# RFG Financial System - Final Delivery Audit

Audit date: 2 July 2026  
Reference: `BoroTech_Android_App_MVP_Updated_Terms_Conditions_Reliant_Future_Group_LLP_FINAL.docx.pdf`  
Reviewed: React/Vite frontend, Supabase SQL/RPC/RLS, authentication, staff/customer journeys, payment/EMI logic, archive automation, and Hostinger build configuration.

## Delivery Decision

**Not ready for public production delivery yet.** The staff and customer previews are suitable for a controlled client demonstration, and the implemented office workflows are substantially complete. Public launch remains blocked by real Razorpay integration, real OTP delivery/verification, approved legal-policy content, production execution of `FINAL_RELEASE_HARDENING.sql`, and a live-environment regression test.

## Critical And High-Risk Issues Fixed

1. **Sales could reset customer MPIN through the RPC.** The UI hid the action, but the backend still authorized Sales for their own loans. `FINAL_RELEASE_HARDENING.sql` now enforces `require_admin()`.
2. **Customer MPIN login could be brute-forced.** The direct anonymous RPC had no retry control. It now rate-limits each normalized mobile number to five failures per 15-minute window and returns a generic response.
3. **Removed customer manual-bank flow remained publicly callable.** Execute permission is now revoked from browser roles.
4. **Processing fee was hidden in remarks JSON.** It is now migrated into typed, non-negative database columns, backfilled, synchronized for legacy records, exposed through approved column grants, and included in audited term changes.
5. **Edit Terms UI/backend conflict.** The UI offered term edits after activation while the backend allowed them only before disbursement. Editing is now limited to Approved loans; active-loan settlement uses Foreclosure.
6. **EMI could diverge after an admin term edit.** The backend now recalculates EMI from `(loan + charge + processing fee) / tenure`; the UI shows the same value as read-only.
7. **Placeholder OTP could be marked verified in production.** Demo OTP controls now work only on localhost with `demo=1`. They cannot simulate verification on a production hostname.
8. **Missing Hostinger browser protections.** Added SPA routing plus CSP, HSTS, frame denial, MIME sniffing protection, referrer policy, permissions policy, directory-listing denial, and protection against serving environment/SQL/config files.
9. **Customer policy buttons silently did nothing.** They now clearly state that approved policy content must be published; no legal text was invented.

## Implemented Correctly

- Admin and Sales authentication through Supabase Auth, profile activation checks, and role-specific interfaces.
- RLS/RPC ownership model: Admin sees operational data; Sales reads and acts only on applications they created.
- Admin-only loan approval, rejection, disbursement activation, payment review, staff access, term changes, MPIN reset, and foreclosure.
- Customer access only for an Active loan using normalized mobile number and bcrypt-backed MPIN.
- Application parties now recorded as Customer, Guarantor, Showroom, and RFG.
- Category-aware fields/checklists: RC and insurance for Two-Wheeler, IMEI/serial for Electronics, neither for unrelated categories.
- No uploaded document images/PDFs are stored.
- Under Processing -> Approved/Rejected -> Disbursed/Active -> Closed workflow.
- EMI schedule generated atomically from actual disbursement date, with calendar-day clamping.
- Cash and office Bank Transfer/QR requests remain Verification Pending until Admin review.
- Sales cannot mark a payment Paid; Admin approval creates the payment and updates the EMI in one locked transaction.
- Duplicate pending request and duplicate confirmed-payment database indexes.
- Partial EMI payment and carry-forward to the next EMI, including reconciliation SQL for older rows.
- Fixed seven-day grace period and Rs 496 penalty per overdue EMI; penalties accumulate across overdue installments.
- Foreclosure records agreed settlement, returned-product decision/value, notes, actor, and timestamp before closing.
- Audit/activity logs, login logs for successful staff sessions, and private Google Drive archive automation with two-month database retention.
- Responsive layouts tested at desktop and 375px mobile without horizontal overflow.

## Intentional Scope Changes From The PDF

- Seller/lender was replaced with **Guarantor**; Showroom remains separate.
- Customer login changed to **mobile number + MPIN** rather than loan ID/password-style access.
- Due dates are generated from the actual disbursement timestamp, not manually chosen during application entry.
- Processing fee was added and participates in EMI/total-payable calculations.
- Manual bank payment was removed from the customer app. Office Bank Transfer/QR is recorded and verified by staff through the same controlled queue as cash.
- Partial payments carry their shortfall into the next EMI.
- Fixed grace/penalty rules and negotiated foreclosure settlement were added.
- Customer app payment UI is Razorpay-only.
- Activity archives use private Google Drive rather than Cloudflare R2/Hostinger.

## Missing Or Incomplete Scope

### Release blockers

- **Razorpay is not integrated.** There is no server-created order, checkout key exchange, signature verification, webhook verification, idempotent payment capture, duplicate-event handling, refund handling, or failed-payment recovery. The button correctly remains disabled while configuration is absent.
- **OTP is not integrated.** Customer/Guarantor SMS delivery, hashed OTP storage, expiry, attempt limits, resend cooldown, provider callback, and abuse controls are absent.
- **Customer notifications are not integrated.** Firebase 7-day, 3-day, and 24-hour EMI reminders are not implemented.
- **New-device alerts and 24-hour unattended-task emails are not implemented.** The UI badges are data counters, not a notification delivery system.
- **Android packaging was not found.** The current customer experience is a responsive React web app; no verified APK/AAB, signing configuration, Play Store package, native secure storage, or device test suite exists in this repository.
- **Privacy, refund, support, and final terms content is not supplied/published.** These cannot be fabricated by engineering.

### Client confirmation required

- RTO/hypothecation status tracking appears in the original reference but is not present as a dedicated workflow. RC/insurance checklist entries are not equivalent.
- Confirm whether customer and guarantor OTP must block application submission at launch. The current approved testing rule treats them as non-mandatory until the provider is connected.
- Confirm financial/legal treatment of “Charge Amount + GST.” The software records the supplied charge amount; it does not independently derive GST on finance charges.
- Confirm Razorpay fee policy: current report math assumes the customer bears 2% plus 18% GST on that fee so RFG receives the intended net amount.
- Confirm foreclosure settlement accounting: the agreement is recorded, but no separate settlement-payment collection or general-ledger entry is created.

## Security Review

- No service-role key, database password, or Razorpay secret was found in the browser environment. Only the Supabase URL and publishable key are exposed, as expected.
- Production npm audit: **0 known vulnerabilities** across 128 dependencies.
- No `dangerouslySetInnerHTML`, raw HTML injection, or document upload surface was found. React text rendering mitigates ordinary stored/reflected XSS.
- SQL injection risk is low in reviewed code because browser writes use Supabase parameters/RPCs and PL/pgSQL values are not concatenated into dynamic SQL.
- CSRF risk is reduced because Supabase uses bearer tokens rather than ambient application cookies. Authorization still resides in RLS/RPC checks.
- IDOR controls exist in RLS and critical RPC ownership checks. The final migration is required to make MPIN reset strictly Admin-only.
- MPIN hashes use pgcrypto bcrypt salts. Clear MPIN is only shown immediately after Admin generation/reset; hashes are excluded from browser column grants and customer responses.
- Customer login now has database throttling, but a production Edge Function/WAF remains preferable for IP/device-aware throttling and bot protection.
- Google Drive archive service credentials remain outside the browser in Apps Script properties.
- Hostinger must force HTTPS and honor `.htaccess`; verify headers after deployment.

## Calculation And Integrity Verification

- EMI formula: `(loan amount + charge amount + processing fee) / tenure`, rounded to two decimals during audited term updates.
- Schedule: one EMI per tenure month, first due one calendar month after actual disbursement, clamped for shorter months.
- Grace: seven calendar days after due date.
- Penalty: Rs 496 added once to each EMI that passes its grace date; multiple overdue EMIs produce multiple penalties.
- Partial payment: confirmed amount is recorded against the source EMI; shortfall is atomically added to the next pending/overdue EMI. Approval is rejected if no next EMI exists.
- Rejection restores Pending or Overdue based on the current grace calculation.
- Foreclosure blocks while a payment request is awaiting verification.
- Razorpay fee report formula exists, but cannot be called verified until the real gateway settlement/webhook flow is implemented.

## QA Evidence

- `npm run build`: passed (TypeScript + Vite production build).
- Hostinger `.htaccess`: copied into `dist`.
- `npm audit --omit=dev`: 0 vulnerabilities.
- Desktop Admin demo loaded with navigation, metrics, queues, and empty states.
- 375px Admin, Sales, and Customer pages: no horizontal overflow.
- Customer login form validation, demo login, overview, installments, and Pay navigation exercised.
- Razorpay action verified disabled when gateway setting is false.
- Remaining warning: main JavaScript bundle is about 610 KB minified (166 KB gzip). Code splitting is recommended but is not a correctness blocker.

## Deployment Gate

Before public delivery:

1. Back up the Supabase database.
2. Run `FINAL_RELEASE_HARDENING.sql` last in the live Supabase project and retain its successful output.
3. Implement and test Razorpay through a trusted server/Edge Function and signed webhook.
4. Connect the approved OTP provider and make the confirmed OTP rule mandatory as agreed.
5. Publish client-approved legal/support policy content.
6. Confirm RTO/hypothecation scope.
7. Deploy the new `dist` contents including `.htaccess`; verify HTTPS and response headers externally.
8. Run live tests with separate Admin, Sales 1, Sales 2, and Customer accounts, including cross-sales denial, duplicate submissions, partial payment, rejection, overdue penalty, foreclosure, session expiry, and logout.
9. Configure monitoring/error capture and perform a restore drill for database plus Drive archives.
10. If an Android app is contractually required, package, sign, and test the customer web experience as an Android build before calling that deliverable complete.

