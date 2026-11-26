import { TENANT_TEST_CASES } from './cases';
import type { TenantTestResult } from './result-schema';

/**
 * Illustrative result. EVERY value is fake. It exists to show the shape, and is generated
 * (npm run schemas) from the case catalog so it can never drift from the protocol.
 */
export function buildExampleResult(): TenantTestResult {
  const illustrations: Record<string, Partial<TenantTestResult['cases'][number]>> = {
    'TC-01': { status: 'pass', actual: 'EXAMPLE: 24,310 bytes (0.2318% of limit); SHA-256 recorded.', observations: [] },
    'TC-02': { status: 'pass', actual: 'EXAMPLE: uploaded without error.', observations: [] },
    'TC-09': {
      status: 'fail',
      actual: 'EXAMPLE: clicking the external link showed a blocked-site message.',
      observations: ['EXAMPLE: domain was not yet in the HTML Field Security allow list; repeat after allow-listing.'],
    },
    'TC-16': { status: 'blocked', actual: 'EXAMPLE: no Copilot license on the test account.', observations: ['EXAMPLE: Copilot pane unavailable.'] },
  };
  return {
    schemaVersion: 1,
    variant: 'baseline',
    testDate: '2000-01-01',
    studio: { version: '0.0.0-example', build: '0.0.0-example+0000000' },
    browser: { name: 'EXAMPLE-BROWSER', version: '0', os: 'EXAMPLE-OS' },
    tenant: { label: 'EXAMPLE-NOT-A-REAL-TEST', releaseChannel: 'EXAMPLE', htmlPagesEnabled: true, copilotLicensed: false },
    html: {
      fileName: 'SharePoint-Compatibility-Baseline.html',
      utf8Bytes: 24310,
      sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      uploadPath: '/sites/[site]/SitePages/SharePoint-Compatibility-Baseline.html',
      retrievedSha256: null,
    },
    sanitizationConfirmed: true,
    cases: TENANT_TEST_CASES.map((c) => ({
      id: c.id,
      title: c.title,
      expected: c.expected,
      actual: '',
      status: 'not-run' as const,
      observations: [],
      evidence: [],
      ...illustrations[c.id],
    })),
    transformations: [
      { id: 'T-01', area: 'csp', description: 'EXAMPLE: the meta Content-Security-Policy element was absent from the rendered DOM.', before: '<meta http-equiv="Content-Security-Policy" ...>', after: '(removed)' },
    ],
    summary: 'EXAMPLE ONLY. This file illustrates the format; it is not the outcome of any real test.',
  };
}
