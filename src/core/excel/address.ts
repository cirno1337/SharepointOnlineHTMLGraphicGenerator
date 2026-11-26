export function colToLetters(col: number): string {
  let n = col;
  let s = '';
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

export function lettersToCol(letters: string): number {
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n;
}

export function cellAddress(row: number, col: number): string {
  return `${colToLetters(col)}${row}`;
}

export function parseAddress(a: string): { row: number; col: number } | null {
  const m = /^\$?([A-Za-z]{1,3})\$?([1-9][0-9]{0,6})$/.exec(a.trim());
  if (!m) return null;
  return { col: lettersToCol((m[1] as string).toUpperCase()), row: Number(m[2]) };
}

export function normalizeAddress(a: string): string | null {
  const p = parseAddress(a);
  return p ? cellAddress(p.row, p.col) : null;
}

export function parseRange(r: string): { top: number; left: number; bottom: number; right: number } | null {
  const [a, b] = r.split(':');
  const s = a ? parseAddress(a) : null;
  const e = b ? parseAddress(b) : s;
  if (!s || !e) return null;
  return {
    top: Math.min(s.row, e.row),
    left: Math.min(s.col, e.col),
    bottom: Math.max(s.row, e.row),
    right: Math.max(s.col, e.col),
  };
}
