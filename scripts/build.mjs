import { build } from 'vite';
import { assetFileNames } from './pdf-assets.mjs';
import { readFile, readdir, writeFile } from 'node:fs/promises';

const bundledPackages = new Set();

for (const format of ['es', 'iife']) {
  await build({
    configFile: false,
    base: './',
    plugins: [{
      name: 'bundled-license-notices',
      generateBundle() {
        for (const id of this.getModuleIds()) {
          if (id.startsWith('\0')) continue;
          const match = id.match(/^(.*\/node_modules\/(?:@[^/]+\/)?[^/]+)\//);
          if (match) bundledPackages.add(match[1]);
        }
      },
    }],
    build: {
      emptyOutDir: format === 'es',
      lib: {
        entry: 'src/index.js',
        name: 'SlideKit',
        formats: [format],
        fileName: () => format === 'es' ? 'slidekit.js' : 'slidekit.iife.js',
        cssFileName: 'slidekit',
      },
      rollupOptions: { output: { inlineDynamicImports: true, assetFileNames: asset => asset.names?.includes('slidekit.css') ? 'slidekit.css' : assetFileNames(asset) } },
    },
  });
}

const notices = [];
for (const directory of [...bundledPackages].sort()) {
  const info = JSON.parse(await readFile(directory + '/package.json', 'utf8'));
  const files = (await readdir(directory)).filter(name => /^(licen[sc]e|notice|copying)(\..*)?$/i.test(name));
  const key = info.name + '@' + info.version;
  const texts = await Promise.all(files.sort().map(name => readFile(directory + '/' + name, 'utf8')));
  if (!texts.length && ['croact@1.0.4', 'croact-css-styled@1.1.9', 'css-styled@1.0.8', 'keycon@1.4.0'].includes(key)) {
    texts.push(await readFile('scripts/licenses/daybrush-MIT.txt', 'utf8'));
  }
  if (!texts.length && key === 'isarray@1.0.0') texts.push((await readFile(directory + '/README.md', 'utf8')).split('## License\n')[1]);
  if (!texts.length || texts.some(text => !text)) throw new Error('Missing bundled dependency license: ' + key);
  notices.push([key + ' — ' + info.license, ...texts].join('\n\n'));
}
await writeFile('dist/THIRD_PARTY_NOTICES.txt', 'SlideKit bundled dependency notices\n\n' + notices.join('\n\n' + '='.repeat(72) + '\n\n'));
