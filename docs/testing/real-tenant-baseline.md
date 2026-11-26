# Real-tenant baseline test protocol

Purpose: find out, by observation, how SharePoint Online actually renders and transforms a Studio static export. **Until this protocol has been completed and the result files reviewed, Studio makes no claim of SharePoint compatibility.** `docs/research/sharepoint-html-pages.md` lists what Microsoft documents; this protocol covers what it does not.

> ## Do not capture secrets
> Do **not** copy, screenshot, paste or commit: access/refresh/ID tokens, cookies (`FedAuth`, `rtFa`, …), `Authorization` headers, HAR files, signed URLs (`sig=`, `sv=`, `tempauth=`), request headers of any kind, tenant host names, user names, e-mail addresses or page content that is not synthetic.
> - **Never export a HAR file.** Copy only the three response headers named in TC-14 by hand.
> - Redact host names to `[tenant]` / `[host]`; redact site names if sensitive.
> - Crop screenshots to the page area; hide the address bar and profile picture.
> - Do not paste scripts into the browser console. This protocol needs only reading the Elements, Network and Console panels.
> - Result files are checked by `npm run validate-result`, which rejects many (not all) credential patterns. It is a safety net, not a guarantee.
> - Keep results and evidence in `tenant-test-output/` (git-ignored). Do not commit them without review.

## Test environment (fill in)

| Field | Value |
|---|---|
| Test date (YYYY-MM-DD) | |
| Tester alias (not a name) | |
| Tenant alias (e.g. `dev-tenant-A`; **not** the real name) | |
| SharePoint release channel (Frontier public program / Targeted release / Standard / unknown) | |
| "Allow HTML files" on the site (Site Pages → File types) | on / off |
| Tester permission on site | Owner / Member / Visitor |
| Copilot license on tester account | yes / no |
| Browser and version | |
| Operating system | |
| Studio version and build (from Tenant Test Export panel) | |
| Studio git commit | |
| HTML file name | |
| UTF-8 bytes / % of limit | |
| SHA-256 of uploaded file | |
| Upload path (site-relative) | |

## Part A: prepare the file

1. `npm install`, then `npm run dev`, then open the printed `localhost` URL (SHA-256 needs a secure context; `localhost` qualifies).
2. Click **Load “SharePoint Compatibility Baseline” template** and confirm.
3. Select the **Same-site link** in the outline. In the Inspector replace the placeholder target with a real root-relative path of **another page on the test site** (for example `/sites/<yoursite>/SitePages/Home.aspx`). This edit stays on your machine. Do **not** save or commit the project file: `*.studio.json` is git-ignored for this reason.
4. Leave the external link as `https://example.com/studio-external-link-test` (reserved domain, never real traffic).
5. Click **Tenant Test Export**. Resolve any validation **errors** (warnings about the external link are expected).
6. **Download HTML** and **Download validation report (JSON)**. Keep both; upload only the HTML.
7. Hash the downloaded HTML locally and confirm it equals the displayed SHA-256.

## Part B: upload and observe (exact manual steps)

1. Sign in to the test tenant with the tester account. Open the test site (a site where HTML pages are enabled).
2. Open **Site Pages**.
3. Choose **Create or upload** → **Upload HTML page** and pick the downloaded `.html`. (Labels follow Microsoft's documentation; record the exact wording you see.)
4. Open the page; note whether it opens as a draft.
5. Run the cases below in order. After TC-04 you may continue on the published page.
6. Do not use *Upload HTML folder*, Copilot creation, or any other route for this baseline.

## Part C: cases

For every case record **Actual**, **Status** (`pass`, `fail`, `blocked`, `not-run`), sanitized observations, and evidence file names. A case that cannot be run is `blocked` with the reason, never `pass`.


### TC-01 — Pre-flight: size and hash

**Steps**

1. In Studio, load **SharePoint Compatibility Baseline**, edit the same-site link (Part A), click **Tenant Test Export**.
2. Record the UTF-8 size, % of limit and SHA-256 shown in the panel. Confirm Validation shows 0 errors.
3. Download the HTML and the validation report. Hash the downloaded HTML locally (`sha256sum <file>` or PowerShell `Get-FileHash -Algorithm SHA256 <file>`) and confirm it equals the SHA-256 in the panel and in the report.

**Expected:** Tenant Test Export reports a UTF-8 size well under 10 MB and a 64-hex SHA-256; Studio shows no validation errors.

| Actual | Status | Observations (sanitized) | Evidence |
|---|---|---|---|
|  |  |  | `evidence/TC-01-<what>.png` |


### TC-02 — Upload to Site Pages

**Steps**

1. Open the test site, go to **Site Pages**.
2. Use the **Create or upload** menu → **Upload HTML page** (Microsoft's documented label; record the exact label you see if it differs).
3. Select the exported `.html` file. Record the upload path (site-relative, site name redacted if sensitive).

**Expected:** The .html file uploads through "Upload HTML page" into Site Pages without an error or a size/type rejection.

| Actual | Status | Observations (sanitized) | Evidence |
|---|---|---|---|
|  |  |  | `evidence/TC-02-<what>.png` |


### TC-03 — Open as draft

**Steps**

1. Open the uploaded page. If SharePoint opens it as a draft, note the state shown.
2. Walk the page top to bottom against the baseline sections: H1, paragraph, special characters, callout, three KPIs, Issues table (7 rows), wrapping text, two links, export info footer.
3. Check text of the special-characters paragraph character by character: accents, CJK, RTL, emoji, curly quotes.

**Expected:** The draft opens; styles are applied; all baseline sections are visible; no blank page and no "unsupported content" banner.

| Actual | Status | Observations (sanitized) | Evidence |
|---|---|---|---|
|  |  |  | `evidence/TC-03-<what>.png` |


### TC-04 — Publish

**Steps**

1. Publish the page (or use **Save and close** first to confirm draft retention, then publish).
2. Copy nothing from the address bar into results other than the site-relative path.

**Expected:** Publishing succeeds and the page is reachable at its published URL.

| Actual | Status | Observations (sanitized) | Evidence |
|---|---|---|---|
|  |  |  | `evidence/TC-04-<what>.png` |


### TC-05 — Reopen after publish

**Steps**

1. Close the page, reopen it from Site Pages, and open it again in a new browser tab and in a private window (as a user with read access, if available).
2. Compare against the draft view.

**Expected:** Closing and reopening the page (and opening it in a new tab) renders identically to the draft.

| Actual | Status | Observations (sanitized) | Evidence |
|---|---|---|---|
|  |  |  | `evidence/TC-05-<what>.png` |


### TC-06 — Versioning

**Steps**

1. Open version history for the file/page (from the Site Pages library item menu).
2. Record which versions exist after upload and publish. Open or view one older version if the UI allows it. If versioning is not offered for HTML pages, record that.

**Expected:** Version history lists the upload/publish versions; restoring or viewing a previous version renders correctly.

| Actual | Status | Observations (sanitized) | Evidence |
|---|---|---|---|
|  |  |  | `evidence/TC-06-<what>.png` |


### TC-07 — Responsive behavior

**Steps**

1. With DevTools device toolbar (or a resized window) test widths about 1280, 768 and 375 CSS px.
2. At each width check: horizontal page scroll (should be none), the Issues table scrolls inside its own region, the unbroken long string wraps, the KPI cards stay readable.
3. Capture one screenshot per width.

**Expected:** At about 1280, 768 and 375 CSS px: no horizontal page scroll, table scrolls inside its own region, long text wraps, KPIs stay readable.

| Actual | Status | Observations (sanitized) | Evidence |
|---|---|---|---|
|  |  |  | `evidence/TC-07-<what>.png` |


### TC-08 — Same-site link

**Steps**

1. Before exporting, you replaced the same-site link target with a real page on the **same site** (Part A). Click it.
2. Record where it opened: inside the page frame, the top window, or a new tab. Record whether the link works at all.

**Expected:** The same-site link navigates to the target page (record whether in the frame, top window or a new tab).

| Actual | Status | Observations (sanitized) | Evidence |
|---|---|---|---|
|  |  |  | `evidence/TC-08-<what>.png` |


### TC-09 — External link

**Steps**

1. Click the external link (`https://example.com/...`) **before** allow-listing. Record the exact message (copy the text; redact nothing needed for example.com).
2. If you are a site/tenant admin: add `example.com` to **Site settings → HTML Field Security** allow list, then click again. Record the behavior and where it opened. If you are not an admin, mark the second half blocked.

**Expected:** Without allow-listing the domain SharePoint blocks or warns; after allow-listing it navigates. Record exact behavior.

| Actual | Status | Observations (sanitized) | Evidence |
|---|---|---|---|
|  |  |  | `evidence/TC-09-<what>.png` |


### TC-10 — HTML-lookalike workbook text

**Steps**

1. In the Issues table and the markup-like KPI, confirm each of these shows as literal characters: `<b>bold?</b> & <script>alert(1)</script>`, `<img src=x onerror=alert(1)>`, `=HYPERLINK(...)`, `"quoted" & 'single' <!-- not a comment -->`, `javascript:alert(1)`.
2. Confirm no image icon, no dialog, no bold/italic formatting, no clickable link from them.

**Expected:** Every markup-like value displays as literal text; no image loads, no script runs, no formatting is applied.

| Actual | Status | Observations (sanitized) | Evidence |
|---|---|---|---|
|  |  |  | `evidence/TC-10-<what>.png` |


### TC-11 — Special characters and encoding

**Steps**

1. Compare the special-characters paragraph with the text in the Studio preview. Record any mojibake, missing glyphs (square boxes), or changed punctuation.

**Expected:** Accents, CJK, RTL, emoji and typographic punctuation display exactly as authored; no mojibake.

| Actual | Status | Observations (sanitized) | Evidence |
|---|---|---|---|
|  |  |  | `evidence/TC-11-<what>.png` |


### TC-12 — SharePoint sanitization/transformation

**Steps**

1. Use DevTools **Elements** on the rendered page frame. Check, and record each as present/absent/changed: `<meta http-equiv="Content-Security-Policy">`, the `<style>` element and its content, `lang` attribute, `<title>`, `rel="noopener noreferrer"` on links, `role`/`aria-*`/`tabindex` attributes, added attributes or elements the platform introduced.
2. Log each difference as a **transformation** (T-01, T-02, …) in the result file. The DOM view is a re-serialisation, so ignore pure whitespace/quote-style differences.

**Expected:** Retrieved or inspected markup equals the uploaded markup, or every difference is recorded as a transformation.

| Actual | Status | Observations (sanitized) | Evidence |
|---|---|---|---|
|  |  |  | `evidence/TC-12-<what>.png` |


### TC-13 — Iframe inspection

**Steps**

1. In DevTools **Elements**, find the `<iframe>` that contains the page.
2. Record: the `sandbox` attribute tokens (copy the token list only), whether it uses `src` or `srcdoc` (record the *form*: `srcdoc`, `blob:`, or `https` same-origin; **do not** record the host), and any `allow`/`referrerpolicy` attributes.
3. Do not run scripts in the console to read storage or cookies.

**Expected:** The page renders in an iframe; record its sandbox tokens, src/srcdoc form and allow attributes.

| Actual | Status | Observations (sanitized) | Evidence |
|---|---|---|---|
|  |  |  | `evidence/TC-13-<what>.png` |


### TC-14 — CSP inspection

**Steps**

1. (a) In the frame's `<head>`, is the CSP `<meta>` present?
2. (b) In the DevTools **Network** tab select the request for the frame's document and copy only the values of `Content-Security-Policy`, `Content-Security-Policy-Report-Only` and `X-Frame-Options` response headers, if present. Copy **no other header**.
3. (c) Copy the text of any console messages beginning `Refused to…` (redact hosts to `[host]`).
4. (d) If TC-03, TC-07 or TC-19 failed, run **variant B** (Part D) and repeat those cases.

**Expected:** Record whether the meta CSP is present in the rendered document, the effective Content-Security-Policy header, and any violation messages.

| Actual | Status | Observations (sanitized) | Evidence |
|---|---|---|---|
|  |  |  | `evidence/TC-14-<what>.png` |


### TC-15 — Console errors

**Steps**

1. Open the Console with the page loaded (reload once with the Console already open). Separate messages into: from the page content (should be none) vs from SharePoint itself. Record counts and the message text with hosts redacted.

**Expected:** No console errors originate from the page content. Platform-originated messages are recorded separately.

| Actual | Status | Observations (sanitized) | Evidence |
|---|---|---|---|
|  |  |  | `evidence/TC-15-<what>.png` |


### TC-16 — Copilot edit of one text element

**Steps**

1. Requires a Copilot license; otherwise mark **blocked**.
2. Select the intro paragraph and ask Copilot to rewrite it shorter. Record the prompt text.
3. Compare the page before/after: only that paragraph should change. Check KPIs (42 items, 17, markup-like), table (7 rows), callout, links, export footer. Record every unintended change as a transformation. Do **not** re-publish over your baseline file; save as a separate page copy if needed.

**Expected:** Copilot changes the targeted paragraph only; KPIs, table, callout and links remain intact; every other change is recorded.

| Actual | Status | Observations (sanitized) | Evidence |
|---|---|---|---|
|  |  |  | `evidence/TC-16-<what>.png` |


### TC-17 — Retrieved content comparison

**Steps**

1. If the library offers **Download** for the page file, download it and hash it locally.
2. Compare with the upload hash from TC-01 and record `retrievedSha256`. If different, diff the files with a text diff and log each difference as a transformation (T-nn). If no download is possible, set `retrievedSha256` to null and record that.

**Expected:** A file retrieved from SharePoint has the same SHA-256 as the upload, or the differences are recorded.

| Actual | Status | Observations (sanitized) | Evidence |
|---|---|---|---|
|  |  |  | `evidence/TC-17-<what>.png` |


### TC-18 — Keyboard and zoom smoke test

**Steps**

1. Tab through the page with the keyboard only. Confirm each link and the table scroll region receive a visible focus ring.
2. Set browser zoom to 200% and confirm content is still usable without horizontal page scroll.

**Expected:** Links and the table scroll region are reachable by keyboard with a visible focus ring; 200% zoom keeps content usable.

| Actual | Status | Observations (sanitized) | Evidence |
|---|---|---|---|
|  |  |  | `evidence/TC-18-<what>.png` |


### TC-19 — Direct canvas edit of one text element

**Steps**

1. Open the page in SharePoint edit mode.
2. Select the intro paragraph on the canvas and change one word. Save/republish to a **copy** (do not overwrite the baseline).
3. Record whether editing works, whether other elements change, and any console violations (especially `Refused to execute inline script`).

**Expected:** In SharePoint edit mode the paragraph can be selected, edited and saved; the rest of the page is unchanged; no CSP violations appear in the console.

| Actual | Status | Observations (sanitized) | Evidence |
|---|---|---|---|
|  |  |  | `evidence/TC-19-<what>.png` |


## Part D: variant B (only if baseline fails)

If TC-03, TC-07 or TC-19 fail, or the console shows CSP violations:

1. Copy the downloaded HTML. In the copy delete **only** the line `<meta http-equiv="Content-Security-Policy" content="…">`. Change nothing else. Name it `…-nocsp.html`.
2. Hash it (new SHA-256) and upload it as a separate page.
3. Repeat TC-03, TC-07, TC-14, TC-15 and TC-19 and save a **separate** result file with `"variant": "no-csp-meta"` and the new hash.
4. Interpretation rules are in `docs/security/csp.md`. Do not loosen the policy based on this alone.

## Part E: transformations log

Every difference between what Studio exported and what SharePoint serves, shows or saves goes here and into `transformations` in the result file.

| ID | Area (markup, attributes, css, csp, scripts, encoding, links, layout, other) | Description | Before | After |
|---|---|---|---|---|
| T-01 | | | | |

## Part F: return the results

1. `mkdir -p tenant-test-output` and copy `docs/testing/tenant-test-result.example.json` to `tenant-test-output/result-baseline.json`.
2. Replace every `EXAMPLE` value with real observations, set every case status honestly, add transformations, and set `"sanitizationConfirmed": true` **only** once you have re-read the file for secrets.
3. `npm run validate-result -- tenant-test-output/result-baseline.json`
4. Return: the result JSON(s), the Studio validation report JSON, the redacted evidence images, and the list below.

### Observations the tester must return

1. Whether the upload succeeded and any message or size/type rejection.
2. Draft vs published render: identical or not (TC-03/05).
3. Exact SHA-256 of the uploaded and (if possible) retrieved file; whether they match (TC-17).
4. Each transformation (CSP meta, `<style>`, attributes, added elements).
5. The iframe's `sandbox` tokens and its `src`/`srcdoc` form (TC-13).
6. The effective CSP header values and any `Refused to…` console messages (TC-14/15).
7. Link behavior: same-site and external, with and without allow-listing (TC-08/09).
8. Whether markup-like values stayed literal text (TC-10) and whether special characters survived (TC-11).
9. Direct canvas edit and Copilot edit outcomes and side effects (TC-16/19).
10. Version history behavior (TC-06) and responsive behavior at 3 widths (TC-07).
11. Any behavior contradicting `docs/research/sharepoint-html-pages.md`.

## Schemas

- Result file: `docs/testing/tenant-test-result.schema.json` (generated from `src/core/tenant/result-schema.ts`); example: `docs/testing/tenant-test-result.example.json` (**all values fake**).
- Studio's validation report: `docs/testing/validation-report.schema.json`.
- Regenerate with `npm run schemas`; a unit test fails if they drift.
