import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

function contentSecurityPolicy(apiBaseUrl?: string, mapStyleUrl?:string, imageBaseUrl?:string):Plugin {
  let apiOrigin = '';
  if (apiBaseUrl) {
    const url = new URL(apiBaseUrl);
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('VITE_API_BASE_URL must use HTTP or HTTPS');
    apiOrigin = ` ${url.origin}`;
  }
  let mapOrigin='';
  if(mapStyleUrl){
    const url=new URL(mapStyleUrl);
    if(!['http:','https:'].includes(url.protocol))throw new Error('VITE_MAP_STYLE_URL must use HTTP or HTTPS');
    mapOrigin=` ${url.origin}`;
  }
  let imageOrigin='';
  if(imageBaseUrl){const url=new URL(imageBaseUrl);if(!['http:','https:'].includes(url.protocol))throw new Error('VITE_IMAGE_PUBLIC_BASE_URL must use HTTP or HTTPS');imageOrigin=` ${url.origin}`;}
  const policy = `default-src 'self'; script-src 'self'; worker-src 'self' blob:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob:${mapOrigin}${imageOrigin} https://tile.openstreetmap.org https://*.tile.openstreetmap.org; connect-src 'self'${apiOrigin}${mapOrigin} https://tile.openstreetmap.org https://*.tile.openstreetmap.org; object-src 'none'; base-uri 'self'; form-action 'self'`;
  return { name:'asterivum-csp', transformIndexHtml:{ order:'pre', handler:html => html.replace('<meta name="theme-color"', `<meta http-equiv="Content-Security-Policy" content="${policy}" />\n    <meta name="theme-color"`) } };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const apiBaseUrl = env.VITE_API_BASE_URL || (mode === 'production' ? 'https://api.asterivum.com/api' : undefined);
  return {
    plugins: [react(), contentSecurityPolicy(apiBaseUrl,env.VITE_MAP_STYLE_URL,env.VITE_IMAGE_PUBLIC_BASE_URL)],
    server: { port: 5173, proxy: { '/api': 'http://localhost:3001' } },
    build: { outDir: 'build/public', emptyOutDir: true },
  };
});
