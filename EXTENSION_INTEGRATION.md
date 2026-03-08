# Extension to SaaS Integration

The extension now supports job upload to the SaaS API.

## Required popup fields

- `SaaS API URL`: API base URL, for example `http://localhost:8080`
- `API Key`: generated from SaaS dashboard account

## Upload flow

After scraping completes:

1. CSV is downloaded locally.
2. If API URL + API key are set, extension sends:

`POST /scrape-jobs`

Headers:

- `x-api-key: <user_api_key>`
- `Content-Type: application/json`

Payload:

- `metadata`: shortcode, source, exportedAt
- `rows`: full scraped rows

## Plan enforcement

`/scrape-jobs` checks user plan limits:

- monthly jobs
- max rows per job

If exceeded, API responds with `402 plan_limit_exceeded`.
