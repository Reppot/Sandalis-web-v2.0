// Контракт уже живёт в проде: healthCheckPath: /api/health.
// В монорепе просто переносим как есть.
export function GET() {
  return Response.json({ ok: true });
}
