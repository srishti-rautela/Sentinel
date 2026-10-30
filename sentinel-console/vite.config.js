import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Standalone dev server for the Sentinel console. It talks to the SAME api-gateway
// as the shop (/system/*, /api/sentinel/*, /api/policy/*) but ships and runs
// completely independently of the shop frontend.
export default defineConfig({
  plugins: [react()],
  server: { port: 5174, proxy: { '/api': 'http://localhost:3000', '/system': 'http://localhost:3000' } },
});
