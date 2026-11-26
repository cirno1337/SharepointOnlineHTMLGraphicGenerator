export function safeFileName(name: string, ext: string): string {
  const base = name.replace(/[^a-zA-Z0-9-_ ]+/g, '').trim().replace(/\s+/g, '-').slice(0, 60) || 'page';
  return `${base}.${ext}`;
}
