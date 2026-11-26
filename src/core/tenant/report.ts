import { z } from 'zod';
import { MAX_HTML_BYTES } from '../capabilities';
import { EXPORT_CSP, exportContext, renderPage, type RenderContext } from '../export/render';
import { safeFileName } from '../export/fileName';
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
export async function createTenantTestExport(project: Project, ctx: RenderContext = exportContext()): Promise<TenantExport> {
  const html = renderPage(project, ctx);
  const htmlFileName = safeFileName(project.page.title, 'html');
  const issues: Issue[] = [...validateProject(project), ...validateHtml(html)];
  const scan = scanExport(html);
  const bytes = utf8ByteLength(html);
  const report: ValidationReport = {
    reportVersion: 1,
    kind: 'studio-export-validation-report',
    generatedAt: ctx.exportedAt,
    studio: { build: ctx.studioBuild },
    html: { fileName: htmlFileName, utf8Bytes: bytes, limitBytes: MAX_HTML_BYTES, percentOfLimit: percentOfLimit(bytes), sha256: await sha256Hex(html), csp: EXPORT_CSP },
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
    notes: [
      'Local test metadata. Not part of the exported page. Do not publish it to SharePoint.',
      'The hash is of the UTF-8 bytes of the HTML file exactly as downloaded.',
      'This report does not claim SharePoint compatibility. Only the manual tenant protocol can establish that.',
    ],
  };
  return { source: project, html, htmlFileName, reportFileName: safeFileName(`${project.page.title} validation`, 'json'), report, reportJson: `${JSON.stringify(report, null, 2)}\n` };
}
