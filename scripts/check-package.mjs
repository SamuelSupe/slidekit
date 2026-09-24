import { cp, mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const directory = await mkdtemp(join(tmpdir(), 'slidekit-package-'));
const pack = join(directory, 'pack');
const consumer = join(directory, 'consumer');
const manifest = JSON.parse(await readFile('package.json', 'utf8'));
try {
  // Stage only declared distributables so packaging never scans local QA files.
  await cp('package.json', join(pack, 'package.json'), { recursive: true });
  for (const path of manifest.files) await cp(path, join(pack, path), { recursive: true });
  const filename = execFileSync('npm', ['pack', '--offline', '--ignore-scripts', '--silent', '--pack-destination', root], { cwd: pack, encoding: 'utf8' }).trim();
  await cp('test/consumer.mts', join(consumer, 'consumer.mts'), { recursive: true });
  await writeFile(join(consumer, 'package.json'), JSON.stringify({ private: true, type: 'module' }));
  execFileSync('npm', ['install', '--offline', '--ignore-scripts', '--no-audit', '--no-fund', resolve(filename)], { cwd: consumer, stdio: 'inherit' });
  execFileSync(process.execPath, [join(root, 'node_modules/typescript/bin/tsc'), '--strict', '--noEmit', '--module', 'NodeNext', '--moduleResolution', 'NodeNext', '--target', 'ES2022', 'consumer.mts'], { cwd: consumer, stdio: 'inherit' });
  console.log('Package installation and public TypeScript declarations passed: ' + filename);
} finally { await rm(directory, { recursive: true, force: true }); }
