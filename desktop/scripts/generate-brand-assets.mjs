import { createRequire } from 'node:module';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const require = createRequire(path.join(root, 'frontend', 'package.json'));
const sharp = require('sharp');
const source = path.join(root, 'frontend', 'public', 'chronomancer-mascot.png');
const backup = path.join(root, 'desktop', 'assets', 'mascot-backups', 'chronomancer-mascot-original.png');
const iconSourcePath = path.join(root, 'desktop', 'assets', 'brand', 'chronomancer-approved-icon.png');
const mediumSourcePath = path.join(root, 'desktop', 'assets', 'brand', 'chronomancer-approved-medium.png');
const iconPath = path.join(root, 'frontend', 'public', 'chronomancer-icon.png');
const mediumPath = path.join(root, 'frontend', 'public', 'chronomancer-mascot-medium.png');

await mkdir(path.dirname(backup), { recursive: true });
try {
  await readFile(backup);
} catch {
  await copyFile(source, backup);
}

const mascotSource = sharp(source);
const mascotMetadata = await mascotSource.metadata();
const iconEdge = Math.min(mascotMetadata.width ?? 390, mascotMetadata.height ?? 390, 390);
const maskCrop = await mascotSource.extract({ left: 340, top: 20, width: iconEdge, height: iconEdge })
  .resize(218, 218, { fit: 'contain' })
  .png()
  .toBuffer();
const iconTile = Buffer.from('<svg width="256" height="256" viewBox="0 0 256 256" xmlns="http://www.w3.org/2000/svg"><rect x="3" y="3" width="250" height="250" rx="48" fill="#100b0d"/><rect x="3.5" y="3.5" width="249" height="249" rx="47.5" fill="none" stroke="#f43f52" stroke-width="5"/></svg>');
const icon = await sharp(iconTile).composite([{ input: maskCrop, left: 19, top: 19 }]).png().toBuffer();
await writeFile(iconPath, icon);
const mediumSource = sharp(mediumSourcePath);
const mediumMetadata = await mediumSource.metadata();
const mediumCrop = Math.min(415, mediumMetadata.width ?? 415, mediumMetadata.height ?? 415);
await mediumSource.extract({ left: 42, top: 22, width: mediumCrop, height: mediumCrop })
  .resize(640, 640, { fit: 'contain' })
  .png()
  .toFile(mediumPath);
await mkdir(path.join(root, 'desktop', 'resources'), { recursive: true });
const iconSizes = [16, 24, 32, 48, 64, 128, 256];
const iconFrames = await Promise.all(iconSizes.map((size) => sharp(icon).resize(size, size, { fit: 'contain' }).png().toBuffer()));
const iconHeader = Buffer.alloc(6);
iconHeader.writeUInt16LE(0, 0);
iconHeader.writeUInt16LE(1, 2);
iconHeader.writeUInt16LE(iconFrames.length, 4);
let offset = 6 + iconFrames.length * 16;
const iconEntries = iconFrames.map((frame, index) => {
  const size = iconSizes[index];
  const entry = Buffer.alloc(16);
  entry.writeUInt8(size === 256 ? 0 : size, 0);
  entry.writeUInt8(size === 256 ? 0 : size, 1);
  entry.writeUInt8(0, 2);
  entry.writeUInt8(0, 3);
  entry.writeUInt16LE(1, 4);
  entry.writeUInt16LE(32, 6);
  entry.writeUInt32LE(frame.length, 8);
  entry.writeUInt32LE(offset, 12);
  offset += frame.length;
  return entry;
});
await writeFile(path.join(root, 'desktop', 'resources', 'chronomancer.ico'), Buffer.concat([iconHeader, ...iconEntries, ...iconFrames]));

console.log('Saved original mascot backup and rendered approved medium and small Chronum marks.');
