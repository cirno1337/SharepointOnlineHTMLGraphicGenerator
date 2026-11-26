# Issue: direct canvas editing and Copilot write-back failed on uploaded static HTML

Classification: **`FAILED_IN_CURRENT_TEST`**. Microsoft documents direct canvas editing and Copilot editing of HTML pages as supported (`MICROSOFT_DOCUMENTED`, see `docs/research/microsoft-documentation-2026-11-26.md`). This is **not** classified as unsupported. It does not block LiveData work. Do not retry Copilot writes during this milestone unless instructed.

## Reproduction (2026-11-26, one tenant, Studio static export a0525ce, uploaded unmodified)
1. Upload the export through Site Pages > Create or upload > Upload HTML page. It opened as a published page.
2. Edit mode > select the intro paragraph on the canvas and type: text is selectable, typing changes nothing.
3. Copilot pane > "Rewrite the intro paragraph ... shorter". Copilot reads the page and proposes text, then reports that SharePoint reported the page changed during each attempt and blocked the update; nothing was modified.
4. Copilot pane > "Change only the callout background color to light blue ...". Same result.
5. Repeat on a fresh uploaded byte-identical copy, going straight to Copilot without touching the canvas: same result. So the failure is reproducible and not caused by canvas interaction.

## Expected vs observed
Expected: canvas text edits and Copilot edits succeed. Observed: canvas typing has no effect; Copilot write-back is rejected with a concurrency-style message.

## Possible causes (all unverified)
- SharePoint adds an `mso` content-type block and `xmlns` attributes after upload (observed), so the file changes after the editor loads it.
- Editor autosave versus Copilot write-back (version/ETag conflict).
- Copilot write support only for pages Copilot created itself (a Copilot-created page was editable by the same Copilot flow in the lab only as far as creation went).
- A tenant or licence-channel limitation.

## Sanitized evidence
Copilot messages quoted in `docs/research/livedata-experiments.md` history and the tenant notes; no identifiers.

## Recommended later retest (no workaround)
Retest on a Copilot-created page; test an uploaded page after removing the SharePoint-added block in a copy; test with another account and tenant; ask Microsoft support through the documented feedback route. Do not script around the failure.
