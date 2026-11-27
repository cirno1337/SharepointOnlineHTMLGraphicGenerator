import { z } from 'zod';
import { MAX_HTML_BYTES } from '../capabilities';
import { INTERACTIVE_CSP, STATIC_CSP, exportContext, renderPage, type RenderContext } from '../export/render';
import { safeFileName } from '../export/fileName';
import { LIVEDATA_CONTRACT_REVISION, LIVEDATA_PROVIDER_EVIDENCE, PERMISSION_BLOCKER_NOTICE } from '../livedata/constants';
import { compileManifest } from '../livedata/manifest';
import type { Project } from '../project';
import { scanExport, validateHtml, validateProject, type Issue } from '../validate';
import { sha256Hex, utf8ByteLength } from './hash';

export const ValidationReportSchema = z.object({
  reportVersion: z.literal(1),
  kind: z.literal('studio-export-validation-report'),
  generatedAt: z.string(),
  studio: z.object({ build: z.string() }),
  html: z.object({
    fileName: z.string(),
    utf8Bytes: z.number().int().nonnegative(),
    limitBytes: z.literal(MAX_HTML_BYTES),
    percentOfLimit: z.number().nonnegative(),
    sha256: z.string().regex(/^[0-9a-f]{64}$/),
    csp: z.string(),
  }),
  checks: z.object({
    scriptCount: z.number().int().nonnegative(),
    resourceReferenceCount: z.number().int().nonnegative(),
    linkTagCount: z.number().int().nonnegative(),
    inlineHandlerCount: z.number().int().nonnegative(),
    sameSiteLinkCount: z.number().int().nonnegative(),
    externalLinkCount: z.number().int().nonnegative(),
  }),
  validation: z.object({
    errorCount: z.number().int().nonnegative(),
    warningCount: z.number().int().nonnegative(),
    issues: z.array(z.object({ severity: z.enum(['error', 'warning']), code: z.string(), message: z.string() })),
  }),
  project: z.object({ componentCount: z.number().int().nonnegative(), boundComponentCount: z.number().int().nonnegative() }),
  exportProfile: z.enum(['static-safe', 'interactive-safe']),
  /** Experimental LiveData facts. Never contains an identifier, URL or sharing link. */
  liveData: z.object({
    experimentalFeatureUsed: z.boolean(),
    contractRevision: z.string().nullable(),
    evidenceLevel: z.string().nullable(),
    manifestSourceCount: z.number().int().nonnegative(),
    cspStatus: z.string(),
    refreshSupported: z.boolean(),
    permissionWarning: z.string().nullable(),
    /** True when the exported file contains the workbook item URL (tenant host and drive/item identifiers). */
    identifiersInExport: z.boolean(),
    cslViewLinkInExport: z.boolean(),
    explicitSharingDecisionRequired: z.boolean(),
    fallbackAvailable: z.boolean(),
    capability: z.literal('experimental').nullable(),
    permissionTestOutstanding: z.boolean(),
    selectorEvidence: z.string().nullable(),
    /** One entry per Live KPI. Never the label text (it may be business-sensitive): only its length. */
    selectors: z.array(
      z.object({
        selectorType: z.string(),
        worksheet: z.string(),
        labelLength: z.number().int().nonnegative().nullable(),
        matchColumn: z.number().int().nullable(),
        valueOffset: z.number().int().nullable(),
        caseSensitive: z.boolean().nullable(),
        trim: z.boolean().nullable(),
        snapshotFallbackPresent: z.boolean(),
      }),
    ),
  }),
  notes: z.array(z.string()),
});
export type ValidationReport = z.infer<typeof ValidationReportSchema>;

export function percentOfLimit(bytes: number): number {
  return Math.round((bytes / MAX_HTML_BYTES) * 100 * 10000) / 10000;
}

export interface TenantExport {
  /** The project this export was generated from; lets the UI detect staleness by identity. */
  source: Project;
  html: string;
  htmlFileName: string;
  reportFileName: string;
  report: ValidationReport;
  reportJson: string;
}

/**
 * Build the normal static export plus a machine-readable validation report.
 * The HTML is exactly what renderPage produces: no scripts, no network references, and no
 * tenant URL, credential or identifier is added. The report is a separate file.
 */
export async function createTenantTestExport(project: Project, ctx: RenderContext = exportContext(), opts: { liveEnabled?: boolean } = {}): Promise<TenantExport> {
  const html = renderPage(project, ctx);
  const htmlFileName = safeFileName(project.page.title, 'html');
  const profile = project.page.exportProfile;
  const issues: Issue[] = [...validateProject(project, { liveEnabled: opts.liveEnabled }), ...validateHtml(html, { profile })];
  const liveKpis = project.page.components.filter((c) => c.type === 'liveKpi');
  const usedIds = new Set(liveKpis.map((c) => (c.type === 'liveKpi' ? c.sourceId : '')));
  const manifest = profile === 'interactive-safe' ? compileManifest(project.page.liveSources, usedIds) : null;
  const liveUsed = profile === 'interactive-safe' && liveKpis.length > 0;
  const scan = scanExport(html);
  const bytes = utf8ByteLength(html);
  const report: ValidationReport = {
    reportVersion: 1,
    kind: 'studio-export-validation-report',
    generatedAt: ctx.exportedAt,
    studio: { build: ctx.studioBuild },
    html: { fileName: htmlFileName, utf8Bytes: bytes, limitBytes: MAX_HTML_BYTES, percentOfLimit: percentOfLimit(bytes), sha256: await sha256Hex(html), csp: profile === 'interactive-safe' ? INTERACTIVE_CSP : STATIC_CSP },
    checks: {
      scriptCount: scan.scriptCount,
      resourceReferenceCount: scan.resourceReferenceCount,
      linkTagCount: scan.linkTagCount,
      inlineHandlerCount: scan.inlineHandlerCount,
      sameSiteLinkCount: scan.sameSiteLinkCount,
      externalLinkCount: scan.externalLinkCount,
    },
    validation: {
      errorCount: issues.filter((i) => i.severity === 'error').length,
      warningCount: issues.filter((i) => i.severity === 'warning').length,
      issues: issues.map(({ severity, code, message }) => ({ severity, code, message })),
    },
    project: {
      componentCount: project.page.components.length,
      boundComponentCount: project.page.components.filter((c) => (c.type === 'kpi' || c.type === 'table') && c.binding).length,
    },
    exportProfile: profile,
    liveData: {
      experimentalFeatureUsed: liveUsed,
      contractRevision: liveUsed ? LIVEDATA_CONTRACT_REVISION : null,
      evidenceLevel: liveUsed ? LIVEDATA_PROVIDER_EVIDENCE : null,
      manifestSourceCount: manifest?.entries.length ?? 0,
      cspStatus: profile === 'interactive-safe' ? 'interactive-safe: script-src unsafe-inline (evidence: one tenant, LD-04); default-src none' : 'static-safe: no script',
      refreshSupported: liveUsed && liveKpis.some((c) => c.type === 'liveKpi' && c.showRefresh),
      permissionWarning: liveUsed ? PERMISSION_BLOCKER_NOTICE : null,
      identifiersInExport: (manifest?.entries.length ?? 0) > 0,
      cslViewLinkInExport: false,
      explicitSharingDecisionRequired: liveUsed,
      fallbackAvailable: liveKpis.some((c) => c.type === 'liveKpi' && !!c.fallback),
      capability: liveUsed ? 'experimental' : null,
      permissionTestOutstanding: liveUsed,
      selectorEvidence: liveUsed ? 'label-adjacent: design derived from one tenant observation (LD-09, TENANT_OBSERVED_ONCE); not documented by Microsoft' : null,
      selectors: liveKpis.flatMap((c) =>
        c.type !== 'liveKpi'
          ? []
          : [
              {
                selectorType: c.selector.type,
                worksheet: c.worksheet,
                labelLength: c.selector.type === 'label-adjacent' ? c.selector.label.length : null,
                matchColumn: c.selector.type === 'label-adjacent' ? c.selector.matchColumn : null,
                valueOffset: c.selector.type === 'label-adjacent' ? c.selector.valueOffset : null,
                caseSensitive: c.selector.type === 'label-adjacent' ? c.selector.caseSensitive : null,
                trim: c.selector.type === 'label-adjacent' ? c.selector.trim : null,
                snapshotFallbackPresent: !!c.fallback,
              },
            ],
      ),
    },
    notes: [
      'Local test metadata. Not part of the exported page. Do not publish it to SharePoint.',
      'The hash is of the UTF-8 bytes of the HTML file exactly as downloaded.',
      'This report does not claim SharePoint compatibility. Only the manual tenant protocol can establish that.',
    ],
  };
  return { source: project, html, htmlFileName, reportFileName: safeFileName(`${project.page.title} validation`, 'json'), report, reportJson: `${JSON.stringify(report, null, 2)}\n` };
}
