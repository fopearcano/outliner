// Make Outliner.app self-contained: copy the built site + the static server
// into the bundle's Resources so the app runs from anywhere (incl. /Applications),
// independent of the project folder. Run via `npm run mac`.
import { cpSync, mkdirSync, chmodSync, existsSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(ROOT, 'dist');
const res = join(ROOT, 'Outliner.app', 'Contents', 'Resources');
const launcher = join(ROOT, 'Outliner.app', 'Contents', 'MacOS', 'Outliner');

if (!existsSync(join(dist, 'index.html'))) {
  console.error('✗ dist/ not found — run `npm run build` first (or just `npm run mac`).');
  process.exit(1);
}

mkdirSync(res, { recursive: true });
rmSync(join(res, 'dist'), { recursive: true, force: true });
cpSync(dist, join(res, 'dist'), { recursive: true });
cpSync(join(ROOT, 'scripts', 'serve.mjs'), join(res, 'serve.mjs'));

try {
  chmodSync(launcher, 0o755);
} catch {
  /* best effort — git already tracks it as executable */
}

console.log('✓ Bundled the built app + server into Outliner.app/Contents/Resources');
console.log('  Outliner.app is now self-contained — double-click it, or move it to');
console.log('  /Applications and launch from there. (Node.js still needs to be installed.)');
