export const guestProfile = Object.freeze({ subject_type: 'guest', user_id: 'desktop-guest', clan_id: '', role: 'guest', scopes: ['catalog:read'], display_name: 'Гость', avatar_url: null, locale: null, site_admin: false, developer: false });
const norm = (v) => String(v ?? '').normalize('NFKC').toLocaleLowerCase('ru');
const dto = (r) => ({ id: r.code, english_name: '', category: '', faction: 'neutral', origin: null, icon_url: null, crate_size: 1, production_time: 0, aliases: [], needs_review: false, is_active: true, ...r });
const integer = (v, fallback, max) => v === null || !Number.isFinite(Number(v)) ? fallback : Math.min(max, Math.max(0, Math.trunc(Number(v))));
export function localApi(value, data) {
  const url = new URL(value, 'app://sindaris'); const p = url.searchParams;
  if (url.pathname === '/api/v1/items') {
    const query = norm(p.get('query')).trim();
    const rows = data.catalog.map(dto).filter((r) => (!query || norm([r.code, r.name, r.english_name, ...r.aliases].join(' ')).includes(query)) && (!p.get('category') || p.get('category') === 'all' || r.category === p.get('category')) && (!p.get('faction') || p.get('faction') === 'all' || r.faction === p.get('faction')) && (p.get('active_only') !== 'true' || r.is_active) && (!p.has('needs_review') || r.needs_review === (p.get('needs_review') === 'true')));
    rows.sort((a,b) => Number(norm(b.code) === query) - Number(norm(a.code) === query) || a.code.localeCompare(b.code, 'en'));
    const limit = Math.max(1, integer(p.get('limit'), 50, 500)); const offset = integer(p.get('offset'), 0, Number.MAX_SAFE_INTEGER);
    return { items: rows.slice(offset, offset + limit), total: rows.length, limit, offset };
  }
  if (url.pathname.startsWith('/api/v1/items/')) {
    const item = data.catalog.find(r => r.code === decodeURIComponent(url.pathname.slice(14)));
    if (!item) throw Object.assign(new Error('Item not found in the local catalog'), { status: 404 });
    return dto(item);
  }
  if (url.pathname === '/api/v1/content') {
    const kinds = p.getAll('kind');
    return data.content.filter(r => r.is_active && (kinds.length ? kinds.includes(r.kind) : r.kind !== 'guide_chapter'))
      .sort((a,b) => a.kind.localeCompare(b.kind, 'en') || a.sort - b.sort || a.key.localeCompare(b.key, 'en'));
  }
  if (url.pathname === '/api/v1/recipes') {
    const query = norm(p.get('query')).trim();
    return data.recipes.filter(r =>
      (!p.get('kind') || r.kind === p.get('kind')) &&
      (!p.get('facility') || r.facilities?.includes(p.get('facility'))) &&
      (!p.get('faction') || p.get('faction') === 'all' || r.factions?.includes(p.get('faction'))) &&
      (!p.get('category') || p.get('category') === 'all' || r.category === p.get('category')) &&
      (!query || [r.name, r.name_en, r.item_class].some(v => norm(v).includes(query)))
    ).sort((a,b) => a.kind.localeCompare(b.kind, 'en') || (a.sort ?? 0) - (b.sort ?? 0));
  }
  return undefined;
}
