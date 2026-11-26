You are the principal software architect and lead developer for a new open-source application called:

SharePoint HTML Studio

Your task is to design and implement a production-quality visual authoring environment for creating interactive HTML pages specifically compatible with the new SharePoint Online HTML Pages functionality.

Do not build a generic website builder.

Build a constrained, extensible, SharePoint-aware visual editor that helps users create HTML pages, validates them against SharePoint HTML Page limitations, previews them, and exports deployable HTML packages.

You are expected to inspect the repository, create the architecture, implement the application, run tests, fix errors, and leave the repository in a runnable and documented state.

Do not stop after generating a plan or scaffold. Implement a working vertical slice.

==================================================
1. OPERATING PRINCIPLES
==================================================

Follow these rules throughout the project:

1. Never invent a SharePoint capability.

2. Classify every platform capability internally as:
   - CONFIRMED
   - EXPERIMENTAL
   - UNSUPPORTED
   - UNKNOWN

3. Confirm SharePoint-specific behavior using current official Microsoft documentation before implementing it.

4. Keep links to the exact Microsoft sources used in:
   docs/research/sharepoint-html-pages.md

5. When documentation is incomplete, create an adapter or feature flag rather than pretending the behavior is known.

6. The visual editor and exported HTML page are separate runtimes:
   - The editor application may use npm packages.
   - The exported SharePoint HTML must not depend on unsupported external libraries or the editor runtime.
   - The exported page must remain usable after the editor application is closed or removed.

7. Prefer predictable, testable code over clever abstractions.

8. Do not commit secrets, tokens, tenant URLs, workbook IDs, user information, or credentials.

9. Do not ask the user to paste Microsoft 365 access tokens into configuration files.

10. Never weaken browser, SharePoint, CSP, authentication, or tenant security controls to make a feature work.

11. Do not implement direct Microsoft Graph calls from exported SharePoint HTML unless official documentation proves that this scenario is supported by the SharePoint HTML Page sandbox.

12. If live Excel data cannot be safely implemented in exported HTML, provide a functional design-time import/snapshot mode and isolate live-data support behind an experimental adapter.

13. Add clear UI labels for experimental features.

14. Run linting, type checking, unit tests, and production build before declaring a milestone complete.

15. Maintain:
   - IMPLEMENTATION_STATUS.md
   - DECISIONS.md
   - CHANGELOG.md

Update them after each milestone.

==================================================
2. CONFIRMED SHAREPOINT PLATFORM CONSTRAINTS
==================================================

Treat the following as requirements to verify against current official Microsoft documentation before implementation.

Current documented behavior indicates:

- SharePoint HTML Pages are stored in the Site Pages library.
- A single HTML file or an HTML folder with supporting assets can be uploaded.
- The maximum HTML file size is 10 MB, excluding separately handled supporting assets.
- HTML Pages run in a sandboxed iframe.
- Content Security Policy provides additional isolation.
- Inline JavaScript contained in the HTML file is supported.
- Arbitrary fetch requests are blocked.
- Outbound API calls are blocked.
- Browser localStorage is unavailable.
- Arbitrary CDN-hosted scripts are unsupported.
- Microsoft-hosted versions of selected libraries are supported, currently including:
  - Chart.js
  - Mermaid
  - React
  - Fluent UI
  - Babylon
- SharePoint documents support for live data from SharePoint lists and Excel but does not clearly document the complete binding mechanism.
- External navigation may require HTML Field Security allow-list configuration.
- SharePoint does not automatically apply site branding to manually uploaded HTML.
- Copilot can later be asked to update an uploaded page to match site branding.
- Uploaded HTML is not automatically guaranteed to meet accessibility requirements.
- The maximum inline audio/video limits and cumulative media limits must be researched and documented.

Use these official starting references:

https://support.microsoft.com/en-us/sharepoint/create-edit-publish-html-pages

https://techcommunity.microsoft.com/blog/spblog/publish-rich-and-interactive-content-with-html-pages-in-sharepoint/4565918

Do not rely only on this prompt. Re-check the current documentation and record the verification date.

==================================================
3. PRODUCT OBJECTIVE
==================================================

Create a browser-based visual editor with:

- drag-and-drop component authoring
- component tree
- property inspector
- responsive preview
- design tokens and themes
- reusable templates
- project save/load
- undo/redo
- HTML import where safely possible
- SharePoint compatibility validator
- accessibility validator
- export preview
- single-file HTML export
- folder/ZIP export
- Excel workbook import
- Excel cell, range, table, and chart-oriented components
- experimental provider architecture for live Excel data
- clear deployment instructions

The application must run locally first.

Expected commands:

npm install
npm run dev
npm run typecheck
npm run lint
npm test
npm run build

Use the current Node.js LTS version and specify it in:
- package.json engines
- .nvmrc
- README.md

Do not use global dependencies for normal development.

==================================================
4. RECOMMENDED TECHNOLOGY
==================================================

Use the following unless repository inspection or technical evidence shows a concrete problem:

Core:
- TypeScript with strict mode
- React
- Vite
- GrapesJS open-source framework

State and validation:
- Zustand for application state
- Zod for project schemas and imported configuration
- DOMPurify for editor-side sanitization
- axe-core for accessibility testing

Excel:
- SheetJS Community Edition for local XLSX parsing, if its current license and capabilities are acceptable
- Evaluate ExcelJS as an alternative
- Document the decision and license implications in THIRD_PARTY_NOTICES.md
- Do not assume formulas can be recalculated by the browser library
- Prefer reading cached formula results when available
- Clearly distinguish formula text, cached result, and display value

Testing:
- Vitest
- React Testing Library
- Playwright for essential end-to-end flows
- happy-dom or jsdom as appropriate

Packaging:
- JSZip for ZIP export, if the current license is acceptable

Code quality:
- ESLint
- Prettier
- no implicit any
- no unbounded use of unknown casts
- no disabled type checking to work around design errors

Before installing dependencies:
1. Verify current package names.
2. Verify licenses.
3. Prefer actively maintained dependencies.
4. Avoid unnecessary libraries.
5. Record important dependency decisions.

==================================================
5. HIGH-LEVEL ARCHITECTURE
==================================================

Use a modular architecture resembling:

src/
  app/
    App.tsx
    router/
    shell/
    state/

  editor/
    grapes/
      createEditor.ts
      editorCommands.ts
      editorEvents.ts
      blockRegistry.ts
      componentRegistry.ts
      traitRegistry.ts
    canvas/
    panels/
    inspector/
    outline/
    history/

  components/
    definitions/
      layout/
      content/
      interaction/
      visualization/
      data/
      excel/
    runtime/
    schemas/
    serialization/

  project/
    schema/
    persistence/
    import/
    migration/
    examples/

  export/
    compiler/
    templates/
    assets/
    singleFile/
    folder/
    zip/
    manifest/

  validation/
    engine/
    rules/
      sharepoint/
      accessibility/
      html/
      performance/
      security/
    report/

  data/
    contracts/
    providers/
      static/
      excelLocal/
      excelSnapshot/
      excelLiveExperimental/
    transforms/
    formatters/

  excel/
    parser/
    workbookModel/
    selectors/
    preview/
    mapping/
    formulas/
    refresh/

  preview/
    sandbox/
    deviceProfiles/

  shared/
    ui/
    utils/
    types/
    constants/

docs/
  architecture/
  research/
  development/
  testing/
  deployment/
  experiments/

tests/
  unit/
  integration/
  e2e/
  fixtures/

Do not force this exact tree if GrapesJS integration requires adjustments, but maintain strict separation between:

1. editor UI
2. component definitions
3. runtime component behavior
4. export compiler
5. validation
6. data providers
7. Excel parsing
8. experimental Microsoft 365 integration

==================================================
6. CORE DOMAIN MODEL
==================================================

Define a versioned project schema.

A project should contain at least:

- schemaVersion
- projectId
- name
- description
- createdAt
- modifiedAt
- editorState
- componentTree
- globalStyles
- designTokens
- assets
- dataSources
- Excel workbook metadata
- compatibilityTarget
- validationSettings
- exportSettings
- experimentalFeatureFlags

Use Zod validation.

Never deserialize and execute arbitrary JavaScript from project files.

Create migration infrastructure from the beginning:

migrateProject(input, fromVersion, toVersion)

The first schema version should already be test-covered.

==================================================
7. VISUAL EDITOR REQUIREMENTS
==================================================

Create a professional three-panel workspace:

Left:
- component/block library
- searchable categories
- component outline/tree

Center:
- GrapesJS canvas
- responsive preview
- desktop/tablet/mobile modes
- selection indicators
- keyboard-accessible operations

Right:
- properties inspector
- content
- layout
- spacing
- typography
- colors
- borders
- responsive visibility
- accessibility
- data binding
- component-specific settings

Top toolbar:
- New
- Open project
- Save project
- Undo
- Redo
- Preview
- Validate
- Export
- Settings

Do not expose every arbitrary GrapesJS styling capability by default.

Create a curated SharePoint-safe editing experience.

Allow an optional advanced CSS view, but validate its output.

Include:
- empty state
- loading state
- error boundaries
- recoverable project loading errors
- confirmation before destructive resets

Project persistence:
- local project download/upload as JSON
- in-memory state
- optional IndexedDB persistence for the editor application

Important:
IndexedDB/localStorage may be used by the local editor application if appropriate.
They must not be required by the exported SharePoint page because localStorage is unavailable in the SharePoint HTML Page sandbox.

==================================================
8. INITIAL COMPONENT LIBRARY
==================================================

Implement working components, not placeholders.

Layout:
1. Page section
2. Container
3. Responsive two-column layout
4. Responsive three-column layout
5. Grid
6. Divider
7. Spacer

Content:
8. Heading
9. Rich text
10. Image
11. Button/link
12. Hero
13. Information card
14. Callout
15. KPI card
16. Badge/status
17. Office document link

Interaction:
18. Accordion
19. Tabs
20. Filterable card gallery
21. Client-side search
22. Checklist
23. Calculator
24. Timeline
25. Comparison table
26. Troubleshooting decision tree

Visualization:
27. Chart component
28. Mermaid diagram
29. Progress bar
30. Status distribution
31. Process steps

Data:
32. Static data table
33. Inline JSON data source
34. Imported CSV data source
35. Imported Excel data source

Excel:
36. Excel single-cell display
37. Excel range table
38. Excel named range display
39. Excel table display
40. Excel KPI card
41. Excel chart data mapping
42. Excel filtered records
43. Excel conditional-status component

All interactive components must:
- work without network calls
- use semantic HTML
- support keyboard interaction
- have visible focus states
- include ARIA only where required
- avoid inaccessible custom controls
- work after export independently of GrapesJS

==================================================
9. EXCEL SUPPORT
==================================================

Excel is a first-class requirement.

Implement it in three levels.

------------------------------------------
LEVEL A: LOCAL DESIGN-TIME IMPORT
Status: REQUIRED
------------------------------------------

Allow the author to select a local:
- .xlsx
- .xls, only if the selected parsing library safely supports it
- .csv

Do not upload the workbook anywhere.

Parse it locally in the browser.

Build an internal workbook model containing:

- workbook name
- worksheet names
- used ranges
- cells
- values
- formatted/display values when available
- formula text when available
- cached formula result when available
- named ranges
- Excel tables
- table column names
- detected header rows
- inferred data types
- date handling metadata

Provide UI to:

- select worksheet
- select cell by address, e.g. B7
- select range, e.g. A1:F20
- select a named range
- select an Excel table
- choose table columns
- preview records
- rename labels
- apply formatting
- filter records
- sort records
- aggregate data
- map data to charts and KPIs

Supported filter operators:
- equals
- not equals
- contains
- starts with
- ends with
- greater than
- greater than or equal
- less than
- less than or equal
- between
- is blank
- is not blank
- date before
- date after

Supported aggregate operations:
- first
- last
- count
- count non-empty
- sum
- average
- min
- max

Handle:
- blank cells
- errors
- percentages
- currencies
- localized dates
- Excel serial dates
- boolean values
- numeric strings
- duplicate headers
- missing headers
- merged cells
- hidden worksheets
- formula cells without cached results

Do not claim the application recalculates arbitrary Excel formulas.

If a formula does not have a usable cached value, show:
“Formula result unavailable. Recalculate and save the workbook in Excel, then re-import.”

------------------------------------------
LEVEL B: SNAPSHOT EXPORT
Status: REQUIRED
------------------------------------------

At export time, convert selected Excel data into a safe snapshot embedded in the generated HTML.

For example:

<script type="application/json" id="sphs-data-source-123">
  ...
</script>

Do not put executable user content into script blocks.

Escape JSON safely, especially:
- <
- >
- &
- Unicode line separators
- closing script sequences

Allow individual Excel components to choose:

- embed selected values only
- embed selected range
- embed filtered records
- embed aggregated result
- embed entire small table

Set size warnings and conservative limits.

Create warnings when:
- an imported dataset is large
- snapshot data materially increases HTML size
- the page approaches SharePoint’s 10 MB limit
- sensitive-looking columns may be exported

Sensitive-looking column warnings should detect names such as:
- password
- secret
- token
- salary
- personal number
- national ID
- account number

This is only a heuristic warning, not a compliance guarantee.

Generated pages must support:
- displaying a single embedded cell
- mapping cells to KPI cards
- displaying ranges as tables
- client-side filtering
- sorting
- search
- pagination for larger embedded datasets
- Chart.js mapping
- conditional formatting

------------------------------------------
LEVEL C: LIVE EXCEL ONLINE
Status: EXPERIMENTAL
------------------------------------------

Microsoft documentation currently indicates that SharePoint HTML Pages support live data from Excel, while also stating that arbitrary fetch and outbound API requests are blocked.

Do not invent an implementation.

Create an interface:

interface DataProvider {
  id: string;
  kind: string;
  capability: "confirmed" | "experimental" | "unsupported" | "unknown";
  configure(...): Promise<...>;
  preview(...): Promise<...>;
  compile(...): Promise<CompiledDataBinding>;
  validate(...): ValidationResult[];
}

Implement:
- StaticDataProvider
- CsvImportProvider
- ExcelLocalProvider
- ExcelSnapshotProvider

Create a disabled or clearly experimental:
- SharePointExcelLiveProvider

The experimental provider must not emit speculative Graph or SharePoint REST code.

Instead:

1. Research the official SharePoint HTML Page Excel live-data mechanism.
2. Document all evidence.
3. Add test fixtures if a Microsoft-generated sample can be legally and safely inspected.
4. Implement only after identifying a supported binding contract.
5. Put implementation behind:
   VITE_EXPERIMENTAL_EXCEL_LIVE=true
6. Show a visible “Experimental” badge.
7. Include a diagnostic mode that displays generated binding metadata without secrets.
8. Fail safely to snapshot mode when live mode is unavailable.

Do not use these approaches inside exported HTML unless official support is confirmed:
- Microsoft Graph fetch
- SharePoint REST fetch
- XMLHttpRequest
- hidden access tokens
- client secrets
- embedded refresh tokens
- MSAL authentication popup
- iframe scraping
- office.com DOM access
- anonymous sharing as a workaround
- Power Automate HTTP endpoint containing a secret URL

The future live provider should support, if Microsoft’s actual contract allows it:
- workbook stored in SharePoint Online or OneDrive for Business
- worksheet selection
- cell address
- named range
- Excel table
- refresh behavior
- permission-aware rendering
- missing-access state
- deleted workbook state
- renamed worksheet/table state
- throttling state
- stale-data indication

Add a “Data freshness” indicator model:
- snapshot timestamp
- live/experimental state
- last successful refresh
- source unavailable
- access denied
- refresh unsupported

==================================================
10. EXCEL COMPONENT BEHAVIOR
==================================================

Excel Single Cell component:

Properties:
- data source
- worksheet
- cell address
- display label
- number format
- prefix
- suffix
- empty-value text
- error-value text
- conditional thresholds
- icon
- refresh/freshness label

Example:
Workbook: ProjectStatus.xlsx
Worksheet: Summary
Cell: B7
Label: Open Issues
Format: integer
Thresholds:
- 0 to 5 = green
- 6 to 10 = amber
- above 10 = red

Excel Range Table:

Properties:
- workbook
- worksheet/table/range
- header row
- selected columns
- sorting
- filters
- search
- pagination
- numeric/date formatting
- accessible caption
- empty state

Excel KPI:

Allow:
- direct cell
- sum of column
- average of column
- count of filtered rows
- min/max
- first matching record

Excel Chart:

Allow mapping:
- category column
- one or more value columns
- chart type
- accessible text summary
- legend
- color palette
- missing values
- aggregation
- sorting
- maximum category count

Generate a written accessible chart summary in addition to the visual chart.

==================================================
11. EXPORT COMPILER
==================================================

Do not simply dump GrapesJS HTML and CSS.

Create an explicit export compiler pipeline:

1. Normalize component tree.
2. Remove editor-only metadata.
3. Resolve project design tokens.
4. Compile component templates.
5. Compile runtime interactions.
6. Compile embedded data.
7. Collect assets.
8. Sanitize generated markup.
9. Apply accessibility normalization.
10. Run SharePoint validation.
11. Calculate approximate UTF-8 output size.
12. Produce export manifest.
13. Generate preview.
14. Export only when blocking errors are resolved or explicitly overridden.

Support:

A. Single-file export
- index.html
- inline CSS
- inline component runtime JavaScript
- embedded selected data
- no editor dependency

B. Folder export
- index.html
- assets/images/
- assets/media/
- export-manifest.json
- README.txt
- validation-report.html

C. ZIP export of the folder

Do not include source maps, development code, React DevTools hooks, Vite runtime, or GrapesJS in the exported page.

Generated JavaScript should be:
- minimal
- deterministic
- namespaced under one runtime object
- initialized once
- protected from duplicate initialization
- free from eval and Function constructors
- free from outbound network calls

Use event delegation where practical.

==================================================
12. SHAREPOINT COMPATIBILITY VALIDATOR
==================================================

Create a rule engine with:

type ValidationSeverity = "error" | "warning" | "info";
type CapabilityState =
  | "confirmed"
  | "experimental"
  | "unsupported"
  | "unknown";

Each rule must include:
- rule ID
- title
- description
- severity
- capability state
- evidence/source URL
- affected node/component
- remediation
- automated fix availability

Required blocking rules:

- arbitrary external script URL
- unsupported stylesheet URL
- fetch()
- XMLHttpRequest
- WebSocket
- EventSource
- navigator.sendBeacon
- Microsoft Graph outbound call
- SharePoint REST outbound call
- arbitrary API endpoint
- localStorage
- unsupported cross-window communication
- eval()
- Function constructor
- inline event-handler attributes where avoidable
- unsafe javascript: URLs
- iframe source not allowed by policy
- embedded secrets or tokens
- page larger than 10 MB

Required warning rules:

- external link may require HTML Field Security allow list
- missing image alt text
- empty link text
- empty button label
- missing form label
- low color contrast
- heading-level problems
- keyboard trap risk
- fixed width wider than mobile viewport
- oversized Base64 asset
- very large inline dataset
- video/audio size risk
- unsupported or unverified library
- imported HTML branding mismatch
- missing accessible chart summary
- experimental Excel live binding
- stale snapshot data

The validator must scan:
- component model
- generated HTML
- generated CSS
- generated JavaScript
- data-source definitions
- assets

Create a human-readable validation report and machine-readable JSON result.

==================================================
13. SECURITY
==================================================

Use a strict threat model.

Document threats including:
- malicious imported project JSON
- malicious imported HTML
- XSS through workbook values
- formula injection concepts
- dangerous hyperlinks
- embedded script payloads
- HTML in cell values
- crafted SVG
- prototype pollution
- oversized files
- ZIP bombs
- data exfiltration
- leaking workbook data into exported HTML
- accidental export of hidden sheets or sensitive columns

Rules:
- Workbook values are text by default.
- Never treat workbook cell values as HTML.
- Escape all workbook-derived text.
- Sanitize imported HTML.
- Do not execute scripts from imported HTML.
- Do not execute formulas from workbooks.
- Limit file sizes and row/column counts.
- Process ZIP/workbook files defensively.
- Never embed credentials.
- Avoid dangerous URL schemes.
- Add Content Security Policy guidance to documentation.
- Display explicit warning before embedding workbook data into export.

Create:
docs/security/threat-model.md

==================================================
14. ACCESSIBILITY
==================================================

Target WCAG 2.2 AA for the editor and generated components.

Required:
- keyboard-accessible editor operations
- visible focus
- semantic landmarks
- proper headings
- labels for controls
- error messages associated with fields
- accessible accordions
- accessible tabs
- accessible tables
- chart text summaries
- reduced-motion support
- contrast checks
- meaningful empty states
- no color-only status communication

Run axe-core against:
- editor shell
- component preview examples
- exported demo page

Document any known limitations rather than hiding them.

==================================================
15. DESIGN SYSTEM
==================================================

Create a restrained Microsoft 365-inspired visual system without claiming to reproduce proprietary SharePoint styling exactly.

Use CSS variables such as:

--sphs-color-primary
--sphs-color-primary-hover
--sphs-color-background
--sphs-color-surface
--sphs-color-text
--sphs-color-muted
--sphs-color-border
--sphs-color-success
--sphs-color-warning
--sphs-color-danger
--sphs-radius-small
--sphs-radius-medium
--sphs-shadow-card
--sphs-space-1 through --sphs-space-8

Create:
- default light theme
- high-contrast-aware styling
- configurable brand palette
- theme preview
- exportable design tokens

Do not hard-code styling independently in every component.

==================================================
16. IMPORT
==================================================

Support project JSON import from the first release.

HTML import may be limited.

For HTML import:
- sanitize input
- strip scripts by default
- do not execute imported code
- map recognized structures to native components where possible
- place unrecognized safe markup into a constrained HTML component
- report what was removed
- report what could not be converted

Do not promise round-trip fidelity for arbitrary websites.

==================================================
17. TEMPLATES
==================================================

Provide at least five working templates:

1. Project Status Dashboard
2. Employee Onboarding
3. Power Platform Solution Documentation
4. Troubleshooting Decision Tree
5. Excel KPI Dashboard

The Excel KPI Dashboard should demonstrate:
- one cell as KPI
- a filtered Excel table
- an aggregate KPI
- a Chart.js chart
- freshness/snapshot information
- accessible chart summary

Use synthetic sample data and label it clearly.

==================================================
18. DOCUMENTATION
==================================================

Create:

README.md
ARCHITECTURE.md
IMPLEMENTATION_STATUS.md
DECISIONS.md
CHANGELOG.md
CONTRIBUTING.md
SECURITY.md
THIRD_PARTY_NOTICES.md

docs/research/sharepoint-html-pages.md
docs/research/excel-live-data.md
docs/architecture/component-model.md
docs/architecture/export-pipeline.md
docs/architecture/data-providers.md
docs/development/component-authoring.md
docs/development/adding-validation-rules.md
docs/testing/sharepoint-test-protocol.md
docs/deployment/sharepoint-upload.md
docs/security/threat-model.md

The SharePoint test protocol must include:

- test site prerequisite
- Site Pages HTML setting
- upload single HTML file
- upload HTML folder
- open draft
- publish
- desktop SharePoint view
- Teams desktop SharePoint view, if available
- responsive browser test
- anchor navigation
- accordion
- tabs
- filters
- charts
- Mermaid
- external links
- assets
- accessibility
- file-size checks
- Excel snapshot checks
- Excel live-data experiment
- browser console observations
- expected vs actual result
- evidence screenshot fields
- platform version/date
- tenant rollout notes

==================================================
19. TESTING REQUIREMENTS
==================================================

Unit tests:
- project schema validation
- migrations
- workbook cell/range parsing
- Excel date conversion
- duplicate headers
- formula result handling
- filters
- sorting
- aggregates
- safe JSON embedding
- HTML escaping
- output size calculation
- every SharePoint validation rule
- export compiler
- component serialization

Integration tests:
- create project
- add component
- edit properties
- import workbook fixture
- bind cell B7
- render preview
- export HTML
- reload project
- validation report generation

E2E tests:
1. Launch application.
2. Create Excel KPI Dashboard.
3. Import fixture workbook.
4. Select worksheet Summary.
5. Bind B7 to KPI.
6. Bind table Issues to a table.
7. Filter Status != Closed.
8. Map Status counts to a chart.
9. Validate.
10. Export single-file HTML.
11. Open exported HTML locally.
12. Verify KPI, filter, table, chart and accessibility summary.

Include small, synthetic workbook fixtures created specifically for tests.

Do not include real organizational data.

==================================================
20. USER EXPERIENCE AND ERROR HANDLING
==================================================

Errors must tell the user:
- what failed
- why it likely failed
- whether data is safe
- how to recover
- whether the issue is editor-side or SharePoint-side

Examples:

“Workbook formula result is unavailable. Open the workbook in Excel, recalculate it, save it, and import it again.”

“This component uses experimental live Excel binding. The generated page may not refresh in your SharePoint tenant. Export as a snapshot for a supported fallback.”

“This page contains an outbound network request. SharePoint HTML Pages block arbitrary fetch and outbound API calls.”

Do not expose stack traces to normal users.
Provide a developer diagnostics panel.

==================================================
21. MILESTONE PLAN
==================================================

Implement in this order.

MILESTONE 0: Research and repository foundation
- verify SharePoint constraints
- dependency/license review
- architecture
- decision records
- project scaffold
- CI
- baseline tests

MILESTONE 1: Editor vertical slice
- GrapesJS integration
- section, heading, text, hero, KPI, card
- inspector
- responsive preview
- project save/load
- single-file export

MILESTONE 2: Validation
- rule engine
- SharePoint rules
- accessibility checks
- report UI
- export gate

MILESTONE 3: Interactivity
- accordion
- tabs
- filterable cards
- search
- checklist
- timeline
- troubleshooting tree
- exported runtime

MILESTONE 4: Excel local import and snapshots
- parser
- workbook browser
- single cell
- range/table
- filter/aggregate
- KPI
- chart mapping
- safe embedded data
- workbook fixtures
- tests

MILESTONE 5: Export packaging
- folder export
- asset handling
- ZIP
- manifest
- SharePoint README
- size reporting

MILESTONE 6: Experimental live data research
- evidence gathering
- provider interface
- disabled experimental adapter
- test protocol
- no speculative Graph implementation

For this initial execution, complete Milestones 0 and 1, and implement the core of Milestone 4 sufficiently to demonstrate:

- importing an XLSX workbook locally
- selecting a worksheet
- selecting a single cell
- binding that cell to a KPI component
- exporting that value as a safe snapshot

If time permits, proceed to the range table and chart mapping.

==================================================
22. ACCEPTANCE CRITERIA FOR FIRST WORKING RELEASE
==================================================

The first release is acceptable only if:

1. npm install succeeds.
2. npm run dev launches the application.
3. npm run typecheck succeeds.
4. npm run lint succeeds.
5. npm test succeeds.
6. npm run build succeeds.
7. User can create a project.
8. User can add and configure visual components.
9. User can save and reload the project.
10. User can import a sample XLSX file locally.
11. User can bind a cell such as Summary!B7 to a KPI.
12. User can preview the KPI.
13. User can export a self-contained HTML file.
14. Exported HTML opens locally without the editor.
15. Exported HTML does not contain GrapesJS.
16. Exported HTML does not require Vite.
17. Exported HTML does not make network calls.
18. Workbook-derived values are escaped.
19. Validator reports prohibited APIs.
20. Documentation explains how to upload the HTML to SharePoint.
21. Experimental live Excel support is clearly distinguished from snapshot mode.
22. No credentials or tenant-specific values exist in the repository.

==================================================
23. HOW TO WORK
==================================================

Start by:

1. Inspecting the current repository.
2. Reading any existing instructions, especially CLAUDE.md.
3. Creating an implementation plan in IMPLEMENTATION_STATUS.md.
4. Verifying current official Microsoft SharePoint HTML Page documentation.
5. Evaluating dependency licenses.
6. Creating short architecture decision records.
7. Scaffolding only after these checks.
8. Implementing a complete vertical slice.
9. Running every quality command.
10. Fixing errors rather than merely describing them.

When making architectural decisions:
- record the decision
- list alternatives
- explain the tradeoff
- avoid unnecessary complexity

Do not rewrite stable working code without a reason.
Do not leave important buttons non-functional.
Do not create fake implementations disguised as complete features.
Do not declare live Excel integration complete unless tested successfully in an actual SharePoint HTML Page environment.

At the end, provide:

1. Implemented features.
2. Repository structure.
3. Commands run and results.
4. Tests added.
5. Known limitations.
6. Experimental features.
7. Exact next development step.
8. Manual SharePoint test instructions.
9. Any questions that block the next milestone.

Begin now.
