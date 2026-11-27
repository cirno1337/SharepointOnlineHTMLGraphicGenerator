import { RUNTIME_SOURCE_RAW } from './runtime.generated';

/**
 * The exact inline script Studio embeds in Interactive Safe exports (generated from runtime.src.js by
 * `npm run runtime`; a test fails on drift). The validator requires an export's only executable script
 * to equal this string, so nothing else can be smuggled in.
 */
export const RUNTIME_SOURCE: string = RUNTIME_SOURCE_RAW.trim();
