import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));

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
  },
};

export default config;
