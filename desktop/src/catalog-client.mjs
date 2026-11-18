import { Worker } from 'node:worker_threads';
export function createCatalog(snapshot) {
  const worker = new Worker(new URL('./catalog-worker.mjs', import.meta.url), { workerData: { snapshot } });
  let nextId = 0; let failure; const pending = new Map();
  const fail = (error) => { failure = error; for (const p of pending.values()) { clearTimeout(p.timer); p.reject(error); } pending.clear(); };
  worker.on('error', fail); worker.on('exit', () => fail(new Error('Локальный справочник остановлен')));
  worker.on('message', ({ id, value, error, status }) => { const p = pending.get(id); if (!p) return; pending.delete(id); clearTimeout(p.timer); if (error) p.reject(Object.assign(new Error(error), { status })); else p.resolve(value); });
  return {
    query(url) { if (failure) return Promise.reject(failure); return new Promise((resolve,reject) => { const id = ++nextId; const timer = setTimeout(() => { pending.delete(id); reject(new Error('Локальный справочник не отвечает')); }, 10000); pending.set(id,{resolve,reject,timer}); worker.postMessage({id,url}); }); },
    close() { return worker.terminate(); },
  };
}
