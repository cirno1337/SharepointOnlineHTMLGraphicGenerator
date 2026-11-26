/** Exact size of the string as it will be written to disk: UTF-8, no BOM. */
export function utf8ByteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}

export class HashUnavailableError extends Error {}

/** SHA-256 (lowercase hex) of the UTF-8 bytes of `text`. Needs Web Crypto (https or localhost). */
export async function sha256Hex(text: string): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new HashUnavailableError('SHA-256 needs a secure context (https:// or localhost). Open the editor from one of those.');
  const digest = await subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
