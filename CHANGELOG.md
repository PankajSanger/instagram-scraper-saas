# Changelog

All notable changes to this project will be documented in this file.

## [1.5.0] - 2026-03-08

- Added production deployment manifests (`render.yaml`, `railway.api.toml`, `railway.web.toml`).
- Added public launch runbook for India UPI deployment.
- Added production environment template `.env.production.example`.
- Tightened API CORS configurability and `x-api-key` header support.
- Updated dashboard API base behavior for public domains.

## [1.4.0] - 2026-03-08

- Switched billing model to India-first UPI flow.
- Added INR plans: Free, Starter, Pro.
- Added UPI payment request API with deep link + QR generation.
- Added UTR confirmation endpoint for instant plan activation.
- Added subscription expiry handling for paid plans.
- Updated dashboard UX for UPI payment and confirmation.
- Added UPI environment variables and billing notes documentation.

## [1.3.0] - 2026-03-08

- Added paid SaaS foundation with API, dashboard web app, and shared plan config.
- Added auth, API key management, usage metering, and plan enforcement.
- Added billing scaffolding endpoints and webhook handling structure.
- Integrated extension popup with SaaS API URL and API key fields.
- Added extension upload-to-SaaS job flow after scrape completion.
- Added extension icon assets and updated manifest icon config.
- Added setup and launch docs for SaaS deployment and go-live.

## [1.2.0] - 2026-03-08

- Improved extension metadata and semantic version format.
- Cleaned popup UI labels and removed mojibake characters.
- Added productization assets: README, privacy policy, terms, roadmap.
- Added repeatable packaging script for Chrome Web Store release ZIP creation.
