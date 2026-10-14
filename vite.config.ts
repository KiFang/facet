import { defineConfig } from 'vitest/config';
import type { Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { build } from 'esbuild';
import { fileURLToPath, URL } from 'node:url';
import path from 'node:path';
import { readFile } from 'node:fs/promises';

const SRC = fileURLToPath(new URL('./src', import.meta.url));
const VIRTUAL_ID = 'virtual:facet-portal';
const RESOLVED_ID = `\0${VIRTUAL_ID}`;

/**
 * Собирает клиент портала (src/portal/main.ts) в один минифицированный IIFE и отдаёт его строкой.
 * Редактор кладёт эту строку в экспорт как web/portal.js — превью и сервер используют один и тот же код.
 */
function facetPortalBundle(): Plugin {
  return {
    name: 'facet-portal-bundle',
    resolveId: (id) => (id === VIRTUAL_ID ? RESOLVED_ID : null),
    async load(id) {
      if (id !== RESOLVED_ID) return null;
      const result = await build({
        entryPoints: [path.join(SRC, 'portal/main.ts')],
        bundle: true,
        write: false,
        minify: true,
        format: 'iife',
        target: 'es2019',
        metafile: true,
        legalComments: 'none',
        plugins: [
          {
            name: 'alias',
            setup(b) {
              // `?raw` (как в Vite) — текст файла, а не модуль: иначе код хуков PocketBase выполнится в браузере.
              b.onResolve({ filter: /\?raw$/ }, async (args) => {
                const clean = args.path.replace(/\?raw$/, '');
                const r = clean.startsWith('@/')
                  ? await b.resolve(`./${clean.slice(2)}`, { resolveDir: SRC, kind: args.kind })
                  : await b.resolve(clean, { resolveDir: args.resolveDir, kind: args.kind });
                return { path: r.path, namespace: 'raw' };
              });
              b.onLoad({ filter: /.*/, namespace: 'raw' }, async (args) => ({ contents: await readFile(args.path, 'utf8'), loader: 'text' }));
              b.onResolve({ filter: /^@\// }, (args) =>
                b.resolve(`./${args.path.slice(2)}`, { resolveDir: SRC, kind: args.kind }),
              );
            },
          },
        ],
      });
      for (const input of Object.keys(result.metafile.inputs)) this.addWatchFile(path.resolve(input));
      const code = `/* Facet OS portal */\n${result.outputFiles[0].text}`;
      return `export default ${JSON.stringify(code)};`;
    },
  };
}

/**
 * `vite build --mode hub` — ядро Facet Hub (src/hub/core.ts) одним CommonJS-файлом для Node:
 * экспортёр, миграции и портал те же, что у редактора.
 */
const hubConfig = defineConfig({
  plugins: [facetPortalBundle()],
  resolve: { alias: { '@': SRC } },
  build: {
    ssr: path.join(SRC, 'hub/core.ts'),
    outDir: 'hub/dist',
    emptyOutDir: true,
    target: 'node20',
    minify: false,
    rollupOptions: { output: { format: 'cjs', entryFileNames: 'core.cjs' } },
  },
  ssr: { noExternal: true },
});

export default defineConfig(({ mode }) => (mode === 'hub' ? hubConfig : {
  plugins: [react(), facetPortalBundle()],
  resolve: {
    alias: { '@': SRC },
  },
  // Ленивые зависимости экспорта — заранее, иначе dev-сервер перезагрузит страницу при первом экспорте.
  optimizeDeps: {
    include: ['jszip', 'file-saver'],
  },
  build: {
    rollupOptions: {
      output: {
        // Библиотеки отдельно от кода редактора: меняются редко и кэшируются браузером.
        manualChunks: {
          vendor: [
            'react', 'react-dom', 'zustand', 'zundo', 'lucide-react',
            '@radix-ui/react-accordion', '@radix-ui/react-dialog', '@radix-ui/react-slider',
            '@radix-ui/react-switch', '@radix-ui/react-tabs', '@radix-ui/react-toggle-group',
          ],
        },
      },
    },
  },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
}));
