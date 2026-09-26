# Integration guide

English · [简体中文](guide.zh-CN.md) · [Home](../README.md)

## Build and install

Use Node.js 22.13+ or 24+. Source is JavaScript; declarations are generated from JSDoc.

```sh
npm ci
npm test
npm run build       # dist/ library bundles and declarations
npm run build:demo  # site/ static demo, library and examples
npm run preview    # http://localhost:5183
npm pack           # local-slidekit-0.2.0.tgz
```

Install the release tarball with `npm install ./local-slidekit-0.2.0.tgz`. The package name is `@local/slidekit`; no npm registry publication is implied. Serve examples over HTTP(S); `file://` cannot load browser ES modules. The static site supports deployment under a subdirectory.

### ESM

```js
import { createEditor, paragraph } from '@local/slidekit';
import '@local/slidekit/style.css';

const editor = createEditor(document.querySelector('#editor'), {
  mode: 'edit',
  locale: 'en',
  theme: { accent: '#5c5bd6' },
  ui: { toolbar: true, thumbnails: true, inspector: true },
  pdfAssetsUrl: '/slidekit-pdf/',
});
editor.addElement('text', {
  x: 96, y: 96, width: 900, height: 140,
  fontSize: 44, content: paragraph('A place for your ideas.'),
});
const off = editor.on('change', ({ reason }) => {
  const snapshot = editor.getDocument();
  // Debounce persistence in the host. Do not setDocument(snapshot) here.
});
// off(); editor.destroy();
```

The container must have an explicit size, e.g. `<div id="editor" style="height:720px;width:100%"></div>`. Minimum height is 420px; a width of at least 900px is recommended for desktop editing. Below 720px, sidebars fold and can be opened using toolbar buttons.

### Plain script

```html
<link rel="stylesheet" href="./dist/slidekit.css">
<div id="editor" style="height:720px"></div>
<script src="./dist/slidekit.iife.js"></script>
<script>
  const editor = SlideKit.createEditor(document.querySelector('#editor'));
  editor.on('change', () => console.log(editor.getDocument()));
</script>
```

[Browser ESM](../examples/esm.html) and [plain script](../examples/iife.html) examples each demonstrate two instances, snapshots, read-only mode, destruction and remounting.

### PDF assets

For Vite/Webpack and other bundled hosts, copy the installed package's **entire** `dist/pdf-assets/` directory into a public directory such as `public/slidekit-pdf/`. Set `pdfAssetsUrl` to its served URL, including the deployment prefix for subdirectory hosting. Preserve filenames: the directory contains the PDF worker, fonts, CMaps, color profiles and image decoders.

Direct browser ESM/script deployments can keep the complete `dist/` tree together; by default resources load beside the library. PDF processing stays in the browser. Serve `.mjs` with a JavaScript MIME type. Host CSP must allow your served scripts/workers and embedded image URLs.

### React and Vue

See [ReactEditor.jsx](../examples/ReactEditor.jsx) and [VueEditor.vue](../examples/VueEditor.vue). Create the editor after mounting and call `destroy()` before unmounting. For SSR, load the library in the client mounting phase. `initialDocument` is an initial value; use `setDocument` for an intentional later load. Writing every change back through `setDocument` clears undo history.

## Editor capabilities and shortcuts

The configurable UI includes slide creation, duplication, deletion, ordering, visibility, backgrounds and 16:9/4:3 page sizes. It supports text selection formatting, paragraph alignment/spacing/lists, images, shapes, gradients, outer shadows and independent fill/stroke alpha.

Drag, resize and rotate objects; hold Shift for multi-selection or aspect-preserving resize. Use marquee selection, alignment, equal distribution, snapping, layer order and locks. The canvas supports zoom, fit, read-only mode and presentation.

| Shortcut | Action |
| --- | --- |
| Double click / Enter | Edit selected text |
| Escape | Finish text editing / clear selection / leave presentation |
| Cmd/Ctrl+C, V, X | Copy, paste, cut objects; native rich text clipboard while editing |
| Cmd/Ctrl+D | Duplicate selected objects |
| Cmd/Ctrl+Z | Undo |
| Cmd/Ctrl+Shift+Z or Ctrl+Y | Redo |
| Cmd/Ctrl+S | Download JSON, including the current text draft |
| Arrow keys / Shift+arrow | Move by 1 / 10 logical pixels |
| Left/right, PageUp/PageDown | Change slide during presentation |

Shortcuts are scoped to the focused instance and do not override host input controls or active IME composition. Pasted CSS colors and font sizes are normalized to supported formats. Unsupported colors/fonts fall back without discarding text. Zero/negative numbered-list starts become 1; the allowed start range is 1–9999. If a draft exceeds the supported rich-text structure, saving fails without destroying it; Undo restores the last valid text.

## Public API

`createEditor(container, options)` returns an `EditorHandle` with the following methods. Synchronous mutations throw on invalid input or in read-only mode. Async methods reject on failure. After destruction, public methods reject/throw except the idempotent `destroy()`.

| Method | Contract |
| --- | --- |
| `getDocument()` | Owned snapshot, including text currently being edited/composed |
| `setDocument(doc)` | Validate, replace and clear history; invalid input preserves the current document |
| `addSlide(properties?, index?)` | Insert after the current slide by default; return the new ID |
| `duplicateSlide(id?)` | Duplicate the specified/current slide with new element IDs; return new slide ID |
| `updateSlide(id, patch)` | Update name, background, backgroundGradient or hidden |
| `deleteSlide(id?)` | Delete specified/current slide; deleting the last one creates a blank slide |
| `moveSlide(id, index)` | Move to a zero-based index |
| `goToSlide(id)` | Activate an existing slide |
| `addElement(type, properties?)` | Add text/shape/image to the current slide; return ID |
| `updateElement(id, patch)` | Update a current-slide element; identity/type stay stable |
| `deleteElements(ids?)` | Delete specified/selected elements; preserve locked elements |
| `addImage(file, properties?)` | Embed PNG/JPEG or convert WebP to PNG; return `Promise<string>` |
| `selectElements(ids)` | Select existing elements on the current slide |
| `undo()` / `redo()` | Unified document history; one gesture is one operation |
| `getLocale()` / `setLocale(locale)` | Read/change this instance’s interface language without changing its document or history |
| `setMode('edit' \| 'view')` | Change interaction mode without replacing the document |
| `importPdf(file, options?)` | Convert all pages before replacing the document |
| `importPptx(file, options?)` | Return `{warnings: string[]}` after loading supported objects |
| `present()` / `exitPresent()` | Start/exit playback; request fullscreen when available |
| `exportPptx()` | Return `Promise<Blob>` containing native editable PPTX objects |
| `on(event, handler)` | Subscribe; return an unsubscribe function |
| `destroy()` | Release listeners, observers, controls, pending imports and owned DOM |

`element` exposes the root HTMLElement for host focus/layout integration. The library also exports `createDocument(title?)`, `createElement(type?, properties?)`, `paragraph(text?)`, `validateDocument(doc)`, `exportPptx(doc)`, `DEFAULT_PDF_LIMITS` and `SUPPORTED_LOCALES`.

Options: `document`, `mode`, `locale`, `theme: {accent}`, `ui: {toolbar, thumbnails, inspector}`, `pdfAssetsUrl`, `pdfLimits`. Accent is a six-digit hex color. The three UI fields are booleans; omitted panels are shown.

### Interface languages

| `locale` | Language |
| --- | --- |
| `zh-CN` | 简体中文 · Simplified Chinese (default) |
| `zh-TW` | 繁體中文 · Traditional Chinese |
| `en` | English |
| `ko` | 한국어 · Korean |
| `ja` | 日本語 · Japanese |

```js
const editor = createEditor(container, { locale: 'en' });
editor.setLocale('ja');
console.log(editor.getLocale()); // 'ja'
// Plain script: SlideKit.createEditor(container, { locale: 'ko' });
```

`SUPPORTED_LOCALES` is a frozen array of these five codes; `EditorLocale` is the corresponding exported type. Codes are exact and case sensitive. Unsupported values throw `TypeError` before mounting or changing the instance. The library defaults to `zh-CN` and does not infer language from the browser or change the host page’s language.

Language belongs to the editor instance, not its JSON document. Switching translates controls, accessible labels, notifications, import dialogs and compatibility notes. It preserves the current slide, selection, text draft, zoom mode, read-only mode, panel visibility and history, and does not emit a document `change`. Existing titles, slide names, text and image filenames remain untouched. New blank-slide names, duplicate suffixes and text placeholders use the current locale. Standalone `createDocument()` / `createElement()` retain their original Chinese defaults; supply explicit content when needed.

To protect native form edits and IME, a focused title/property input finishes before its controls are redrawn on blur. During an import, the active dialog switches immediately; the surrounding controls refresh when the import finishes or is cancelled. The document’s contenteditable node is preserved during switching. Native browser dialogs (such as file pickers) follow browser/OS language.

`error` event `message` and `importPptx()` result warnings use the current locale for known library diagnostics. The original `error` object and directly thrown/rejected validation errors retain their original messages; unknown browser or host errors are passed through. Do not branch on translated text.

The demo selector writes `?locale=ja` (or another supported code) to the URL for reloads; invalid URL codes fall back to `zh-CN`. React/Vue examples accept a reactive `locale` prop and call `setLocale()` without remounting the editor. The sample deck and host-example controls are illustrative content, not translated by the editor.

### Events and failure isolation

| Event | Payload |
| --- | --- |
| `change` | `{reason}`; read the snapshot with `getDocument()` |
| `selectionChange` | `{ids: string[]}` |
| `slideChange` | `{id, index}` |
| `error` | `{error, message}`; listener failures also include `sourceEvent` |

Handlers must be functions. A throwing/rejected host handler does not undo a successful edit or prevent other handlers from running. The failure goes to `error`; a failing error handler is logged without recursion. Hosts should display persistence failures and keep independent backups. Do not assume every selection/slide event represents a distinct document edit.

JSON/PDF/PPTX opening replaces the current document only after successful validation/conversion. Cancellation, destruction or concurrent host edits prevent replacement. Pending image insertion rejects if the document is reloaded, even when slide IDs are reused; ordinary edits to the original slide may continue.

## Document model

```js
{
  schemaVersion: 1,
  title: 'Presentation',
  width: 1280, height: 720,
  slides: [{ id: 'stable-slide-id', name: 'Slide 1',
    background: '#ffffff', hidden: false, elements: [] }],
  assets: {}
}
```

Positions and dimensions use **logical pixels**, independent of canvas zoom. Fonts use **points**; `96px = 1in`, `72pt = 1in`. Rotation is degrees around the object's center. Page presets are 1280×720 and 960×720; resizing the page keeps object coordinates, so content may need rearranging.

All elements include `id`, `type`, `x`, `y`, `width`, `height`, `rotation`, `opacity` (0–1), and `locked`. Use `createElement()` to get valid defaults. IDs must be unique across slides and elements. Validation rejects unsupported schema versions, non-finite coordinates, duplicate IDs, missing assets and unsupported rich-text nodes. Maximum: 500 slides and 2,000 elements per slide. Allowed page dimensions: 100–10,000 logical pixels.

### Text

Text elements add `content`, `fontFamily`, `fontSize` (1–256pt), `color` (six-digit hex), and `lineHeight` (0.8–3). Rich text uses a restricted Tiptap JSON tree:

- Nodes: `doc`, `paragraph`, `text`, `hardBreak`, `bulletList`, `orderedList`, `listItem`.
- Marks: `bold`, `italic`, `underline`, `textStyle`.
- `textStyle.attrs`: `fontFamily`, `fontSize: '32pt'`, `color: '#5c5bd6'`, `opacity`, `gradient`.
- Paragraph attributes: `textAlign: 'left' | 'center' | 'right' | 'justify'`, `lineHeight` as a numeric string.
- Ordered lists may have `attrs.start` from 1 through 9999. List items start with a paragraph.

Local text opacity multiplies object opacity. Text boxes retain specified dimensions rather than growing to fit their contents. Rich-text trees have a 12-level depth limit and a 50,000-node limit per text element; unsupported attributes are not an extension protocol.

### Shapes and appearance

`shape` accepts `rect`, `roundRect`, `ellipse`, `line`, `arrow`, `rightArrow`, `leftArrow`, `upArrow`, `downArrow`, `leftRightArrow`, `upDownArrow`. Shapes have `fill`, `stroke`, `strokeWidth` (0–30px). Fill can be `transparent`; other colors are six-digit hex. Optional `fillOpacity` and `strokeOpacity` default to 1 and multiply overall opacity. Gradient stops additionally multiply fill opacity.

```js
const gradient = {
  type: 'linear', angle: 0, scaled: true, rotateWithShape: true,
  stops: [
    { offset: 0, color: '#6136ff', opacity: 1 },
    { offset: 0.53, color: '#cb2ae3', opacity: 1 },
    { offset: 1, color: '#ff763d', opacity: 1 },
  ],
};
editor.updateElement(shapeId, { gradient });
editor.updateSlide(slideId, { backgroundGradient: gradient });
editor.updateElement(shapeId, {
  shadow: { color: '#000000', opacity: 0.15, blur: 20,
    offsetX: 4, offsetY: 4, rotateWithShape: false },
});
```

Gradients need 2–32 stops with offset/opacity in 0–1. Angles are clockwise from the right; `scaled` adjusts direction to the fill's dimensions, and `rotateWithShape` controls rotation coupling. Shadows use logical pixels. Shadow opacity represents its own alpha and is not multiplied again on successive PPTX round trips. Pass `null` to remove a gradient or shadow.

Line endpoints `startArrow` / `endArrow` accept `none`, `triangle`, `stealth`, `arrow`, `diamond`, `oval`. Block arrows use `arrowShaft` (0–1 width ratio) and `arrowHead` (head length relative to the short edge, default 0.5; constrained to the shape's bounds).

Lines/arrows may have `points: [{x, y}, …]`: 2–32 coordinates normalized to object dimensions, with points outside the bounding box permitted. Transformations preserve this path; PPTX exports an editable native path. There is no individual point-dragging UI; use `updateElement` or `points: null` to restore a straight line.

### Images and storage

Image elements use `assetId` and `fit: 'contain' | 'cover'`. Resources are `{data: 'data:image/png;base64,…', width, height, name}`; JPEG is also accepted. JSON embeds all referenced images and can be restored independently. Local image insertion accepts PNG/JPEG/WebP up to 20 MiB and 40 million pixels. WebP is converted to PNG.

The editor removes resources after their last reference is deleted. History retains images needed for Undo. Snapshots own mutable fields while sharing immutable image strings; thumbnail images load lazily. Unreferenced assets in loaded JSON are pruned.

The library does not persist automatically. The demo uses IndexedDB with debouncing, including active composition drafts. Failed recovery pauses auto-save and preserves the existing record. Each save checks the stored revision in the same transaction; if another updated demo tab saved first, the stale tab keeps its local work and asks you to export JSON before reloading. It does not merge concurrent edits. Reload existing demo tabs after upgrading so all writers use these checks.

While changes remain unsaved, the demo requests the browser's leave confirmation. Quota, private browsing, forced closure and browser policies can still prevent saves or suppress this confirmation. Browser storage is not a backup; export important work as JSON.

## Presentation

`hidden: true` slides stay editable, appear labeled in thumbnails, and survive JSON/PPTX export. Playback skips them and counts only visible slides. Starting from a hidden slide starts at the first visible slide; an all-hidden deck shows a message without opening the player.

Playback uses the document snapshot from when it started. Host edits do not change the ongoing show. Fullscreen refusal falls back to the in-page player. Clicking navigation controls preserves keyboard navigation; Escape exits.

## PPTX compatibility

The exporter creates individual native text boxes, shapes and images in their document order. Supported gradients, outer shadows, block arrows, connector endpoints and paths are written as DrawingML. Fonts remain in points; geometry uses 96px/in. Browser locks are not exported as PowerPoint edit locks.

```js
const blob = await editor.exportPptx();
const { warnings } = await editor.importPptx(file, { signal: controller.signal });
```

The importer reads page order/size, solid/linear-gradient backgrounds, supported editable text/shape styles, embedded PNG/JPEG/SVG, layout/master positions, theme colors and text defaults. Groups expand to individual objects. Hidden slides retain content and visibility; hidden objects/groups are skipped with warnings, including inherited ones.

Raster compatibility fallbacks are preferred. SVG-only `svgBlip` references are supported and rasterized in an image context to embedded PNG (long edge ≤2560px, ≤4 million pixels). SVG is not inserted into the DOM as editable markup. Scripts/external resources do not execute/load in that image context. Cropped or mirrored images are normalized to PNG.

Office elbow connectors `bentConnector2–5` retain bends, mirroring, rotation and endpoint arrows. Unsupported connector curves/formulas fall back to endpoint lines with warnings. Ordinary and soft line breaks, including leading/consecutive/trailing breaks, are retained. Independent fill/stroke alpha, invisible `noFill` lines and shadow alpha survive supported round trips.

| Content | Import behavior |
| --- | --- |
| Supported text, images, shapes | Editable objects; SVG/cropped/mirrored images become PNG |
| Hidden slide | Retained; skipped during playback |
| Hidden object/group | Omitted with a warning |
| Unsupported shape | Shape omitted; internal text retained when readable |
| Table, chart, SmartArt, audio/video | Omitted with warnings |
| Radial/path gradients, complex effects | Simplified or skipped with warnings |
| Nested list indentation, fixed line spacing, vertical text/alignment | Simplified |
| Missing/external/unsupported image references | Skipped with page/object/reason warning |
| Animation/transition | Not imported |

Warnings appear above the editor and in the API result, but are not saved in JSON. The original PPTX is never modified. Necessary missing/corrupt parts, cancellation or host edits during import reject without replacing the document.

Limits: original PPTX ≤200 MiB; ≤500 pages; referenced decompressed data ≤500 MiB; XML/SVG part ≤16 MiB, other part ≤64 MiB; ≤2,000 objects per slide; group depth ≤16. Old `.ppt` and encrypted PPTX require conversion to an unencrypted `.pptx` in Office/WPS first.

JSON is the lossless working format. Font availability and Office engines affect wrapping, lists, spacing and rounded corners. XML-invalid control characters/lone surrogates are replaced with `�` only during PPTX export; JSON keeps original text. Native WPS/PowerPoint validation for the current release remains incomplete: see [validation](../VALIDATION.md).

## PDF import

Each PDF page becomes a locked image. Unlock it in the layer panel or overlay text/shapes. Original PDF text is not independently editable; there is no OCR, interactive form/link support or PDF re-export. PPTX retains the original PDF pages as images and overlays as native objects.

```js
await editor.importPdf(file);
await editor.importPdf(file, { password: 'document-password' });
const controller = new AbortController();
const opening = editor.importPdf(file, { signal: controller.signal });
// controller.abort(); // rejects with AbortError, preserving the current deck
await opening;
```

Missing/incorrect passwords open an input dialog. Passwords are used only for that import and never stored in JSON. Workers are released on completion, error, cancellation or destruction. Read-only instances can load PDF/PPTX/JSON; subsequent editing is still blocked.

The first PDF page defines the deck ratio. Mixed page sizes are centered without stretching; page rotation follows PDF orientation. Images have a maximum long edge of 2560px and a maximum of 4 million pixels, so zooming is not equivalent to native vector PDF magnification.

Default limits are **200 MiB input / 500 pages / 500 MiB encoded image data**. Limits use 1024×1024 bytes; compressed input and PNG data are measured separately. Errors report the actual size/count and current threshold.

```js
const editor = createEditor(container, {
  pdfLimits: { maxFileSizeMB: 300, maxPages: 500, maxRenderedSizeMB: 800 },
});
await editor.importPdf(file, { limits: { maxRenderedSizeMB: 1000 } });
```

Per-call overrides inherit unmentioned instance settings. `DEFAULT_PDF_LIMITS` exposes the defaults. Size limits must be finite positive numbers; page limits are integers from 1–500. Raising limits does not increase image resolution or guarantee browser memory/storage capacity. Large JSON/PPTX export still depends on device resources.

## Source map and validation

| Responsibility | Files |
| --- | --- |
| Document, atomic mutations, history | `src/document.js`, `store.js`, `history.js` |
| Shared canvas/thumbnail/player rendering | `src/render.js`, `appearance.js` |
| Rich text and IME | `src/rich-text.js` |
| Selection and transformations | `src/gestures.js` |
| Editable PowerPoint export/import | `src/pptx.js`, `pptx-import.js`, supporting modules |
| PDF conversion and cancellation | `src/pdf.js`, `pdf-engine.js`, `import-dialog.js` |
| UI and public API | `src/editor.js`, `panels.js`, `toolbar.js`, `index.js` |

Styles, shortcuts and subscriptions are scoped to instances. Build output bundles runtime dependencies; the tarball requires no additional runtime npm packages or public CDN. Dependency license texts accompany the bundle. [Validation](../VALIDATION.md) distinguishes automated checks, actual Chrome interaction and missing native Office evidence.
