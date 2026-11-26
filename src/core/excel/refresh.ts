import type { Binding, Component, Project, SnapshotValue } from '../project';
import { formatCell } from '../export/escape';
import { makeBinding } from './resolve';
import type { WorkbookData } from './types';

export interface RefreshChange {
  componentId: string;
  label: string;
  before: string;
  after: string;
  status: 'changed' | 'unchanged' | 'error';
  newBinding?: Binding;
}

export interface RefreshPlan {
  changes: RefreshChange[];
  changed: number;
  errors: number;
}

function describe(v: SnapshotValue): string {
  return v.kind === 'scalar' ? formatCell(v.value) : `${v.rows.length} rows × ${v.columns.length} columns`;
}

function selectionLabel(b: Binding): string {
  const s = b.selection;
  if (s.selectionType === 'cell') return `${s.worksheet}!${s.address}`;
  if (s.selectionType === 'namedRange') return `name ${s.name}`;
  return `table ${s.table}`;
}

/** Re-resolve every bound component against a newer workbook. Pure: does not modify the project. */
export function planRefresh(project: Project, wb: WorkbookData): RefreshPlan {
  const changes: RefreshChange[] = [];
  for (const c of project.page.components) {
    if (c.type !== 'kpi' && c.type !== 'table') continue;
    if (!c.binding) continue;
    const label = `${selectionLabel(c.binding)} (${c.type})`;
    const before = describe(c.binding.snapshot);
    const r = makeBinding(wb, c.binding.selection);
    if (!r.ok) {
      changes.push({ componentId: c.id, label, before, after: r.error, status: 'error' });
      continue;
    }
    const after = describe(r.binding.snapshot);
    const same = JSON.stringify(c.binding.snapshot) === JSON.stringify(r.binding.snapshot);
    changes.push({ componentId: c.id, label, before, after, status: same ? 'unchanged' : 'changed', newBinding: r.binding });
  }
  return {
    changes,
    changed: changes.filter((c) => c.status === 'changed').length,
    errors: changes.filter((c) => c.status === 'error').length,
  };
}

/** Apply only the changed bindings from a plan. */
export function applyRefresh(project: Project, plan: RefreshPlan): Project {
  const byId = new Map(plan.changes.filter((c) => c.status === 'changed' && c.newBinding).map((c) => [c.componentId, c.newBinding as Binding]));
  const components = project.page.components.map((c): Component => {
    const b = byId.get(c.id);
    if (!b) return c;
    if (c.type === 'kpi' && b.snapshot.kind === 'scalar') return { ...c, binding: b };
    if (c.type === 'table' && b.snapshot.kind === 'table') return { ...c, binding: b };
    return c;
  });
  return { ...project, page: { ...project.page, components } };
}
