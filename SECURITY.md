# Security / 安全说明

## English

The current 0.1.x line is the supported release line. Files are parsed in the browser; the library has no document upload endpoint. Host applications remain responsible for access control, persistence, CSP, resource hosting and dependency updates.

Import limits bound file size, referenced decompression and document structure; they do not guarantee memory usage or responsiveness for every hostile file. SVG is decoded in an image context. External PPTX image links are skipped. Invalid input or failed import must leave the current document intact.

Report vulnerabilities through this repository's **Security → Report a vulnerability** entry when available. If private reporting is unavailable, ask the maintainer for a private channel without posting an exploit or confidential document in a public issue. Ordinary bugs belong in Issues. Remove secrets and personal content from attachments.

## 简体中文

目前维护 0.1.x 版本。文件在浏览器内解析，库不提供文稿上传接口；宿主仍需负责访问控制、持久化、CSP、资源托管及依赖更新。

导入限制约束文件大小、引用资源解压量和文档结构，不保证所有恶意文件的内存消耗或响应时间。SVG 在图片环境中解码，PPTX 外部图片链接被跳过；无效输入或导入失败应保留当前文稿。

漏洞请通过仓库 **Security → Report a vulnerability** 私下报告。如私密报告入口不可用，请先向维护者索取私密渠道，不要在公开 Issue 中发布漏洞利用细节或保密文稿。普通缺陷使用 Issues，附件需移除凭据和个人信息。
