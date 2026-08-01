// scripts/generate-icons.mjs — Generates 16x16, 48x48, and 128x128 valid PNG icons for iChess Chrome extension

import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const extDir = path.join(rootDir, 'extension');

function createCrcTable() {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      if (c & 1) c = 0xedb88320 ^ (c >>> 1);
      else c = c >>> 1;
    }
    table[n] = c;
  }
  return table;
}

const crcTable = createCrcTable();

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = crcTable[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function writeChunk(type, data) {
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);

  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  
  const typeAndData = Buffer.concat([typeBuf, data]);
  const crcVal = crc32(typeAndData);
  crcBuf.writeUInt32BE(crcVal, 0);

  return Buffer.concat([lenBuf, typeAndData, crcBuf]);
}

function createPngBuffer(width, height, renderPixel) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8;  // bit depth
  ihdrData[9] = 6;  // RGBA
  ihdrData[10] = 0; // compression
  ihdrData[11] = 0; // filter
  ihdrData[12] = 0; // interlace
  const ihdrChunk = writeChunk('IHDR', ihdrData);

  // Scanlines
  const scanlineSize = 1 + width * 4;
  const rawData = Buffer.alloc(height * scanlineSize);

  for (let y = 0; y < height; y++) {
    const offset = y * scanlineSize;
    rawData[offset] = 0; // filter type 0 (None)
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = renderPixel(x, y, width, height);
      const pxOffset = offset + 1 + x * 4;
      rawData[pxOffset]     = r;
      rawData[pxOffset + 1] = g;
      rawData[pxOffset + 2] = b;
      rawData[pxOffset + 3] = a;
    }
  }

  const idatCompressed = zlib.deflateSync(rawData);
  const idatChunk = writeChunk('IDAT', idatCompressed);
  const iendChunk = writeChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

function generateChessIcon(size) {
  return createPngBuffer(size, size, (x, y, w, h) => {
    const nx = (x / w) * 2 - 1; // -1 to 1
    const ny = (y / h) * 2 - 1; // -1 to 1

    // Background: Dark rounded square #07090f
    const cornerDist = Math.max(Math.abs(nx), Math.abs(ny));
    if (cornerDist > 0.92) {
      return [0, 0, 0, 0]; // transparent rounded corner
    }

    // Border glow: #00adb5
    const isBorder = cornerDist > 0.82;
    if (isBorder) {
      return [0, 173, 181, 255]; // Cyan border
    }

    // Center symbol: "i" / Chess piece motif
    // Lower stem: x in [-0.15, 0.15], y in [0.05, 0.5]
    // Top dot: circle at (0, -0.35)
    const isDot = (nx * nx + (ny + 0.38) * (ny + 0.38)) < 0.04;
    const isStem = Math.abs(nx) < 0.16 && ny >= -0.05 && ny <= 0.48;
    const isSerifTop = Math.abs(nx) < 0.32 && ny >= -0.05 && ny <= 0.08;
    const isSerifBottom = Math.abs(nx) < 0.38 && ny >= 0.36 && ny <= 0.48;

    if (isDot) {
      return [0, 255, 245, 255]; // Bright cyan dot
    }

    if (isStem || isSerifTop || isSerifBottom) {
      return [255, 255, 255, 255]; // Pure white "i" stem
    }

    // Dark body background
    return [13, 17, 32, 255]; // #0d1120
  });
}

console.log('🎨 Generating PNG icons for Extension...');

const sizes = [16, 48, 128];
for (const size of sizes) {
  const pngBuf = generateChessIcon(size);
  const outPath = path.join(extDir, `icon${size}.png`);
  fs.writeFileSync(outPath, pngBuf);
  console.log(`✅ Created ${outPath} (${size}x${size})`);
}

console.log('🎉 Icons generated successfully!');
