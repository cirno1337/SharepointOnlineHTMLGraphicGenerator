import { z } from 'zod';
import { MAX_HTML_BYTES } from '../capabilities';

/** Patterns that indicate a credential, session artifact or tenant identifier was pasted into a result. */
const SENSITIVE: [RegExp, string][] = [
  [/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/, 'a JWT-like token'],
  [/\bBearer\s+\S+/i, 'a Bearer token'],
  [/\b(?:set-)?cookie\s*:/i, 'a cookie header'],
  [/\bauthorization\s*:/i, 'an Authorization header'],
  [/\b(?:access_token|refresh_token|id_token|client_secret)\b/i, 'a token or secret name'],
  [/\b(?:FedAuth|rtFa|SPOIDCRL|ESTSAUTH\w*)\b/, 'a SharePoint/Entra session cookie name'],
  [/[?&](?:sig|sv|se|tempauth|access_token)=/i, 'a signed-URL parameter'],
  [/[a-z0-9-]+\.sharepoint\.com/i, 'a tenant hostname (write [tenant] instead)'],
];

export function findSensitive(value: string): string | null {
  for (const [re, what] of SENSITIVE) if (re.test(value)) return what;
  return null;
}

/** Free text written by a human tester. Rejected when it appears to contain credentials or tenant hostnames. */
const safeText = (max: number) =>
  z
    .string()
    .max(max)
    .superRefine((v, ctx) => {
      const hit = findSensitive(v);
      if (hit) ctx.addIssue({ code: 'custom', message: `Looks like it contains ${hit}. Redact it before saving.` });
    });

const sha256 = z.string().regex(/^[0-9a-f]{64}$/, 'Expected 64 lowercase hex characters.');

export const CaseStatusSchema = z.enum(['pass', 'fail', 'blocked', 'not-run']);

export const TenantCaseResultSchema = z
  .object({
    id: z.string().regex(/^TC-\d{2}$/),
    title: safeText(200),
    expected: safeText(1000),
    actual: safeText(2000),
    status: CaseStatusSchema,
    observations: z.array(safeText(1000)).max(50),
    evidence: z.array(z.object({ label: safeText(200), fileName: z.string().max(200).regex(/^[\w .()-]+$/, 'File name only, no paths or URLs.') })).max(20),
  })
  .superRefine((c, ctx) => {
    if (c.status !== 'not-run' && c.actual.trim() === '') ctx.addIssue({ code: 'custom', path: ['actual'], message: 'Describe the actual result.' });
    if ((c.status === 'fail' || c.status === 'blocked') && c.observations.length === 0) {
      ctx.addIssue({ code: 'custom', path: ['observations'], message: 'Failed or blocked cases need at least one observation.' });
    }
  });

export const TransformationSchema = z.object({
  id: z.string().regex(/^T-\d{2}$/),
  area: z.enum(['markup', 'attributes', 'css', 'csp', 'scripts', 'encoding', 'links', 'layout', 'other']),
  description: safeText(1000),
  before: safeText(1000).optional(),
  after: safeText(1000).optional(),
});

export const TenantTestResultSchema = z.object({
  schemaVersion: z.literal(1),
  /** `baseline` = the file exactly as Studio exported it. `no-csp-meta` = diagnostic copy with only the CSP <meta> line removed (see docs/testing). */
  variant: z.enum(['baseline', 'no-csp-meta']),
  /** ISO date, e.g. 2026-12-01 */
  testDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  studio: z.object({ version: safeText(40), build: safeText(80) }),
  browser: z.object({ name: safeText(60), version: safeText(40), os: safeText(60) }),
  tenant: z.object({
    /** A non-identifying alias such as "dev-tenant-A". Never the tenant name or hostname. */
    label: safeText(80),
    releaseChannel: safeText(120),
    htmlPagesEnabled: z.boolean(),
    copilotLicensed: z.boolean(),
  }),
  html: z.object({
    fileName: z.string().max(200),
    utf8Bytes: z.number().int().positive().max(MAX_HTML_BYTES),
    sha256,
    /** Site-relative path only, with the site name redacted if sensitive, e.g. /sites/[site]/SitePages/x.html */
    uploadPath: safeText(300),
    retrievedSha256: sha256.nullable(),
  }),
  /** The tester confirms no token, cookie, sensitive header, tenant hostname or personal data is in this file or its evidence. */
  sanitizationConfirmed: z.literal(true),
  cases: z.array(TenantCaseResultSchema).min(1),
  transformations: z.array(TransformationSchema),
  summary: safeText(3000),
});
export type TenantTestResult = z.infer<typeof TenantTestResultSchema>;
