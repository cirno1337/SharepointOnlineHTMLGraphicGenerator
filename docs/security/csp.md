# Content-Security-Policy review

Status: **reviewed on paper; unverified in a tenant.** Nothing here claims SharePoint compatibility. The tenant protocol (`docs/testing/real-tenant-baseline.md`, TC-14 and TC-19) is what settles the open points.

## Current policy

Emitted by `src/core/export/render.ts` (`EXPORT_CSP`) as the first element after the charset/viewport metas:

```html
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:">
```

Full value: `default-src 'none'; style-src 'unsafe-inline'; img-src data:`

A unit test pins this string, so any change is deliberate and must update this file and `DECISIONS.md`.

## Directives and why they exist

| Directive | Why it is there | Notes |
|---|---|---|
| `default-src 'none'` | Deny-by-default for every fetch directive not listed: scripts, XHR/fetch/WebSocket (`connect-src`), fonts, media, nested frames (`frame-src`), objects, workers. This mirrors the documented platform rules (no external scripts, no outbound calls) so the file is also safe if opened outside SharePoint, e.g. downloaded or attached to email. | Does **not** cover `base-uri`, `form-action`, `frame-ancestors` or navigation. See "What the policy does not do". |
| `style-src 'unsafe-inline'` | The export has one inline `<style>` element so the file is self-contained. Without it the page would render unstyled. | Allows inline styles only; it does not allow scripts. A hash would be stricter but breaks if the platform re-serialises whitespace in the style element. Revisit after TC-12 shows whether the platform leaves the element byte-identical. |
| `img-src data:` | The platform documents base64 images as supported. Studio has no image component yet, so this is **currently unused**. | Reserved. Removing it is strictly safer until images exist (see Review items). |

Fonts: the page uses the system stack (`Segoe UI`, `system-ui`, …) so no `font-src` is needed.

## What the policy does not do

- It is delivered by `<meta>`, so it applies only to this document, only to content parsed after the tag, and it **cannot** express `frame-ancestors`, `report-uri` or `sandbox`.
- If SharePoint also sends a CSP header, both policies are enforced and the effective policy is the intersection. A meta policy can only **tighten** what the host allows, never loosen it. So this policy can cause failures but cannot be the reason something is *allowed*.
- `form-action` and `base-uri` are not set (they do not fall back to `default-src`). The exporter never emits `<form>` or `<base>`, and the validator warns/errors on them.
- CSP does not restrict link navigation or `postMessage`. Links and any host/iframe messaging are unaffected by this policy.

## Could it conflict with SharePoint's iframe rendering?

Microsoft states that HTML renders "in a sandboxed iframe" with "Content Security Policy (CSP) rules" for extra isolation, but publishes **no directives, no description of the frame's `src`/`srcdoc` form, and no description of anything SharePoint injects into the frame**. So the following are risks, not facts:

1. **Platform-injected script or style inside the frame.** If SharePoint adds an inline `<script>`, a script from a SharePoint host, or inline styles (for example a height-sync helper, an accessibility shim, or edit-mode tooling), `default-src 'none'` (which also governs `script-src`) would block it.
2. **Edit mode.** Microsoft documents editing text and images on the canvas and with the Copilot pane. If that is implemented by injecting code into the page frame rather than by the host manipulating the DOM from outside, the policy could break editing while viewing still works.
3. **Sanitisation.** The platform may strip or rewrite `<meta http-equiv>`, `<style>` or attributes. Stripped meta = no failure, but the page then relies on the platform policy alone.
4. **Frame form.** The policy behaves the same for `srcdoc`, `blob:` and served documents, but a platform wrapper that rewrites `<head>` could place content before the meta, weakening it (never loosening beyond the host policy).

## What failure would look like

| Symptom | Likely cause | How to confirm |
|---|---|---|
| Page renders **unstyled** | `style-src` blocked, or the platform removed `<style>` | Console: `Refused to apply inline style …`; Elements panel: is the `<style>` present? |
| Page renders but is **clipped, has an inner scrollbar, or has wrong height** | Host height-sync script blocked by `default-src 'none'` | Console: `Refused to execute inline script …` or `Refused to load the script …` naming a SharePoint host (redact host) |
| **Edit mode cannot select or save text** (TC-19) while view mode is fine | Edit tooling injected into the frame is blocked | Same console messages, appearing only in edit mode |
| **Blank page** | Unlikely from CSP alone; more likely the file was rejected or rewritten | Compare retrieved file hash (TC-17) |
| No console messages, everything fine, meta absent from the rendered DOM | The platform stripped the meta | Record as a transformation; no action |

## Decision rules (so nobody loosens it speculatively)

1. Do **not** add `script-src`, `connect-src`, `'unsafe-inline'` for scripts, or any host allow-list on a hunch.
2. If a tenant test fails, first run **variant B**: the same file with only the meta line removed (protocol, TC-14). Variant B can only remove restrictions Studio added; the platform CSP stays in force.
   - If B works and baseline fails: the failing console message names the directive. Record it, then decide with the project owner. Prefer dropping the meta over granting new capabilities.
   - If both fail: the cause is not this CSP.
3. Any loosening needs a recorded console violation from a real tenant, the narrowest possible source, and an updated test and `DECISIONS.md` entry.

## Review items for a human

- `img-src data:` is unused today. Keep (documented platform support, harmless) or remove until an image component exists?
- Should the meta CSP stay at all if tenant testing shows SharePoint strips it or its platform policy already covers the same ground? Its remaining value is defense in depth for copies of the file outside SharePoint.

## Interactive Safe profile (experimental, added 2026-11-26)

`default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:` (constant `INTERACTIVE_CSP`). Evidence: LD-04, one tenant. Studio's static policy stopped the LiveData page script (static markup rendered, no value); adding only `script-src 'unsafe-inline'` fixed it (`TENANT_OBSERVED_ONCE` each). The CSP `<meta>` survived upload unchanged; the file's response header carried only `frame-ancestors`. The `blob:` frame's own CSP is unknown. This is not claimed to work in any other tenant.

Tradeoff: `unsafe-inline` allows any inline script in the document, so the CSP no longer blocks injected inline script. Compensations: the export validator requires the only executable script to equal Studio's runtime byte for byte (plus one JSON manifest), rejects inline event handlers and `javascript:`, requires the meta to equal the selected profile's policy, and all dynamic text is escaped. `connect-src` stays blocked through `default-src 'none'`; no `frame-src`, external script/style, or `unsafe-eval`. `base-uri` and `form-action` remain unset in both profiles (they do not fall back to `default-src`); the exporter never emits `<base>` or `<form>`. Nonce or hash instead of `unsafe-inline`: not adopted (a nonce in a static file is not secret; SharePoint rewrites the stored file, so a hash may stop matching; both are hypotheses). Static Safe keeps its policy unchanged and contains no script.
