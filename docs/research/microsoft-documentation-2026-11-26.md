# Microsoft documentation check: HTML Pages and live data

Retrieval date: **2026-11-26**. Read in a regular browser (an automated fetcher was refused by the domain check). Claims are paraphrased, not copied. Classification: `MICROSOFT_DOCUMENTED` means stated on these pages.

## Sources

| # | URL | Title | Date shown |
|---|---|---|---|
| S1 | https://support.microsoft.com/en-us/sharepoint/create-edit-publish-html-pages | Create, upload, edit, and publish HTML pages in SharePoint | none shown |
| S2 | https://techcommunity.microsoft.com/blog/spblog/publish-rich-and-interactive-content-with-html-pages-in-sharepoint/4565918 | Publish rich and interactive content with HTML pages in SharePoint | posted and updated Oct 22, 2026, "version 2.0" |

Both pages say some functionality rolls out gradually to organizations in the Frontier program.

## Documented claims relevant to LiveData (MICROSOFT_DOCUMENTED)

- **Live data exists.** S1 lists "live data sharing (lists and Excel)" as supported, with the note that arbitrary fetch requests and outbound API calls are not supported. S2 says pages can show live data "upon refresh" from SharePoint lists, Excel and CSV. (S2 adds CSV; S1 does not mention it.)
- **Third-party live sources are not supported** (S1 lists a third-party source as unsupported).
- **No arbitrary fetch / outbound API calls** (S1, S2).
- **Sandboxed iframe** isolates the page from SharePoint header/footer/navigation; **CSP rules** give extra isolation; no cross-tenant communication (S1, S2). No directives or iframe attributes are published.
- **JavaScript** is supported when contained in the same HTML file. CDN-hosted scripts are not supported, except libraries hosted on a Microsoft-managed CDN: Chart.js, Mermaid, React, Fluent UI, Babylon (S1, S2).
- **localStorage is not accessible** (S1, S2).
- **Size:** 10 MB HTML file limit, excluding assets copied to Site Assets (S1).
- **Upload routes:** `+ New` -> HTML page (needs Copilot licence), or Site Pages -> Create or upload -> Upload HTML page / Upload HTML folder (no licence); a document-library file can be opened with Edit in SharePoint or moved/copied to Site Pages (S1, S2). S1 says that after an upload from the creation screen the page opens in edit mode.
- **Editing:** text and image editing directly on the canvas is listed as supported; Copilot pane editing needs a Microsoft 365 Copilot licence (S1, S2).
- **Publishing does not grant new permissions**; viewing needs read permission on the page (S1).
- **Links:** same-site and same-tenant links work; other domains need the site's HTML Field Security allow list (S1, S2).
- **Branding:** not applied automatically to uploaded HTML (S1, S2).

## What the documentation does NOT define (UNKNOWN unless tested)

- Any authoring contract for live data: no manifest, markup, attribute, API, global variable or message name is described.
- How workbook data reaches the page; what format it has; which sheets/tables/ranges are addressable; how often it refreshes beyond "upon refresh".
- Whether a viewer who can open the page but not the workbook sees data.
- Whether CSV and Excel use the same mechanism; how SharePoint lists are bound.
- The sandbox attribute tokens, the frame source form, the exact CSP, and what the host injects.
- Whether an uploaded (not Copilot-created) page can use live data. (Observed in one tenant; see `live-excel-contract-observed.md`.)

## Differences between documentation and tenant observations (2026-11-26, one tenant)

| Documented | Observed in test tenant | Classification of the observation |
|---|---|---|
| Direct canvas text editing supported | Typing on the canvas of an uploaded static page changed nothing | `FAILED_IN_CURRENT_TEST` (not "unsupported") |
| Copilot pane edits pages | Two write-backs on an uploaded page and one on a clean copy were refused with a "page changed" message | `FAILED_IN_CURRENT_TEST` |
| Upload from the creation screen opens in edit mode | Upload from the Site Pages library opened the page as published in view mode (different route; not a contradiction) | `TENANT_OBSERVED_ONCE` |
| Library note: only the listed libraries from the Microsoft CDN | not tested | `UNKNOWN` |

## Stale statements in this repository to review

- `src/core/capabilities.ts` `live-excel` notes say neither page documents the binding contract (still true) but its label does not mention CSV or the "upon refresh" wording; update once the provider exists.
- `cdn-js` is marked UNSUPPORTED; S1/S2 list five Microsoft-managed libraries as supported. The statement "Only Microsoft-managed libraries are supported" in the notes remains accurate but a `ms-managed-libraries` capability entry should be added (documented, not used by Studio).
