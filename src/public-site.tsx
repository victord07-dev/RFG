import React, { useEffect } from 'react';
import { siteConfig } from './site-config';
import './public-site.css';

type Block = { heading: string; body: React.ReactNode[] };
type PageDef = { path: string; title: string; description: string; render: () => React.ReactNode };

const missing = (label: string) => <mark className="ps-missing">[Add {label}]</mark>;
const value = (text: string, label: string) => (text ? text : missing(label));

const navLinks = [
  { path: '/', label: 'Home' },
  { path: '/how-it-works', label: 'How buying works' },
  { path: '/vehicles', label: 'Vehicles' },
  { path: '/about', label: 'About us' },
  { path: '/contact', label: 'Contact' }
];

const policyLinks = [
  { path: '/terms', label: 'Terms of sale' },
  { path: '/privacy', label: 'Privacy policy' },
  { path: '/refund-policy', label: 'Refund & cancellation' },
  { path: '/handover-policy', label: 'Handover & ownership' },
  { path: '/grievance', label: 'Grievance redressal' }
];

const purchaseSteps = [
  ['Choose a vehicle', 'Visit our store and inspect the pre-owned motorcycles and scooters on display.'],
  ['Verification', 'We verify your identity, residential address and the documents needed for the purchase.'],
  ['Purchase agreement', 'You and RFG sign an agreement stating the vehicle price, down payment, balance, payment schedule and all applicable terms.'],
  ['Vehicle handover', 'After the down payment and formalities are complete, the vehicle is handed over at our store.'],
  ['Scheduled payments', 'You pay the remaining balance on the agreed dates, through the secure online payment option or at our store.']
];

function PolicyBanner() {
  if (siteConfig.policyStatus === 'approved') return null;
  return (
    <p className="ps-draft" role="note">
      Draft for review. This text has not yet been approved by {siteConfig.legalName} and its legal adviser.
    </p>
  );
}

function PolicyPage({ blocks }: { blocks: Block[] }) {
  return (
    <div className="ps-policy">
      <PolicyBanner />
      <p className="ps-updated">Last updated: {siteConfig.policyUpdated}</p>
      {blocks.map((block) => (
        <section key={block.heading}>
          <h2>{block.heading}</h2>
          {block.body.map((paragraph, index) => <p key={index}>{paragraph}</p>)}
        </section>
      ))}
    </div>
  );
}

const termsBlocks = (): Block[] => [
  {
    heading: '1. Who we are',
    body: [
      <>{siteConfig.legalName} ("RFG", "we") is a retail business that sells pre-owned two-wheelers from its store in {siteConfig.region}. RFG is the seller named in every purchase agreement and invoice.</>,
      'RFG is not a bank, a non-banking financial company or a lender. We do not offer personal loans, cash advances or third-party financing.'
    ]
  },
  {
    heading: '2. Purchase and payment plan',
    body: [
      'Each sale is recorded in a written purchase agreement. The agreement states the vehicle, the total price, the mandatory down payment, the remaining balance, the number and amount of each scheduled payment, and the due dates.',
      'The balance is payable to RFG in the scheduled instalments agreed in that agreement. Amounts and dates are fixed when the agreement is signed and are not changed without both parties agreeing in writing.'
    ]
  },
  {
    heading: '3. Late payments',
    body: [
      'If a scheduled payment is not made by its due date, any grace period and any late-payment charge are those stated in the purchase agreement. No charge is applied that is not stated in the signed agreement.',
      'We will contact you using the details you gave us before taking any further step.'
    ]
  },
  {
    heading: '4. Online payments',
    body: [
      'Scheduled payments can be made online through our payment provider, Razorpay. RFG does not see or store your card, UPI or bank credentials.',
      'A payment is recorded against your purchase only after it is confirmed by the payment provider. Keep the payment reference for your records.'
    ]
  },
  {
    heading: '5. Ownership and handover',
    body: ['Ownership of the vehicle and transfer of registration are described in the Handover & ownership policy and in your purchase agreement.']
  },
  {
    heading: '6. Customer responsibilities',
    body: [
      'You agree to provide true and complete identity and address details, keep the vehicle insured and in roadworthy condition as required by law, and tell us promptly if your contact details change.'
    ]
  },
  {
    heading: '7. Changes and governing law',
    body: [
      'We may update these terms. The terms in your signed purchase agreement always apply to your purchase.',
      'These terms are governed by the laws of India. Disputes are subject to the courts at the location of our registered office.'
    ]
  }
];

const privacyBlocks = (): Block[] => [
  {
    heading: '1. What we collect',
    body: [
      'Name, phone number, residential address, identity and address document details checked at our store, vehicle and purchase details, payment schedule and payment history.',
      'If you use the customer app, we also keep your login details (mobile number and a secured PIN) and the activity needed to keep your account safe.'
    ]
  },
  {
    heading: '2. Why we use it',
    body: [
      'To verify you, prepare your purchase agreement, hand over the vehicle, record and confirm your payments, send payment reminders, respond to your queries and meet legal and tax requirements.'
    ]
  },
  {
    heading: '3. Who we share it with',
    body: [
      'Our payment provider (Razorpay) processes online payments. Our technology providers host our systems. We share data with government or regulatory bodies only when the law requires it.',
      'We do not sell your personal data.'
    ]
  },
  {
    heading: '4. How long we keep it',
    body: ['We keep purchase and payment records for as long as needed for the sale and to meet accounting and legal retention requirements.']
  },
  {
    heading: '5. Your choices',
    body: [
      <>You may ask us to access, correct or delete your personal data, and to withdraw consent for non-essential uses, by writing to <a href={`mailto:${siteConfig.email}`}>{siteConfig.email}</a>. Some records must be kept by law.</>
    ]
  },
  {
    heading: '6. Security',
    body: ['Access to customer records is limited to authorised staff and protected by login controls. Payment card and bank details are handled by the payment provider, not by RFG.']
  }
];

const refundBlocks = (): Block[] => [
  {
    heading: '1. Before the vehicle is handed over',
    body: [
      'You may cancel a purchase before handover by telling us in writing. Whether the down payment is refunded in full or in part is set out in your purchase agreement.',
      'Refunds are made to the original payment method or bank account within the period stated in the agreement.'
    ]
  },
  {
    heading: '2. After handover',
    body: [
      'After the vehicle is handed over, the sale is final except where the purchase agreement or the law provides otherwise, for example a vehicle that is not as described.',
      'If you want to settle the remaining balance early, contact us. The settlement amount is the unpaid balance stated in your agreement.'
    ]
  },
  {
    heading: '3. Duplicate or failed online payments',
    body: [
      'If an online payment is debited but not recorded against your purchase, or you are charged twice, write to us with the payment reference. Eligible refunds are returned to the original payment method, usually within 5 to 7 working days after we confirm the issue with the payment provider.'
    ]
  }
];

const handoverBlocks = (): Block[] => [
  {
    heading: '1. Handover',
    body: [
      'The vehicle is handed over at our store after the purchase agreement is signed, the down payment is received and the verification formalities are complete. We do not ship vehicles.',
      'You can inspect the vehicle and its documents before handover.'
    ]
  },
  {
    heading: '2. Ownership and registration',
    body: [
      'Ownership of the vehicle and the transfer of its registration certificate are completed as described in your purchase agreement. In general, the transfer paperwork is completed once the full price has been paid.',
      'RFG keeps the original registration documents until that point, unless your agreement states otherwise.'
    ]
  },
  {
    heading: '3. Insurance and use',
    body: ['The vehicle must be insured and used lawfully from the day of handover.']
  }
];

const grievanceBlocks = (): Block[] => [
  {
    heading: 'How to raise a concern',
    body: [
      <>Write to <a href={`mailto:${siteConfig.email}`}>{siteConfig.email}</a>, call {siteConfig.phoneLabel}, or visit our store. Please include your name, mobile number and the vehicle or payment reference.</>,
      <>Grievance contact: {value(siteConfig.grievanceOfficerName, 'grievance officer name')}</>
    ]
  },
  {
    heading: 'What happens next',
    body: [
      `We acknowledge your concern within ${siteConfig.grievanceAcknowledgeWithin} and aim to resolve it within ${siteConfig.grievanceResolveWithin}.`,
      'If you are not satisfied with our response, you may approach the consumer forum or other authority that applies to you.'
    ]
  }
];

function Home() {
  return (
    <>
      <section className="ps-hero">
        <div>
          <p className="ps-eyebrow">Pre-owned two-wheeler retail · {siteConfig.region}</p>
          <h1>Quality pre-owned motorcycles and scooters, with part-payment made simple.</h1>
          <p className="ps-lead">
            {siteConfig.legalName} sells inspected pre-owned two-wheelers from our store. Pay a down payment at purchase and the remaining price in
            agreed scheduled payments, all written down in a clear purchase agreement.
          </p>
          <div className="ps-actions">
            <a className="ps-button" href="/how-it-works">How buying works</a>
            <a className="ps-button ps-ghost" href="/contact">Visit or call us</a>
          </div>
        </div>
        <aside className="ps-hero-card">
          <h2>What we are, and are not</h2>
          <ul>
            <li>A local retailer selling vehicles from our own store</li>
            <li>A written purchase agreement for every sale</li>
            <li>Not a bank, NBFC or loan provider</li>
          </ul>
        </aside>
      </section>
      <section className="ps-grid3">
        <article><h3>Inspect before you buy</h3><p>See and test the vehicle and check its documents at our store before you decide.</p></article>
        <article><h3>Clear, fixed payments</h3><p>The price, down payment, balance and every payment date are stated in your agreement.</p></article>
        <article><h3>Pay securely</h3><p>Pay scheduled amounts online through Razorpay, or at our store, and track them in the customer app.</p></article>
      </section>
    </>
  );
}

function HowItWorks() {
  return (
    <>
      <p className="ps-lead">Buying from RFG follows five steps. Every sale is recorded in a written purchase agreement.</p>
      <ol className="ps-steps">
        {purchaseSteps.map(([title, text], index) => (
          <li key={title}><span>{index + 1}</span><div><h3>{title}</h3><p>{text}</p></div></li>
        ))}
      </ol>
      <section className="ps-example">
        <h2>Example of a payment plan</h2>
        <p>Illustration only. Your actual amounts and dates are the ones written in your purchase agreement.</p>
        <table>
          <tbody>
            <tr><th>Vehicle price</th><td>₹1,00,000</td></tr>
            <tr><th>Down payment at purchase</th><td>₹20,000</td></tr>
            <tr><th>Balance</th><td>₹80,000</td></tr>
            <tr><th>Scheduled payments</th><td>4 monthly payments of ₹20,000</td></tr>
          </tbody>
        </table>
      </section>
      <section>
        <h2>Paying online</h2>
        <p>
          Scheduled payments can be made through our payment provider, Razorpay. Your payment is recorded against your purchase once it is confirmed.
          We never see or store your card, UPI or bank details. See our <a href="/terms">Terms of sale</a> and <a href="/refund-policy">Refund &amp; cancellation policy</a>.
        </p>
      </section>
    </>
  );
}

function Vehicles() {
  return (
    <>
      <p className="ps-lead">We stock inspected pre-owned motorcycles and scooters. Stock changes often, so please visit or call to see what is available today.</p>
      <section className="ps-grid3">
        <article><h3>Motorcycles</h3><p>Commuter and everyday motorcycles.</p></article>
        <article><h3>Scooters</h3><p>Easy-to-ride scooters for daily use.</p></article>
        <article><h3>Every vehicle</h3><p>Documents verified and the vehicle open to inspection before you decide.</p></article>
      </section>
      <p><a className="ps-button" href="/contact">See stock at our store</a></p>
    </>
  );
}

function About() {
  return (
    <>
      <p className="ps-lead">
        {siteConfig.legalName} is a locally operated pre-owned two-wheeler retail business based in Assam, serving customers in the Gossaigaon subdivision.
      </p>
      <p>We sell quality pre-owned motorcycles and scooters and make ownership more accessible through structured part-payment options, with every sale documented in a purchase agreement.</p>
      <h2>Our business</h2>
      <p>
        RFG is a vehicle retail business, not a bank, NBFC or independent loan provider. We do not provide personal loans, cash advances or third-party financing.
        Payments collected from customers are amounts due against vehicles bought directly from us.
      </p>
      <h2>Our mission</h2>
      <p>To make pre-owned two-wheeler ownership more accessible, transparent and convenient for local customers through reliable vehicles, structured payment arrangements and digitally managed transactions.</p>
      <h2>Business details</h2>
      <table className="ps-facts">
        <tbody>
          <tr><th>Legal name</th><td>{siteConfig.legalName}</td></tr>
          <tr><th>LLPIN</th><td>{value(siteConfig.llpin, 'LLPIN')}</td></tr>
          <tr><th>GSTIN</th><td>{value(siteConfig.gstin, 'GSTIN')}</td></tr>
          <tr><th>Store address</th><td>{value(siteConfig.storeAddress, 'store address')}</td></tr>
        </tbody>
      </table>
    </>
  );
}

function Contact() {
  return (
    <>
      <p className="ps-lead">Visit our store, call or write to us.</p>
      <table className="ps-facts">
        <tbody>
          <tr><th>Store</th><td>{value(siteConfig.storeAddress, 'store address')}</td></tr>
          <tr><th>Phone</th><td><a href={`tel:${siteConfig.phone}`}>{siteConfig.phoneLabel}</a></td></tr>
          <tr><th>Email</th><td><a href={`mailto:${siteConfig.email}`}>{siteConfig.email}</a></td></tr>
          <tr><th>Hours</th><td>{value(siteConfig.businessHours, 'business hours')}</td></tr>
        </tbody>
      </table>
      <p>For complaints, see our <a href="/grievance">grievance redressal process</a>.</p>
    </>
  );
}

const pages: PageDef[] = [
  { path: '/', title: 'Pre-owned two-wheelers in Gossaigaon, Assam', description: 'Reliant Future Group LLP sells inspected pre-owned motorcycles and scooters in Gossaigaon, Assam, with clear, scheduled part-payments.', render: () => <Home /> },
  { path: '/how-it-works', title: 'How buying works', description: 'The five steps to buy a pre-owned two-wheeler from RFG, with an example payment plan.', render: () => <HowItWorks /> },
  { path: '/vehicles', title: 'Vehicles', description: 'Pre-owned motorcycles and scooters available at the RFG store.', render: () => <Vehicles /> },
  { path: '/about', title: 'About us', description: 'About Reliant Future Group LLP, a pre-owned two-wheeler retailer in Assam.', render: () => <About /> },
  { path: '/contact', title: 'Contact us', description: 'Store address, phone and email for Reliant Future Group LLP.', render: () => <Contact /> },
  { path: '/terms', title: 'Terms of sale', description: 'Terms of sale for vehicles bought from Reliant Future Group LLP.', render: () => <PolicyPage blocks={termsBlocks()} /> },
  { path: '/privacy', title: 'Privacy policy', description: 'How Reliant Future Group LLP collects and uses customer information.', render: () => <PolicyPage blocks={privacyBlocks()} /> },
  { path: '/refund-policy', title: 'Refund & cancellation policy', description: 'Cancellation and refund terms for vehicle purchases and online payments.', render: () => <PolicyPage blocks={refundBlocks()} /> },
  { path: '/handover-policy', title: 'Handover & ownership policy', description: 'How vehicle handover and ownership transfer work at Reliant Future Group LLP.', render: () => <PolicyPage blocks={handoverBlocks()} /> },
  { path: '/grievance', title: 'Grievance redressal', description: 'How to raise a concern with Reliant Future Group LLP and what to expect.', render: () => <PolicyPage blocks={grievanceBlocks()} /> }
];

export const publicPaths = pages.map((page) => page.path);

export function isPublicPath(pathname: string) {
  return publicPaths.includes(pathname.replace(/\/+$/, '') || '/');
}

export function PublicSite() {
  const path = window.location.pathname.replace(/\/+$/, '') || '/';
  const page = pages.find((item) => item.path === path) || pages[0];

  useEffect(() => {
    document.title = path === '/' ? `${siteConfig.legalName} | ${page.title}` : `${page.title} | ${siteConfig.legalName}`;
    let meta = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.name = 'description';
      document.head.appendChild(meta);
    }
    meta.content = page.description;
  }, [path, page]);

  return (
    <div className="ps-shell">
      <header className="ps-header">
        <a className="ps-brand" href="/"><img src="/rfg-logo.png" alt="" /><span>{siteConfig.legalName}</span></a>
        <nav aria-label="Main">
          {navLinks.map((link) => (
            <a key={link.path} href={link.path} aria-current={link.path === path ? 'page' : undefined}>{link.label}</a>
          ))}
        </nav>
      </header>
      <main className="ps-main">
        {path !== '/' && <h1 className="ps-page-title">{page.title}</h1>}
        {page.render()}
      </main>
      <footer className="ps-footer">
        <div>
          <strong>{siteConfig.legalName}</strong>
          <p>Pre-owned two-wheeler retailer · {siteConfig.region}</p>
          <p>LLPIN: {value(siteConfig.llpin, 'LLPIN')} · GSTIN: {value(siteConfig.gstin, 'GSTIN')}</p>
          <p>{value(siteConfig.storeAddress, 'store address')}</p>
          <p><a href={`tel:${siteConfig.phone}`}>{siteConfig.phoneLabel}</a> · <a href={`mailto:${siteConfig.email}`}>{siteConfig.email}</a></p>
        </div>
        <div>
          <strong>Policies</strong>
          {policyLinks.map((link) => <a key={link.path} href={link.path}>{link.label}</a>)}
        </div>
        <div>
          <strong>Accounts</strong>
          <a href="/customer">Customer login</a>
          <a href="/staff">Staff login</a>
        </div>
        <p className="ps-copy">© {new Date().getFullYear()} {siteConfig.legalName}. RFG is a vehicle retailer, not a bank, NBFC or loan provider.</p>
      </footer>
    </div>
  );
}
