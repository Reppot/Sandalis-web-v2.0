import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createCatalog } from '../src/catalog-client.mjs';

test('prepared snapshot matches source catalog and serves in a worker offline', async () => {
  const snapshot = fileURLToPath(new URL('../resources/snapshot.json', import.meta.url));
  const source = JSON.parse(await readFile(new URL('../../backend/app/seed/data/catalog.json', import.meta.url), 'utf8'));
  const client = createCatalog(snapshot);
  try {
    const all = await client.query('/api/v1/items?limit=500');
    assert.equal(all.total, source.length);
    assert.equal((await client.query('/api/v1/recipes?kind=facility')).every(r => r.kind === 'facility'), true);
    assert.equal(await client.query('/api/v1/stockpiles'), undefined);
    await assert.rejects(client.query('/api/v1/items/not-a-real-item'), { status: 404 });
    await assert.rejects(client.query('/api/v1/items/%ZZ'), { status: 400 });
    assert.equal((await client.query('/api/v1/items?category=all')).total, source.length);
    const content = await client.query('/api/v1/content');
    assert.ok(content.find(r => r.kind === 'external_tool' && r.key === 'foxwar-net').payload.i18n.en.tag);
    assert.equal(content.some(r => r.kind === 'guide_chapter'), false);
    const guide = await client.query('/api/v1/content?kind=guide_chapter');
    assert.ok(guide.length > 0);
    assert.ok(guide.every(r => r.kind === 'guide_chapter'));
  } finally { await client.close(); }
});
