import { newComponent, type Component, type ComponentType, type Project } from '../core/project';

export type Action =
  | { type: 'load'; project: Project }
  | { type: 'rename'; name: string }
  | { type: 'page'; patch: Partial<Pick<Project['page'], 'title' | 'lang' | 'accent' | 'exportProfile' | 'liveSources'>> }
  | { type: 'add'; component: ComponentType }
  | { type: 'update'; component: Component }
  | { type: 'remove'; id: string }
  | { type: 'move'; id: string; dir: -1 | 1 };

export function reducer(state: Project, action: Action): Project {
  const comps = state.page.components;
  const withComps = (components: Component[]): Project => ({ ...state, page: { ...state.page, components } });
  switch (action.type) {
    case 'load':
      return action.project;
    case 'rename':
      return { ...state, name: action.name };
    case 'page':
      return { ...state, page: { ...state.page, ...action.patch } };
    case 'add':
      return withComps([...comps, newComponent(action.component)]);
    case 'update':
      return withComps(comps.map((c) => (c.id === action.component.id ? action.component : c)));
    case 'remove':
      return withComps(comps.filter((c) => c.id !== action.id));
    case 'move': {
      const i = comps.findIndex((c) => c.id === action.id);
      const j = i + action.dir;
      if (i < 0 || j < 0 || j >= comps.length) return state;
      const next = [...comps];
      const a = next[i] as Component;
      next[i] = next[j] as Component;
      next[j] = a;
      return withComps(next);
    }
  }
}
