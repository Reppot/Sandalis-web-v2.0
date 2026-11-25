import { parentPort, workerData } from 'node:worker_threads';
import { readFile } from 'node:fs/promises';
import { localApi } from './local-api.mjs';
const data = JSON.parse(await readFile(workerData.snapshot, 'utf8'));
parentPort.on('message', ({ id, url }) => {
  try { parentPort.postMessage({ id, value: localApi(url, data) }); }
  catch (error) { parentPort.postMessage({ id, error: error.message, status: error instanceof URIError ? 400 : error.status }); }
});
