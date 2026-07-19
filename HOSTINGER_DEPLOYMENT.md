# Production deployment: Hostinger Premium + Railway

Hostinger Premium serves the compiled React site. Railway runs the Node.js API and MySQL. This keeps the current application architecture and does not require Hostinger's Web Apps feature.

## Domain layout

Use sibling HTTPS hosts so secure SameSite cookies and CSRF protection work correctly:

- Frontend: `https://www.example.com` (Hostinger)
- API: `https://api.example.com` (Railway custom domain)
- Cookie domain: `.example.com`

Do not use Railway's generated domain for the production frontend. A different registrable domain would require a less restrictive cross-site cookie configuration.

## 1. Deploy the API and database to Railway

1. Create a Railway project from this repository.
2. Add a MySQL service to the same project.
3. Configure the application service:
   - Build command: `npm ci && npm run build:server`
   - Start command: `npm start`
   - Health check: `/api/health`
4. Set `DATABASE_URL` using a Railway reference to the MySQL service's private connection URL. Use the dashboard variable picker so the password is not copied into source control.
5. Set these application variables:

```text
NODE_ENV=production
APP_ORIGIN=https://www.example.com
COOKIE_DOMAIN=.example.com
SESSION_SECRET=<at least 32 cryptographically random characters>
ALLOW_REGISTRATION=false
DATABASE_SSL=false
ADMIN_EMAIL=<your email, first deployment only>
ADMIN_INITIAL_PASSWORD=<unique 14+ character password, first deployment only>
```

Railway supplies `PORT`; do not hard-code it. Generate the session secret locally:

```sh
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

6. Add `api.example.com` as the Railway service's custom domain. Railway shows the DNS target.
7. In Hostinger DNS, create the requested CNAME for `api` and wait for Railway to issue TLS.
8. Deploy and confirm `https://api.example.com/api/health` returns `status: ok`.
9. Sign in with the initial administrator, remove `ADMIN_INITIAL_PASSWORD`, and redeploy/restart.

## 2. Build the static frontend

Build locally with the production API URL. On PowerShell:

```powershell
$env:VITE_API_BASE_URL='https://api.example.com/api'
npm.cmd ci
npm.cmd run build:web
```

`VITE_API_BASE_URL` is compiled into the browser bundle. Rebuild if the API hostname changes. The build also creates a restrictive Content Security Policy that permits connections only to that API origin.

## 3. Upload to Hostinger Premium

1. Back up the current `public_html` contents.
2. Upload the **contents** of `build/public` to `public_html`, including `.htaccess`.
3. Enable/verify SSL and force HTTPS in hPanel.
4. Open the frontend and test login, logout, profile writes, chart generation, PDF export, and printing.

The included `.htaccess` provides React route fallback, disables directory listing, and adds browser security headers. If hPanel hides dotfiles, enable **Show hidden files** before checking the upload.

## Release checks

Run before each deployment:

```powershell
npm.cmd test
npm.cmd run build
npm.cmd audit --omit=dev
```

- Back up MySQL daily and test restoration.
- Use separate staging and production databases.
- Keep registration closed until email verification and password recovery exist.
- Never log passwords, cookies, birth data payloads, or database URLs.
- Keep `APP_ORIGIN` exact: scheme and hostname, with no trailing path.
- Never configure CORS as `*` when credentials are enabled.

## Alternative: Hostinger MySQL

Hostinger supports remote MySQL access, so Railway could connect to the database in Premium hosting. This is not the preferred design: it sends database traffic across providers, requires IP allowlisting, and makes availability and incident diagnosis more complex. Never select **Any Host** for a production database. Keep API and MySQL together on Railway unless there is a strong operational reason not to.
