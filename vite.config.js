import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  // 멀티 페이지 빌드: index.html (앱) + landing.html (마케팅 페이지)
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        landing: resolve(__dirname, 'landing.html'),
      },
    },
  },
});
