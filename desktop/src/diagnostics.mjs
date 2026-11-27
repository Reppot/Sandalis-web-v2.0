import { appendFile, mkdir, readFile, rename, rm, stat } from 'node:fs/promises';
import { dirname } from 'node:path';
import { deflateRawSync } from 'node:zlib';

const MAX_LOG_BYTES = 1024 * 1024;

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function safeText(value) {
  let text = String(value).slice(0, 1200)
    .replace(/\bBearer\s+[^\s"']+/gi, 'Bearer [redacted]')
    .replace(/\beyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\b/g, '[redacted-token]')
    .replace(/([?&](?:access_token|refresh_token|id_token|token|code|state|client_secret|password|session|ticket)=)[^&#\s]*/gi, '$1[redacted]')
    .replace(/(set-cookie\s*:\s*)[^\r\n]+/gi, '$1[redacted]')
    .replace(/https?:\/\/[^\s"'<>]+/gi, (raw) => {
      try {
        const url = new URL(raw.replace(/[),.;]+$/, ''));
        return `${url.origin}${url.pathname}`;
      } catch { return '[redacted-url]'; }
    });
  const home = process.env.USERPROFILE;
  if (home) text = text.replace(new RegExp(escapeRegExp(home), 'gi'), '%USERPROFILE%');
  return text;
}

function safeValue(value, depth = 0) {
  if (depth > 3 || value == null) return value ?? null;
  if (typeof value === 'boolean' || typeof value === 'number') return value;
  if (typeof value === 'string') return safeText(value);
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => safeValue(item, depth + 1));
  if (typeof value === 'object') {
    const result = {};
    for (const [key, item] of Object.entries(value).slice(0, 40)) {
      const isSafePresenceFlag = typeof item === 'boolean' && /(?:attached|present|configured|available|enabled|online)$/i.test(key);
      if (!isSafePresenceFlag && /token|secret|authorization|cookie|password|credential|savefile|filename|filepath|stockpile|inventory|item|clan|guild|discord|username|avatar|body|contents/i.test(key)) {
        result[key] = '[redacted]';
      } else result[key] = safeValue(item, depth + 1);
    }
    return result;
  }
  return String(value).slice(0, 200);
}

export function createDiagnosticsLogger(filePath) {
  let queue = Promise.resolve();
  const write = (level, event, details = {}) => {
    const line = `${JSON.stringify({ at: new Date().toISOString(), level, event: String(event).slice(0, 80), details: safeValue(details) })}\n`;
    queue = queue.then(async () => {
      await mkdir(dirname(filePath), { recursive: true });
      try {
        const info = await stat(filePath);
        if (info.size + Buffer.byteLength(line) > MAX_LOG_BYTES) {
          await rm(`${filePath}.1`, { force: true });
          await rename(filePath, `${filePath}.1`).catch(() => {});
        }
      } catch { /* First log entry creates the file. */ }
      await appendFile(filePath, line, 'utf8');
    }).catch(() => {});
    return queue;
  };
  return {
    info: (event, details) => write('info', event, details),
    warn: (event, details) => write('warn', event, details),
    error: (event, details) => write('error', event, details),
    flush: () => queue,
  };
}

function crc32(data) {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function zipDate(date) {
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  const day = ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { time, day };
}

export function createZip(entries) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  const { time, day } = zipDate(new Date());
  for (const [fileName, source] of entries) {
    const name = Buffer.from(fileName, 'utf8');
    const input = Buffer.isBuffer(source) ? source : Buffer.from(source, 'utf8');
    const compressed = deflateRawSync(input, { level: 6 });
    const crc = crc32(input);
    const local = Buffer.alloc(30 + name.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(8, 8);
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(day, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(input.length, 22);
    local.writeUInt16LE(name.length, 26);
    name.copy(local, 30);
    localParts.push(local, compressed);

    const central = Buffer.alloc(46 + name.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(time, 12);
    central.writeUInt16LE(day, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(input.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    name.copy(central, 46);
    centralParts.push(central);
    offset += local.length + compressed.length;
  }
  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...localParts, centralDirectory, end]);
}

export async function readDiagnosticLogs(filePath) {
  const current = await readFile(filePath).catch(() => Buffer.alloc(0));
  const previous = await readFile(`${filePath}.1`).catch(() => Buffer.alloc(0));
  return Buffer.concat([previous, current]).toString('utf8');
}

export function sanitizeDiagnostic(value) {
  return safeValue(value);
}

export function diagnosticErrorDetails(error) {
  const failure = error && typeof error === 'object' ? error : { message: String(error ?? 'Unknown error') };
  const cause = failure.cause && typeof failure.cause === 'object' ? failure.cause : null;
  const details = {
    errorName: typeof failure.name === 'string' ? failure.name : 'Error',
    errorCode: failure.code ?? failure.errno ?? null,
    errorMessage: typeof failure.message === 'string' ? failure.message : String(failure),
    causeName: typeof cause?.name === 'string' ? cause.name : null,
    causeCode: cause?.code ?? cause?.errno ?? null,
    causeMessage: typeof cause?.message === 'string' ? cause.message : null,
  };
  if (typeof failure.stack === 'string') details.stack = failure.stack.split('\n').slice(0, 8).join('\n');
  return safeValue(details);
}
