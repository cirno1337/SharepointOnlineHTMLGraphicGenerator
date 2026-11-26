import { writeFileSync } from 'node:fs';
import { buildStatusWorkbook } from '../tests/helpers';

writeFileSync('fixtures/project-status.xlsx', Buffer.from(await buildStatusWorkbook()));
console.log('wrote fixtures/project-status.xlsx');
