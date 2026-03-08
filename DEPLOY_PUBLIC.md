# Public Launch Runbook (India UPI)

## 1. Deploy API

Option A: Render

1. Create new Web Service from this repo.
2. Use `render.yaml` service `commentmint-api`.
3. Set env vars:
   - `JWT_SECRET`
   - `UPI_VPA`
   - `UPI_PAYEE_NAME`
   - `CORS_ORIGIN` (your web app URL)
4. Note API URL, for example `https://api.yourdomain.com`.

Option B: Railway

1. Create project service for API.
2. Use `railway.api.toml`.
3. Set same env vars.

## 2. Deploy Web App

Option A: Render

1. Deploy `commentmint-web` from `render.yaml`.
2. Point custom domain, for example `https://app.yourdomain.com`.

Option B: Railway

1. Create separate service using `railway.web.toml`.
2. Add custom domain.

## 3. Connect Web to API

In browser on web app, run once in devtools:

```js
localStorage.setItem('cm_api_base', 'https://api.yourdomain.com');
location.reload();
```

## 4. Publish Extension

1. In extension popup set API URL to `https://api.yourdomain.com`.
2. Package extension:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\package.ps1
```

3. Upload ZIP from `dist/` to Chrome Web Store.
4. In listing description, explain UPI payment and plan activation.

## 5. Verify live payment

1. Create test user.
2. Choose Starter/Pro, pay via UPI.
3. Submit UTR.
4. Confirm plan becomes active and scrape uploads succeed.
