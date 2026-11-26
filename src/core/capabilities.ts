/**
 * Registry of SharePoint HTML Page platform capabilities and how this project treats them.
 * Every entry cites the Microsoft source; see docs/research/sharepoint-html-pages.md.
 */
export type CapabilityStatus = 'CONFIRMED' | 'EXPERIMENTAL' | 'UNSUPPORTED' | 'UNKNOWN';

export interface Capability {
  id: string;
  label: string;
  status: CapabilityStatus;
  notes: string;
  source: string;
}

const SUPPORT = 'https://support.microsoft.com/en-us/sharepoint/create-edit-publish-html-pages';
const BLOG =
  'https://techcommunity.microsoft.com/blog/spblog/publish-rich-and-interactive-content-with-html-pages-in-sharepoint/4565918';

export const CAPABILITIES: readonly Capability[] = [
  {
    id: 'file-size',
    label: 'HTML file up to 10 MB (assets excluded)',
    status: 'CONFIRMED',
    notes: 'Enforced by the export validator.',
    source: SUPPORT,
  },
  {
    id: 'upload-single-or-folder',
    label: 'Upload a single .html file or an HTML folder',
    status: 'CONFIRMED',
    notes: 'Studio exports a single self-contained .html file.',
    source: SUPPORT,
  },
  {
    id: 'inline-js',
    label: 'JavaScript contained in the same HTML file',
    status: 'CONFIRMED',
    notes: 'Supported by the platform; Studio v0.1 still exports zero scripts (decision D-004).',
    source: SUPPORT,
  },
  {
    id: 'cdn-js',
    label: 'Scripts from arbitrary CDNs / open-source locations',
    status: 'UNSUPPORTED',
    notes: 'Only Microsoft-managed libraries are supported. Export validator rejects external scripts.',
    source: SUPPORT,
  },
  {
    id: 'fetch',
    label: 'Arbitrary fetch / outbound API calls',
    status: 'UNSUPPORTED',
    notes: 'Blocked by SharePoint. Export validator rejects fetch, XMLHttpRequest, WebSocket, Graph and REST URLs.',
    source: SUPPORT,
  },
  {
    id: 'local-storage',
    label: 'Browser localStorage',
    status: 'UNSUPPORTED',
    notes: 'The sandbox cannot access localStorage. Export validator rejects it.',
    source: SUPPORT,
  },
  {
    id: 'same-domain-images',
    label: 'Images as base64 or same-domain URLs',
    status: 'CONFIRMED',
    notes: 'Studio v0.1 has no image component; will emit data: URIs when added.',
    source: SUPPORT,
  },
  {
    id: 'excel-import-snapshot',
    label: 'Design-time Excel import and embedded snapshot',
    status: 'CONFIRMED',
    notes: 'Implemented entirely in the editor; exported HTML contains static values only.',
    source: 'Project design (no SharePoint behavior involved)',
  },
  {
    id: 'live-excel',
    label: 'Live Excel data in HTML pages',
    status: 'EXPERIMENTAL',
    notes:
      'Microsoft documents that live lists/Excel (and, in the blog post, CSV) data exists, but neither page documents the binding contract. Studio implements an EXPERIMENTAL, feature-flagged provider for the contract observed in one tenant on 2026-11-26 (revision observed-2026-11-r1). It is undocumented, may change without notice, and permission isolation (LD-07) is unvalidated.',
    source: `${SUPPORT} ; ${BLOG}`,
  },
  {
    id: 'ms-managed-libraries',
    label: 'Chart.js, Mermaid, React, Fluent UI and Babylon from a Microsoft-managed CDN',
    status: 'CONFIRMED',
    notes: 'Documented as supported. Studio does not use them; its exports load no external script.',
    source: `${SUPPORT} ; ${BLOG}`,
  },
  {
    id: 'forms',
    label: 'HTML <form> submission',
    status: 'UNKNOWN',
    notes: 'Not addressed in Microsoft documentation. Export validator warns on <form>.',
    source: SUPPORT,
  },
  {
    id: 'iframes',
    label: 'Nested iframes',
    status: 'UNKNOWN',
    notes: 'Not documented. Export validator warns on <iframe>.',
    source: SUPPORT,
  },
  {
    id: 'external-fonts-images',
    label: 'Fonts/images from other domains',
    status: 'UNKNOWN',
    notes: 'Not stated; likely blocked. Export validator flags external resources as errors.',
    source: SUPPORT,
  },
];

export const MAX_HTML_BYTES = 10 * 1024 * 1024;
