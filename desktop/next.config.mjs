import path from 'node:path';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const { version } = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));

/** Electron uses two static Next pages on app://sindaris; all API traffic is handled by Electron. */
const config = {
  output: 'export',
  distDir: '.next-desktop',
  trailingSlash: true,
  outputFileTracingRoot: path.resolve(root, '..'),
  images: { unoptimized: true },
  env: {
    NEXT_PUBLIC_API_URL: '',
    NEXT_PUBLIC_CDN_URL: '',
    NEXT_PUBLIC_ENABLE_DEV_LOGIN: 'false',
    NEXT_PUBLIC_CHRONUM_VERSION: version,
  },
};

export default config;
