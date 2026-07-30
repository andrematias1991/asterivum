# Asterivum — Professional Astrology Studio

Asterivum is a self-hosted bilingual astrology workspace for professional astrologers. It combines private client profiles, natal and transit charts, ephemerides, forecasting, synastry, astrocartography, printing, PDF reports, private chart annotations, and administration in one responsive application.

Asterivum Atlas adds a separate public directory for complementary-care practitioners and clinics. Listings use draft/revision workflows, privacy-aware map markers, regulated-specialty credential declarations, and administrator approval before anything becomes public.

The platform distinguishes guest, normal registered, verified professional, verified clinic, and administrator access. Professional/clinic upgrades and new directory specialties use administrator approval queues. The administration area includes last-login data, aggregate daily page views, and a privacy-conscious activity log; it does not store visitor IP addresses or browser fingerprints.

Directory location pictures are normalized to WebP, resized, and stripped of embedded metadata by the API. Development stores them under `data/uploads`; production requires S3-compatible object storage. See [.env.example](.env.example) and [HOSTINGER_DEPLOYMENT.md](HOSTINGER_DEPLOYMENT.md).

The interface supports English and Portuguese (Portugal). Language preference is stored locally in the browser.

## Quick start

Requirements: Node.js 22+ and npm.

```bash
cp .env.example .env
npm install
npm run dev
```

Open `http://localhost:5173`. The API runs on `http://localhost:3001`.

No default administrator is created. To bootstrap one, set `ADMIN_EMAIL` and `ADMIN_INITIAL_PASSWORD`, run `npm run seed`, then remove the password from the environment.

## Production

Production uses MySQL, revocable HttpOnly sessions, CSRF protection, security headers, request limits, rate limiting, and tracked schema migrations.

For the Atlas map, configure `VITE_MAP_STYLE_URL` during the frontend build when using a commercial or self-hosted MapLibre tile provider. The OpenStreetMap raster fallback is intended for development and low-volume evaluation; production use must follow the selected tile provider's usage policy.

```bash
npm ci
npm run build
npm start
```

See [HOSTINGER_DEPLOYMENT.md](HOSTINGER_DEPLOYMENT.md) for the deployment checklist and required environment variables.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the API and Vite development server |
| `npm run typecheck` | Run strict TypeScript checks |
| `npm run build` | Build the static client and compiled Node server |
| `npm start` | Serve the production application |
| `npm test` | Run calculation and security tests |
| `npm run seed` | Create the explicitly configured initial administrator |

## Structure

```text
public/brand/         Asterivum application identity assets
src/i18n.tsx          English and Portuguese (Portugal) localization
src/                  React client and SVG chart renderer
server/astro.ts       Ephemeris and chart calculation adapter
server/routes.ts      Authenticated REST API and admin endpoints
server/db.ts          MySQL/SQLite adapter and schema migrations
data/astralis.db      Local development database
```

Astrology should be presented as a reflective practice, not as medical, legal, or financial advice.
