# Instagram Comments Scraper + India UPI SaaS

This project includes:

- Chrome extension for Instagram comment scraping
- SaaS API with auth, usage limits, and UPI-based paid plans
- Web dashboard for signup/login, API key management, and UPI activation

## India-first paid model

- Currency: INR
- Plans: Free, Starter (Rs 499 / 30 days), Pro (Rs 1499 / 30 days)
- Payment flow: UPI deep link + QR + UTR confirmation

## Local Run

```powershell
node apps/api/src/server.js
node apps/web/server.js
```

Web: `http://localhost:3000`
API: `http://localhost:8080`

## Public Deployment

See:

- `DEPLOY_PUBLIC.md`
- `render.yaml`
- `railway.api.toml`
- `railway.web.toml`
- `.env.production.example`

## Configure UPI receiver

Set env vars in deployed API:

- `UPI_VPA` (example: `brand@upi`)
- `UPI_PAYEE_NAME` (example: `CommentMint Pvt Ltd`)

## Package extension

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\package.ps1
```
