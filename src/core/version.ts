declare const __STUDIO_VERSION__: string | undefined;
declare const __STUDIO_BUILD__: string | undefined;

/** Injected by Vite at build time (see vite.config.ts); falls back when running under tsx. */
export const STUDIO_VERSION: string = typeof __STUDIO_VERSION__ === 'string' ? __STUDIO_VERSION__ : '0.0.0-unknown';
/** `<version>+<git short sha>[.dirty]`. Identifies the exact Studio build that produced an export. */
export const STUDIO_BUILD: string = typeof __STUDIO_BUILD__ === 'string' ? __STUDIO_BUILD__ : `${STUDIO_VERSION}+unknown`;
