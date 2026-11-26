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
const iconPath = path.join(root, 'frontend', 'public', 'chronomancer-icon.png');
const mediumPath = path.join(root, 'frontend', 'public', 'chronomancer-mascot-medium.png');

await mkdir(path.dirname(backup), { recursive: true });
try {
  await readFile(backup);
} catch {
  await copyFile(source, backup);
}

const iconSource = await readFile(iconSourcePath);
const icon = await sharp(iconSource).resize(256, 256, { fit: 'fill' }).png().toBuffer();
await writeFile(iconPath, icon);
const mascot = sharp(source);
const mascotMetadata = await mascot.metadata();
const cropSize = Math.min(520, mascotMetadata.width ?? 520, mascotMetadata.height ?? 520);
const cropLeft = Math.max(0, Math.round(((mascotMetadata.width ?? cropSize) - cropSize) / 2));
await mascot.extract({ left: cropLeft, top: 0, width: cropSize, height: cropSize })
  .resize(640, 640, { fit: 'contain' })
  .png()
  .toFile(mediumPath);
await mkdir(path.join(root, 'desktop', 'resources'), { recursive: true });
const iconSizes = [16, 24, 32, 48, 64, 128, 256];
const iconFrames = await Promise.all(iconSizes.map((size) => sharp(iconSource).resize(size, size, { fit: 'fill' }).png().toBuffer()));
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

console.log('Saved original mascot backup and rendered approved Chronomancer icon sizes.');
