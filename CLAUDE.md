Claude Code Instructions: SharePoint HTML Studio
Mission
Build and maintain an open-source visual editor that exports constrained, accessible HTML for SharePoint Online HTML Pages.

This is not a generic website builder.

Non-negotiable platform rules
Never invent SharePoint support.
Verify platform behavior against current official Microsoft documentation.
Exported pages must not use arbitrary fetch, XMLHttpRequest, WebSocket, Graph calls, SharePoint REST calls, or arbitrary external scripts.
Exported pages must not depend on localStorage.
Do not embed secrets, access tokens, client secrets, refresh tokens, signed URLs, or Power Automate confidential trigger URLs.
Keep unsupported or undocumented functionality behind experimental feature flags.
Keep the editor runtime separate from the exported-page runtime.
Exported HTML must not include GrapesJS, Vite runtime, development code, or editor state.
Treat workbook values as untrusted text.
Never execute workbook formulas or cell HTML.
Excel modes
Supported project modes
Local import: Parse workbook in the browser without uploading it.

Snapshot: Embed selected workbook values into exported HTML.

Live Excel: Experimental until the official SharePoint HTML Page data-binding contract is documented and validated in a real tenant.

Never replace the experimental live provider with a speculative Graph or REST implementation.

Definition of done
A task is not done until relevant commands pass:

npm run typecheck
npm run lint
npm test
npm run build
