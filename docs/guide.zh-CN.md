# 接入指南

[English](guide.md) · 简体中文 · [返回首页](../README.zh-CN.md)

可嵌入的 JavaScript 幻灯片编辑器。原生 DOM / SVG 画布，中文办公界面，结构化富文本，JSON 保存、本地 PPTX/PDF 打开和原生可编辑 PowerPoint 导出。宿主无需 React 或 Vue。

## 开始使用

要求 Node.js 22.13+ 或 24+。项目源码为 JavaScript，类型由 JSDoc 生成。在源码项目目录执行：

```sh
npm ci
npm run dev
```

打开 <http://localhost:5182>。演示页将文稿保存在本浏览器的 IndexedDB 中；右上角可下载 JSON 和 PPTX。浏览器存储不等于备份，重要文稿请保存 JSON 文件。

```sh
npm test          # 文档、历史、几何和 PPTX 边界测试
npm run build    # dist/ ESM、IIFE、CSS、类型声明
npm run build:demo # 完整静态站点 site/，含打包产物接入示例
npm run preview  # 在 5183 端口预览 site/ 静态产物
npm pack         # local-slidekit-0.1.0.tgz；包含构建产物及示例
```

`site/` 可放到任意静态 HTTP(S) 服务，支持子目录部署，无后端服务。请通过 HTTP(S) 打开示例，浏览器不支持用 `file://` 直接加载 ES module。

本地包名暂定为 `@local/slidekit`，尚未发布 npm。安装本地 tarball 或项目目录：

```sh
npm install /path/to/local-slidekit-0.1.0.tgz
```

### npm / ESM

```js
import { createEditor, paragraph } from '@local/slidekit';
import '@local/slidekit/style.css';

const editor = createEditor(document.querySelector('#editor'), {
  mode: 'edit',
  pdfAssetsUrl: '/slidekit-pdf/',
  theme: { accent: '#5c5bd6' },
  ui: { toolbar: true, thumbnails: true, inspector: true },
});

editor.addElement('text', {
  x: 96, y: 96, width: 900, height: 140,
  fontSize: 44,
  content: paragraph('让好想法，有出色的表达。'),
});

const unsubscribe = editor.on('change', ({ reason }) => {
  const document = editor.getDocument();
  // 宿主在这里防抖保存 document。
  console.log(reason, document);
});

// 页面卸载时：
// unsubscribe();
// editor.destroy();
```

在 Vite、Webpack 等宿主打包项目中，启用 PDF 打开时，把安装包的 `dist/pdf-assets/` 复制到宿主静态目录，例如 `public/slidekit-pdf/`，并将 `pdfAssetsUrl` 配成它的访问路径。子目录部署须包含宿主的路径前缀。该目录包含 Worker、字体、CMap 和图像解码资源，文件名应保持不变。PDF 在浏览器中本地处理，不上传文件。

容器必须有明确尺寸，例如 `<div id="editor" style="height:720px;width:100%"></div>`。编辑器最低高度 420px，建议桌面编辑宽度至少 900px。窄于 720px 时侧栏折叠，可用工具栏右侧按钮展开。

### 普通 script

```html
<link rel="stylesheet" href="./dist/slidekit.css">
<div id="editor" style="height:720px"></div>
<script src="./dist/slidekit.iife.js"></script>
<script>
  const editor = SlideKit.createEditor(document.querySelector('#editor'));
  editor.on('change', () => console.log(editor.getDocument()));
</script>
```

完整可运行接入页：[普通 script](../examples/iife.html)、[浏览器 ESM](../examples/esm.html)。两者均直接使用 `dist/`，包含双实例、保存/加载、只读切换与销毁后重新挂载。

直接通过 script 或浏览器 ESM 引用时，部署整个 `dist/`（包括 `pdf-assets/`）；默认自动从库文件旁边加载 PDF 资源，无需设置 `pdfAssetsUrl`。

框架接入：[ReactEditor.jsx](../examples/ReactEditor.jsx)、[VueEditor.vue](../examples/VueEditor.vue)。只需在挂载后创建实例，卸载前调用 `destroy()`；SSR 应在客户端挂载阶段加载。`initialDocument` 仅作为初始值，后续主动加载使用 `setDocument()`，不要在每次 `change` 后回写同一份文稿，否则会清空历史。

## 编辑能力

- 幻灯片新增、复制、删除、拖动排序，隐藏/取消隐藏、背景色，16:9 / 4:3 页面比例。
- 双击文字编辑，局部字体、字号、颜色、粗体、斜体、下划线；段落对齐、行距、项目/编号列表。
- 本地 PNG、JPEG、WebP 图片；矩形、圆角矩形、椭圆、直线、单/双向连线箭头和块状箭头；填充、描边、不透明度。
- 形状线性渐变可调整色标颜色与角度；外阴影可调整颜色、模糊、偏移及不透明度。导入的渐变文字在编辑时保留，设置局部纯色可替换该选区的渐变。
- 拖动、八方向缩放、旋转；框选与 Shift 多选；方向键微调；对齐、等距分布、参考线吸附。
- 图层面板、置顶/置底、锁定，复制粘贴，统一撤销重做。
- 画布缩放、适应容器、只读、全屏放映，左右翻页、Esc 退出。
- 打开 PDF，每页转为一张幻灯片；支持密码、进度、取消和继续添加编辑元素。

选中对象后按 Enter 可编辑文字；Esc 退出文本编辑并取消选择。⌘/Ctrl+D 复制对象；⌘/Ctrl+C/V/X 复制/粘贴/剪切；⌘/Ctrl+Z 撤销，⌘/Ctrl+Shift+Z 或 Ctrl+Y 重做；Shift+方向键每次移动 10 个逻辑像素。文本选区内的复制粘贴由富文本编辑器处理。

锁定元素仍可在图层面板选中并解锁，但不能移动、改样式、删除或调整层级。一次拖动为一个历史步骤；连续输入在 700ms 内合并，格式变更独立记录。历史保留最近 100 步。

粘贴编号列表时，起始序号规范化为 1–9999，零或负数从 1 开始，保留全部条目文字。若其他内容校验仍然失败，编辑草稿会保留，保存、切页等操作不会悄悄退回旧文字；可用撤销恢复最近一次有效内容。

## 公开 API

```js
const editor = createEditor(container, options);
```

`options`：`document` 初始文稿，`mode` 为 `'edit' | 'view'`，`theme.accent` 为六位十六进制颜色，`ui.toolbar / thumbnails / inspector` 控制初始面板显示，`pdfAssetsUrl` 指定宿主部署的 PDF 资源目录，`pdfLimits` 设置 PDF 导入上限。一个容器可包含编辑器以外的内容，`destroy` 仅移除本实例创建的 DOM。

| 方法 | 语义 |
| --- | --- |
| `getDocument()` | 返回独立快照，包含当前正在编辑的文字；修改返回值不影响实例 |
| `setDocument(doc)` | 校验并加载，回到第一页、清空选择和历史；失败抛出异常并保留当前文稿和文本会话 |
| `importPdf(fileOrBlob, {password?, signal?, limits?}?)` | 异步打开 PDF，全部转换成功后替换文稿并清空历史；失败或取消不替换当前内容，返回 `Promise<void>`；`limits` 仅覆盖本次调用的导入上限 |
| `importPptx(fileOrBlob, {signal?}?)` | 异步打开本地 PPTX，全部解析成功后替换文稿并清空历史；失败或取消保留原稿；返回 `Promise<{warnings: string[]}>`，说明不能完整还原的内容 |
| `addSlide(properties?, index?)` | 插入空白页，默认当前页后；返回新页面 ID。属性支持 `name`、`background`、`backgroundGradient`、`hidden` |
| `duplicateSlide(id?)` | 复制指定/当前页面，重建页面和元素 ID，返回新页面 ID |
| `updateSlide(id, {name?, background?, backgroundGradient?, hidden?})` | 修改页面属性；隐藏页保留内容，放映时跳过 |
| `deleteSlide(id?)` | 删除指定/当前页；删除最后一页时创建新的空白页 |
| `moveSlide(id, index)` | 移到从 0 开始的最终位置 |
| `goToSlide(id)` | 切换当前页并结束文本编辑 |
| `addElement(type, properties?)` | 当前页新增 `text`、`shape` 或已有资源的 `image`；返回元素 ID |
| `updateElement(id, patch)` | 修改当前页的元素；ID、类型固定；锁定元素只允许修改 `locked` |
| `deleteElements(ids?)` | 默认删除选中元素，保留锁定元素 |
| `addImage(fileOrBlob, properties?)` | 异步嵌入图片并返回元素 ID；支持 PNG/JPEG/WebP。若等待期间切页、切为只读或销毁则拒绝 |
| `selectElements(ids)` | 设置当前页的选择，过滤不存在的 ID |
| `undo()` / `redo()` | 文档级撤销重做，覆盖文本、元素、页面操作 |
| `setMode('edit' \| 'view')` | 切换模式并结束文本会话；只读禁止文档修改，但可加载、翻页、保存、导出、放映 |
| `present()` / `exitPresent()` | 开启/关闭放映；播放启动时的文稿快照，只播放可见页，全部隐藏时提示并不启动；无全屏权限时使用页面内放映 |
| `exportPptx()` | 返回 `Promise<Blob>`，包含正在编辑的文字；不自动下载 |
| `on(event, handler)` | 注册事件，返回取消订阅函数 |
| `destroy()` | 幂等销毁，移除监听、观察器、编辑器、变换工具和实例 DOM |
| `element` | 本实例根 DOM，可用于聚焦与宿主布局 |

API 的文档修改方法在只读模式抛出异常。非法参数同步抛出，异步 API 拒绝 Promise。销毁后除再次 `destroy()` 外不能调用实例 API。界面操作失败会显示提示并发出 `error`，宿主直接调用 API 应自行 `try/catch`。

事件负载：

```js
editor.on('change', ({ reason }) => { /* 从 getDocument() 读取最新快照 */ });
editor.on('selectionChange', ({ ids }) => { /* 当前选择 ID 数组 */ });
editor.on('slideChange', ({ id, index }) => { /* 当前页面 ID 和从 0 开始的索引 */ });
editor.on('error', ({ error, message }) => { /* UI 操作错误 */ });
```

文档变更后也会通知当前选择与页面；这些事件可用于同步宿主界面，不应在处理函数中无条件再次修改同一文稿。

另导出 `createDocument(title?)`、`createElement(type, props?)`、`paragraph(text)`、`validateDocument(doc)` 和无界面的 `exportPptx(doc)`。`validateDocument` 返回规范化独立副本，不修改输入。

## JSON 文档与坐标

```js
{
  schemaVersion: 1,
  title: '演示文稿',
  width: 1280,
  height: 720,
  slides: [{
    id: 'slide-stable-id',
    name: '第一页',
    background: '#ffffff',
    elements: []
  }],
  assets: {}
}
```

元素通用属性为 `id / type / x / y / width / height / rotation / opacity / locked`。坐标和尺寸是固定逻辑像素，旋转单位为度（绕元素中心），不透明度为 0–1；画布显示缩放不会改变数据。`elements` 数组从底层到顶层排列。

- 文字：`fontFamily / fontSize / color / lineHeight / content`。字号为 **pt**；行距为倍数。富文本使用受限的 Tiptap JSON：`doc / paragraph / text / hardBreak / bulletList / orderedList / listItem`，标记为 `bold / italic / underline / textStyle`。`textStyle` 支持 `fontFamily`、`fontSize: '32pt'`、`color: '#5c5bd6'`、`opacity: 0.5`。局部不透明度与文本框的 `opacity` 相乘；PPTX 导入会将统一透明度还原到文本框，不同文字片段的透明度分别保留。浏览器粘贴的命名色、短十六进制、RGB/HSL 等 CSS 颜色会规范化为文档颜色，颜色中的 alpha 合并到局部不透明度；无法解析的颜色使用默认文字色，文字内容仍保留。
- 形状：`shape: 'rect' | 'roundRect' | 'ellipse' | 'line' | 'arrow'`，另支持 `rightArrow / leftArrow / upArrow / downArrow / leftRightArrow / upDownArrow`；`fill`、`stroke`、`strokeWidth`。填充可以为 `'transparent'`，其余颜色为六位十六进制。可选 `fillOpacity`、`strokeOpacity` 为 0–1，缺省为 1，分别与对象 `opacity` 相乘；渐变色标再乘入填充不透明度。描边及箭头端点共享描边不透明度，PPTX 往返保留实际透明度。
- 图片：`assetId / fit`，`fit` 为 `'contain' | 'cover'`。资源表条目为 `{data: 'data:image/png;base64,...', width, height, name}`；所有图片都内嵌，JSON 可离线独立恢复。

渐变保存为形状的 `gradient`、页面的 `backgroundGradient` 或文字 `textStyle.attrs.gradient`：

```js
const gradient = {
  type: 'linear', angle: 0, scaled: true, rotateWithShape: true,
  stops: [
    { offset: 0, color: '#6136ff', opacity: 1 },
    { offset: 0.53, color: '#cb2ae3', opacity: 1 },
    { offset: 1, color: '#ff763d', opacity: 1 }
  ]
};
editor.updateElement(shapeId, { gradient });
editor.updateSlide(slideId, { backgroundGradient: gradient });
editor.updateElement(shapeId, {
  shadow: { color: '#000000', opacity: 0.15, blur: 20, offsetX: 4, offsetY: 4, rotateWithShape: false }
});
```

渐变角度从右方开始顺时针计量；`scaled` 表示方向随填充区域宽高调整，`rotateWithShape` 表示随对象旋转。须有 2–32 个色标，`offset` 和 `opacity` 为 0–1。阴影使用逻辑像素，适用于形状、文字及图片；`blur` 为模糊半径，`offsetX/Y` 为偏移。`shadow.opacity` 保存阴影本身的不透明度，PPTX 往返不会再次乘入对象不透明度。传入 `null` 可去掉渐变或阴影。JSON 保存和历史保留这些参数。

连线的 `startArrow/endArrow` 可为 `none / triangle / stealth / arrow / diamond / oval`。块状箭头的 `arrowShaft` 是箭杆宽度比例（0–1），`arrowHead` 是箭头长度相对短边的比例，默认均为 0.5；实际长度限制在形状范围内。

折线使用 `line` 或 `arrow` 的可选 `points: [{x, y}, ...]` 保存 2–32 个路径点。坐标相对于元素宽高归一化，`{x: 0, y: 0}` 为左上角、`{x: 1, y: 1}` 为右下角；允许超出边界的折点。移动、缩放、旋转保留折线路径，导出为原生可编辑 DrawingML 路径。当前界面不提供逐点拖动；宿主可通过 `updateElement` 调整路径，传入 `points: null` 恢复直线。

通过 `createElement()` 生成完整默认属性，再调整所需值。不能给不同元素复用 ID。加载拒绝未知文档版本、非法坐标、重复 ID、缺失图片引用和不支持的富文本节点。未知富文本属性不作为扩展协议使用，规范化时会移除。文档最多 500 页、每页 2000 个元素；导入本地图片不超过 20MB / 4000 万像素。WebP 入库前转为 PNG。

改变页面比例保留元素原始坐标，可能需要重新排版。文字框保持指定尺寸，不会为了容纳内容自动放大。

页面可选 `hidden: true` 表示隐藏，缺省为可见。缩略图标明隐藏页，仍可编辑、复制和保存；在页面属性中取消隐藏，或调用 `updateSlide(id, {hidden: false})`。放映从当前可见页开始；当前页隐藏时从首个可见页开始，翻页和计数均排除隐藏页。JSON 和 PPTX 导出保留隐藏标记。

## 保存、放映与导出

库不上传文稿，也不自动持久化；PDF 打开时会从宿主加载解析资源。宿主订阅 `change` 后保存 JSON；演示页的 IndexedDB 防抖保存见源码中的 `demo/persistence.js` 和 `demo/main.js`。自动保存可能受浏览器配额、隐私模式和页面强制关闭影响。

编辑器加载或修改文稿时清理没有任何页面引用的图片资源；`getDocument()`、JSON 下载和自动保存只包含仍在使用的图片。共用图片在最后一个引用删除后清理，撤销历史独立保留恢复所需的资源。旧 JSON 中的孤立资源也会在加载后移除；需要保留的图片应由页面元素引用。

PPTX 将各元素依次转换为原生文本框、形状和图片，保留顺序、位置、旋转和支持的样式。线性渐变、外阴影、块状箭头及连线两端样式写入原生 DrawingML；文字与形状可继续编辑。坐标按 96px = 1in 转换，字号使用 pt，描边从 px 转为 pt。图片不是整页截图。

不同 Office 引擎、字体与字形度量会导致换行、行距、列表缩进、圆角等差异，不承诺逐像素一致。浏览器侧锁定状态不作为 PowerPoint 编辑锁定导出。JSON 是无损往返格式；PPTX 可导入支持的对象，但不保证完整还原所有 Office 功能。

当前范围不包含专门的表格/图表编辑器、动画、多人协作、账号、云存储与手机触控编辑。库自身不依赖外部字体服务；宿主可自行安装字体。

### PPTX 打开

工具栏“打开”可直接选择本地 `.pptx`，不上传文件。支持多页、页面大小与顺序、纯色/线性渐变背景、可编辑文字及局部字号/字体/颜色/粗体/斜体/下划线/线性渐变、段落对齐和列表，以及矩形、圆角矩形、椭圆、直线/箭头、六种方向的块状箭头、内嵌 PNG/JPEG/SVG 图片。支持形状线性渐变与外阴影；组合对象展开为独立元素，解析母版和布局中的位置、文字样式及主题色。裁剪和镜像图片转换为内嵌 PNG。

支持 Office 的图片兼容分支及只有 `svgBlip` 扩展引用的 SVG。有可用 PNG/JPEG 时优先读取；SVG 在浏览器图片环境中解码为内嵌 PNG，供 JSON 保存和 PPTX 导出使用，不作为可编辑矢量图形。转换最长边为 2560px、最多 400 万像素，SVG 脚本和外部资源不会执行或加载。

Office 的 `bentConnector2–5` 折线连接符保留拐点、镜像、旋转和两端箭头；不支持的曲线或路径公式会显示兼容性说明，明确告知已按端点直线导入。文字中的普通换行和软换行均保留，包括开头、连续和结尾换行；渐变文字也可正常导出。

完全透明填充或 `noFill` 的形状会保留可见描边。PPTX 中标记为隐藏的对象和组合（含母版、布局中的对象）不导入，并在兼容性说明中列出；它们不会出现在画布、缩略图、放映或后续导出文件中。原 PPTX 文件不会被修改。

PPTX 的隐藏页面会保留整页内容并提示，放映时自动跳过，导出仍是隐藏页。渐变或纯色填充与描边的不同透明度分别保留；连线设置为无描边时保持不可见，包括箭头端点。

```js
const result = await editor.importPptx(file);
console.log(result.warnings);
// 同 PDF 一样，可通过 AbortSignal 取消。
await editor.importPptx(file, { signal: controller.signal });
```

导入存在兼容性差异时，编辑器顶部显示可展开的说明；API 返回相同的 `warnings`。表格、图表、SmartArt、音视频及不支持的形状不导入，不支持的形状中若有文字则保留。路径/径向渐变、渐变平铺、内阴影、发光、反射及复杂阴影变换仍会简化或跳过；多级列表缩进、固定行距和竖排/垂直对齐会简化。动画不导入。不支持的图片格式、外部链接、缺失的图片引用、空图片占位符和无法解码的 SVG 会跳过，提示具体页码、对象及原因，其余内容继续打开。字体未安装、组合中的非等比旋转等情况可能影响版面，重要文稿请核对导入结果。

限制为原文件 200 MB、最多 500 页、引用资源解压累计 500 MB、单页最多 2000 个元素。旧版 `.ppt` 和加密文稿需先在 PowerPoint/WPS 中另存为未加密的 `.pptx`。文件损坏、页面等必要资源缺失、取消或解析期间宿主改动文稿时，均不会替换当前文稿。公开方法成功后包含当前实例的兼容性说明，但这类说明不写入 JSON。

解析依据 [Microsoft 的 PresentationML 文档结构说明](https://learn.microsoft.com/en-us/office/open-xml/presentation/working-with-presentations)，使用现有 JSZip 和浏览器 XML 解析器；`@xmldom/xmldom` 仅用于 Node 测试，不进入浏览器产物。

### PDF 打开

工具栏“打开”可选择 `.pdf`。PDF 通过 Mozilla PDF.js 在浏览器中逐页渲染，保留可见版面，每页作为一张默认锁定的图片；可以在图层面板解锁，或直接叠加可编辑文字、形状和图片。PDF 内部原有文字与图形不会还原为独立对象，不包含 OCR、链接、表单交互或 PDF 再导出。导出 PPTX 时，原 PDF 页面仍是图片，新增文字和形状为原生对象。

文稿尺寸沿用第一张 PDF 页面的比例；混合横竖页面按比例居中留白，旋转依据 PDF 页面的方向。图像长边最多 2560px、单页最多 400 万像素，因此超高倍缩放不等同于原 PDF 矢量清晰度。

```js
await editor.importPdf(file);
// 加密 PDF 也可提前提供密码；缺少/错误密码时显示输入框。
await editor.importPdf(file, { password: 'document-password' });
// 可通过 AbortController 取消，Promise 将以 AbortError 拒绝。
const controller = new AbortController();
const opening = editor.importPdf(file, { signal: controller.signal });
// controller.abort();
await opening;
```

默认最多打开 **200 MB / 500 页**的 PDF；渲染后内嵌图像的编码总量上限为 **500 MB**，MB 按 1024×1024 换算。原文件压缩率与 PNG 图像不同，因此两个大小分别计量。超限提示会显示实际大小、当前上限，以及渲染阶段到达的页码。

```js
const editor = createEditor(container, {
  pdfLimits: { maxFileSizeMB: 300, maxPages: 500, maxRenderedSizeMB: 800 },
});
// 本次调用只覆盖指定项，其余沿用实例设置。
await editor.importPdf(file, { limits: { maxRenderedSizeMB: 1000 } });
```

可通过 `DEFAULT_PDF_LIMITS` 读取默认值。大小限制接受有限正数；页数须为 1–500 的整数，与文档模型上限一致。配置影响“打开”入口与 API，不会提高图像分辨率。上限表示导入检查阈值，不是浏览器内存或存储容量保证；很大的 JSON/PPTX 导出仍取决于设备资源和浏览器配额。

图片数据在编辑历史中共享不可变字符串，快照的可变字段仍相互隔离；缩略图图片使用延迟加载。密码只用于当前导入，不保存到 JSON。解析失败、取消、销毁实例或加载了其他文稿时释放 Worker；若宿主在导入期间修改文稿，则拒绝替换，避免覆盖新内容。只读模式可打开 PDF，后续修改仍受只读限制。

## 结构与验证

`src/document.js / store.js / history.js` 负责文档与原子历史；`render.js` 共用编辑、缩略图和放映渲染；`rich-text.js` 管理 Tiptap 与中文组合输入；`gestures.js` 管理 Moveable/Selecto；`pptx.js` 是原生导出边界。UI、CSS、快捷键限定在实例根容器，销毁会清理资源。

构建产物包含已打包的运行依赖，npm 安装包没有额外运行依赖，普通 script 无需外部 CDN。PptxGenJS 的开发环境传递依赖 `image-size` 固定为修复漏洞的版本，保留 TLS 校验。

实际验收记录见 [VALIDATION.md](../VALIDATION.zh-CN.md)。GitHub Release 提供安装包和静态演示站点；尚未发布到 npm registry。

## 宿主集成的失败边界

`on()` 要求函数处理器。处理器抛异常或返回拒绝的 Promise 时，不会回滚已经成功的编辑，也不会阻断其他订阅者；通过 `error` 事件报告 `{error, message, sourceEvent}`。`error` 处理器自身失败只写入控制台，不递归触发错误。宿主应自行显示保存状态并处理持久化失败。

本地 JSON 与 PPTX/PDF 一样，校验和转换全部成功后才替换文稿；取消、实例销毁或读取期间修改/重新加载文稿会拒绝替换。图片解码期间重新加载文稿，即使页面 ID 相同，也会拒绝插入；原文稿上的普通编辑仍可继续。

编辑文字时按 ⌘/Ctrl+S 会保存包含当前草稿的 JSON；只读模式下也可以下载。组合输入期间和宿主输入框中的快捷键不会被抢占。

JSON 保留原始文字。PPTX 导出会把 XML 1.0 无法表达的控制字符和孤立代理码替换为 `�`，保留合法 Unicode、换行和中文，避免生成需要修复的 XML。

单个 PPTX XML/SVG 引用资源最多 16 MiB，其余单资源最多 64 MiB，组合对象最多嵌套 16 层。演示页的 IndexedDB 不提供多标签并发编辑协调。
