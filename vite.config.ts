import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { viteSingleFile } from 'vite-plugin-singlefile'

// Две сборки из одного кода:
//  • по умолчанию (npm run build / sync-web в Expo) — один HTML-файл со всем внутри, работает офлайн в WebView;
//  • --mode web (npm run build:web, Vercel) — обычный сайт: чанки, фото отдельными файлами, админка грузится по требованию.
export default defineConfig(({ mode }) => {
  const web = mode === 'web'
  return {
    plugins: [react(), tailwindcss(), ...(web ? [] : [viteSingleFile()])],
    resolve: web ? { alias: [{ find: /^\.\/photoData$/, replacement: './photoIndex' }] } : undefined,
    build: web
      ? {
          target: 'es2020', outDir: 'dist-web', emptyOutDir: true, assetsInlineLimit: 4096, cssCodeSplit: true, sourcemap: false,
          rollupOptions: { output: { manualChunks: { react: ['react', 'react-dom'], motion: ['framer-motion'] } } },
        }
      : { target: 'es2020', cssCodeSplit: false, assetsInlineLimit: 100000000 },
  }
})
