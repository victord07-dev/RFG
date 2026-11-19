# Razorpay re-application: client confirmation checklist

Nothing here is deployed. These local changes only make sense if the facts below are TRUE for RFG.
If any answer is "no", stop and use the bank collection / eNACH route instead of re-applying as a retailer.

## 1. Facts the client must confirm (the whole positioning depends on these)

- [ ] RFG buys the vehicles and holds them as its own stock.
- [ ] RFG issues its own sale invoice and is the named seller in the agreement.
- [ ] The down payment and every instalment are paid to RFG as part of the vehicle price.
- [ ] RFG does not pay a separate showroom or seller up front and then recover that money from the customer.
- [ ] Ownership / RC transfer: exactly when does it happen? (The draft text says "once the full price has been paid".)
- [ ] Late-payment charge: the amount, grace period and whether it is defensible (ask the CA). The app still applies a fixed Rs 496 penalty.
- [ ] "Charges + GST" and "Processing Fee" shown on the customer account: are these real, agreed parts of the sale? (They are still shown honestly; they were not hidden.)

## 2. Details to fill in `src/site-config.ts` (shown as red "[Add ...]" markers until filled)

- [ ] Store address
- [ ] LLPIN
- [ ] GSTIN
- [ ] Business hours
- [ ] Grievance contact name
- [ ] Confirm the acknowledge / resolve times in the grievance policy
- [ ] After the client and their legal adviser approve the policy text, set `policyStatus` to `'approved'` (removes the draft banner)

## 3. Still to do before re-applying

- [ ] New logo: the current logo image reads "Financial". It is a picture, so it needs a replacement file.
- [ ] Replace loan wording in the staff (Admin/Sales) screens; only the public site and the customer app were changed.
- [ ] Decide whether to keep the Electronics / Others categories, the Showroom and Guarantor parties, and "Foreclosure". These touch calculations and database rules, so they were not changed.
- [ ] Remove the 2% gateway fee charged to the customer (`supabase/functions/_shared/razorpay.ts` `gatewayAmounts`), or disclose it clearly.
- [ ] Prepare the purchase agreement and a sample invoice in retail wording (not a loan agreement).
- [ ] Add every Supabase Auth redirect URL if the staff entry changes (staff login is now at `/staff`; auth callbacks from `/` still reach the staff app).
- [ ] Ask Razorpay whether a Rs 20,000 monthly mandate is supported (UPI AutoPay limits may be lower).
- [ ] Documents Razorpay may ask for: PAN, LLP agreement and certificate, GSTIN, current account proof, partner KYC, shop / trade licence, dealer proof, sample invoice and agreement.

## 4. Deploy notes (Hostinger)

- Build with `npm run build`, then upload the contents of `dist/` including `.htaccess`.
  `.htaccess` sends every path (/privacy, /staff, /customer ...) to `index.html`.
- Staff now sign in at `/staff`; customers at `/customer`; `/` is the public website.
