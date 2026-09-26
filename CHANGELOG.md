# Changelog / 变更记录

## 0.2.0 — 2026-09-26

### English

- Configure Simplified Chinese, Traditional Chinese, English, Korean and Japanese UI through `locale`, `getLocale()` and `setLocale()`. Language changes remain independent per instance and preserve document content, selection and history.
- Localize import dialogs, diagnostics, toolbars, property panels and slideshow controls. Add a demo language selector and reactive React/Vue examples; the document schema remains unchanged.
- Replace backtracking diagnostic matching with delimiter scanning, preventing long PPTX image references from freezing the editor.
- Preserve existing browser saves after failed demo recovery and atomically reject stale tab writes. Autosave composition drafts and request browser leave confirmation while changes remain unsaved.
- Verified with 41 tests, ESM/IIFE and static demo builds, offline package installation, strict consumer types and native Chrome regression checks. See [validation](VALIDATION.md) for scope and limitations.

Upgrade note: reload existing demo tabs so every writer uses the new conflict checks. Export local work as JSON before reloading a tab with a save conflict. The demo does not merge concurrent edits. Native WPS/PowerPoint certification remains outstanding.

### 简体中文

- 通过 `locale`、`getLocale()` 和 `setLocale()` 配置／切换简体中文、繁体中文、英文、韩文及日文界面。各实例语言独立，切换时保留文稿内容、选区与历史。
- 本地化导入对话框、诊断、工具栏、属性面板和放映控件；增加演示页语言选择器及 React／Vue 响应式示例，文稿结构版本不变。
- 诊断匹配改为固定分隔符扫描，避免超长 PPTX 图片引用使编辑器卡顿。
- 演示页恢复失败时保留原存档，原子拒绝旧标签页覆盖新存档；组合输入草稿也触发自动保存，仍有未保存内容时请求浏览器离开确认。
- 通过 41 项测试、ESM／IIFE 与静态演示构建、离线安装包、严格消费端类型检查及本机 Chrome 回归，范围和限制见[验证记录](VALIDATION.zh-CN.md)。

升级提示：重新加载已有演示标签页，使所有写入方都启用新的冲突保护。存在保存冲突时，先导出当前工作为 JSON 再重新加载。演示页不会合并并发编辑，WPS／PowerPoint 原生验收仍未完成。

## 0.1.1 — 2026-09-25

### English

- Remove the second full-document copy from each edit while preserving complete validation, atomic rejection and undo history isolation.
- Share immutable image data across snapshots and clipboards, copy mutable metadata independently, and deduplicate shared image resources during selection copying.
- Keep host patches and clipboard metadata independent from committed documents, including asset IDs such as `toString`.
- A synthetic 100-page, 2,000-element benchmark reduced median core commit time from 8.69 ms to 5.09 ms (about 41%). This measures the data layer, excluding browser rendering; see [validation](VALIDATION.md).
- Verified with 39 tests, ESM/IIFE builds, strict consumer types and native Chrome editing, clipboard, history and remount checks. The public API and document schema are unchanged.

### 简体中文

- 移除每次编辑的第二次整稿复制，保留完整校验、失败原子拒绝与撤销历史隔离。
- 快照与剪贴板共享不可变图片数据，独立复制可变元数据；多选复制时对共享图片资源去重。
- 保持宿主传入补丁、剪贴板元数据与已提交文稿相互独立，兼容 `toString` 等资源 ID。
- 100 页、2,000 个元素的合成基准中，核心提交耗时中位数由 8.69 ms 降至 5.09 ms，约减少 41%。此数据不包含浏览器渲染，详见[验证记录](VALIDATION.zh-CN.md)。
- 通过 39 项测试、ESM／IIFE 构建、严格消费端类型检查，以及本机 Chrome 编辑、复制粘贴、历史和重挂验证。公开 API 与文稿结构版本保持不变。

## 0.1.0 — 2026-09-25

### English

Initial public release of the framework-independent slide editor, with ESM/IIFE bundles and TypeScript declarations.

- Rich text, images, shapes, gradients, shadows, object transforms, selection, layers, history and presentation.
- Portable JSON, local PPTX import with warnings, PDF pages as images, and editable native PPTX export.
- Hidden slides, independent fill/stroke transparency, SVG-only Office picture references, elbow connectors and text line-break handling.
- Release review fixes: isolate failing host event callbacks, keep invalid XML characters out of exported PPTX, reject stale image insertion after a reload, protect asynchronous JSON loading, and save active text through Cmd/Ctrl+S.
- English/Chinese documentation, real Chrome screenshot, reproducible build, CI and bundled dependency notices.

Known limits: Chinese UI; desktop focus; PDF content is rasterized; Office import is a supported subset. Fresh native WPS/PowerPoint validation remains outstanding. See [validation](VALIDATION.md).

### 简体中文

首个公开版本，提供不依赖宿主框架的幻灯片编辑器、ESM/IIFE 产物及 TypeScript 类型。

- 富文本、图片、形状、渐变、阴影、变换、多选、图层、历史与放映。
- 完整 JSON、本地 PPTX 导入与兼容性说明、PDF 页面图像化及原生可编辑 PPTX 导出。
- 隐藏页面、独立填充／描边透明度、Office SVG 图片引用、折线连接符及文字换行保留。
- 发布复查修复：隔离宿主回调异常、处理 PPTX 非法 XML 字符、阻止重新加载后的陈旧图片插入、保护异步 JSON 加载，以及文字编辑中的保存快捷键。
- 中英文文档、Chrome 真实截图、可重复构建、CI 及依赖许可声明。

已知边界：中文界面、面向桌面；PDF 内容为图片，Office 导入仅支持部分功能。新版文件仍缺少 WPS／PowerPoint 原生验收，见[验证记录](VALIDATION.zh-CN.md)。
