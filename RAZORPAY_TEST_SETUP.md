# Razorpay Test Mode Setup

## 1. Install the database workflow

Run the complete `RAZORPAY_PAYMENT_WORKFLOW.sql` file in the Supabase SQL Editor.
Expected result: `RFG Razorpay payment workflow installed`.

## 2. Add Supabase Edge Function secrets

In Supabase Dashboard, open **Edge Functions > Secrets** and add:

- `RAZORPAY_KEY_ID`: Razorpay Test Key ID
- `RAZORPAY_KEY_SECRET`: Razorpay Test Key Secret
- `RAZORPAY_WEBHOOK_SECRET`: a separate strong random value used only for webhooks

Never add these values to `.env.local`, React/Vite variables, Hostinger frontend files, Git, or screenshots.

## 3. Deploy the payment functions

From the project directory:

```powershell
npx.cmd supabase functions deploy razorpay-create-order --no-verify-jwt
npx.cmd supabase functions deploy razorpay-verify-payment --no-verify-jwt
npx.cmd supabase functions deploy razorpay-webhook --no-verify-jwt
```

The browser functions use a short-lived customer payment token. The webhook authenticates the raw request with the Razorpay webhook signature, so Supabase JWT verification is intentionally disabled for these three endpoints.

## 4. Create the Razorpay webhook

In Razorpay Test Mode, create a webhook with this URL:

`https://kizjrvzctilzugbjlfwl.supabase.co/functions/v1/razorpay-webhook`

Use the exact same value stored as `RAZORPAY_WEBHOOK_SECRET`. Subscribe to:

- `payment.captured`
- `payment.failed`

Enable automatic capture in Razorpay Test Mode. RFG records an EMI as paid only after Razorpay reports the payment as captured.

## 5. Enable Razorpay in RFG Admin

Open **Admin > Settings**, enable Razorpay, and save.

## 6. Test

1. Log in to an active customer loan.
2. Open the first payable EMI.
3. Continue to Razorpay and use a Razorpay Test Mode payment method.
4. Confirm the EMI becomes Paid and the next EMI unlocks.
5. Confirm Admin Payments shows contractual EMI, gross payment, fee, GST, and net settlement.
6. Repeat the success callback or webhook and confirm no duplicate payment is created.
7. Test a failed payment and confirm the EMI remains unpaid.
