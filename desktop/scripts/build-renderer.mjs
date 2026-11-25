import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cp, copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(fileURLToPath(new URL('../', import.meta.url)));
const repo = path.resolve(root, '..');
const frontend = path.join(repo, 'frontend');
const nextCli = path.join(frontend, 'node_modules', 'next', 'dist', 'bin', 'next');
const result = spawnSync(process.execPath, [nextCli, 'build'], {
  cwd: root,
  stdio: 'inherit',
  env: {
    ...process.env,
    NEXT_TELEMETRY_DISABLED: '1',
    NODE_PATH: [path.join(frontend, 'node_modules'), process.env.NODE_PATH].filter(Boolean).join(path.delimiter),
  },
});
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);

const exported = path.join(root, '.next-desktop');
for (const page of ['index.html', path.join('desktop-section', 'index.html')]) {
  const pagePath = path.join(exported, page);
  let html = await readFile(pagePath, 'utf8');
  const hashes = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
    .filter((match) => !/\bsrc\s*=/.test(match[1]))
    .map((match) => `'sha256-${createHash('sha256').update(match[2]).digest('base64')}'`);
  const scriptHashes = [...new Set(hashes)].join(' ');
  const policy = `default-src 'self'; script-src 'self' ${scriptHashes}; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self' data:; media-src 'self' blob: https:; connect-src 'self' https:; worker-src 'self' blob:; object-src 'none'; base-uri 'none'; form-action 'none'`;
  html = html.replace('<head>', `<head><meta http-equiv="Content-Security-Policy" content="${policy}">`);
  await writeFile(pagePath, html, 'utf8');
}
const dist = path.join(root, 'dist');
await rm(dist, { recursive: true, force: true });
await cp(exported, dist, { recursive: true });
await copyFile(path.join(exported, 'desktop-section', 'index.html'), path.join(dist, 'section.html'));
await mkdir(dist, { recursive: true });
console.log('Prepared static Next.js renderer: Sindaris shell and section page');
