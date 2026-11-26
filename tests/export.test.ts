// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { parseWorkbook } from '../src/core/excel/parse';
import { makeBinding } from '../src/core/excel/resolve';
import { applyRefresh, planRefresh } from '../src/core/excel/refresh';
import { renderPage } from '../src/core/export/render';
import { emptyProject, parseProject, type Project } from '../src/core/project';
import { validateHtml, validateProject } from '../src/core/validate';
import { buildMaliciousWorkbook, buildStatusWorkbook } from './helpers';

async function boundProject(buf: ArrayBuffer): Promise<Project> {
  const wb = await parseWorkbook(buf, 'ProjectStatus.xlsx');
  const k = makeBinding(wb, { selectionType: 'cell', worksheet: 'Summary', address: 'B7' });
  const t = makeBinding(wb, { selectionType: 'table', table: 'Issues' });
  if (!k.ok || !t.ok) throw new Error('binding failed');
  const p = emptyProject();
  p.page.components.push(
    { id: 'k', type: 'kpi', label: 'Open issues', value: '0', prefix: '', suffix: '', binding: k.binding },
    { id: 't', type: 'table', caption: 'Issues', columns: [], rows: [], binding: t.binding },
  );
  return p;
}

describe('export: Summary!B7 bound to KPI', () => {
  it('embeds 17 and works with no workbook present', async () => {
    const project = await boundProject(await buildStatusWorkbook());
    // Simulate closing the editor and discarding the workbook: round-trip through JSON only.
    const reloaded = parseProject(JSON.parse(JSON.stringify(project)));
    if (!reloaded.ok) throw new Error(reloaded.error);
    const html = renderPage(reloaded.project);
    expect(html).toContain('<strong class="sphs-kpi__value">17</strong>');
    expect(html).toContain('Login fails on Safari');
    expect(validateHtml(html).filter((i) => i.severity === 'error')).toEqual([]);
    expect(validateProject(reloaded.project).filter((i) => i.severity === 'error')).toEqual([]);
  });

  it('contains no scripts, network references or editor runtime', async () => {
    const html = renderPage(await boundProject(await buildStatusWorkbook()));
    expect(html).not.toMatch(/<script/i);
    expect(html).not.toMatch(/fetch\(|XMLHttpRequest|WebSocket|localStorage/);
    expect(html).not.toMatch(/https?:\/\//);
    expect(html).not.toMatch(/sourceMappingURL|grapesjs|vite|react/i);
    expect(html).not.toContain('ProjectStatus.xlsx'); // no workbook names leak into the page
  });
});

describe('export: malicious workbook values are escaped', () => {
  it('neutralises markup, attribute breakouts and script', async () => {
    const wb = await parseWorkbook(await buildMaliciousWorkbook(), 'm.xlsx');
    const p = emptyProject();
    const cell = makeBinding(wb, { selectionType: 'cell', worksheet: 'Summary', address: 'B7' });
    const cell2 = makeBinding(wb, { selectionType: 'cell', worksheet: 'Summary', address: 'B8' });
    const tbl = makeBinding(wb, { selectionType: 'table', table: 'Issues' });
    if (!cell.ok || !cell2.ok || !tbl.ok) throw new Error('bind');
    p.page.components.push(
      { id: 'a', type: 'kpi', label: 'A', value: '', prefix: '', suffix: '', binding: cell.binding },
      { id: 'b', type: 'kpi', label: 'B', value: '', prefix: '', suffix: '', binding: cell2.binding },
      { id: 'c', type: 'table', caption: 'T', columns: [], rows: [], binding: tbl.binding },
    );
    const html = renderPage(p);
    expect(html).not.toMatch(/<img/i);
    expect(html).not.toMatch(/<script/i);
    expect(html).not.toMatch(/<b>/);
    const doc = new DOMParser().parseFromString(html, 'text/html');
    expect(doc.querySelectorAll('script,img,svg,iframe,form,b').length).toBe(0);
    const handlers = [...doc.querySelectorAll('*')].flatMap((el) => el.getAttributeNames().filter((a) => a.startsWith('on')));
    expect(handlers).toEqual([]);
    expect(doc.querySelector('.sphs-kpi__value')?.textContent).toBe('<img src=x onerror=alert(1)>');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(html).toContain('a&quot; onmouseover=&quot;alert(3)');
    expect(validateHtml(html).filter((i) => i.severity === 'error')).toEqual([]);
  });

  it('escapes authored text, title and attribute-bound values', () => {
    const p = emptyProject();
    p.page.title = '</title><script>x</script>';
    p.page.components.push({ id: 'x', type: 'table', caption: '"><svg onload=1>', columns: ['<i>'], rows: [['&']] });
    const html = renderPage(p);
    expect(html).not.toMatch(/<svg|<i>|<script/);
  });
});

describe('validateHtml', () => {
  it('flags forbidden constructs', () => {
    const bad = `<script src="https://cdn.example.com/x.js"></script><script>fetch('/_api/web');localStorage.x=1</script><img src="https://x/y.png" onclick="a()"><iframe></iframe><form></form><link rel="stylesheet" href="a.css">`;
    const codes = validateHtml(bad).map((i) => i.code);
    for (const c of ['external-script', 'forbidden-api', 'inline-handler', 'external-resource', 'iframe', 'form', 'link-tag']) {
      expect(codes).toContain(c);
    }
  });
  it('flags editor runtime artifacts and oversize files', () => {
    expect(validateHtml('<div data-gjs-type="x"></div>').map((i) => i.code)).toContain('editor-runtime');
    expect(validateHtml('x'.repeat(10 * 1024 * 1024 + 1)).map((i) => i.code)).toContain('size');
  });
  it('does not false-positive on text that mentions fetch(', () => {
    const p = emptyProject();
    p.page.components.push({ id: 't', type: 'text', text: 'Call fetch( ) carefully, onclick= is fine as text' });
    expect(validateHtml(renderPage(p)).filter((i) => i.severity === 'error')).toEqual([]);
  });
});

describe('validateProject', () => {
  it('reports accessibility issues', () => {
    const p = emptyProject();
    p.page.components = [
      { id: 'a', type: 'heading', level: 1, text: 'A' },
      { id: 'b', type: 'heading', level: 3, text: 'B' },
      { id: 'c', type: 'table', caption: '', columns: [], rows: [] },
    ];
    const codes = validateProject(p).map((i) => i.code);
    expect(codes).toContain('heading-skip');
    expect(codes).toContain('table-caption');
  });
});

describe('refresh snapshot', () => {
  it('previews and applies changes', async () => {
    const project = await boundProject(await buildStatusWorkbook());
    const newer = await parseWorkbook(await buildStatusWorkbook(), 'ProjectStatus.xlsx');
    const cell = newer.sheets.find((s) => s.name === 'Summary');
    if (!cell) throw new Error('sheet');
    cell.cells.B7 = 23;
    const plan = planRefresh(project, newer);
    expect(plan.changed).toBe(1);
    expect(plan.changes.find((c) => c.componentId === 'k')).toMatchObject({ before: '17', after: '23', status: 'changed' });
    const updated = applyRefresh(project, plan);
    expect(renderPage(updated)).toContain('>23</strong>');
  });
  it('reports a missing sheet as an error without altering the project', async () => {
    const project = await boundProject(await buildStatusWorkbook());
    const wb = await parseWorkbook(await buildStatusWorkbook(), 'x.xlsx');
    wb.sheets = [];
    const plan = planRefresh(project, wb);
    expect(plan.errors).toBeGreaterThan(0);
    expect(applyRefresh(project, plan)).toEqual(project);
  });
});

describe('project schema', () => {
  it('rejects invalid project data', () => {
    expect(parseProject({ schemaVersion: 2 }).ok).toBe(false);
    expect(parseProject(emptyProject()).ok).toBe(true);
  });
});
