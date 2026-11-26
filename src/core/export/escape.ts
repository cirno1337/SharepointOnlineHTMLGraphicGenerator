/** Escape untrusted text for HTML text nodes and double-quoted attribute values. */
export function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/`/g, '&#96;');
}

export function formatCell(v: string | number | boolean | null): string {
  return v === null ? '' : String(v);
}
