import { INTERACTIVE_CSP } from '../export/render';
import { escapeHtml } from '../export/escape';
import type { CompiledManifest } from './manifest';

/**
 * LD-09 probe: a CONTROLLED-TEST diagnostic page. It prints the STRUCTURE of the data the SharePoint viewer
 * injects (key count, result field names, format, per-sheet CSV line numbers with blank lines visible) so a
 * human can settle whether CSV row 1 / column 1 is Excel A1. It shows workbook values as text, never prints
 * the item URL, and makes no network request. Use only with a synthetic workbook. Not a normal export.
 */
export const PROBE_SOURCE = `(function () {
  'use strict';
  function token(v) { return typeof v === 'string' ? v.replace(/[^A-Za-z0-9_.-]/g, '').slice(0, 40) : String(typeof v); }
  function show(v) { var s = JSON.stringify(v); return s === undefined ? 'undefined' : s.length > 220 ? s.slice(0, 220) + '...(' + s.length + ' chars)' : s; }
  function run() {
    var out = [];
    var results = window.__LD_RESULTS__;
    out.push('LiveData probe (observed contract revision 1). Values below are workbook data shown as text.');
    out.push('window.__LD_RESULTS__ is ' + (results === undefined ? 'undefined' : results === null ? 'null' : typeof results));
    var el = document.querySelector('script.ka-livedata-manifest');
    var manifest = [];
    try { manifest = JSON.parse(el ? el.textContent || '[]' : '[]'); } catch (e) { out.push('manifest unreadable'); }
    if (results && typeof results === 'object') out.push('result key count: ' + Object.keys(results).length);
    for (var i = 0; i < manifest.length; i++) {
      var entry = manifest[i];
      out.push('');
      out.push('source ' + (i + 1));
      if (!results || typeof results !== 'object' || !Object.prototype.hasOwnProperty.call(results, entry.spItemUrl)) { out.push('  no result under this key'); continue; }
      var r = results[entry.spItemUrl];
      if (!r || typeof r !== 'object') { out.push('  result is ' + typeof r); continue; }
      out.push('  fields: ' + Object.keys(r).map(token).join(', '));
      out.push('  format: ' + token(r.format) + '; errorCode: ' + token(r.errorCode) + '; has error text: ' + (r.error ? 'yes' : 'no'));
      out.push('  metadata: ' + (r.metadata === null || r.metadata === undefined ? String(r.metadata) : 'object with keys ' + Object.keys(r.metadata).map(token).join(', ')));
      var c = r.content;
      out.push('  content type: ' + typeof c + '; length: ' + (typeof c === 'string' ? c.length : 'n/a'));
      if (typeof c !== 'string') continue;
      out.push('  content start: ' + show(c.slice(0, 160)));
      var re = /<sheet\\s+name\\s*=\\s*"([^"]*)"\\s*>([\\s\\S]*?)<\\/sheet>/g;
      var m;
      var n = 0;
      while ((m = re.exec(c)) !== null && n < 12) {
        n += 1;
        var raw = m[2];
        out.push('  sheet ' + show(m[1]) + ': ' + raw.length + ' chars; starts with line break: ' + (raw.charAt(0) === '\\n' || raw.charAt(0) === '\\r'));
        var lines = raw.split(/\\r\\n|\\r|\\n/);
        for (var k = 0; k < lines.length && k < 12; k++) out.push('    line ' + (k + 1) + ': ' + show(lines[k]));
        if (lines.length > 12) out.push('    ... ' + lines.length + ' lines in total');
      }
    }
    document.getElementById('probe-out').textContent = out.join('\\n');
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run); else run();
})();`;

export function renderProbePage(manifest: CompiledManifest): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="${INTERACTIVE_CSP}">
<meta name="generator" content="SharePoint HTML Studio LiveData probe">
<title>LiveData probe</title>
<style>body{font-family:"Segoe UI",system-ui,Arial,sans-serif;margin:1rem}pre{white-space:pre-wrap;overflow-wrap:anywhere}</style>
</head>
<body>
<main>
<h1>LiveData probe (LD-09)</h1>
<p>${escapeHtml('Controlled-test diagnostic. It prints the structure of the data SharePoint injects, including workbook values as text. Use only with a synthetic workbook.')}</p>
<pre id="probe-out" aria-live="polite">Waiting for data…</pre>
</main>
${manifest.scriptTag}
<script>
${PROBE_SOURCE}
</script>
</body>
</html>
`;
}
