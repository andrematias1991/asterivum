# Asterivum — Professional Astrology Studio

Asterivum is a self-hosted bilingual astrology workspace for professional astrologers. It combines private client profiles, natal and transit charts, ephemerides, forecasting, synastry, astrocartography, printing, PDF reports, and administration in one responsive application.

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
