<div align="center">

# SlideKit

**把幻灯片编辑器，嵌入你的产品。**

浏览器内创作 · JSON 独立保存 · 导出可编辑 PowerPoint

[![CI](https://github.com/SamuelSupe/slidekit/actions/workflows/ci.yml/badge.svg)](https://github.com/SamuelSupe/slidekit/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/SamuelSupe/slidekit)](https://github.com/SamuelSupe/slidekit/releases/latest)
[![License: MIT](https://img.shields.io/badge/License-MIT-5c5bd6.svg)](LICENSE)
[![JavaScript](https://img.shields.io/badge/JavaScript-ESM%20%2B%20IIFE-f1d44f)](docs/guide.zh-CN.md)

[English](README.md) · 简体中文

[快速开始](#快速开始) · [接入指南](docs/guide.zh-CN.md) · [兼容性](docs/guide.zh-CN.md#pptx-打开) · [下载](https://github.com/SamuelSupe/slidekit/releases/latest)

</div>

## 编辑器预览

[![SlideKit 在 Chrome 中的实际界面：缩略图、画布、文字工具栏和属性面板](docs/images/editor-v0.1.1.png)](docs/images/editor-v0.1.1.png)

*SlideKit v0.1.1 在本机 Chrome 中的实际截图，使用项目自带的示例文稿。点击截图可查看原图。编辑器目前采用中文界面，文档提供中英文版本。*

## 在自己的产品里完成演示创作

SlideKit 可挂载到指定 DOM 容器，自带工具栏、缩略图、画布和属性面板。使用 JavaScript 与 DOM/SVG，不要求宿主采用特定框架。构建同时提供 ESM、普通 script、CSS，以及由 JSDoc 生成的 TypeScript 类型声明。

| 内容创作 | 排版与编辑 | 文件与交付 |
| --- | --- | --- |
| 局部富文本样式 | 拖动、缩放、旋转、吸附 | 内嵌图片的完整 JSON |
| 图片、形状与箭头 | 多选、对齐、等距分布 | 本地 PPTX 导入与兼容性提示 |
| 渐变、阴影、透明度 | 图层、锁定、撤销重做 | PDF 页面转为图片 |
| 多页面与隐藏页面 | 画布缩放、只读、放映 | 原生可编辑 PPTX 导出 |

文稿在本地浏览器中处理。库不提供上传服务、账号或存储后端；演示页使用 IndexedDB 自动保存，宿主通过事件接入自己的存储。

## 快速开始

要求 Node.js **22.13+ 或 24+**：

```sh
git clone https://github.com/SamuelSupe/slidekit.git
cd slidekit
npm ci
npm run dev
```

打开 **http://localhost:5182**。运行 `npm run build:demo` 和 `npm run preview`，可在 5183 端口预览完整静态产物。

### 引入前端库

从 [Releases](https://github.com/SamuelSupe/slidekit/releases/latest) 下载 `local-slidekit-0.1.1.tgz`：

```sh
npm install ./local-slidekit-0.1.1.tgz
```

安装后的包名为 `@local/slidekit`，**尚未发布到 npm registry**。

```js
import { createEditor, paragraph } from '@local/slidekit';
import '@local/slidekit/style.css';

const editor = createEditor(document.querySelector('#editor'));
editor.addElement('text', {
  content: paragraph('让好想法，有出色的表达。'),
  x: 96, y: 96, width: 900, height: 140, fontSize: 44,
});

const off = editor.on('change', () => {
  const snapshot = editor.getDocument();
  // 宿主在这里防抖保存 snapshot。
});

// 卸载时：off(); editor.destroy();
```

容器需要明确尺寸，例如 `<div id="editor" style="height:720px"></div>`。

普通 HTML 页面可引用 `dist/slidekit.css` 和 `dist/slidekit.iife.js`，然后调用 `SlideKit.createEditor(container)`。仓库包含 [ESM](examples/esm.html)、[普通 script](examples/iife.html)、[React](examples/ReactEditor.jsx) 与 [Vue](examples/VueEditor.vue) 示例。

**打包宿主使用 PDF：**将 `dist/pdf-assets/` 复制到静态目录，并设置 `pdfAssetsUrl`；直接通过 script/ESM 部署时保留完整 `dist/` 目录。[详细说明 →](docs/guide.zh-CN.md#npm--esm)

## 明确当前边界

- **JSON 是无损工作格式。** PPTX 导入支持部分 Office 对象，不支持或简化的内容会显示兼容性说明。
- **PDF 按页转成图片。** 原有文字不能逐段编辑，新增文字与形状仍可编辑。
- 面向桌面浏览器；窄容器会折叠侧栏，暂不提供专门的手机编辑交互。
- 字体与 Office 排版引擎会影响换行、间距。当前版本完成浏览器与 OOXML 验证，仍缺少新版文件的 WPS／PowerPoint 原生打开和编辑验收。
- 当前不包含表格／图表编辑器、动画、多人协作、账号及云存储。

## 文档与开发

| 主题 | English | 简体中文 |
| --- | --- | --- |
| 安装、API、文档模型、导入与限制 | [Guide](docs/guide.md) | [接入指南](docs/guide.zh-CN.md) |
| 实际验证与待验收范围 | [Validation](VALIDATION.md) | [验证记录](VALIDATION.zh-CN.md) |
| 版本变化 | [Changelog](CHANGELOG.md#english) | [变更记录](CHANGELOG.md#简体中文) |
| 贡献与安全 | [Contributing](CONTRIBUTING.md) · [Security](SECURITY.md) | [参与贡献](CONTRIBUTING.md#简体中文) · [安全说明](SECURITY.md#简体中文) |

```sh
npm test           # 文档、历史、几何、导入导出边界
npm run build      # ESM、IIFE、CSS、类型和依赖许可声明
npm run build:demo # 静态站点和接入示例
npm pack           # 自动构建并生成可安装 tarball
```

基于 [Tiptap](https://github.com/ueberdosis/tiptap)、[Moveable](https://github.com/daybrush/moveable)、[Selecto](https://github.com/daybrush/selecto)、[PptxGenJS](https://github.com/gitbrent/PptxGenJS)、[PDF.js](https://github.com/mozilla/pdf.js) 与 [Lucide](https://github.com/lucide-icons/lucide) 构建。

采用 [MIT 许可证](LICENSE)。构建会生成 `dist/THIRD_PARTY_NOTICES.txt`，发布包附带已打包依赖的完整许可文本。
