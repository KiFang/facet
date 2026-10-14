import { defineConfig } from 'vitest/config';
import type { Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { build } from 'esbuild';
import { fileURLToPath, URL } from 'node:url';
import path from 'node:path';

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

export default defineConfig({
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
});
