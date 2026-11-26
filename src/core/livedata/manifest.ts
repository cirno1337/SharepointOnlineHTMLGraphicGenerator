import type { LiveSource } from './source';
import { parseSpItemUrl, validateLiveSourceShape } from './source';

/**
 * Manifest entry as emitted into the page. Only fields with recorded tenant evidence are written
 * (see MANIFEST_FIELD_EVIDENCE): spItemUrl (required: LD-01-H, LD-03) and fileName (needed with it:
 * LD-01-A vs LD-01-B). filePath, label and cslViewLink are deliberately NOT emitted.
 */
export interface ManifestEntry {
  spItemUrl: string;
  fileName: string;
}

export interface CompiledManifest {
  entries: ManifestEntry[];
  /** source id -> index into `entries` (identical sources share one entry). */
  indexBySourceId: Map<string, number>;
  /** Source ids that were skipped because their shape is invalid. */
  skipped: string[];
  json: string;
  /** Complete <script> element, or '' when there are no entries. */
  scriptTag: string;
}

/** JSON that is safe inside a <script> element: no raw "<", ">", "&" and no line/paragraph separators. */
export function safeJsonForScript(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .split(String.fromCharCode(0x2028))
    .join('\\u2028')
    .split(String.fromCharCode(0x2029))
    .join('\\u2029');
}

export function compileManifest(sources: readonly LiveSource[], usedIds?: ReadonlySet<string>): CompiledManifest {
  const entries: ManifestEntry[] = [];
  const keyToIndex = new Map<string, number>();
  const indexBySourceId = new Map<string, number>();
  const skipped: string[] = [];

  for (const s of sources) {
    if (usedIds && !usedIds.has(s.id)) continue;
    const url = s.spItemUrl.trim();
    const fileName = s.fileName.trim();
    const shapeErrors = validateLiveSourceShape({ ...s, acknowledgedExperimental: true }).filter((p) => p.severity === 'error');
    if (shapeErrors.length > 0 || !parseSpItemUrl(url) || !fileName) {
      skipped.push(s.id);
      continue;
    }
    const key = `${url}\n${fileName}`;
    let idx = keyToIndex.get(key);
    if (idx === undefined) {
      idx = entries.length;
      entries.push({ spItemUrl: url, fileName });
      keyToIndex.set(key, idx);
    }
    indexBySourceId.set(s.id, idx);
  }

  const json = safeJsonForScript(entries.map((e) => ({ spItemUrl: e.spItemUrl, fileName: e.fileName })));
  const scriptTag = entries.length === 0 ? '' : `<script type="application/json" class="ka-livedata-manifest">${json}</script>`;
  return { entries, indexBySourceId, skipped, json, scriptTag };
}
