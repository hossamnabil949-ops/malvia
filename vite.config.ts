import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {defineConfig} from 'vite';

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    define: {
      // رقم إصدار البناء: يظهر في شاشة الكاشير لمعرفة هل النسخة المنشورة هي الأحدث
      __APP_BUILD__: JSON.stringify(new Date().toISOString().slice(0, 16).replace('T', ' ')),
    },
    resolve: {
      alias: {
        '@': projectRoot,
      },
    },
    build: {
      rolldownOptions: {
        output: {
          codeSplitting: {
            minSize: 20_000,
            groups: [{
              debugName: 'vendor-packages',
              name: (id: string) => {
                const normalized = id.replaceAll('\\', '/');
                const marker = '/node_modules/';
                const at = normalized.lastIndexOf(marker);
                if (at < 0) return null;
                const packagePath = normalized.slice(at + marker.length);
                const packageName = packagePath.startsWith('@')
                  ? packagePath.split('/').slice(0, 2).join('/')
                  : packagePath.split('/')[0];
                return `vendor-${packageName.replace(/^@/, '').replaceAll('/', '-')}`;
              },
              test: /node_modules/,
            }],
          },
        },
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
