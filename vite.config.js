import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        landing: resolve(__dirname, 'landing.html'),
      },
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          const pkgPath = id.split('node_modules/')[1];
          const segments = pkgPath.split('/');
          const packageName = segments[0].startsWith('@')
            ? `${segments[0]}-${segments[1]}`
            : segments[0];
          return `vendor-${packageName.replace('@', '').replace(/[^\w.-]+/g, '-')}`;
        },
      },
    },
  },
});
