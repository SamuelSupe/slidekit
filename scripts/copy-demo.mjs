import { cp } from 'node:fs/promises';

for (const path of ['dist', 'examples', 'docs', 'README.md', 'README.zh-CN.md', 'VALIDATION.md', 'VALIDATION.zh-CN.md', 'CHANGELOG.md', 'CONTRIBUTING.md', 'SECURITY.md', 'LICENSE']) {
  await cp(path, 'site/' + path, { recursive: true });
}
