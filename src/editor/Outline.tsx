import type { Component, ComponentType } from '../core/project';
import type { Action } from './state';

const TYPES: { type: ComponentType; label: string }[] = [
  { type: 'heading', label: 'Heading' },
  { type: 'text', label: 'Text' },
  { type: 'callout', label: 'Callout' },
  { type: 'kpi', label: 'KPI' },
  { type: 'table', label: 'Table' },
  { type: 'link', label: 'Link' },
  { type: 'stamp', label: 'Export info' },
];
/** Offered only when VITE_EXPERIMENTAL_EXCEL_LIVE=true. */
const LIVE_TYPE: { type: ComponentType; label: string } = { type: 'liveKpi', label: 'Live KPI (experimental)' };

export function summary(c: Component): string {
  switch (c.type) {
    case 'heading':
      return `H${c.level}: ${c.text}`;
    case 'text':
      return c.text.slice(0, 40);
    case 'callout':
      return `${c.tone}: ${c.text.slice(0, 30)}`;
    case 'link':
      return `Link: ${c.text.slice(0, 30)}`;
    case 'stamp':
      return 'Export info (timestamp and build)';
    case 'kpi':
      return `KPI: ${c.label}${c.binding ? ' (bound)' : ''}`;
    case 'table':
      return `Table: ${c.caption}${c.binding ? ' (bound)' : ''}`;
    case 'liveKpi':
      return `Live KPI: ${c.label} (${c.worksheet}, ${c.selector.type === 'label-adjacent' ? 'row label' : 'removed cell selection'}, experimental)`;
  }
}

interface Props {
  components: Component[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  dispatch: (a: Action) => void;
  liveEnabled: boolean;
}

export function Outline({ components, selectedId, onSelect, dispatch, liveEnabled }: Props) {
  return (
    <section aria-labelledby="outline-h" className="panel">
      <h2 id="outline-h">Page outline</h2>
      <div role="group" aria-label="Add component" className="row wrap">
        {(liveEnabled ? [...TYPES, LIVE_TYPE] : TYPES).map((t) => (
          <button key={t.type} type="button" onClick={() => dispatch({ type: 'add', component: t.type })}>
            Add {t.label}
          </button>
        ))}
      </div>
      {components.length === 0 ? (
        <p className="muted">The page is empty. Add a component to begin.</p>
      ) : (
        <ol className="outline">
          {components.map((c, i) => (
            <li key={c.id} aria-current={c.id === selectedId ? 'true' : undefined}>
              <button type="button" className="link" onClick={() => onSelect(c.id)} aria-pressed={c.id === selectedId}>
                {summary(c)}
              </button>
              <span className="row">
                <button type="button" disabled={i === 0} aria-label={`Move up: ${summary(c)}`} onClick={() => dispatch({ type: 'move', id: c.id, dir: -1 })}>
                  ↑
                </button>
                <button type="button" disabled={i === components.length - 1} aria-label={`Move down: ${summary(c)}`} onClick={() => dispatch({ type: 'move', id: c.id, dir: 1 })}>
                  ↓
                </button>
                <button type="button" aria-label={`Delete: ${summary(c)}`} onClick={() => dispatch({ type: 'remove', id: c.id })}>
                  ✕
                </button>
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
