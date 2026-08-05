// scripts/build-extension.mjs — v2.0: Bundle → Minify → Obfuscate → Zip
// Pipeline: esbuild (minify) → javascript-obfuscator (protect) → static copy → zip

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { build } from 'esbuild';
import JavaScriptObfuscator from 'javascript-obfuscator';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const rootDir    = path.resolve(__dirname, '..');

const srcDir     = path.join(rootDir, 'extension');
const distParent = path.join(rootDir, 'dist-extension');
const distFolder = path.join(distParent, 'ichess-extension');
const zipDest    = path.join(rootDir, 'public', 'ichess-extension.zip');

// ─── Obfuscator config (Medium — balanced protection vs perf) ────────────────
const OBFUSCATOR_CONFIG = {
  compact:                       true,
  controlFlowFlattening:         true,
  controlFlowFlatteningThreshold: 0.3,   // 0.3 = moderate, keeps perf acceptable
  numbersToExpressions:          true,
  simplify:                      true,
  stringArray:                   true,
  stringArrayCallsTransform:     true,
  stringArrayEncoding:           ['base64'],
  stringArrayShuffle:            true,
  stringArrayThreshold:          0.7,
  splitStrings:                  true,
  splitStringsChunkLength:       12,
  transformObjectKeys:           false,  // keep chrome.* object keys intact
  renameGlobals:                 false,  // NEVER — breaks chrome.* APIs
  selfDefending:                 false,  // content scripts run on a 300ms loop, skip
  sourceMap:                     false,
  // Protect these identifiers from being renamed
  reservedNames: [
    '^chrome$', '^window$', '^document$', '^navigator$',
    '^Chess$', '^Worker$', '^URL$', '^fetch$',
    '^customElements$', '^postMessage$',
  ],
  // Protect our message type strings from being split weirdly
  reservedStrings: [
    'ICHESS_SF_CMD', 'ICHESS_SF_LINE', 'ICHESS_INIT_ENGINE',
    'ICHESS_SETTINGS_UPDATE', 'ICHESS_RESET_GAME', 'ICHESS_MAIN_RESET_GAME',
    'ichess-engine', 'ichess-overlay-container', 'ichess-hud-status',
    'wc-chess-board', 'chess-board',
  ],
};

// ─── Files to process through full pipeline ──────────────────────────────────
const JS_PROCESS = [
  'content.js',
  'background.js',   // ← was missing from old build script, fixed!
  'popup.js',
  'main-world.js',
];

// ─── Files to copy as-is (3rd party libs / binary-adjacent) ──────────────────
const JS_COPY = [
  'chess.js',       // UMD global lib — obfuscating a lib = pointless
  'stockfish.js',   // 10.5 MB WASM-adjacent — DO NOT touch
];

// ─── Static assets ────────────────────────────────────────────────────────────
const STATIC_COPY = [
  'manifest.json',
  'overlay.css',
  'popup.html',
  'icon16.png',
  'icon48.png',
  'icon128.png',
];

// ─────────────────────────────────────────────────────────────────────────────

console.log('\n🚀 iChess Extension Build Pipeline v2.0\n');

// Step 0 — Clean dist
if (fs.existsSync(distParent)) {
  fs.rmSync(distParent, { recursive: true, force: true });
}
fs.mkdirSync(distFolder, { recursive: true });
console.log('🧹 Cleaned dist-extension/\n');

// ─── Step 1: Minify with esbuild ─────────────────────────────────────────────
console.log('📦 Step 1: Minifying with esbuild...');

for (const file of JS_PROCESS) {
  const srcPath  = path.join(srcDir, file);
  const destPath = path.join(distFolder, file);

  if (!fs.existsSync(srcPath)) {
    console.warn(`  ⚠️  Skipping ${file} — not found`);
    continue;
  }

  await build({
    entryPoints: [srcPath],
    outfile:     destPath,
    bundle:      false,    // no ES module imports between ext files
    minify:      true,
    platform:    'browser',
    target:      ['chrome110'],
    logLevel:    'silent',
  });

  const origSize = fs.statSync(srcPath).size;
  const newSize  = fs.statSync(destPath).size;
  const savings  = (((origSize - newSize) / origSize) * 100).toFixed(1);
  console.log(`  ✅ ${file.padEnd(16)} ${kb(origSize)} → ${kb(newSize)} (-${savings}%)`);
}

// ─── Step 2: Obfuscate ───────────────────────────────────────────────────────
console.log('\n🔒 Step 2: Obfuscating...');

for (const file of JS_PROCESS) {
  const filePath = path.join(distFolder, file);
  if (!fs.existsSync(filePath)) continue;

  const src        = fs.readFileSync(filePath, 'utf8');
  const obfuscated = JavaScriptObfuscator.obfuscate(src, OBFUSCATOR_CONFIG);
  fs.writeFileSync(filePath, obfuscated.getObfuscatedCode(), 'utf8');

  const newSize = fs.statSync(filePath).size;
  console.log(`  🔐 ${file.padEnd(16)} → obfuscated (${kb(newSize)})`);
}

// ─── Step 3: Copy JS libs as-is ──────────────────────────────────────────────
console.log('\n📋 Step 3: Copying JS libs...');

for (const file of JS_COPY) {
  const srcPath  = path.join(srcDir, file);
  const destPath = path.join(distFolder, file);
  if (!fs.existsSync(srcPath)) {
    console.warn(`  ⚠️  Skipping ${file} — not found`);
    continue;
  }
  fs.copyFileSync(srcPath, destPath);
  console.log(`  📄 ${file.padEnd(16)} ${kb(fs.statSync(srcPath).size)}`);
}

// ─── Step 4: Copy static assets ──────────────────────────────────────────────
console.log('\n🖼️  Step 4: Copying static assets...');

for (const file of STATIC_COPY) {
  const srcPath  = path.join(srcDir, file);
  const destPath = path.join(distFolder, file);
  if (!fs.existsSync(srcPath)) {
    console.warn(`  ⚠️  Skipping ${file} — not found`);
    continue;
  }
  fs.copyFileSync(srcPath, destPath);
  console.log(`  📄 ${file}`);
}

// ─── Step 5: Zip ─────────────────────────────────────────────────────────────
console.log('\n📦 Step 5: Zipping...');

if (fs.existsSync(zipDest)) fs.unlinkSync(zipDest);
fs.mkdirSync(path.dirname(zipDest), { recursive: true });

execSync(
  `powershell -Command "Compress-Archive -Path '${distFolder}' -DestinationPath '${zipDest}' -Force"`,
  { stdio: 'inherit' }
);

// ─── Summary ─────────────────────────────────────────────────────────────────
const zipSize = fs.existsSync(zipDest) ? fs.statSync(zipDest).size : 0;
console.log(`\n✅ Build complete!`);
console.log(`   📁 Unpacked : dist-extension/ichess-extension/`);
console.log(`   🗜️  Zip      : public/ichess-extension.zip (${kb(zipSize)})`);
console.log(`\n💡 Load unpacked: chrome://extensions → Load unpacked → dist-extension/ichess-extension/\n`);

// ─── Helper ──────────────────────────────────────────────────────────────────
function kb(bytes) {
  return bytes >= 1_000_000
    ? `${(bytes / 1_000_000).toFixed(1)} MB`
    : `${(bytes / 1024).toFixed(1)} KB`;
}
