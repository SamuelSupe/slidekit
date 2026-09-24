# Contributing / 参与贡献

## English

Use Node.js 22.13+ or 24+. Run `npm ci`, then `npm run dev`. Keep changes focused and preserve public JSON/API contracts. Prefer plain readable JavaScript and cohesive modules to additional abstraction.

Before a pull request, run `npm test`, `npm run build:demo` and `npm run check:package`. For a UI change, exercise the actual page in Chrome, including its error state and the affected import/save/export flow. Document what was actually run; building alone does not validate browser interaction or Office compatibility.

Add tests for meaningful behavior, nontrivial invariants, or a confirmed regression. Prefer extending an existing behavioral boundary over mirroring implementation details. Do not add a browser automation dependency for a small change.

Update both languages when changing API, file compatibility or user-visible behavior. A useful PR explains the trigger, before/after behavior, validation and any remaining limitation. Use synthetic or authorized, anonymized fixtures. Do not commit personal documents, credentials, generated bundles or `validation/` scratch files.

Source responsibilities are listed in the [guide](docs/guide.md#source-map-and-validation). Release archives include generated dependency notices; preserve their license texts when redistributing the bundle.

## 简体中文

使用 Node.js 22.13+ 或 24+，运行 `npm ci` 与 `npm run dev`。改动应聚焦，保留公开 JSON/API 契约。优先使用可读的 JavaScript 与职责清晰的模块，避免不必要的抽象。

提交 PR 前运行 `npm test`、`npm run build:demo` 和 `npm run check:package`。修改 UI 时，在 Chrome 中实际验证页面、错误状态及受影响的导入／保存／导出流程。说明实际执行的验证；构建成功不能代替浏览器交互或 Office 兼容性验收。

只为有意义的行为、非平凡不变量或已确认缺陷添加回归测试。优先扩展现有行为边界，不编写复刻实现细节的测试；不要为微小改动引入浏览器自动化框架。

API、文件兼容性和用户可见行为变化需要更新中英文文档。PR 说明应包含触发条件、修复前后行为、验证和剩余限制。使用合成或经过授权脱敏的样例，不提交个人文稿、凭据、生成产物及 `validation/` 临时文件。

模块职责见[接入指南](docs/guide.zh-CN.md#结构与验证)。发布包包含自动生成的依赖许可声明，重新分发时需保留这些许可文本。
