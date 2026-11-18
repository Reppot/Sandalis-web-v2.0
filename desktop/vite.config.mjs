import { defineConfig } from 'vite';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const fromFrontend = createRequire(new URL('../frontend/package.json', import.meta.url));
const modules = fileURLToPath(new URL('../frontend/node_modules/',import.meta.url));
export default defineConfig({
  root: fileURLToPath(new URL('./renderer',import.meta.url)), base:'/', publicDir:false,
  resolve: { alias: [
    {find:'@',replacement:fileURLToPath(new URL('../frontend/src',import.meta.url))},
    ...['react','react-dom','clsx','exceljs','tailwind-merge','@fontsource-variable','@fontsource'].map(name=>({find:name,replacement:`${modules}${name}`})),
  ], dedupe:['react','react-dom'] },
  define: {'process.env.NEXT_PUBLIC_API_URL':'""','process.env.NEXT_PUBLIC_CDN_URL':'""','process.env.NEXT_PUBLIC_ENABLE_DEV_LOGIN':'"false"'},
  oxc: {jsx:{runtime:'automatic'}},
  css:{postcss:{plugins:[fromFrontend('@tailwindcss/postcss')({base:fileURLToPath(new URL('../frontend',import.meta.url))})]}},
  build:{outDir:'../dist',emptyOutDir:true,sourcemap:false,target:'es2022'},
});
