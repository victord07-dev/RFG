# RFG project handoff (for the next developer / Claude Code session)

Date written: 2026-11-19 (session context). Read this fully before editing anything.

## 1. The project in one paragraph

Reliant Future Group LLP (RFG) runs a pre-owned two-wheeler business in Gossaigaon, Assam, and collects customer payments in scheduled instalments. The software is a React 19 + Vite + TypeScript app (`src/main.tsx`, about 9,300 lines, one file) on a Supabase backend (Postgres, RLS, RPCs, Edge Functions). It has an Admin panel, a Sales panel and a Customer app. The built app is hosted on Hostinger File Manager. SQL migrations and setup docs sit in the project root.

## 2. The business problem (the main goal)

The client wants a payment gateway (Razorpay, PayU or similar) to collect instalments from customers automatically. A previous developer integrated Razorpay (Edge Functions exist), but Razorpay rejected / revoked the account. The user's understanding is that Razorpay wanted an NBFC partner, which the client cannot provide. **The exact rejection message and the category/website used in that application have not been seen. Ask for them first.**

Why it was likely rejected: the app and documents describe lending ("Loan", "Disbursed", "Charge Amount", "Processing Fee", "Foreclosure", "Guarantor", a separate "Showroom" party, a fixed Rs 496 penalty, categories beyond two-wheelers). Gateways treat lending as restricted unless an NBFC / regulated lender is involved.

## 3. Hard boundary: do not misrepresent the business

The user asked several times for ways to "show the business as something else" to a gateway. We refused, and you must too. Reasons: misrepresenting the business to a payment provider is fraud exposure for the LLP and partners, gateways cross-check site vs. app vs. transactions, and the usual outcome is frozen balances and blacklisting. A relabel (calling an instalment sale "rent", picking an easier category, renaming fields only to hide charges) is also not acceptable.

What IS acceptable: describing RFG accurately, in plain retail terms, if and only if the facts below are true.

### Facts the client must confirm (unconfirmed as of this handoff)

- RFG buys the vehicles and holds them as its own stock.
- RFG issues its own sale invoice and is the named seller.
- The down payment and instalments are paid to RFG as part of the vehicle price.
- RFG does NOT pay a separate showroom/seller up front and then recover that money with a charge on top.
- When ownership / RC transfer happens.
- Whether the "Charges + GST", "Processing Fee" and Rs 496 late penalty are real, agreed charges.

The user described RFG variously as a retailer, "indirect, like OLX", and said ownership "remains with RFG and the Seller until full payment". Those conflict. The user never answered whether RFG pays sellers up front or charges on top. If those answers show RFG is financing, do NOT re-apply as a retailer. Use the bank route instead (section 6).

## 4. What was done in this session (all local, nothing deployed, no git repo)

Backup of the original `src`, `supabase`, `index.html`, `package.json`, `tsconfig.json` was made in the previous session's scratchpad (temporary, may no longer exist). The folder is NOT a git repo, so consider running `git init` and committing before further work.

Files added:
- `src/site-config.ts`: business details for public pages (address, LLPIN, GSTIN, hours, grievance contact are empty and render as red "[Add ...]" markers; `policyStatus: 'draft'` shows a draft banner).
- `src/public-site.tsx` + `src/public-site.css`: a public website inside the React app (Home, How buying works, Vehicles, About, Contact, Terms, Privacy, Refund, Handover, Grievance) in retail wording. Tested on desktop and 375px mobile, no overflow.
- `public/.htaccess`: SPA routing and basic headers.
- `RAZORPAY_REAPPLICATION_CHECKLIST.md`: client confirmation and to-do checklist.
- `HANDOFF.md`: this file.

Files edited:
- `src/main.tsx`: (a) added `showPublicSite` before `function App()` so `/` and the policy paths render the public site, with staff at `/staff`; (b) customer-app wording changed from loan terms to retail terms (e.g. "Loan Amount" to "Balance Amount", "EMI" to "Instalment", "Secure Banking" to "Customer Portal", Razorpay checkout name to "Reliant Future Group LLP"). "Charges + GST" and "Processing Fee" were deliberately kept visible, not hidden.
- `index.html`: title and description changed to the public-site ones.

`npm install` was run and `npm run build` passes. `dist/` was built. Dev server: `npm run dev -- --port 5180 --strictPort` (it was stopped; a restart attempt later exited with code 4, probably because the port was already in use).

Note: the system reported that `src/public-site.css` and `src/main.tsx` changed on disk after our edits. Re-read them before editing rather than assuming they match this description.

## 5. IMPORTANT correction found late: the hosting layout (from RFG.zip)

The user supplied `C:\Users\Victor\Downloads\RFG.zip` (the live Hostinger File Manager contents) and the site https://www.rfg-financialgroup.com/. Structure:

```
RFG.zip
  index.html, terms.html, privacy.html, refund.html, support.html   <- the real public static site (home page = index.html)
  styles.css, script.js, assets/                                     <- its styling and assets
  downloads/RFG-Customer-v1.0.apk                                    <- Android app (Capacitor wrapper)
  .htaccess                                                          <- APK download headers
  app/                                                               <- built React app (this project's output)
     index.html, assets/, logos
     .htaccess                                                       <- production SPA routing + strict CSP/security headers
```

The home page links to `https://app.rfg-financialgroup.com/customer` (the React app, apparently on an `app.` subdomain pointing at `app/`) and to the APK.

Consequences:
1. **Do not deploy the React-app public site I built.** The static root site already is the public site. Remove or disable the `showPublicSite` routing in `src/main.tsx` so `/` goes back to the staff login on the app subdomain, and delete `src/public-site.*`/`src/site-config.ts` if not reused. Reuse the drafted policy wording in the static pages instead.
2. **Do not upload `public/.htaccess` from this project.** It would overwrite the production `app/.htaccess` (strict CSP that allows Razorpay, MSG91, hCaptcha, Supabase). Replace `public/.htaccess` with the zip's `app/.htaccess` so builds carry the right file.
3. **The APK** bundles its own, older copy of the React build plus the Razorpay SDK and Firebase. Loan wording changes in `src/main.tsx` will not reach APK users until the APK is rebuilt. The Capacitor/Android project source is not in the zip or this folder; ask the user for it.
4. The audit report (`FINAL_AUDIT_REPORT.md`) says "Android packaging not found" and "Razorpay not integrated". Both are outdated (an APK exists; Edge Functions `razorpay-create-order`, `razorpay-verify-payment`, `razorpay-webhook` exist). The verify and webhook functions were not reviewed.

### Problems in the live static site (as read from the zip and the live home page)

- Branded "RFG Financial"; the legal entity "Reliant Future Group LLP" never appears. No store address, LLPIN or GSTIN anywhere.
- Home page says the policy pages are public so "payment service reviewers can understand that RFG is a store". This is written at the reviewer. Remove it.
- Loan-like wording: "approved customers", "purchase approval", "guarantor verification", non-refundable "processing fee, documentation or service charges".
- Scope inconsistency: home says "pre-owned bikes and other eligible products"; terms say two-wheelers only.
- Terms (last updated 20-8-2026) name "PayTM PG", not Razorpay.
- Privacy policy mentions sharing data with "showrooms", which contradicts "RFG sells its own vehicles".
- The logo image itself reads "Financial".
- The same retail framing is already live and Razorpay still rejected, so the wording alone is not the whole story.

## 6. Plan / what to do next

Immediate (needs the client's confirmation of section 3 facts first):
1. Get Razorpay's rejection message and the application details.
2. Work on a COPY of the zip's static site (never the live files): replace "RFG Financial" branding with the LLP name, add LLPIN/GSTIN/address/hours/grievance contact, remove the reviewer-targeted sentence, fix Paytm to the real provider, make the product scope consistent, add a "how buying works" page with an example payment plan, a handover and ownership policy and a grievance page, and make the terms match the real agreement. The draft wording in `src/public-site.tsx` can be reused. Policy text must be approved by the client's lawyer/CA.
3. Undo the React public-site routing and fix `public/.htaccess` (section 5).
4. Staff (Admin/Sales) screens still use loan wording and need a separate, listed-before-editing wording audit.
5. Decide with the client whether to keep: Electronics/Others categories, Showroom and Guarantor parties, "Foreclosure", "Charge Amount" and "Processing Fee", the Rs 496 penalty. Some touch calculations and DB rules (see `*.sql` files), so change carefully.
6. Remove the 2% customer-paid gateway fee (`supabase/functions/_shared/razorpay.ts` `gatewayAmounts`, plus report math in `src/main.tsx`) or disclose it clearly. Gateways question silent surcharging.
7. Prepare a plain purchase agreement and sample invoice in retail wording.
8. Re-apply to Razorpay under a retail/vehicle-dealer category, describing the instalment structure openly. Likely documents: LLP certificate and agreement, PAN, GSTIN, current account proof, partner KYC, shop/trade licence, any dealer registration, sample invoice and agreement. Ask the client's CA what Assam requires for pre-owned vehicle dealers.
9. Ask Razorpay whether a Rs 20,000 monthly mandate is supported (UPI AutoPay limits are lower, around Rs 15,000 without extra authentication; confirm current limits). The idea discussed: Razorpay Subscriptions, e.g. Rs 1,00,000 price as 5 x Rs 20,000.

Fallback if the facts show RFG finances sellers or customers (no honest way to be a retailer):
- Collect through the bank: current account in the LLP's name with a collection product (virtual account per loan with webhook, UPI collect) and eNACH / UPI AutoPay via a lender-friendly provider (Cashfree, PayU, Digio, Setu, Easebuzz or the bank directly). Reuse the existing pattern: webhook with signature check, idempotent recording, `payableAmount` logic, the admin approval RPC. Add an "unmatched payments" admin queue and a `payment_mandates` table.
- Ask the CA whether RFG needs a state money-lender licence or NBFC registration.

## 7. Technical notes

- Stack: React 19, Vite 7, TypeScript, `@supabase/supabase-js`, lucide-react. Build: `npm run build` (tsc + vite build with `--base=./`). Output goes to `dist/`.
- Entry: `src/main.tsx` (all components), `src/supabase.ts`, styles in `src/styles.css` and `src/admin-pro.css` (global table styles set `min-width` and `white-space: nowrap`).
- Routing is manual in `App()` using `window.location` (`/customer*` is the customer app; `?demo=1&role=admin|sales` is a localhost demo preview; auth callbacks arrive at `/`).
- Supabase setup is documented in `SUPABASE_SETUP.md`; Razorpay test setup in `RAZORPAY_TEST_SETUP.md`; run the SQL files in the documented order (`FINAL_RELEASE_HARDENING.sql` last).
- Edge Functions in `supabase/functions` (admin device OTP, staff invite/reset, log archive, razorpay-*).
- Secrets live only in Supabase Edge Function secrets, never in `.env` or the frontend. `.env.example` has only the public URL and publishable key. No `.env` exists locally, so the staff login screen just shows "Loading RFG panel..." locally; use the demo preview.
- Staff and customer wording changes must keep the DB column names; only UI text was changed.

## 8. Working agreements with the user

- Do not change code or files unless the user clearly asks (they once stopped work abruptly with "do not change any code or do anything").
- Keep changes local; nothing is deployed; the user uploads via Hostinger File Manager.
- Be honest about uncertainty (no guarantee Razorpay approves; legal and tax questions go to the client's CA/lawyer).
- Reply concisely and in plain language.
