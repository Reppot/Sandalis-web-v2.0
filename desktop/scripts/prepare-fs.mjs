import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { copyFile, mkdir, readFile, rename, rm } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const resources = path.join(root, 'resources');
const helperPath = path.join(resources, 'fs.exe');
const helperHash = 'dcb883528b2a56de47b2e6278040a5a1dade62bf37c6473bc59fdb4e69d552a4';
await mkdir(resources, { recursive: true });

let helperBytes;
try { helperBytes = await readFile(helperPath); } catch { helperBytes = null; }
if (helperBytes && createHash('sha256').update(helperBytes).digest('hex') !== helperHash) {
  throw new Error('Bundled fs.exe failed its pinned SHA-256 check');
}
if (!helperBytes) {
  const url = 'https://github.com/xurxogr/foxhole-stockpiles/releases/download/v1.4.0/fs.exe';
  const response = await fetch(url, { redirect: 'follow' });
  if (!response.ok || !response.body) throw new Error(`Unable to download fs.exe (${response.status})`);
  const tempPath = `${helperPath}.download`;
  try {
    await pipeline(Readable.fromWeb(response.body), createWriteStream(tempPath));
    helperBytes = await readFile(tempPath);
    if (createHash('sha256').update(helperBytes).digest('hex') !== helperHash) {
      throw new Error('Downloaded fs.exe failed its pinned SHA-256 check');
    }
    await rename(tempPath, helperPath);
  } catch (error) {
    await rm(tempPath, { force: true });
    throw error;
  }
}

await copyFile(path.join(root, 'licenses/foxhole-stockpiles-LICENSE.txt'), path.join(resources, 'foxhole-stockpiles-LICENSE.txt'));
console.log('Prepared verified Foxhole Stockpiles v1.4.0 fs.exe runtime');
