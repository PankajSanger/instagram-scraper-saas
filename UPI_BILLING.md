# UPI Billing Notes

## Flow

1. User chooses Starter or Pro plan.
2. API creates pending payment request with amount and UPI intent URI.
3. Dashboard shows deep link and QR.
4. User pays in any UPI app.
5. User submits UTR.
6. API marks payment as paid and activates plan for 30 days.

## Endpoints

- `GET /plans`
- `POST /billing/upi/create`
- `POST /billing/upi/confirm`
- `GET /billing/upi/history`

## Important

Current confirmation is user-UTR based for simplicity. For stronger fraud prevention in public production, integrate provider verification (Razorpay/Cashfree webhook) later.
