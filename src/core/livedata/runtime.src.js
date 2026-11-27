/* SharePoint HTML Studio: LiveData runtime. EXPERIMENTAL, observed contract revision observed-2026-11-r1.
 *
 * Reads workbook data that the SharePoint HTML viewer injects into this frame (window.__LD_RESULTS__).
 * This script makes NO network requests, uses NO browser storage, and builds every workbook-derived
 * string with textContent only. The only message it ever posts is the fixed refresh request that the
 * observed Microsoft-generated page also posted; it contains no data, identifiers or credentials.
 * Undocumented: Microsoft may change or remove this behavior without notice. */
(function () {
  'use strict';

  var LIMITS = {
    maxContentChars: 2000000,
    maxSheets: 50,
    maxRows: 10000,
    maxCellsPerRow: 500,
    maxCellChars: 5000,
    maxSheetNameChars: 255
  };
  var COOLDOWN_MS = 8000;
  var REFRESH_TYPE = 'ka-html-viewer-refresh';
  var EDITOR_MESSAGE = 'Live data is unavailable in the SharePoint editor. Publish or preview the page to load current data.';
  var FRESHNESS_HINT = 'Recent workbook changes may take time to appear.';

  function fail(code) {
    return { ok: false, code: code };
  }

  function has(obj, key) {
    return Object.prototype.hasOwnProperty.call(obj, key);
  }

  /* ---------- xlsx-sheets envelope ---------- */

  function decodeName(s) {
    return s.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  }

  /* Expected shape (observed): <sheet name="Summary">CSV text</sheet><sheet name="Issues">CSV text</sheet>
   * Text outside sheet elements is ignored. A sheet body ends at the FIRST closing sheet tag.
   * Unterminated or nested sheet elements are rejected as malformed. */
  function parseEnvelope(content) {
    if (typeof content !== 'string') return fail('format');
    if (content.length > LIMITS.maxContentChars) return fail('too-large');
    var sheets = [];
    var pos = 0;
    for (;;) {
      var start = content.indexOf('<sheet', pos);
      if (start < 0) break;
      var m = /^<sheet\s+name\s*=\s*(?:"([^"]*)"|'([^']*)')\s*>/.exec(content.slice(start, start + LIMITS.maxSheetNameChars + 64));
      if (!m) return fail('malformed');
      var name = decodeName(m[1] !== undefined ? m[1] : m[2]);
      if (name.length > LIMITS.maxSheetNameChars) return fail('malformed');
      var bodyStart = start + m[0].length;
      var end = content.indexOf('</sheet>', bodyStart);
      if (end < 0) return fail('malformed');
      var body = content.slice(bodyStart, end);
      if (body.indexOf('<sheet') >= 0) return fail('malformed');
      /* One line break directly after the opening tag is treated as formatting, not as a blank row. */
      if (body.charAt(0) === '\r' && body.charAt(1) === '\n') body = body.slice(2);
      else if (body.charAt(0) === '\n') body = body.slice(1);
      sheets.push({ name: name, csv: body });
      if (sheets.length > LIMITS.maxSheets) return fail('too-many-sheets');
      pos = end + 8;
    }
    if (sheets.length === 0) return fail('malformed');
    return { ok: true, sheets: sheets };
  }

  /* ---------- RFC 4180 style CSV ---------- */

  function parseCsv(text) {
    if (typeof text !== 'string') return fail('format');
    if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
    var rows = [];
    var row = [];
    var field = '';
    var inQuotes = false;
    var err = null;
    var i = 0;
    var n = text.length;

    function endField() {
      if (field.length > LIMITS.maxCellChars) err = 'cell-too-long';
      row.push(field);
      field = '';
      if (row.length > LIMITS.maxCellsPerRow) err = 'too-many-columns';
    }
    function endRow() {
      endField();
      rows.push(row);
      row = [];
      if (rows.length > LIMITS.maxRows) err = 'too-many-rows';
    }

    while (i < n) {
      var c = text.charAt(i);
      if (inQuotes) {
        if (c === '"') {
          if (text.charAt(i + 1) === '"') {
            field += '"';
            i += 2;
          } else {
            inQuotes = false;
            i += 1;
          }
        } else {
          field += c;
          i += 1;
        }
      } else if (c === '"' && field === '') {
        inQuotes = true;
        i += 1;
      } else if (c === ',') {
        endField();
        i += 1;
      } else if (c === '\r') {
        endRow();
        i += text.charAt(i + 1) === '\n' ? 2 : 1;
      } else if (c === '\n') {
        endRow();
        i += 1;
      } else {
        field += c;
        i += 1;
      }
      if (err) return fail(err);
      if (field.length > LIMITS.maxCellChars + 1) return fail('cell-too-long');
    }
    if (inQuotes) return fail('malformed');
    if (field !== '' || row.length > 0) endRow();
    if (err) return fail(err);
    return { ok: true, rows: rows };
  }

  /* ---------- semantic selector: label-adjacent ----------
   * LD-09 (one tenant): the host CSV is a TRIMMED grid (leading blank rows absent, no coordinates), so there is no
   * positional (Excel A1) selection at all. label-adjacent finds exactly one row whose cell in matchColumn equals the
   * label and returns the cell valueOffset columns away in the same row. Exact match only: no fuzzy matching, no regex,
   * no punctuation or diacritic removal, no interior-whitespace collapsing, no numeric coercion.
   * Normalisation of BOTH sides: Unicode NFC (when String.prototype.normalize exists), then trim (optional), then
   * String.prototype.toLowerCase (optional; locale-independent but NOT full Unicode case folding). */
  var SEL = { maxLabelChars: 255, maxMatchColumn: 499, maxValueOffset: 499 };

  function normLabel(s, trim, caseSensitive) {
    if (typeof s.normalize === 'function') s = s.normalize('NFC');
    if (trim) s = s.trim();
    if (!caseSensitive) s = s.toLowerCase();
    return s;
  }

  /* Returns a failure object, or null when the selector configuration is acceptable. */
  function checkSelector(sel) {
    if (!sel || typeof sel !== 'object' || sel.type !== 'label-adjacent') return fail('selector-unsupported');
    if (typeof sel.label !== 'string') return fail('label-empty');
    if ((sel.trim ? sel.label.trim() : sel.label) === '') return fail('label-empty');
    if (sel.label.length > SEL.maxLabelChars) return fail('label-too-long');
    var mc = sel.matchColumn;
    var vo = sel.valueOffset;
    if (typeof mc !== 'number' || mc % 1 !== 0 || mc < 0 || mc > SEL.maxMatchColumn) return fail('match-column-invalid');
    if (typeof vo !== 'number' || vo % 1 !== 0 || vo === 0 || Math.abs(vo) > SEL.maxValueOffset || mc + vo < 0) return fail('value-offset-invalid');
    return null;
  }

  function selectLabelAdjacent(rows, sel) {
    var bad = checkSelector(sel);
    if (bad) return bad;
    var want = normLabel(sel.label, sel.trim, sel.caseSensitive);
    var mc = sel.matchColumn;
    var hit = -1;
    for (var r = 0; r < rows.length; r++) {
      var row = rows[r];
      if (row.length <= mc) continue;
      if (normLabel(row[mc], sel.trim, sel.caseSensitive) === want) {
        if (hit >= 0) return fail('ambiguous-label');
        hit = r;
      }
    }
    if (hit < 0) return fail('label-not-found');
    var matched = rows[hit];
    var vc = mc + sel.valueOffset;
    if (vc >= matched.length) return fail('adjacent-value-missing');
    var v = matched[vc];
    /* Whitespace-only counts as empty (it would render as a blank "live" value); a non-empty value is never altered. */
    if (v.trim() === '') return sel.allowEmptyValue ? { ok: true, value: '', empty: true } : fail('adjacent-value-empty');
    return { ok: true, value: v, empty: false };
  }

  /* Looks up a worksheet by exact trimmed, case-insensitive name; the FIRST match wins (deterministic). */
  function findSheet(sheets, worksheet) {
    var want = String(worksheet).trim().toLowerCase();
    for (var s = 0; s < sheets.length; s++) {
      if (String(sheets[s].name).trim().toLowerCase() === want) return sheets[s];
    }
    return null;
  }

  /* ---------- host result handling ---------- */

  var NUM_RE = /^-?[0-9]+(\.[0-9]+)?$/;

  function formatValue(raw, format) {
    if (!NUM_RE.test(raw)) return raw;
    var n = Number(raw);
    if (format === 'integer') return String(Math.round(n));
    if (format === 'decimal1') return n.toFixed(1);
    if (format === 'decimal2') return n.toFixed(2);
    return raw;
  }

  function statusFor(raw, cfg) {
    if (!NUM_RE.test(raw)) return '';
    var n = Number(raw);
    if (cfg.criticalAt !== null && n >= cfg.criticalAt) return 'critical';
    if (cfg.warnAt !== null && n >= cfg.warnAt) return 'warning';
    return '';
  }

  function safeToken(v) {
    return typeof v === 'string' ? v.replace(/[^A-Za-z0-9_.-]/g, '').slice(0, 40) : '';
  }

  function maskRef(s) {
    var h = 0x811c9dc5;
    for (var i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return 'ref-' + ('00000000' + h.toString(16)).slice(-8);
  }

  /* Pure decision: what does the host data say about one KPI? Never throws. */
  function resolveKpi(cfg, manifest, results) {
    var entry = Array.isArray(manifest) ? manifest[cfg.source] : undefined;
    if (!entry || typeof entry.spItemUrl !== 'string') return fail('source-config');
    var ref = maskRef(entry.spItemUrl);
    var base = { ref: ref };
    if (results === undefined || results === null || typeof results !== 'object') return merge(fail('no-prefetch'), base);
    if (!has(results, entry.spItemUrl)) return merge(fail('no-prefetch'), base);
    var result = results[entry.spItemUrl];
    if (result === null || typeof result !== 'object') return merge(fail('empty-result'), base);
    if (result.error || result.errorCode) {
      var out = merge(fail('host-error'), base);
      out.hostCode = safeToken(result.errorCode);
      return out;
    }
    if (result.content === null || result.content === undefined || result.content === '') return merge(fail('empty-result'), base);
    if (result.format !== 'xlsx-sheets') {
      var fm = merge(fail('unsupported-format'), base);
      fm.hostFormat = safeToken(result.format);
      return fm;
    }
    var env = parseEnvelope(result.content);
    if (!env.ok) return merge(fail(env.code), base);
    var sheet = findSheet(env.sheets, cfg.sheet);
    if (!sheet) return merge(fail('worksheet-not-found'), base);
    if (!has(sheet, '_rows')) sheet._rows = parseCsv(sheet.csv);
    if (!sheet._rows.ok) return merge(fail(sheet._rows.code), base);
    /* Semantic selection only. There is deliberately no positional (Excel A1) path and no fallback to one. */
    var picked = selectLabelAdjacent(sheet._rows.rows, cfg.selector);
    if (!picked.ok) return merge(fail(picked.code), base);
    return { ok: true, value: picked.value, empty: picked.empty, ref: ref };
  }

  function merge(a, b) {
    for (var k in b) if (has(b, k)) a[k] = b[k];
    return a;
  }

  var MESSAGES = {
    'no-prefetch': EDITOR_MESSAGE,
    'host-error': 'Workbook data could not be loaded from SharePoint.',
    'empty-result': 'SharePoint returned no workbook data.',
    'unsupported-format': 'The workbook data format is not supported.',
    malformed: 'The workbook data could not be read.',
    format: 'The workbook data could not be read.',
    'too-large': 'The workbook data is too large to display.',
    'too-many-sheets': 'The workbook data has too many worksheets.',
    'too-many-rows': 'The worksheet has too many rows.',
    'too-many-columns': 'The worksheet has too many columns.',
    'cell-too-long': 'A cell value is too long to display.',
    'worksheet-not-found': 'Worksheet not found.',
    'adjacent-value-missing': 'The matching row does not contain a value in the configured adjacent column.',
    'adjacent-value-empty': 'The matching row has an empty value in the configured adjacent column.',
    'label-empty': 'The row label is empty.',
    'label-too-long': 'The row label is too long.',
    'match-column-invalid': 'The label column is not valid.',
    'value-offset-invalid': 'The value offset is not valid.',
    'selector-unsupported': 'This selection method is not supported.',
    'source-config': 'The live data source is not configured correctly.'
  };

  /* The configured label (author text) is shown only through textContent, shortened, in typographic quotes. */
  function quotedLabel(cfg) {
    var l = cfg.selector && typeof cfg.selector.label === 'string' ? cfg.selector.label : '';
    if (l.length > 80) l = l.slice(0, 80) + '…';
    return '‘' + l + '’';
  }

  function messageFor(code, cfg) {
    if (code === 'label-not-found') return 'No row matched the label ' + quotedLabel(cfg) + '.';
    if (code === 'ambiguous-label') return 'More than one row matched ' + quotedLabel(cfg) + '. Use a more specific label.';
    return MESSAGES[code] || MESSAGES['host-error'];
  }

  /* View model for one KPI: live value, labelled snapshot fallback, or error. Never mixes them silently. */
  function present(cfg, res, loadedAt) {
    var vm = { mode: 'error', code: res.ok ? '' : res.code, ref: res.ref || '', value: '', message: '', badge: '', meta: '', status: '', diag: '' };
    if (res.ok) {
      vm.mode = 'live';
      vm.value = res.empty ? cfg.emptyText : cfg.prefix + formatValue(res.value, cfg.format) + cfg.suffix;
      vm.meta = cfg.showLoadedAt && loadedAt ? 'Loaded from SharePoint at ' + loadedAt : '';
      vm.status = res.empty ? '' : statusFor(res.value, cfg);
      return vm;
    }
    var generic = messageFor(res.code, cfg);
    vm.message = res.code === 'no-prefetch' ? generic : cfg.errorText || generic;
    var d = 'Diagnostic: ' + res.code;
    if (res.hostCode) d += ' (' + res.hostCode + ')';
    if (res.hostFormat) d += ' (format ' + res.hostFormat + ')';
    vm.diag = d + '; source ' + (cfg.source + 1) + ' ' + vm.ref;
    if (cfg.fallbackValue !== null) {
      vm.mode = 'fallback';
      vm.value = cfg.prefix + formatValue(cfg.fallbackValue, cfg.format) + cfg.suffix;
      vm.badge = 'Snapshot fallback';
      vm.meta = cfg.fallbackAt ? 'Snapshot taken ' + cfg.fallbackAt : 'Snapshot time unknown';
    }
    return vm;
  }

  var core = {
    LIMITS: LIMITS,
    parseEnvelope: parseEnvelope,
    parseCsv: parseCsv,
    normLabel: normLabel,
    checkSelector: checkSelector,
    selectLabelAdjacent: selectLabelAdjacent,
    resolveKpi: resolveKpi,
    present: present,
    formatValue: formatValue,
    maskRef: maskRef
  };

  var root = typeof window !== 'undefined' ? window : globalThis;

  /* ---------- DOM (textContent only) ---------- */

  function setText(el, text) {
    if (el) el.textContent = text;
  }

  function numberOrNull(v) {
    if (v === undefined || v === null || v === '') return null;
    var n = Number(v);
    return isFinite(n) ? n : null;
  }

  function readConfig(el) {
    var d = el.dataset;
    return {
      source: parseInt(d.sphsSource, 10),
      sheet: d.sphsSheet || '',
      selector:
        d.sphsSelector === 'label-adjacent'
          ? {
              type: 'label-adjacent',
              label: d.sphsLabel === undefined ? '' : d.sphsLabel,
              matchColumn: Number(d.sphsMatchCol),
              valueOffset: Number(d.sphsValueOffset),
              matchMode: 'exact',
              caseSensitive: d.sphsCase === '1',
              trim: d.sphsTrim === '1',
              allowEmptyValue: d.sphsAllowEmpty === '1'
            }
          : { type: 'unsupported' },
      format: d.sphsFormat || 'auto',
      prefix: d.sphsPrefix || '',
      suffix: d.sphsSuffix || '',
      emptyText: d.sphsEmptyText || 'No value',
      errorText: d.sphsErrorText || '',
      showLoadedAt: d.sphsShowLoaded === '1',
      showRefresh: d.sphsShowRefresh === '1',
      warnAt: numberOrNull(d.sphsWarn),
      criticalAt: numberOrNull(d.sphsCritical),
      fallbackValue: has(d, 'sphsFallbackValue') ? d.sphsFallbackValue : null,
      fallbackAt: d.sphsFallbackAt || ''
    };
  }

  function readManifest(doc) {
    var el = doc.querySelector('script.ka-livedata-manifest');
    if (!el) return null;
    try {
      var parsed = JSON.parse(el.textContent || '');
      return Array.isArray(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }

  function requestRefresh(button, status) {
    if (button.disabled) return;
    button.disabled = true;
    setText(status, 'Refresh requested. ' + FRESHNESS_HINT);
    try {
      /* Target origin "*" mirrors the observed Microsoft-generated page. The message is a fixed
       * constant with no data, identifiers or credentials, so there is nothing to protect by narrowing it. */
      root.parent.postMessage({ type: REFRESH_TYPE }, '*');
    } catch {
      setText(status, 'A refresh could not be requested from this page.');
    }
    setTimeout(function () {
      button.disabled = false;
      setText(status, 'If this page did not reload, you can request a refresh again.');
    }, COOLDOWN_MS);
  }

  function renderKpi(el, cfg, manifest, results, loadedAt) {
    var vm;
    try {
      vm = present(cfg, resolveKpi(cfg, manifest, results), loadedAt);
    } catch {
      vm = present(cfg, fail('malformed'), loadedAt);
    }
    el.setAttribute('data-sphs-state', vm.mode);
    el.className = el.className.replace(/\bsphs-live--[a-z]+\b/g, '').replace(/\s+/g, ' ').trim();
    if (vm.status) el.className += ' sphs-live--' + vm.status;
    var value = el.querySelector('.sphs-kpi__value');
    var badge = el.querySelector('.sphs-live__badge');
    var meta = el.querySelector('.sphs-live__meta');
    var msg = el.querySelector('.sphs-live__message');
    var diag = el.querySelector('.sphs-live__diag');
    var st = el.querySelector('.sphs-live__threshold');
    setText(value, vm.value === '' ? '—' : vm.value);
    setText(badge, vm.badge);
    if (badge) badge.hidden = vm.badge === '';
    setText(meta, vm.meta);
    if (meta) meta.hidden = vm.meta === '';
    setText(msg, vm.message);
    if (msg) {
      msg.hidden = vm.message === '';
      msg.setAttribute('role', vm.mode === 'live' ? 'status' : 'alert');
    }
    setText(diag, vm.diag);
    if (diag) diag.hidden = vm.diag === '';
    setText(st, vm.status ? 'Status: ' + (vm.status === 'critical' ? 'Critical' : 'Warning') : '');
    if (st) st.hidden = vm.status === '';
    var btn = el.querySelector('.sphs-live__refresh');
    if (btn) btn.hidden = !cfg.showRefresh;
  }

  function init() {
    if (typeof document === 'undefined') return;
    if (root.SPHSRuntime && root.SPHSRuntime.initialised) return;
    root.SPHSRuntime.initialised = true;
    var nodes = document.querySelectorAll('[data-sphs-live="kpi"]');
    if (nodes.length === 0) return;
    var manifest = readManifest(document);
    var results = root.__LD_RESULTS__;
    var loadedAt = new Date().toLocaleTimeString();
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      renderKpi(el, readConfig(el), manifest, results, loadedAt);
      var btn = el.querySelector('.sphs-live__refresh');
      var st = el.querySelector('.sphs-live__refresh-status');
      if (btn && !btn.hasAttribute('data-sphs-bound')) {
        btn.setAttribute('data-sphs-bound', '1');
        btn.addEventListener('click', makeRefreshHandler(btn, st));
      }
    }
  }

  function makeRefreshHandler(button, status) {
    return function () {
      requestRefresh(button, status);
    };
  }

  root.SPHSRuntime = { core: core, init: init, initialised: false };

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
  }
})();
