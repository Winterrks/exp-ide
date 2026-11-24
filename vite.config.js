import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { api } from './server/api.js';

export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, process.cwd(), ''), ...process.env };
  const start = server => {
    server.middlewares.use(api({ root: env.KEYLINE_WORKSPACE, dataDir: env.KEYLINE_DATA_DIR, apiKey: env.KEYLINE_MODEL_API_KEY || env.OPENAI_API_KEY,
      model: env.OPENAI_MODEL || 'gpt-4.1-mini', baseUrl: env.OPENAI_BASE_URL || 'https://api.openai.com/v1' }));
  };
  return {
    plugins: [react(), { name: 'keyline-workspace', configureServer: start, configurePreviewServer: start }],
    server: { host: '127.0.0.1', port: 5173, fs: { deny: ['.env', '.env.*', '*.{crt,pem}', '**/.git/**', '**/.keyline/**'] }, watch: { ignored: ['**/.keyline/**'] } },
    preview: { host: '127.0.0.1', port: 4173 },
  };
});
