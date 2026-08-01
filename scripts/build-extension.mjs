// scripts/build-extension.mjs — Minifies, obfuscates, and packages extension for production distribution

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const srcDir = path.join(rootDir, 'extension');
const distParentDir = path.join(rootDir, 'dist-extension');
const distFolder = path.join(distParentDir, 'ichess-extension');
const publicZipPath = path.join(rootDir, 'public', 'ichess-extension.zip');

console.log('🚀 Building production obfuscated extension...');

// 1. Clean & recreate dist directory
if (fs.existsSync(distParentDir)) {
  fs.rmSync(distParentDir, { recursive: true, force: true });
}
fs.mkdirSync(distFolder, { recursive: true });

// 2. Minify & mangle JS files using Terser
const jsFiles = ['content.js', 'popup.js', 'chess.js'];

for (const file of jsFiles) {
  const srcPath = path.join(srcDir, file);
  const destPath = path.join(distFolder, file);

  if (fs.existsSync(srcPath)) {
    console.log(`🔒 Minifying & obfuscating ${file}...`);
    try {
      execSync(`npx terser "${srcPath}" -o "${destPath}" --compress --mangle --comments false`, {
        stdio: 'inherit',
      });
    } catch (err) {
      console.warn(`Fallback copying ${file} due to terser warning...`);
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

// 3. Copy other assets (manifest.json, overlay.css, popup.html, stockfish.js, icons)
const staticFiles = [
  'manifest.json',
  'overlay.css',
  'popup.html',
  'stockfish.js',
  'icon16.png',
  'icon48.png',
  'icon128.png',
];

for (const file of staticFiles) {
  const srcPath = path.join(srcDir, file);
  const destPath = path.join(distFolder, file);
  if (fs.existsSync(srcPath)) {
    console.log(`📋 Copying ${file}...`);
    fs.copyFileSync(srcPath, destPath);
  }
}

// 4. Zip the dist folder so it extracts into a clean 'ichess-extension' subfolder
if (fs.existsSync(publicZipPath)) {
  fs.unlinkSync(publicZipPath);
}

console.log('📦 Zipping into public/ichess-extension.zip...');
const powershellCmd = `powershell -Command "Compress-Archive -Path '${distFolder}' -DestinationPath '${publicZipPath}' -Force"`;
execSync(powershellCmd, { stdio: 'inherit' });

console.log('✅ Production extension build complete! Zip ready at public/ichess-extension.zip');
