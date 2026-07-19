import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

function contentSecurityPolicy(apiBaseUrl?: string):Plugin {
  let apiOrigin = '';
  if (apiBaseUrl) {
    const url = new URL(apiBaseUrl);
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('VITE_API_BASE_URL must use HTTP or HTTPS');
    apiOrigin = ` ${url.origin}`;
  }
  const policy = `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob:; connect-src 'self'${apiOrigin}; object-src 'none'; base-uri 'self'; form-action 'self'`;
  return { name:'asterivum-csp', transformIndexHtml:{ order:'pre', handler:html => html.replace('<meta name="theme-color"', `<meta http-equiv="Content-Security-Policy" content="${policy}" />\n    <meta name="theme-color"`) } };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  return {
    plugins: [react(), contentSecurityPolicy(env.VITE_API_BASE_URL)],
    server: { port: 5173, proxy: { '/api': 'http://localhost:3001' } },
    build: { outDir: 'build/public', emptyOutDir: true },
  };
});
