import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { safeFile, isAppUrl, isAuthNavigation, externalUrl, sessionRequestPolicy, rendererAuthResponse } from '../src/policy.mjs';
import { localApi, guestProfile } from '../src/local-api.mjs';

const catalog = [
  { code: 'rifle', name: 'Винтовка', english_name: 'Rifle', category: 'arms', faction: 'warden', is_active: true },
  { code: 'hidden', name: 'Hidden', is_active: false },
];
const data = { catalog, recipes: [{ id: 'r1', kind: 'factory' }, { id: 'r2', kind: 'facility' }], content: [] };
test('asset resolver confines decoded paths to its root', () => {
  assert.equal(safeFile('/bundle', '/assets/ui.svg'), path.resolve('/bundle/assets/ui.svg'));
  for (const path of ['/../secret', '/%2e%2e/secret', '/%5c..%5csecret', '/C:/secret', '/a%00b', '/%ZZ']) {
    assert.throws(() => safeFile('/bundle', path));
  }
});
test('only exact app origin and fixed auth hosts are trusted', () => {
  assert.equal(isAppUrl('app://sindaris/'), true);
  for (const u of ['app://evil/', 'app://sindaris.evil/', 'https://sindaris/']) assert.equal(isAppUrl(u), false);
  assert.equal(isAuthNavigation('https://discord.com/oauth2/authorize'), true);
  assert.equal(isAuthNavigation('https://discord.com.evil/oauth2/authorize'), false);
  assert.equal(externalUrl('javascript:alert(1)'), null);
  assert.equal(externalUrl('file:///etc/passwd'), null);
});
test('local catalog filters and paginates without contacting a server', () => {
  const page = localApi('/api/v1/items?query=винт&active_only=true&limit=1', data);
  assert.equal(page.total, 1);
  assert.equal(page.items[0].code, 'rifle');
  assert.equal(localApi('/api/v1/items?active_only=true', data).total, 1);
  assert.equal(localApi('/api/v1/items?query=rifle&offset=1', data).items.length, 0);
  assert.equal(localApi('/api/v1/items?needs_review=true', data).total, 0);
});
test('recipes respect kind and catalog DTO supplies required defaults', () => {
  assert.deepEqual(localApi('/api/v1/recipes?kind=facility', data).map(x => x.id), ['r2']);
  const item = localApi('/api/v1/items/rifle', data);
  assert.equal(item.production_time, 0);
  assert.equal(item.crate_size, 1);
  assert.deepEqual(item.aliases, []);
});
test('private routes are never served from public snapshots', () => {
  assert.equal(localApi('/api/v1/stockpiles', data), undefined);
  assert.equal(localApi('/api/v1/auth/me', data), undefined);
  assert.equal(guestProfile.subject_type, 'guest');
  assert.deepEqual(guestProfile.scopes, ['catalog:read']);
  assert.equal(guestProfile.site_admin, false);
});

test('all categories and exact code ordering match server catalog behavior', () => {
  const rows = { ...data, catalog: [
    { code: 'a-rifle', name: 'A rifle', category: 'arms' },
    { code: 'rifle', name: 'Z rifle', category: 'arms' },
  ] };
  const page = localApi('/api/v1/items?category=all&query=rifle', rows);
  assert.equal(page.total, 2);
  assert.deepEqual(page.items.map(r => r.code), ['rifle', 'a-rifle']);
});

test('recipe query includes item class, trims whitespace and respects server ordering', () => {
  const rows = { ...data, recipes: [
    { id: 'late', kind: 'factory', sort: 20, category: 'arms', item_class: 'RifleW' },
    { id: 'early', kind: 'factory', sort: 1, category: 'arms', item_class: 'RifleW' },
  ] };
  assert.deepEqual(localApi('/api/v1/recipes?category=all&query=%20RifleW%20', rows).map(r => r.id), ['early', 'late']);
});

test('missing local item returns 404 without falling through to remote API', () => {
  assert.throws(() => localApi('/api/v1/items/missing', data), { status: 404 });
});

test('fresh offline launch skips remote session lookup and returning login has a short timeout', () => {
  assert.deepEqual(sessionRequestPolicy('/api/v1/auth/me', []), { localUnauthorized: true, timeout: 8000 });
  assert.equal(sessionRequestPolicy('/api/v1/auth/me', [{ name: 'sandalis_session' }]).localUnauthorized, false);
  assert.equal(sessionRequestPolicy('/api/v1/auth/me', [{ name: 'csrf' }]).localUnauthorized, true);
  assert.equal(sessionRequestPolicy('/api/v1/orders', []).timeout, 120000);
});

test('session establishment does not expose bearer tokens to the renderer', () => {
  const payload = { access_token: 'secret', refresh_token: 'secret2', token_type: 'bearer', me: { role: 'owner' } };
  for (const route of ['/api/v1/auth/discord/setup', '/api/v1/auth/developer/enter']) {
    assert.deepEqual(rendererAuthResponse(route, payload), { me: { role: 'owner' } });
  }
  assert.deepEqual(rendererAuthResponse('/api/v1/tokens', payload), payload);
  assert.equal(payload.access_token, 'secret');
});

test('guide content is isolated from the default bootstrap content', () => {
  const rows = { ...data, content: [
    { kind: 'media', key: 'home', sort: 0, is_active: true },
    { kind: 'guide_chapter', key: 'chapter', sort: 1, is_active: true },
    { kind: 'media', key: 'hidden', sort: 2, is_active: false },
  ] };
  assert.deepEqual(localApi('/api/v1/content', rows).map(r => r.key), ['home']);
  assert.deepEqual(localApi('/api/v1/content?kind=guide_chapter', rows).map(r => r.key), ['chapter']);
  assert.equal(localApi('/api/v1/content?kind=guide_chapter&kind=media', rows).length, 2);
});
