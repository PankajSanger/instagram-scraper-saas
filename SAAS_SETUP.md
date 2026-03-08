# SaaS Setup Guide

This repository now contains a paid SaaS foundation:

- API service: `apps/api/src/server.js`
- Web app (landing + dashboard): `apps/web/public/*`
- Shared plan limits: `packages/shared/plans.js`
- Postgres schema: `apps/api/db/schema.sql`
- Extension uploader integration: `popup.js` + `popup.html`

## 1. Configure Environment

1. Copy `.env.example` to `.env`.
2. Set values:
   - `JWT_SECRET`
   - `DATABASE_URL` (for production DB migration)
   - `STRIPE_SECRET_KEY`
   - `STRIPE_WEBHOOK_SECRET`
   - `STRIPE_PRICE_PRO`
   - `STRIPE_PRICE_BUSINESS`

## 2. Run Locally

In separate terminals:

```powershell
node apps/api/src/server.js
node apps/web/server.js
```

API: `http://localhost:8080`
Web: `http://localhost:3000`

## 3. Create a Paid User Flow

1. Sign up on the web app.
2. Copy generated API key from dashboard.
3. In extension popup:
   - Set API URL to `http://localhost:8080`
   - Paste API key
4. Run scraper on Instagram and upload jobs.

## 4. Stripe Production Migration

Current code includes a checkout scaffold and mock local activation endpoint.
Replace `apps/api/src/services/billing.js` with live Stripe SDK calls:

- Create real checkout sessions.
- Verify webhook signatures.
- Map Stripe subscription lifecycle events to `subscriptions`.

## 5. Deployment

- Deploy API and web app separately (Railway/Render/Fly/AWS).
- Use managed Postgres.
- Set `APP_URL` to your production frontend URL.
- Lock CORS to your domain in API.
