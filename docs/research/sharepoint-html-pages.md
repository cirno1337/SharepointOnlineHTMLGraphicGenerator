# SharePoint Online HTML Pages: platform research

Retrieved 2026-11-26 from the two official Microsoft sources below. Everything marked **stated** is taken from those pages; anything marked **inferred** or **not documented** must not be treated as supported.

## Sources

1. Microsoft Support, *Create, upload, edit, and publish HTML pages in SharePoint* — https://support.microsoft.com/en-us/sharepoint/create-edit-publish-html-pages (no last-updated date in the fetched text)
2. Microsoft SharePoint Blog, *Publish rich and interactive content with HTML pages in SharePoint* (Nicole Woon, Oct 22 2026, v2.0) — https://techcommunity.microsoft.com/blog/spblog/publish-rich-and-interactive-content-with-html-pages-in-sharepoint/4565918

The feature is rolling out (Frontier / targeted release, GA expected around end of 2026 / early 2027 per a Microsoft reply on the blog). Re-verify before each release.

## Findings and how Studio treats them

| Topic | Finding | Status | Studio behavior |
|---|---|---|---|
| Storage | Pages live in the Site Pages library; assets go to Site assets (stated) | CONFIRMED | Export is a single `.html` file |
| Upload | "Upload HTML page" (single file) or "Upload HTML folder" (stated) | CONFIRMED | Single file only in v0.1 |
| Size | 10 MB HTML limit, assets excluded; inline video 8 MB each, 24 MB per page (stated) | CONFIRMED | Validator errors above 10 MB |
| Inline JS | JavaScript contained in the same HTML file is supported (stated) | CONFIRMED | Studio exports no script (D-004) |
| Library JS | Only Microsoft-managed Chart.js, Mermaid, React, Fluent UI, Babylon; no other CDN/open-source script locations (stated) | CONFIRMED / UNSUPPORTED for others | Validator rejects any `<script src>` |
| Outbound calls | Arbitrary fetch and outbound API calls are blocked (stated) | UNSUPPORTED | Validator rejects fetch/XHR/WebSocket/Graph/REST |
| Storage API | Sandbox cannot access `localStorage` (stated) | UNSUPPORTED | Validator rejects `localStorage` |
| Sandbox | Rendered in a sandboxed iframe with additional CSP; no directives published (stated) | CONFIRMED | Export includes a restrictive CSP `<meta>`; preview iframe is `sandbox=""` |
| Images | Base64 and same-domain URLs supported (stated) | CONFIRMED | No image component yet |
| Live data | "Live data sharing (lists and Excel)" is Yes, with the fetch caveat; blog adds CSV. **Neither page describes the mechanism or how to author it.** | EXPERIMENTAL | Disabled stub provider; no Graph/REST |
| Third-party live data | No (stated) | UNSUPPORTED | — |
| Forms | `<form>` not mentioned | UNKNOWN | Validator warns |
| Iframes | Not mentioned (inferred: not supported) | UNKNOWN | Validator warns |
| External fonts/images | Not stated (inferred: blocked by same-domain rule) | UNKNOWN | Validator errors on external resources |
| Accessibility | Copilot-created pages meet accessibility requirements; uploaded HTML is **not** automatically accessible (stated) | CONFIRMED | Studio targets WCAG 2.2 AA itself |
| Branding | Site branding not applied automatically to uploaded HTML (stated) | CONFIRMED | Export carries its own styles |
| Permissions | Publishing grants no new permissions; create/upload/edit/publish need Member (Edit); view needs Visitor (stated) | CONFIRMED | Documented in README |
| Admin | "Allow HTML files" is a per-site toggle; cannot be disabled tenant-wide (stated). Community reports that the toggle is not fully enforced; Microsoft is investigating | CONFIRMED / unverified | — |
| Licensing | Copilot license needed for the Copilot creation/edit flows, not for upload, direct edit, publish, view (stated) | CONFIRMED | Uploads need no Copilot |
| Co-authoring, private drafts, templates, mobile editing | Not supported (stated) | UNSUPPORTED | — |
| Browser support, cookies, versioning | Not documented | UNKNOWN | — |

## Open questions that block features

- How an HTML page declares a live Excel/list data source, what metadata is stored, and how permissions are evaluated at view time. Needed before any live provider can be built. Plan: inspect a Microsoft-generated page with live data in a real tenant.
- Whether `<form>` and nested iframes work.
- Exact CSP directives.
