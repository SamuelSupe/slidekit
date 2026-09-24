# Validation

English · [简体中文](VALIDATION.zh-CN.md) · [Home](README.md)

This records observed evidence for the 0.1.1 release and labels earlier browser checks separately. It is not a promise of complete Office compatibility.

## Automated checks — 2026-09-25

Environment: Node.js 24 in OrbStack (`node:24-bookworm`).

- **39 tests passed:** JSON ownership and round trips, image restoration/pruning, IDs, atomic rejection, history/coalescing, geometry, PDF limits, PPTX parsing and native editable export.
- The optimization regression checks mutate host patches and clipboard metadata after committing, verify independent undo/redo snapshots, and exercise image copying with a `toString` asset ID.
- Regression cases cover broken/SVG-only image references, transparency, gradients, shadows, hidden objects/slides, elbow connectors, line breaks, pasted rich text and rejected-draft recovery.
- Release review adds host callback failure isolation (sync/async), XML-invalid characters in PPTX, image insertion during document reload, and the save shortcut during text editing/read-only mode.
- Dependency audit: **0 known advisories** at review time. The first container audit encountered a local certificate-chain error; it was rerun with native Node using the system trust store. TLS verification was not disabled. Advisory results can change.

Commands: `npm test`, `npm run build:demo`, `npm run check:package`. CI repeats tests, builds and installable-package TypeScript checks on Node 24. Check the [CI run](https://github.com/SamuelSupe/slidekit/actions/workflows/ci.yml) for the published commit.

## Performance sample — 2026-09-25

On Node.js 24.19.0, Linux arm64 in OrbStack, a synthetic deck with 100 pages and 20 elements per page was edited by changing one element's position. Seven rounds alternated the previous and optimized implementations, with eight warm-up edits and 30 measured edits per round. Median core commit time fell from **8.69 ms to 5.09 ms (about 41%)**. This measures document processing without DOM rendering or import/export; it is not an end-to-end latency or maximum-capacity guarantee.

## Browser evidence

Browser validation uses native desktop Chrome, not a newly installed browser automation framework. The demo and built ESM/IIFE examples are served over HTTP from local static services. The README screenshot is an actual capture of the editor.

Earlier completed checks covered multi-page editing, Chinese text, local formatting, selection/arrangement, zoom, presentation, JSON download/reload, editable PPTX export/import, two-instance isolation, read-only behavior and destroy/remount. PDF validation included encrypted/cancelled imports and a synthetic 171.72 MiB, 12-page image PDF; this is one observed workload, not a capacity guarantee.

The preceding fix round verified hidden-page playback, independent transparency, invisible lines, list-paste recovery and keyboard focus after player controls in built ESM and IIFE examples. It inspected actual downloaded JSON/PPTX, not just generated test fixtures.

### 0.1.1 optimization checks — 2026-09-25

- Built ESM: Chinese text and bold formatting, consecutive undo/redo, image insertion, shared-image selection copying and cross-instance paste. All pasted images finished decoding; the other instance remained unchanged until explicitly targeted.
- Deleting all ten objects and undoing restored all four image objects. Loading a saved snapshot and destroying/remounting retained all ten objects and the second instance's seven objects.
- Built IIFE: adding a page, undo/redo and destroy/remount retained the expected page counts; the second instance stayed at one page and two objects.
- Both examples ran in native Chrome at 1512×861 with no relevant console errors or warnings. The version bump and documentation changes do not alter these flows.

### 0.1.0 release checks — 2026-09-25

- Built **ESM and IIFE**: injected synchronous/asynchronous host save failures; later subscribers and undo/redo kept working. A pending image could not enter a reloaded deck with identical slide IDs. Control-character text exported, reopened, and retained valid Chinese/emoji while leaving the source JSON unchanged. Destroy/remount and the second read-only instance remained independent.
- Actual **Cmd+S while editing** downloaded JSON containing the current Chinese/English draft. Reopening that file restored all three objects; the second instance stayed at two objects with zero changes.
- Actual JSON file selection with a controlled delayed-read boundary verified that a concurrent host edit rejects replacement and retains the newer text. The delay hook exists only in an excluded QA page.
- Chrome console: no relevant errors or warnings in the final static ESM/IIFE runs. One initial check hit the dev server's cached older `dist` module; the checks were rerun against the static release server and passed.
- The downloaded PPTX was inspected with an independent XML parser: all XML and relationship parts parsed successfully.
- The tarball installed offline in a fresh consumer; strict TypeScript checks passed against its public exports, including hidden slides, gradients, opacity, imports and lifecycle methods. Documentation, dependency notices and the real screenshot are included; QA fixtures are excluded.

URLs: `http://127.0.0.1:5183/examples/esm.html`, `/examples/iife.html`, and an excluded synthetic QA page loading the same built bundles. Desktop viewport: 1512×861. README capture: native Chrome demo at port 5182.

## Office and other remaining gaps

- **Current-release WPS/PowerPoint native open/edit: not verified.** Earlier WPS attempts were blocked by inaccessible native dialogs. Browser rendering and OOXML inspection do not replace Office acceptance testing.
- Other desktop browsers, mobile/touch editing, arbitrary third-party PPTX and maximum-size decks have not been exhaustively exercised.
- PDF content is rasterized; PPTX is a documented subset. Font metrics, advanced effects, layout inheritance and unsupported Office objects can change the result. See the [compatibility guide](docs/guide.md#pptx-compatibility).
- IndexedDB is a demo convenience, not a backup or multi-tab collaboration system. Hosts must handle persistence failures.

## Repeat locally

```sh
npm ci
npm test
npm run build:demo
npm run check:package
npm run preview
```

In Chrome, open `http://localhost:5183`, `/examples/esm.html` and `/examples/iife.html`. Exercise the changed flow, inspect the console, save/reload the document, and verify the second instance remains independent. Check native Office manually before making application-specific compatibility claims. Use synthetic files; personal QA documents and generated scratch files are excluded from Git and release packages.
