import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// On GitHub Pages the app lives at https://yuto-valiark.github.io/padlab/
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/padlab/' : '/',
  plugins: [react()],
  server: { port: 5173 },
}));
