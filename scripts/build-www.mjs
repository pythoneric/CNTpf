// Builds www/ for the Capacitor Android app from the PWA sources.
// cnt.html stays the single source of truth; this only copies it and swaps
// the CDN Chart.js + Google Fonts tags for local copies so the APK runs offline.
import { rmSync, mkdirSync, copyFileSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const www = join(root, 'www');
const nm = join(root, 'node_modules');

const CHART_CDN = '<script src="https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js"></script>';
const FONTS_CDN_RE = /<link href="https:\/\/fonts\.googleapis\.com\/css2\?[^"]*" rel="stylesheet">/;
const FONTS = [
  { family: 'Syne', pkg: 'syne', weights: [400, 500, 600, 700, 800] },
  { family: 'JetBrains Mono', pkg: 'jetbrains-mono', weights: [400, 500, 700] },
];
// latin covers Spanish/English; latin-ext adds the rest of the Latin script.
const SUBSETS = [
  { name: 'latin-ext', range: 'U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF' },
  { name: 'latin', range: 'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD' },
];

const copy = (from, to) => { mkdirSync(dirname(to), { recursive: true }); copyFileSync(from, to); };

rmSync(www, { recursive: true, force: true });
mkdirSync(www, { recursive: true });

for (const f of ['manifest.json', 'icon-192.png', 'icon-512.png', 'README.md', 'README.en.md']) {
  copy(join(root, f), join(www, f));
}

// Chart.js — pinned to the exact CDN version (4.4.1) via devDependency.
const chartVer = JSON.parse(readFileSync(join(nm, 'chart.js', 'package.json'), 'utf8')).version;
if (chartVer !== '4.4.1') throw new Error(`chart.js ${chartVer} installed; cnt.html expects 4.4.1`);
copy(join(nm, 'chart.js', 'dist', 'chart.umd.js'), join(www, 'vendor', 'chart.umd.js'));

// Fonts — woff2 files from @fontsource + a generated fonts.css.
let css = '';
for (const { family, pkg, weights } of FONTS) {
  for (const w of weights) {
    for (const { name, range } of SUBSETS) {
      const file = `${pkg}-${name}-${w}-normal.woff2`;
      const src = join(nm, '@fontsource', pkg, 'files', file);
      if (!existsSync(src)) throw new Error(`missing font file ${src}`);
      copy(src, join(www, 'vendor', 'fonts', file));
      css += `@font-face{font-family:'${family}';font-style:normal;font-display:swap;font-weight:${w};` +
        `src:url(fonts/${file}) format('woff2');unicode-range:${range}}\n`;
    }
  }
}
writeFileSync(join(www, 'vendor', 'fonts.css'), css);

// cnt.html → www/index.html (Capacitor loads index.html) with local assets.
let html = readFileSync(join(root, 'cnt.html'), 'utf8');
if (!html.includes(CHART_CDN)) throw new Error('Chart.js CDN tag not found in cnt.html');
if (!FONTS_CDN_RE.test(html)) throw new Error('Google Fonts tag not found in cnt.html');
html = html
  .replace(CHART_CDN, '<script src="vendor/chart.umd.js"></script>')
  .replace(FONTS_CDN_RE, '<link href="vendor/fonts.css" rel="stylesheet">');
writeFileSync(join(www, 'index.html'), html);
writeFileSync(join(www, 'cnt.html'), html);

console.log(`www/ built (Chart.js ${chartVer}, ${FONTS.reduce((n, f) => n + f.weights.length, 0)} font weights)`);
