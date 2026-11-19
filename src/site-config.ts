// Business details shown on the public site and policy pages.
// Empty values render as a highlighted "[Add ...]" marker so nothing unverified goes live by accident.
// Fill every value with the client's confirmed details, then set policyStatus to 'approved'.

export const siteConfig = {
  legalName: 'Reliant Future Group LLP',
  shortName: 'RFG',
  tagline: 'Pre-owned two-wheelers with simple, scheduled part-payments',
  region: 'Gossaigaon subdivision, Assam, India',
  email: 'reliantfuturegroup@gmail.com',
  phone: '+916001515726',
  phoneLabel: '+91 60015 15726',

  // To be supplied by the client.
  storeAddress: '',
  llpin: '',
  gstin: '',
  businessHours: '',
  grievanceOfficerName: '',

  // Grievance handling commitments; confirm with the client before publishing.
  grievanceAcknowledgeWithin: '2 working days',
  grievanceResolveWithin: '15 working days',

  // 'draft' shows a review banner on policy pages. Set to 'approved' once the client and
  // their legal adviser have signed off the text.
  policyStatus: 'draft' as 'draft' | 'approved',
  policyUpdated: '2026-11-19'
};

export type SiteConfig = typeof siteConfig;
