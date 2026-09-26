<div align="center">

# SlideKit

**An embeddable slide editor for the web.**

Create in the browser. Save portable JSON. Export editable PowerPoint.

[![CI](https://github.com/SamuelSupe/slidekit/actions/workflows/ci.yml/badge.svg)](https://github.com/SamuelSupe/slidekit/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/SamuelSupe/slidekit)](https://github.com/SamuelSupe/slidekit/releases/latest)
[![License: MIT](https://img.shields.io/badge/License-MIT-5c5bd6.svg)](LICENSE)
[![JavaScript](https://img.shields.io/badge/JavaScript-ESM%20%2B%20IIFE-f1d44f)](docs/guide.md)

English · [简体中文](README.zh-CN.md)

[Get started](#get-started) · [Integration guide](docs/guide.md) · [Compatibility](docs/guide.md#pptx-compatibility) · [Download](https://github.com/SamuelSupe/slidekit/releases/latest)

</div>

## Editor preview

[![SlideKit running in Chrome: slide thumbnails, canvas, formatting toolbar and inspector](docs/images/editor-v0.1.1.png)](docs/images/editor-v0.1.1.png)

*SlideKit v0.1.1 captured in desktop Chrome using the included sample deck. Click the screenshot to view it at full size. The screenshot uses Simplified Chinese. The current UI also supports Traditional Chinese, English, Korean and Japanese; documentation is available in English and Chinese.*

## Build presentations inside your product

SlideKit mounts into a DOM container and owns its toolbar, thumbnails, canvas and inspector. It uses JavaScript and DOM/SVG, with no framework requirement. ESM, a standalone script bundle, CSS and JSDoc-generated TypeScript declarations are included in every build.

| Create | Arrange | Bring your files |
| --- | --- | --- |
| Rich text with local formatting | Drag, resize, rotate, snap | Portable JSON with embedded images |
| Images, shapes and arrows | Multi-select, align, distribute | Local PPTX import with fidelity warnings |
| Gradients, shadows, transparency | Layers, locks, undo/redo | PDF pages imported as images |
| Multiple slides and hidden pages | Zoom, read-only mode, slideshow | Native editable PPTX export |

Files are processed locally. The library has no upload service, account system or persistence backend. The demo saves to IndexedDB; your host controls storage through events.

## Get started

Node.js **22.13+ or 24+**:

```sh
git clone https://github.com/SamuelSupe/slidekit.git
cd slidekit
npm ci
npm run dev
```

Open **http://localhost:5182**. Use `npm run build:demo` and `npm run preview` to check the static release at port 5183.

### Embed the library

Download `local-slidekit-0.2.0.tgz` from [Releases](https://github.com/SamuelSupe/slidekit/releases/latest), then install it:

```sh
npm install ./local-slidekit-0.2.0.tgz
```

The package name is `@local/slidekit`; it is **not published to the npm registry**.

```js
import { createEditor, paragraph } from '@local/slidekit';
import '@local/slidekit/style.css';

const editor = createEditor(document.querySelector('#editor'), { locale: 'en' });
editor.addElement('text', {
  content: paragraph('Make room for your next idea.'),
  x: 96, y: 96, width: 900, height: 140, fontSize: 44,
});

const off = editor.on('change', () => {
  const snapshot = editor.getDocument();
  // Debounce and persist snapshot in your host application.
});

// Before unmounting: off(); editor.destroy();
```

Give the container a size, for example `<div id="editor" style="height:720px"></div>`.

Using a plain HTML page? Include `dist/slidekit.css` and `dist/slidekit.iife.js`, then call `SlideKit.createEditor(container)`. [ESM](examples/esm.html), [plain script](examples/iife.html), [React](examples/ReactEditor.jsx) and [Vue](examples/VueEditor.vue) examples are included.

**PDF in a bundled host:** copy `dist/pdf-assets/` to a public directory and set `pdfAssetsUrl`. Direct script/ESM deployments should keep the complete `dist/` tree together. [Details →](docs/guide.md#pdf-assets)

### Interface languages

Configure `locale` as `zh-CN` (default), `zh-TW`, `en`, `ko` or `ja`. Call `editor.setLocale('ja')` to switch an existing instance and `editor.getLocale()` to read its language. The demo has a language selector; ESM and IIFE examples demonstrate two independent languages. Changing the UI language preserves slide content and undo history. See [language configuration](docs/guide.md#interface-languages).

## Know the boundaries

- **JSON is the lossless working format.** PPTX import supports a defined subset of Office objects; warnings identify unsupported or simplified content.
- **PDF imports as page images.** Original PDF text is not individually editable; new text and shapes remain editable.
- Desktop browsers are the target. The UI folds its sidebars in narrow containers; dedicated mobile editing is outside this release.
- Font availability and Office layout engines can change wrapping and spacing. The latest release has browser and OOXML validation; a fresh native WPS/PowerPoint open-and-edit check is still outstanding.
- Table/chart editors, animations, collaboration, accounts and cloud storage are outside the current scope.

## Documentation and development

| Topic | English | 简体中文 |
| --- | --- | --- |
| Setup, API, document model, imports and limits | [Guide](docs/guide.md) | [接入指南](docs/guide.zh-CN.md) |
| Actual validation and remaining gaps | [Validation](VALIDATION.md) | [验证记录](VALIDATION.zh-CN.md) |
| Release changes | [Changelog](CHANGELOG.md#english) | [变更记录](CHANGELOG.md#简体中文) |
| Contribution and security | [Contributing](CONTRIBUTING.md) · [Security](SECURITY.md) | [参与贡献](CONTRIBUTING.md#简体中文) · [安全说明](SECURITY.md#简体中文) |

```sh
npm test           # Document, history, geometry, import/export boundaries
npm run build      # ESM + IIFE + CSS + declarations + dependency notices
npm run build:demo # Static site and integration examples
npm pack           # Installable tarball; builds first
```

Built with [Tiptap](https://github.com/ueberdosis/tiptap), [Moveable](https://github.com/daybrush/moveable), [Selecto](https://github.com/daybrush/selecto), [PptxGenJS](https://github.com/gitbrent/PptxGenJS), [PDF.js](https://github.com/mozilla/pdf.js) and [Lucide](https://github.com/lucide-icons/lucide).

[MIT license](LICENSE). Bundled dependency license texts are generated in `dist/THIRD_PARTY_NOTICES.txt` and included in release archives.
