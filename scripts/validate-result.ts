import { readFileSync } from 'node:fs';
import { TenantTestResultSchema } from '../src/core/tenant/result-schema';
import { TENANT_TEST_CASES } from '../src/core/tenant/cases';

const file = process.argv[2];
if (!file) {
  console.error('Usage: npm run validate-result -- <path-to-result.json>');
  process.exit(2);
}
const parsed = TenantTestResultSchema.safeParse(JSON.parse(readFileSync(file, 'utf8')));
if (!parsed.success) {
  for (const i of parsed.error.issues) console.error(`${i.path.join('.') || '(root)'}: ${i.message}`);
  process.exit(1);
}
const ids = new Set(parsed.data.cases.map((c) => c.id));
const missing = TENANT_TEST_CASES.filter((c) => !ids.has(c.id)).map((c) => c.id);
if (missing.length) console.warn(`Warning: cases missing from the file: ${missing.join(', ')}`);
const counts = parsed.data.cases.reduce<Record<string, number>>((a, c) => ({ ...a, [c.status]: (a[c.status] ?? 0) + 1 }), {});
console.log(`Valid. ${JSON.stringify(counts)}`);
