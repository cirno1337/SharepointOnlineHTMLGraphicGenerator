import { writeFileSync } from 'node:fs';
import { z } from 'zod';
import { ValidationReportSchema } from '../src/core/tenant/report';
import { TenantTestResultSchema } from '../src/core/tenant/result-schema';
import { buildExampleResult } from '../src/core/tenant/example';

const json = (v: unknown) => `${JSON.stringify(v, null, 2)}\n`;

writeFileSync('docs/testing/tenant-test-result.schema.json', json(z.toJSONSchema(TenantTestResultSchema)));
writeFileSync('docs/testing/validation-report.schema.json', json(z.toJSONSchema(ValidationReportSchema)));
writeFileSync('docs/testing/tenant-test-result.example.json', json(buildExampleResult()));
console.log('wrote docs/testing schemas and example');
