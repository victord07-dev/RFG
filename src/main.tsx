import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { createRoot } from 'react-dom/client';
import type { Session } from '@supabase/supabase-js';
import {
  AlertCircle,
  Archive,
  ArrowRight,
  ArrowUpRight,
  Banknote,
  Bell,
  Bike,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronUp,
  ClipboardCheck,
  Clock3,
  CreditCard,
  Eye,
  EyeOff,
  FileClock,
  Gauge,
  Home,
  ListFilter,
  LockKeyhole,
  LogOut,
  Mail,
  Menu,
  MessageCircle,
  Phone,
  PhoneCall,
  Plus,
  QrCode,
  Search,
  Save,
  Scale,
  ShieldCheck,
  Smartphone,
  Store,
  UserRound,
  UsersRound,
  WalletCards,
  X
} from 'lucide-react';
import './styles.css';
import './admin-pro.css';
import { PublicSite, isPublicPath } from './public-site';
import { isSupabaseConfigured, supabase } from './supabase';

type View = 'Dashboard' | 'New Application' | 'Applications' | 'Pending EMI' | 'Payment Requests' | 'Customers';
type AdminView =
  | 'Admin Dashboard'
  | 'New Application'
  | 'Applications Review'
  | 'Customers'
  | 'Payments'
  | 'Payment Verification'
  | 'Guarantors/Showrooms'
  | 'Reports'
  | 'Activity Logs'
  | 'Staff Users'
  | 'Settings';
type LoanStatus = 'Under Processing' | 'Approved' | 'Active' | 'Rejected' | 'Closed';
type ProductCategory = 'Two-Wheeler' | 'Electronics' | 'Others';
type CashStatus = 'Verification Pending' | 'Approved' | 'Rejected';
type EmiStatus = 'Pending' | 'Verification Pending' | 'Paid' | 'Part Paid' | 'Rejected' | 'Failed' | 'Overdue';

type Checklist = {
  aadhaar: boolean;
  pan: boolean;
  address: boolean;
  photo: boolean;
  signature: boolean;
  customerOtp: boolean;
  sellerConfirmed: boolean;
  sellerOtp: boolean;
  rc: boolean;
  insurance: boolean;
  serialChecked: boolean;
};

type Application = {
  supabaseId?: string;
  id: string;
  customerName: string;
  mobile: string;
  alternateMobile: string;
  address: string;
  customerPincode: string;
  category: ProductCategory;
  productName: string;
  assetId: string;
  guarantorName: string;
  guarantorMobile: string;
  guarantorAddress: string;
  guarantorPincode: string;
  showroomName: string;
  showroomMobile: string;
  productPrice: number;
  downPayment: number;
  loanAmount: number;
  chargeAmount: number;
  processingFee: number;
  tenure: number;
  emiAmount: number;
  dueDay: number;
  disbursedAt?: string;
  disbursementReference?: string;
  disbursementNotes?: string;
  status: LoanStatus;
  salesPerson: string;
  date: string;
  loginId: string;
  customerPassword: string;
  checklist: Checklist;
  remarks: string;
  activity: string[];
  foreclosureSettlement?: ForeclosureSettlement;
};

type ForeclosureSettlement = {
  originalLoanAmount: number;
  originalChargeAmount: number;
  paidBeforeForeclosure: number;
  agreedSettlementAmount: number;
  productReturned: boolean;
  productReturnValue: number;
  notes: string;
  settledBy: string;
  settledAt: string;
};

type CashRequest = {
  supabaseId?: string;
  id: string;
  applicationId: string;
  customerName: string;
  emiMonth: string;
  emiScheduleId?: string;
  amount: number;
  emiDueAmount?: number;
  shortAmount?: number;
  carryForwardAmount?: number;
  collectedBy: string;
  collectedAt: string;
  remarks: string;
  status: CashStatus;
  requestMode?: 'cash' | 'manual_bank_qr';
  paymentReference?: string;
  createdById?: string;
  reviewedById?: string;
  reviewedAt?: string;
  createdAt?: string;
  paymentId?: string;
};

type StaffProfile = {
  id: string;
  fullName: string;
  email: string;
  role: 'admin' | 'sales';
  active: boolean;
  createdAt: string;
};

type ActivityLog = {
  id: string;
  text: string;
  createdAt: string;
};

type LogArchive = {
  id: string;
  archiveMonth: string;
  objectKey: string;
  storageProvider: string;
  activityCount: number;
  loginCount: number;
  sizeBytes: number;
  archivedAt: string;
};

type EmiItem = {
  id: string;
  applicationId: string;
  emiMonth: string;
  dueDate: string;
  amount: number;
  carryForwardAmount?: number;
  paidAmount?: number;
  status: EmiStatus;
};

type PaymentItem = {
  id: string;
  paymentId: string;
  applicationId: string;
  emiScheduleId: string | null;
  amount: number;
  mode: string;
  status: EmiStatus;
  reference: string;
  createdAt: string;
  createdById?: string;
  verifiedById?: string;
  verifiedAt?: string;
};

type LoanTermsInput = {
  productPrice: number;
  downPayment: number;
  loanAmount: number;
  chargeAmount: number;
  processingFee: number;
  tenure: number;
  emiAmount: number;
  dueDay: number;
};

type ForeclosureSettlementInput = {
  agreedSettlementAmount: number;
  productReturned: boolean;
  productReturnValue: number;
  notes: string;
};

type DisbursementInput = {
  disbursedAt: string;
  reference: string;
  notes: string;
};

type OfficePaymentInput = {
  application: Application;
  emi: EmiItem;
  amount: number;
  mode: 'cash' | 'manual_bank_qr';
  reference: string;
  remarks: string;
};

type ConfirmAction = {
  title: string;
  message: string;
  confirmLabel: string;
  tone?: 'danger' | 'warning' | 'success';
  details?: Array<[string, string]>;
  onConfirm: () => void;
};

type PaymentSettings = {
  manualBankQrEnabled: boolean;
  cashRequestEnabled: boolean;
  razorpayEnabled: boolean;
  bankAccountName: string;
  bankName: string;
  bankNotes: string;
};

type CustomerLoanPayload = {
  application: Application;
  emiSchedule: EmiItem[];
  payments: PaymentItem[];
  paymentSettings: PaymentSettings;
  customerSessionToken?: string;
};

type RazorpayCheckoutResponse = {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
};

type AdminDeviceGate =
  | { status: 'checking' }
  | { status: 'challenge'; challengeId: string; email: string; retryAfterSeconds: number }
  | { status: 'error'; message: string }
  | null;

const ADMIN_DEVICE_TOKEN_KEY = 'rfg-admin-trusted-device-v1';

type Draft = {
  customerName: string;
  mobile: string;
  alternateMobile: string;
  address: string;
  customerPincode: string;
  category: ProductCategory;
  productName: string;
  assetId: string;
  guarantorName: string;
  guarantorMobile: string;
  guarantorAddress: string;
  guarantorPincode: string;
  showroomName: string;
  showroomMobile: string;
  productPrice: string;
  downPayment: string;
  loanAmount: string;
  chargeAmount: string;
  processingFee: string;
  tenure: string;
  emiAmount: string;
  remarks: string;
  checklist: Checklist;
};

const GRACE_PERIOD_DAYS = 7;
const FIXED_EMI_PENALTY_AMOUNT = 496;

const salesNav = [
  { label: 'Dashboard' as View, icon: Gauge },
  { label: 'New Application' as View, icon: Plus },
  { label: 'Applications' as View, icon: FileClock },
  { label: 'Pending EMI' as View, icon: CalendarClock },
  { label: 'Payment Requests' as View, icon: Banknote },
  { label: 'Customers' as View, icon: UsersRound }
];

const adminNav = [
  { label: 'Admin Dashboard' as AdminView, icon: Gauge },
  { label: 'New Application' as AdminView, icon: Plus },
  { label: 'Applications Review' as AdminView, icon: FileClock },
  { label: 'Customers' as AdminView, icon: UsersRound },
  { label: 'Payments' as AdminView, icon: CreditCard },
  { label: 'Payment Verification' as AdminView, icon: Banknote },
  { label: 'Guarantors/Showrooms' as AdminView, icon: Store },
  { label: 'Reports' as AdminView, icon: WalletCards },
  { label: 'Activity Logs' as AdminView, icon: ClipboardCheck },
  { label: 'Staff Users' as AdminView, icon: UsersRound },
  { label: 'Settings' as AdminView, icon: ShieldCheck }
];

const emptyChecklist: Checklist = {
  aadhaar: false,
  pan: false,
  address: false,
  photo: false,
  signature: false,
  customerOtp: false,
  sellerConfirmed: false,
  sellerOtp: false,
  rc: false,
  insurance: false,
  serialChecked: false
};

const emptyDraft: Draft = {
  customerName: '',
  mobile: '',
  alternateMobile: '',
  address: '',
  customerPincode: '',
  category: 'Two-Wheeler',
  productName: '',
  assetId: '',
  guarantorName: '',
  guarantorMobile: '',
  guarantorAddress: '',
  guarantorPincode: '',
  showroomName: '',
  showroomMobile: '',
  productPrice: '',
  downPayment: '',
  loanAmount: '',
  chargeAmount: '',
  processingFee: '',
  tenure: '',
  emiAmount: '',
  remarks: '',
  checklist: emptyChecklist
};

const defaultPaymentSettings: PaymentSettings = {
  manualBankQrEnabled: true,
  cashRequestEnabled: true,
  razorpayEnabled: false,
  bankAccountName: '',
  bankName: '',
  bankNotes: 'Admin must verify the bank account before confirming payment.'
};

const RAZORPAY_FEE_RATE = 0.02;
const RAZORPAY_FEE_GST_RATE = 0.18;

const seedApplications: Application[] = [];
const seedCashRequests: CashRequest[] = [];

const previewStaffProfiles: StaffProfile[] = [
  {
    id: 'preview-admin',
    fullName: 'RFG Admin',
    email: 'info@rfg-financialgroup.com',
    role: 'admin',
    active: true,
    createdAt: '2026-06-05T09:00:00+05:30'
  },
  {
    id: 'preview-sales-1',
    fullName: 'Sales User 1',
    email: 'borotechsolution@gmail.com',
    role: 'sales',
    active: true,
    createdAt: '2026-06-05T09:15:00+05:30'
  },
  {
    id: 'preview-sales-2',
    fullName: 'Sales User 2',
    email: 'prakash8basu9@gmail.com',
    role: 'sales',
    active: true,
    createdAt: '2026-06-09T09:15:00+05:30'
  }
];

// The public website is served at "/" and the policy paths. Staff sign-in lives at "/staff".
// Auth callbacks (invite, password reset, Google sign-in) and local demo previews still reach the staff app
// from "/". Evaluated once per page load so the choice stays stable when Supabase clears the URL hash.
const showPublicSite = (() => {
  const params = new URLSearchParams(window.location.search);
  const path = window.location.pathname.replace(/\/+$/, '') || '/';
  const isAuthCallback = params.has('auth') || params.has('code') || params.has('app') || params.has('role') || params.has('demo')
    || /access_token|refresh_token|error_description|type=/.test(window.location.hash);
  const isPublic = !isAuthCallback && isPublicPath(path);
  if (!isPublic) document.title = path === '/customer' || path.startsWith('/customer/') ? 'RFG Customer' : 'RFG Staff Portal';
  return isPublic;
})();

function App() {
  if (showPublicSite) return <PublicSite />;
  const previewParams = new URLSearchParams(window.location.search);
  const appPreview = previewParams.get('app');
  const normalizedPath = window.location.pathname.replace(/\/+$/, '');
  const isCustomerRoute = normalizedPath === '/customer' || normalizedPath.startsWith('/customer/');
  if (appPreview === 'customer' || isCustomerRoute) return <CustomerApp />;

  const rolePreview = previewParams.get('role');
  const adminViewPreview = previewParams.get('view');
  const isLocalPreview = ['localhost', '127.0.0.1'].includes(window.location.hostname);
  const isRolePreview = isLocalPreview
    && previewParams.get('demo') === '1'
    && (rolePreview === 'admin' || rolePreview === 'sales');
  const [isLoading, setIsLoading] = useState(!isRolePreview);
  const [session, setSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState(isSupabaseConfigured);
  const [dataLoading, setDataLoading] = useState(false);
  const [userRole, setUserRole] = useState<'admin' | 'sales' | null>(() =>
    isRolePreview ? (rolePreview as 'admin' | 'sales') : null
  );
  const [activeAdminView, setActiveAdminView] = useState<AdminView>(() => {
    if (isLocalPreview && rolePreview === 'admin' && adminViewPreview === 'new-application') return 'New Application';
    if (isLocalPreview && rolePreview === 'admin' && adminViewPreview === 'applications') return 'Applications Review';
    if (isLocalPreview && rolePreview === 'admin' && adminViewPreview === 'customers') return 'Customers';
    if (isLocalPreview && rolePreview === 'admin' && adminViewPreview === 'payments') return 'Payments';
    if (isLocalPreview && rolePreview === 'admin' && adminViewPreview === 'reports') return 'Reports';
    if (isLocalPreview && rolePreview === 'admin' && adminViewPreview === 'staff') return 'Staff Users';
    if (isLocalPreview && rolePreview === 'admin' && adminViewPreview === 'settings') return 'Settings';
    if (isLocalPreview && rolePreview === 'admin' && adminViewPreview === 'activity') return 'Activity Logs';
    if (isLocalPreview && rolePreview === 'admin' && adminViewPreview === 'sellers') return 'Guarantors/Showrooms';
    if (isLocalPreview && rolePreview === 'admin' && adminViewPreview === 'bank') return 'Payment Verification';
    return 'Admin Dashboard';
  });
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeView, setActiveView] = useState<View>('Dashboard');
  const [salesApplicationStatusFilter, setSalesApplicationStatusFilter] = useState<LoanStatus | 'All'>('All');
  const [query, setQuery] = useState('');
  const [toast, setToast] = useState('');
  const [lastAuthNotice, setLastAuthNotice] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [applications, setApplications] = useState<Application[]>(seedApplications);
  const [cashRequests, setCashRequests] = useState<CashRequest[]>(seedCashRequests);
  const [staffProfiles, setStaffProfiles] = useState<StaffProfile[]>(() =>
    isRolePreview && rolePreview === 'admin' ? previewStaffProfiles : []
  );
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);
  const [logArchives, setLogArchives] = useState<LogArchive[]>([]);
  const [emiSchedule, setEmiSchedule] = useState<EmiItem[]>([]);
  const [payments, setPayments] = useState<PaymentItem[]>([]);
  const [paymentSettings, setPaymentSettings] = useState<PaymentSettings>(defaultPaymentSettings);
  const [currentProfile, setCurrentProfile] = useState<StaffProfile | null>(() =>
    isRolePreview && rolePreview === 'admin' ? previewStaffProfiles[0] : null
  );
  const [adminDeviceGate, setAdminDeviceGate] = useState<AdminDeviceGate>(null);
  const [passwordRecoveryActive, setPasswordRecoveryActive] = useState(
    () => previewParams.get('auth') === 'set-password'
  );

  useEffect(() => {
    window.localStorage.removeItem('rfg-sales-applications');
    window.localStorage.removeItem('rfg-cash-requests');
    window.localStorage.removeItem('rfg-sales-applications-clean');
    window.localStorage.removeItem('rfg-cash-requests-clean');
    window.localStorage.removeItem('rfg-guarantor-applications-v1');
    window.localStorage.removeItem('rfg-guarantor-cash-requests-v1');
  }, []);

  useEffect(() => {
    if (isRolePreview) return;
    const timer = window.setTimeout(() => setIsLoading(false), 700);
    return () => window.clearTimeout(timer);
  }, [isRolePreview]);

  useEffect(() => {
    if (isRolePreview) {
      setSession(null);
      setAuthLoading(false);
      return;
    }
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (!data.session) setAuthLoading(false);
    });
    const { data } = supabase.auth.onAuthStateChange((event, nextSession) => {
      setSession(nextSession);
      if (event === 'PASSWORD_RECOVERY') {
        setPasswordRecoveryActive(true);
        setAuthLoading(false);
        return;
      }
      if (nextSession) {
        if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') {
          setAuthLoading(true);
        }
        if (event === 'SIGNED_IN' && !isRolePreview) setUserRole(null);
      } else {
        setAuthLoading(false);
        if (!isRolePreview) setUserRole(null);
        setCurrentProfile(null);
        setAdminDeviceGate(null);
      }
    });
    return () => data.subscription.unsubscribe();
  }, [isRolePreview]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(''), 2800);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    const handler = (event: Event) => {
      const message = (event as CustomEvent<string>).detail;
      if (message) setToast(message);
    };
    window.addEventListener('rfg-toast', handler);
    return () => window.removeEventListener('rfg-toast', handler);
  }, []);

  useEffect(() => {
    if (!supabase || !session || isRolePreview || passwordRecoveryActive) return;
    setAuthLoading(true);
    void bootSession()
      .catch((error) => {
        showToast(`Could not open staff workspace: ${getErrorMessage(error)}`);
      })
      .finally(() => setAuthLoading(false));
  }, [session, isRolePreview, passwordRecoveryActive]);

  useEffect(() => {
    if (!supabase || !session || isRolePreview || userRole !== 'admin' || adminDeviceGate) return;

    const presenceClient = supabase;
    let lastActivityAt = Date.now();
    let heartbeatRunning = false;
    const noteActivity = () => { lastActivityAt = Date.now(); };
    const recordPresence = async () => {
      if (heartbeatRunning || document.visibilityState !== 'visible') return;
      if (Date.now() - lastActivityAt > 5 * 60 * 1000) return;
      heartbeatRunning = true;
      try {
        await presenceClient.rpc('record_admin_presence');
      } finally {
        heartbeatRunning = false;
      }
    };

    const activityEvents: Array<keyof WindowEventMap> = ['pointerdown', 'keydown', 'focus'];
    activityEvents.forEach((eventName) => window.addEventListener(eventName, noteActivity, { passive: true }));
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        noteActivity();
        void recordPresence();
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    void recordPresence();
    const timer = window.setInterval(() => void recordPresence(), 60_000);

    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      activityEvents.forEach((eventName) => window.removeEventListener(eventName, noteActivity));
    };
  }, [session, isRolePreview, userRole, adminDeviceGate]);

  const filteredApplications = useMemo(() => {
    const search = query.trim().toLowerCase();
    if (!search) return applications;
    return applications.filter((application) =>
      [
        application.id,
        application.customerName,
        application.mobile,
        application.assetId,
        application.productName,
        application.guarantorName,
        application.showroomName
      ]
        .join(' ')
        .toLowerCase()
        .includes(search)
    );
  }, [applications, query]);

  const selectedApplication = applications.find((application) => application.id === selectedId) || null;
  const salesApplicationsForView = salesApplicationStatusFilter === 'All'
    ? filteredApplications
    : filteredApplications.filter((application) => application.status === salesApplicationStatusFilter);
  const activeSalesCustomers = filteredApplications.filter((application) => application.status === 'Active');
  const salesProcessingAttention = applications.filter((application) => application.status === 'Under Processing').length;
  const salesEmiAttention = getPendingEmiRows(
    applications.filter((application) => application.status === 'Active'),
    emiSchedule
  ).filter(({ emi }) => isEmiDueWithinDays(emi, 7)).length;
  const salesAttentionCount = salesProcessingAttention + salesEmiAttention;

  const navigate = (view: View) => {
    if (view === 'Applications') setSalesApplicationStatusFilter('All');
    setActiveView(view);
    setSelectedId(null);
    setMenuOpen(false);
    if (view === 'New Application') setStep(0);
  };

  const openSalesApplications = (filter: LoanStatus | 'All') => {
    setSalesApplicationStatusFilter(filter);
    setActiveView('Applications');
    setSelectedId(null);
    setMenuOpen(false);
  };

  const showToast = (message: string) => {
    setToast(message);
    if (isErrorMessage(message)) setLastAuthNotice(message);
  };

  const handleSignOut = async () => {
    try {
      if (supabase) {
        const { error } = await supabase.auth.signOut();
        if (error) throw error;
      }
    } catch (error) {
      showToast(error instanceof Error ? `Could not sign out: ${error.message}` : 'Could not sign out. Please try again.');
      return;
    }

    setSession(null);
    setUserRole(null);
    setCurrentProfile(null);
    setAdminDeviceGate(null);
    setMenuOpen(false);
    setSelectedId(null);

    const loginUrl = new URL(window.location.href);
    loginUrl.searchParams.delete('role');
    loginUrl.searchParams.delete('view');
    window.location.replace(loginUrl.toString());
  };

  const bootSession = async () => {
    const role = await loadUserRole();
    if (role) await loadSupabaseData(role);
  };

  const getAdminDeviceLabel = () => {
    const platform = navigator.platform || 'Unknown device';
    return `${platform} browser`.slice(0, 120);
  };

  const startAdminDeviceVerification = async (): Promise<boolean> => {
    if (!supabase) return false;
    setAdminDeviceGate({ status: 'checking' });
    const deviceToken = window.localStorage.getItem(ADMIN_DEVICE_TOKEN_KEY) || undefined;
    const { data, error } = await supabase.functions.invoke('admin-device-start', {
      body: { deviceToken, deviceLabel: getAdminDeviceLabel() }
    });
    if (error) {
      setAdminDeviceGate({ status: 'error', message: 'We could not start device verification. Please try again.' });
      return false;
    }
    if (data?.status === 'verified') {
      setAdminDeviceGate(null);
      return true;
    }
    if (data?.status === 'challenge' && data.challengeId) {
      setAdminDeviceGate({
        status: 'challenge',
        challengeId: data.challengeId,
        email: data.email || 'your Admin email',
        retryAfterSeconds: Math.max(0, Number(data.retryAfterSeconds) || 0)
      });
      return false;
    }
    setAdminDeviceGate({ status: 'error', message: 'Device verification is unavailable. Please try again.' });
    return false;
  };

  const verifyAdminDeviceOtp = async (otp: string) => {
    if (!supabase || adminDeviceGate?.status !== 'challenge') return;
    const challenge = adminDeviceGate;
    const { data, error } = await supabase.functions.invoke('admin-device-verify', {
      body: { challengeId: challenge.challengeId, otp, deviceLabel: getAdminDeviceLabel() }
    });
    if (error) throw new Error('The code could not be checked. Please try again.');
    if (data?.status !== 'verified') {
      const remaining = Number(data?.attempts_remaining);
      if (data?.status === 'expired') throw new Error('This code has expired. Request a new code.');
      if (data?.status === 'locked') throw new Error('Too many incorrect attempts. Request a new code.');
      throw new Error(Number.isFinite(remaining)
        ? `Incorrect code. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining.`
        : 'Incorrect verification code.');
    }
    if (typeof data.deviceToken !== 'string') throw new Error('This device could not be trusted. Please try again.');
    window.localStorage.setItem(ADMIN_DEVICE_TOKEN_KEY, data.deviceToken);
    setAdminDeviceGate({ status: 'checking' });
    await bootSession();
  };

  const resendAdminDeviceOtp = async () => {
    const verified = await startAdminDeviceVerification();
    if (verified) await bootSession();
  };

  const loadUserRole = async (): Promise<'admin' | 'sales' | null> => {
    if (!supabase || !session) return null;
    if (isRolePreview) {
      const previewUserRole = rolePreview as 'admin' | 'sales';
      setUserRole(previewUserRole);
      return previewUserRole;
    }
    const { data, error } = await supabase
      .from('profiles')
      .select('id, full_name, email, role, active, created_at')
      .eq('id', session.user.id)
      .maybeSingle();
    if (error || !data?.active) {
      showToast(error ? 'Staff access could not be verified. Please sign in again or contact the administrator.' : 'This staff account is not active yet. Ask admin to approve it.');
      await supabase.auth.signOut();
      return null;
    }
    setCurrentProfile(mapStaffProfileFromSupabase(data));
    const role = data.role === 'admin' ? 'admin' : 'sales';
    if (role === 'admin' && !(await startAdminDeviceVerification())) return null;
    setUserRole(role);
    // Audit logging must never block an otherwise valid staff login.
    void writeLoginLog(role, true).catch((error) => {
      console.error('Could not write login audit event.', error);
    });
    return role;
  };

  const loadSupabaseData = async (roleOverride?: 'admin' | 'sales' | null) => {
    if (!supabase) return;
    const effectiveRole = roleOverride || userRole;
    setDataLoading(true);
    try {
      const baseApplicationColumns = `
        id,
        loan_id,
        customer_id,
        seller_id,
        showroom_id,
        customer_name,
        mobile,
        alternate_mobile,
        address,
        category,
        product_name,
        asset_id,
        seller_name,
        seller_mobile,
        showroom_name,
        showroom_mobile,
        product_price,
        down_payment,
        loan_amount,
        charge_amount,
        processing_fee,
        tenure,
        emi_amount,
        due_day,
        status,
        sales_person,
        login_id,
        remarks,
        created_by,
        approved_by,
        approved_at,
        closed_by,
        closed_at,
        created_at,
        updated_at,
        document_checklists(*)
      `;
      const disbursementColumns = `
        disbursed_by,
        disbursed_at,
        disbursement_reference,
        disbursement_notes,
      `;

      const extendedApplicationsResult = await supabase
        .from('loan_applications')
        .select(`${disbursementColumns}${baseApplicationColumns}`)
        .order('created_at', { ascending: false });
      let appRows = extendedApplicationsResult.data as Record<string, any>[] | null;
      let appsError = extendedApplicationsResult.error;

      if (appsError && isMissingDisbursementSchemaError(appsError)) {
        const fallback = await supabase
          .from('loan_applications')
          .select(baseApplicationColumns)
          .order('created_at', { ascending: false });
        appRows = fallback.data as Record<string, any>[] | null;
        appsError = fallback.error;
      }

      if (appsError) throw appsError;

      let foreclosureByApplicationId = new Map<string, ForeclosureSettlement>();
      if (effectiveRole === 'admin') {
        const { data: foreclosureRows, error: foreclosureError } = await supabase
          .from('loan_foreclosure_settlements')
          .select(`
            application_id,
            original_loan_amount,
            original_charge_amount,
            paid_before_foreclosure,
            agreed_settlement_amount,
            product_returned,
            product_return_value,
            settlement_notes,
            settled_by,
            settled_at
          `);
        if (foreclosureError) throw foreclosureError;
        foreclosureByApplicationId = new Map(
          (foreclosureRows || []).map((row) => [
            row.application_id,
            mapForeclosureSettlementFromSupabase(row)
          ])
        );
      }

      const mappedApplications = (appRows || []).map((row) => {
        const application = mapApplicationFromSupabase(row);
        return {
          ...application,
          foreclosureSettlement: application.supabaseId
            ? foreclosureByApplicationId.get(application.supabaseId)
            : undefined
        };
      });
      setApplications(mappedApplications.length ? mappedApplications : []);

      const { data: cashRows, error: cashError } = await supabase
        .from('cash_payment_requests')
        .select('*, loan_applications(customer_name, loan_id)')
        .order('created_at', { ascending: false });
      if (cashError) throw cashError;
      setCashRequests((cashRows || []).map(mapCashRequestFromSupabase));

      const { data: logRows } = await supabase
        .from('activity_logs')
        .select('id, action, details, created_at')
        .order('created_at', { ascending: false })
        .limit(80);
      setActivityLogs((logRows || []).map(mapActivityLogFromSupabase));

      if (effectiveRole === 'admin') {
        const { data: archiveRows, error: archiveError } = await supabase
          .from('log_archives')
          .select('id, archive_month, object_key, storage_provider, activity_count, login_count, size_bytes, archived_at')
          .order('archive_month', { ascending: false })
          .order('archived_at', { ascending: false });
        if (archiveError && !['42P01', 'PGRST205'].includes(archiveError.code || '')) throw archiveError;
        setLogArchives((archiveRows || []).map(mapLogArchiveFromSupabase));
      } else {
        setLogArchives([]);
      }

      const { data: profileRows } = await supabase
        .from('profiles')
        .select('id, full_name, email, role, active, created_at')
        .order('created_at', { ascending: false });
      setStaffProfiles((profileRows || []).map(mapStaffProfileFromSupabase));

      const { data: emiRows, error: emiError } = await supabase
        .from('emi_schedule')
        .select('*')
        .order('due_date', { ascending: true });
      if (emiError) throw emiError;
      setEmiSchedule((emiRows || []).map(mapEmiFromSupabase));

      const { data: paymentRows, error: paymentsError } = await supabase
        .from('payments')
        .select('id, payment_id, application_id, emi_schedule_id, amount, mode, status, reference, created_by, verified_by, verified_at, created_at')
        .order('created_at', { ascending: false });
      if (paymentsError) throw paymentsError;
      setPayments((paymentRows || []).map(mapPaymentFromSupabase));

      const { data: settingsRow, error: settingsError } = await supabase
        .from('payment_settings')
        .select('manual_bank_qr_enabled, cash_request_enabled, razorpay_enabled, bank_account_name, bank_name, bank_notes')
        .eq('id', true)
        .maybeSingle();
      if (settingsError) throw settingsError;
      if (settingsRow) setPaymentSettings(mapPaymentSettingsFromSupabase(settingsRow));
    } catch (error) {
      showToast(`Supabase setup needed: ${getErrorMessage(error)}`);
    } finally {
      setDataLoading(false);
    }
  };

  const writeLoginLog = async (role: 'admin' | 'sales', success: boolean) => {
    if (!supabase || !session) return;
    if (!role || !success) return;
    await supabase.rpc('record_login_event', {
      p_user_agent: navigator.userAgent
    });
  };

  const createApplication = () => {
    const error = getStepError(5, draft);
    if (error) {
      showToast(error);
      return;
    }

    const normalizedMobile = draft.mobile.replace(/\D/g, '');
    const existingOpenLoan = applications.find((application) =>
      application.mobile.replace(/\D/g, '') === normalizedMobile
      && ['Under Processing', 'Approved', 'Active'].includes(application.status)
    );
    if (existingOpenLoan) {
      showToast(`This mobile number already has an open loan (${existingOpenLoan.id}). A new application can be created after it is closed.`);
      return;
    }

    const id = nextLoanId(applications.length);
    const newApplication: Application = {
      id,
      customerName: draft.customerName.trim(),
      mobile: draft.mobile.trim(),
      alternateMobile: draft.alternateMobile.trim(),
      address: draft.address.trim(),
      customerPincode: draft.customerPincode.trim(),
      category: draft.category,
      productName: draft.productName.trim() || draft.category,
      assetId: draft.assetId.trim(),
      guarantorName: draft.guarantorName.trim(),
      guarantorMobile: draft.guarantorMobile.trim(),
      guarantorAddress: draft.guarantorAddress.trim(),
      guarantorPincode: draft.guarantorPincode.trim(),
      showroomName: draft.showroomName.trim(),
      showroomMobile: draft.showroomMobile.trim(),
      productPrice: toNumber(draft.productPrice),
      downPayment: toNumber(draft.downPayment),
      loanAmount: toNumber(draft.loanAmount),
      chargeAmount: toNumber(draft.chargeAmount),
      processingFee: toNumber(draft.processingFee),
      tenure: toNumber(draft.tenure),
      emiAmount: toNumber(draft.emiAmount),
      dueDay: new Date().getDate(),
      status: 'Under Processing',
      salesPerson: currentProfile?.fullName || 'Sales User',
      date: 'Today',
      loginId: id,
      customerPassword: generatePin(),
      checklist: draft.checklist,
      remarks: draft.remarks.trim() || 'No additional remarks.',
      activity: ['Application created by Sales User', 'Customer login generated']
    };

    if (supabase && session) {
      void saveApplicationToSupabase(newApplication);
      return;
    }

    setApplications([newApplication, ...applications]);
    setDraft(emptyDraft);
    setStep(0);
    if (userRole === 'admin') setActiveAdminView('Applications Review');
    else setActiveView('Applications');
    setSelectedId(newApplication.id);
    showToast(userRole === 'admin'
      ? `Application created. Customer MPIN: ${newApplication.customerPassword}`
      : 'Application created and sent for admin review.');
  };

  const saveApplicationToSupabase = async (newApplication: Application) => {
    if (!supabase) return;
    try {
      const { data, error } = await supabase.rpc('create_loan_application', {
        p_application: {
          customer_name: newApplication.customerName,
          mobile: newApplication.mobile,
          alternate_mobile: newApplication.alternateMobile,
          address: newApplication.address,
          category: mapProductCategoryToDb(newApplication.category),
          product_name: newApplication.productName,
          asset_id: newApplication.assetId,
          seller_name: newApplication.guarantorName,
          seller_mobile: newApplication.guarantorMobile,
          showroom_name: newApplication.showroomName,
          showroom_mobile: newApplication.showroomMobile,
          product_price: newApplication.productPrice,
          down_payment: newApplication.downPayment,
          loan_amount: newApplication.loanAmount,
          charge_amount: newApplication.chargeAmount,
          tenure: newApplication.tenure,
          emi_amount: newApplication.emiAmount,
          due_day: newApplication.dueDay,
          remarks: serializeApplicationRemarks(newApplication)
        },
        p_checklist: mapChecklistToSupabase(newApplication.checklist),
        p_plain_mpin: newApplication.customerPassword
      });
      if (error) throw error;

      const result = data as { loan_id?: string; login_id?: string } | null;
      const createdLoanId = result?.loan_id;
      if (!createdLoanId) throw new Error('Supabase did not return the new Loan ID.');

      await loadSupabaseData();
      setDraft(emptyDraft);
      setStep(0);
      if (userRole === 'admin') setActiveAdminView('Applications Review');
      else setActiveView('Applications');
      setSelectedId(createdLoanId);
      showToast(userRole === 'admin'
        ? `Application ${createdLoanId} created. Customer MPIN: ${newApplication.customerPassword}`
        : `Application ${createdLoanId} created and sent for admin review.`);
    } catch (error) {
      showToast(`Could not save application: ${getErrorMessage(error)}`);
    }
  };

  const resetPassword = (applicationId: string) => {
    if (userRole !== 'admin' && userRole !== 'sales') {
      showToast('Your account cannot reset customer MPINs.');
      return;
    }
    const application = applications.find((item) => item.id === applicationId);
    if (!application || application.status !== 'Active') {
      showToast('MPIN can be reset only after the loan is active.');
      return;
    }
    const newPin = generatePin();
    if (supabase && session) {
      void resetPasswordInSupabase(applicationId, newPin);
      return;
    }

    setApplications(
      applications.map((application) =>
        application.id === applicationId
          ? {
              ...application,
              customerPassword: newPin,
              activity: [`Customer MPIN reset by ${userRole === 'admin' ? 'administrator' : 'sales staff'}`, ...application.activity]
            }
          : application
      )
    );
    showToast(`Customer MPIN reset to ${newPin}. Share only after offline verification.`);
  };

  const resetPasswordInSupabase = async (applicationId: string, newPin: string) => {
    if (!supabase) return;
    try {
      const application = applications.find((item) => item.id === applicationId);
      if (!application) throw new Error('Application not found.');
      const { error } = await supabase.rpc('reset_customer_mpin', {
        p_loan_id: applicationId,
        p_plain_mpin: newPin
      });
      if (error) throw error;
      await loadSupabaseData();
      setApplications((current) => current.map((item) => item.id === applicationId
        ? { ...item, customerPassword: newPin }
        : item));
      showToast(`Customer MPIN reset to ${newPin}. Share only after offline verification.`);
    } catch (error) {
      showToast(`Could not reset MPIN: ${getErrorMessage(error)}`);
    }
  };

  const confirmSeller = (applicationId: string) => {
    if (supabase && session) {
      void confirmSellerInSupabase(applicationId);
      return;
    }

    setApplications(
      applications.map((application) =>
        application.id === applicationId
          ? {
              ...application,
              checklist: {
                ...application.checklist,
                sellerConfirmed: true
              },
              activity: ['Guarantor marked confirmed by Sales User', ...application.activity]
            }
          : application
      )
    );
    showToast('Guarantor confirmation saved.');
  };

  const confirmSellerInSupabase = async (applicationId: string) => {
    if (!supabase) return;
    try {
      const application = applications.find((item) => item.id === applicationId);
      if (!application) throw new Error('Application not found.');
      const { error } = await supabase.rpc('confirm_seller_for_application', {
        p_loan_id: applicationId
      });
      if (error) throw error;
      await loadSupabaseData();
      showToast('Guarantor confirmation saved.');
    } catch (error) {
      showToast(`Could not confirm guarantor: ${getErrorMessage(error)}`);
    }
  };

  const createCashRequest = (
    application: Application,
    amount: number,
    selectedEmi: EmiItem,
    remarks: string,
    requestMode: 'cash' | 'manual_bank_qr',
    paymentReference: string
  ) => {
    if (application.status !== 'Active') {
      showToast('Payment requests start only after admin confirms disbursement and marks the loan active.');
      return;
    }
    const eligibleEmis = getPaymentEligibleEmis(getRenderableEmiSchedule(application, emiSchedule));
    if (!eligibleEmis.some((item) => item.id === selectedEmi.id)) {
      showToast('This installment is locked. Pay an open installment first or wait until its month begins.');
      return;
    }
    const emiDueAmount = getEmiPayableAmount(selectedEmi);
    if (amount <= 0) {
      showToast('Enter the amount received from the customer.');
      return;
    }
    if (amount > emiDueAmount) {
      showToast(`Received amount cannot be more than this EMI due amount: ${money(emiDueAmount)}.`);
      return;
    }
    if (requestMode === 'manual_bank_qr' && !paymentReference.trim()) {
      showToast('Enter the UTR or transaction ID for Bank Transfer / QR.');
      return;
    }
    const shortAmount = Math.max(emiDueAmount - amount, 0);

    const request: CashRequest = {
      id: `CR-${Math.floor(1000 + Math.random() * 8999)}`,
      applicationId: application.id,
      customerName: application.customerName,
      emiMonth: selectedEmi.emiMonth,
      emiScheduleId: selectedEmi.id,
      amount,
      emiDueAmount,
      shortAmount,
      carryForwardAmount: selectedEmi.carryForwardAmount || 0,
      collectedBy: 'Sales User',
      collectedAt: 'Today',
      remarks,
      requestMode,
      paymentReference: paymentReference.trim(),
      status: 'Verification Pending'
    };
    if (supabase && session) {
      void saveCashRequestToSupabase(application, request);
      return;
    }

    setCashRequests([request, ...cashRequests]);
    showToast('Payment request submitted. Admin must verify it before the EMI becomes paid.');
    setActiveView('Payment Requests');
    setSelectedId(null);
  };

  const saveCashRequestToSupabase = async (application: Application, request: CashRequest) => {
    if (!supabase) return;
    try {
      if (!application.supabaseId) throw new Error('This application is not linked to Supabase.');
      if (!request.emiScheduleId) throw new Error('Select a pending EMI from the generated schedule.');
      if (request.amount <= 0) throw new Error('Enter the amount received from the customer.');

      const storedRemarks = serializePaymentRequestRemarks(
        request.requestMode || 'cash',
        request.paymentReference || '',
        request.remarks
      );

      const { error } = await supabase.rpc('submit_cash_payment_request', {
        p_application_id: application.supabaseId,
        p_emi_schedule_id: request.emiScheduleId,
        p_remarks: storedRemarks,
        p_mode: request.requestMode || 'cash',
        p_amount: request.amount
      });
      if (error) throw error;
      await loadSupabaseData();
      showToast('Payment request submitted. Admin must verify it before the EMI becomes paid.');
      setActiveView('Payment Requests');
      setSelectedId(null);
    } catch (error) {
      showToast(`Could not submit payment request: ${getErrorMessage(error)}`);
    }
  };

  const recordAdminOfficePayment = async (input: OfficePaymentInput) => {
    const { application, emi, amount, mode, reference, remarks } = input;
    const payableAmount = getEmiPayableAmount(emi);
    if (application.status !== 'Active') throw new Error('Only active loans can receive payments.');
    if (!applicationScheduleKeys(application).includes(emi.applicationId)) {
      throw new Error('The selected EMI does not belong to this customer loan. Select the loan again.');
    }
    if (!getPaymentEligibleEmis(getRenderableEmiSchedule(application, emiSchedule)).some((item) => item.id === emi.id)) {
      throw new Error('This installment is locked. Confirm an open installment first or wait until its month begins.');
    }
    if (amount <= 0 || amount > payableAmount) {
      throw new Error(`Enter an amount between Rs 1 and ${money(payableAmount)}.`);
    }
    if (mode === 'manual_bank_qr' && !reference.trim()) {
      throw new Error('Enter the UTR or transaction ID for Bank Transfer / QR.');
    }

    const storedRemarks = serializePaymentRequestRemarks(mode, reference.trim(), remarks.trim());
    if (supabase && session) {
      if (!application.supabaseId) throw new Error('This application is not linked to Supabase.');
      const { data: submitted, error: submitError } = await supabase.rpc('submit_cash_payment_request', {
        p_application_id: application.supabaseId,
        p_emi_schedule_id: emi.id,
        p_remarks: storedRemarks,
        p_mode: mode,
        p_amount: amount
      });
      if (submitError) throw submitError;
      const requestId = (submitted as { request_id?: string } | null)?.request_id;
      if (!requestId) throw new Error('The payment request ID was not returned by Supabase.');

      const { error: reviewError } = await supabase.rpc('review_payment_request', {
        p_request_id: requestId,
        p_decision: 'approved'
      });
      if (reviewError) throw reviewError;
      await loadSupabaseData();
      showToast(`${mode === 'cash' ? 'Cash' : 'Bank Transfer / QR'} payment confirmed and added to the ledger.`);
      return;
    }

    const requestId = `CR-${Math.floor(1000 + Math.random() * 8999)}`;
    const shortAmount = Math.max(payableAmount - amount, 0);
    const now = new Date().toISOString();
    setCashRequests((current) => [{
      id: requestId,
      applicationId: application.id,
      customerName: application.customerName,
      emiMonth: emi.emiMonth,
      emiScheduleId: emi.id,
      amount,
      emiDueAmount: payableAmount,
      shortAmount,
      carryForwardAmount: emi.carryForwardAmount || 0,
      collectedBy: currentProfile?.fullName || 'Admin User',
      collectedAt: now,
      remarks,
      requestMode: mode,
      paymentReference: reference.trim(),
      status: 'Approved',
      reviewedAt: now
    }, ...current]);
    setPayments((current) => [{
      id: `preview-${Date.now()}`,
      paymentId: `PAY-${Date.now()}`,
      applicationId: application.supabaseId || application.id,
      emiScheduleId: emi.id,
      amount,
      mode,
      status: shortAmount > 0 ? 'Part Paid' : 'Paid',
      reference: requestId,
      createdAt: now,
      verifiedAt: now
    }, ...current]);
    setEmiSchedule((current) => {
      const nextEmi = [...current]
        .filter((item) => item.applicationId === emi.applicationId && item.dueDate > emi.dueDate && ['Pending', 'Overdue'].includes(item.status))
        .sort((left, right) => left.dueDate.localeCompare(right.dueDate))[0];
      return current.map((item) => {
        if (item.id === emi.id) return { ...item, status: 'Paid', paidAmount: amount };
        if (nextEmi && item.id === nextEmi.id && shortAmount > 0) {
          return { ...item, carryForwardAmount: (item.carryForwardAmount || 0) + shortAmount };
        }
        return item;
      });
    });
    showToast(`${mode === 'cash' ? 'Cash' : 'Bank Transfer / QR'} payment confirmed and added to the ledger.`);
  };

  const updateApplicationStatus = (applicationId: string, status: LoanStatus, activityLabel?: string) => {
    if (supabase && session) {
      void updateApplicationStatusInSupabase(applicationId, status);
      return;
    }

    setApplications((current) =>
      current.map((application) =>
        application.id === applicationId
          ? {
              ...application,
              status,
              activity: [activityLabel || `Admin marked loan ${status}`, ...application.activity]
            }
          : application
      )
    );
    showToast(activityLabel || `Application marked ${status}.`);
  };

  const activateLoan = async (applicationId: string, disbursement: DisbursementInput) => {
    if (supabase && session) {
      await activateLoanInSupabase(applicationId, disbursement);
      return;
    }

    const application = applications.find((item) => item.id === applicationId);
    if (!application) {
      showToast('Application not found.');
      return;
    }

    const disbursedAt = new Date(disbursement.disbursedAt);
    if (Number.isNaN(disbursedAt.getTime())) {
      showToast('Enter a valid disbursement date and time.');
      return;
    }

    setApplications((current) =>
      current.map((item) =>
        item.id === applicationId
          ? {
              ...item,
              status: 'Active',
              dueDay: disbursedAt.getDate(),
              disbursedAt: disbursedAt.toISOString(),
              disbursementReference: disbursement.reference.trim(),
              disbursementNotes: disbursement.notes.trim(),
              activity: [`Admin confirmed disbursement on ${formatDateTime(disbursedAt.toISOString())}`, ...item.activity]
            }
          : item
      )
    );
    const scheduleKeys = new Set(applicationScheduleKeys(application));
    setEmiSchedule((current) => [
      ...current.filter((item) => !scheduleKeys.has(item.applicationId)),
      ...buildEmiSchedule(application, disbursedAt)
    ]);
    showToast('Disbursement confirmed. Loan activated and EMI schedule generated.');
  };

  const activateLoanInSupabase = async (applicationId: string, disbursement: DisbursementInput) => {
    if (!supabase) return;
    try {
      const disbursedAt = new Date(disbursement.disbursedAt);
      if (Number.isNaN(disbursedAt.getTime())) throw new Error('Enter a valid disbursement date and time.');
      if (disbursedAt.getTime() > Date.now() + 5 * 60 * 1000) throw new Error('Disbursement time cannot be in the future.');

      const { error } = await supabase.rpc('activate_loan_after_disbursement', {
        p_loan_id: applicationId,
        p_disbursed_at: disbursedAt.toISOString(),
        p_reference: disbursement.reference.trim() || null,
        p_notes: disbursement.notes.trim() || null
      });
      if (error) throw error;

      await loadSupabaseData();
      showToast('Disbursement confirmed. Loan activated and EMI schedule generated.');
    } catch (error) {
      showToast(`Could not activate loan: ${getErrorMessage(error)}`);
      throw error;
    }
  };

  const updateApplicationStatusInSupabase = async (applicationId: string, status: LoanStatus) => {
    if (!supabase) return;
    try {
      const application = applications.find((item) => item.id === applicationId);
      if (!application) throw new Error('Application not found.');
      const { error } = await supabase.rpc('set_loan_status', {
        p_loan_id: applicationId,
        p_status: mapLoanStatusToDb(status)
      });
      if (error) throw error;

      await loadSupabaseData();
      showToast(`Application marked ${status}.`);
    } catch (error) {
      showToast(`Could not update application: ${getErrorMessage(error)}`);
    }
  };

  const updateCashRequestStatus = (requestId: string, status: CashStatus) => {
    if (supabase && session) {
      void updateCashRequestStatusInSupabase(requestId, status);
      return;
    }

    const request = cashRequests.find((item) => item.id === requestId);
    setCashRequests((current) => current.map((item) => (item.id === requestId ? { ...item, status } : item)));
    if (request) {
      const application = applications.find((item) => item.id === request.applicationId);
      const applicationKey = application?.supabaseId || application?.id || request.applicationId;
      setEmiSchedule((current) => {
        const targetIndex = current.findIndex((item) => item.applicationId === applicationKey && item.emiMonth === request.emiMonth);
        if (targetIndex < 0) return current;
        const target = current[targetIndex];
        if (status === 'Rejected') {
          return current.map((item, index) => (index === targetIndex ? { ...item, status: 'Pending' } : item));
        }
        const dueAmount = request.emiDueAmount || getEmiPayableAmount(target);
        const shortAmount = Math.max(dueAmount - request.amount, 0);
        const nextIndex = current.findIndex((item, index) =>
          index > targetIndex &&
          item.applicationId === applicationKey &&
          !isEmiSettledForSequence(item)
        );
        return current.map((item, index) => {
          if (index === targetIndex) {
            return {
              ...item,
              status: shortAmount > 0 ? 'Part Paid' : 'Paid',
              paidAmount: (item.paidAmount || 0) + request.amount
            };
          }
          if (shortAmount > 0 && index === nextIndex) {
            return {
              ...item,
              carryForwardAmount: (item.carryForwardAmount || 0) + shortAmount
            };
          }
          return item;
        });
      });
      if (status === 'Approved') {
        setPayments((current) => [
          {
            id: crypto.randomUUID(),
            paymentId: `PAY-${Date.now()}`,
            applicationId: applicationKey,
            emiScheduleId: null,
            amount: request.amount,
            mode: request.requestMode || 'cash',
            status: (request.shortAmount || 0) > 0 ? 'Part Paid' : 'Paid',
            reference: request.id,
            createdAt: new Date().toISOString(),
            verifiedAt: new Date().toISOString()
          },
          ...current
        ]);
      }
    }
    showToast(status === 'Approved' ? 'Payment confirmed. Short amount, if any, moved to next EMI.' : 'Payment request rejected.');
  };

  const updateCashRequestStatusInSupabase = async (requestId: string, status: CashStatus) => {
    if (!supabase) return;
    try {
      const request = cashRequests.find((item) => item.id === requestId);
      if (!request) throw new Error('Payment request not found.');
      const { error } = await supabase.rpc('review_payment_request', {
        p_request_id: requestId,
        p_decision: mapCashStatusToDb(status)
      });
      if (error) throw error;

      await loadSupabaseData();
      showToast(status === 'Approved' ? 'Payment confirmed. Any short balance was moved to the next EMI.' : 'Payment request rejected.');
    } catch (error) {
      showToast(`Could not update payment request: ${getErrorMessage(error)}`);
    }
  };

  const updateStaffProfile = async (profileId: string, changes: Partial<Pick<StaffProfile, 'active' | 'role'>>) => {
    if (!supabase) return;
    try {
      if (changes.role) throw new Error('Staff roles are fixed after account creation.');
      if (typeof changes.active !== 'boolean') throw new Error('Choose an access status.');
      const { error } = await supabase.rpc('admin_set_staff_access', {
        p_profile_id: profileId,
        p_active: changes.active
      });
      if (error) throw error;
      await loadSupabaseData();
      showToast('Staff access updated.');
    } catch (error) {
      showToast(`Could not update staff: ${getErrorMessage(error)}`);
    }
  };

  const inviteSalesStaff = async (input: { fullName: string; email: string; active: boolean }) => {
    if (!supabase || !session) throw new Error('Admin session is unavailable.');
    const { data, error } = await supabase.functions.invoke('admin-staff-invite', { body: input });
    if (error) throw new Error(data?.error || getErrorMessage(error));
    if (!data?.ok) throw new Error(data?.error || 'Staff invitation could not be sent.');
    await loadSupabaseData('admin');
    showToast('Sales invitation sent. The staff member can now create their password.');
  };

  const sendSalesPasswordReset = async (profileId: string) => {
    if (!supabase || !session) throw new Error('Admin session is unavailable.');
    const { data, error } = await supabase.functions.invoke('admin-staff-reset', { body: { profileId } });
    if (error) throw new Error(data?.error || getErrorMessage(error));
    if (!data?.ok) throw new Error(data?.error || 'Password reset email could not be sent.');
    showToast('Password setup/reset link sent to the Sales email.');
  };

  const updateLoanTerms = async (applicationId: string, terms: LoanTermsInput, reason: string) => {
    if (!supabase) {
      setApplications((current) =>
        current.map((application) => application.id === applicationId ? { ...application, ...terms } : application)
      );
      showToast('Loan terms updated.');
      return;
    }

    try {
      const { error } = await supabase.rpc('admin_update_loan_terms', {
        p_loan_id: applicationId,
        p_terms: {
          product_price: terms.productPrice,
          down_payment: terms.downPayment,
          loan_amount: terms.loanAmount,
          charge_amount: terms.chargeAmount,
          processing_fee: terms.processingFee,
          tenure: terms.tenure,
          emi_amount: terms.emiAmount,
          due_day: terms.dueDay
        },
        p_reason: reason
      });
      if (error) throw error;
      await loadSupabaseData();
      showToast('Loan terms updated and recorded in activity.');
    } catch (error) {
      showToast(`Could not update loan terms: ${getErrorMessage(error)}`);
      throw error;
    }
  };

  const forecloseLoan = async (applicationId: string, settlement: ForeclosureSettlementInput) => {
    if (!supabase) {
      setApplications((current) => current.map((application) => application.id === applicationId
        ? {
            ...application,
            status: 'Closed',
            foreclosureSettlement: {
              originalLoanAmount: application.loanAmount,
              originalChargeAmount: application.chargeAmount,
              paidBeforeForeclosure: 0,
              agreedSettlementAmount: settlement.agreedSettlementAmount,
              productReturned: settlement.productReturned,
              productReturnValue: settlement.productReturned ? settlement.productReturnValue : 0,
              notes: settlement.notes,
              settledBy: 'Admin User',
              settledAt: new Date().toISOString()
            },
            activity: [`Loan foreclosed for ${money(settlement.agreedSettlementAmount)}: ${settlement.notes}`, ...application.activity]
          }
        : application));
      showToast('Foreclosure settlement recorded. Loan closed.');
      return;
    }

    try {
      const { error } = await supabase.rpc('admin_foreclose_loan', {
        p_loan_id: applicationId,
        p_agreed_settlement_amount: settlement.agreedSettlementAmount,
        p_product_returned: settlement.productReturned,
        p_product_return_value: settlement.productReturned ? settlement.productReturnValue : 0,
        p_notes: settlement.notes
      });
      if (error) throw error;
      await loadSupabaseData();
      showToast('Foreclosure settlement recorded. Loan closed.');
    } catch (error) {
      showToast(`Could not foreclose loan: ${getErrorMessage(error)}`);
      throw error;
    }
  };

  const savePaymentSettings = async (settings: PaymentSettings) => {
    if (!supabase) {
      setPaymentSettings(settings);
      showToast('Payment settings saved.');
      return;
    }

    try {
      const { error } = await supabase.rpc('admin_update_payment_settings', {
        p_manual_bank_qr_enabled: settings.manualBankQrEnabled,
        p_cash_request_enabled: settings.cashRequestEnabled,
        p_razorpay_enabled: settings.razorpayEnabled,
        p_bank_account_name: settings.bankAccountName,
        p_bank_name: settings.bankName,
        p_bank_notes: settings.bankNotes
      });
      if (error) throw error;
      await loadSupabaseData();
      showToast('Payment settings saved.');
    } catch (error) {
      showToast(`Could not save payment settings: ${getErrorMessage(error)}`);
      throw error;
    }
  };

  if (isLoading) return <LoadingScreen />;
  if (isSupabaseConfigured && passwordRecoveryActive && session && !isRolePreview) {
    return (
      <PasswordRecoveryScreen
        onCancel={() => void handleSignOut()}
        onComplete={async () => {
          setPasswordRecoveryActive(false);
          await handleSignOut();
        }}
      />
    );
  }
  if (authLoading && !isRolePreview) return <LoadingScreen />;
  if (isSupabaseConfigured && !session && !isRolePreview) {
    return (
      <>
        {toast && <div className="toast">{toast}</div>}
        <AuthScreen
          onMessage={showToast}
          initialError={lastAuthNotice}
          onAuthenticated={(authenticatedSession) => {
            setAuthLoading(true);
            setSession(authenticatedSession);
          }}
        />
      </>
    );
  }
  if (isSupabaseConfigured && session && adminDeviceGate && !isRolePreview) {
    return (
      <AdminDeviceVerificationScreen
        gate={adminDeviceGate}
        onVerify={verifyAdminDeviceOtp}
        onResend={resendAdminDeviceOtp}
        onSignOut={() => void handleSignOut()}
      />
    );
  }
  if (isSupabaseConfigured && session && !userRole && !isRolePreview) return <LoadingScreen />;

  if (userRole === 'admin') {
    const navigateAdmin = (view: AdminView) => {
      setActiveAdminView(view);
      setMenuOpen(false);

      if (isLocalPreview) {
        const viewParam: Partial<Record<AdminView, string>> = {
          'Admin Dashboard': 'dashboard',
          'New Application': 'new-application',
          'Applications Review': 'applications',
          Customers: 'customers',
          Payments: 'payments',
          'Payment Verification': 'bank',
          'Guarantors/Showrooms': 'sellers',
          Reports: 'reports',
          'Activity Logs': 'activity',
          'Staff Users': 'staff',
          Settings: 'settings'
        };
        const nextUrl = new URL(window.location.href);
        nextUrl.searchParams.set('role', 'admin');
        nextUrl.searchParams.set('view', viewParam[view] || 'dashboard');
        window.history.replaceState({}, '', nextUrl);
      }
    };

    return (
      <AdminPanel
        activeView={activeAdminView}
        applications={applications}
        cashRequests={cashRequests}
        emiSchedule={emiSchedule}
        payments={payments}
        staffProfiles={staffProfiles}
        activityLogs={activityLogs}
        logArchives={logArchives}
        currentProfileId={currentProfile?.id || null}
        menuOpen={menuOpen}
        navigate={navigateAdmin}
        onApprove={(id) => updateApplicationStatus(id, 'Approved')}
        onReject={(id) => updateApplicationStatus(id, 'Rejected')}
        onActivate={activateLoan}
        onClose={(id) => updateApplicationStatus(id, 'Closed')}
        onForeclose={forecloseLoan}
        onCashApprove={(id) => updateCashRequestStatus(id, 'Approved')}
        onCashReject={(id) => updateCashRequestStatus(id, 'Rejected')}
        onResetPassword={resetPassword}
        onUpdateLoanTerms={updateLoanTerms}
        paymentSettings={paymentSettings}
        onSavePaymentSettings={savePaymentSettings}
        onMenuOpen={() => setMenuOpen(true)}
        onMenuClose={() => setMenuOpen(false)}
        onSignOut={() => void handleSignOut()}
        showToast={showToast}
        onStaffUpdate={updateStaffProfile}
        onStaffInvite={inviteSalesStaff}
        onStaffPasswordReset={sendSalesPasswordReset}
        toast={toast}
        draft={draft}
        setDraft={setDraft}
        applicationStep={step}
        setApplicationStep={setStep}
        onCreateApplication={createApplication}
        onRecordOfficePayment={recordAdminOfficePayment}
      />
    );
  }

  return (
    <div className="app-shell">
      {toast && <div className="toast">{toast}</div>}
      <aside className={`sidebar ${menuOpen ? 'open' : ''}`}>
        <div className="brand">
          <img src="./rfg-logo.png" alt="RFG Financial" />
          <div>
            <strong>RFG Sales</strong>
            <span>Simple Loan Desk</span>
          </div>
          <button className="icon-button close-menu" onClick={() => setMenuOpen(false)} aria-label="Close menu">
            <X size={18} />
          </button>
        </div>

        <nav className="nav-list" aria-label="Sales navigation">
          {salesNav.map((item) => (
            <button
              className={item.label === activeView ? 'nav-item active' : 'nav-item'}
              key={item.label}
              onClick={() => navigate(item.label)}
            >
              <item.icon size={18} />
              <span>{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="sidebar-card">
          <ShieldCheck size={20} />
          <strong>Sales access</strong>
          <p>Create applications and payment requests. Admin approves loans and verifies payments.</p>
        </div>
      </aside>

      <main className="main-panel">
        <header className="topbar">
          <button className="icon-button mobile-menu" onClick={() => setMenuOpen(true)} aria-label="Open menu">
            <Menu size={20} />
          </button>
          <div className="top-logo">
            <img src="./rfg-logo.png" alt="RFG Financial" />
          </div>
          <div className="search-wrap">
            <Search size={18} />
            <input
              aria-label="Search applications"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search Loan ID, customer, mobile, vehicle number, IMEI"
            />
          </div>
          <button
            className="icon-button notification-button"
            aria-label={salesAttentionCount ? `${salesAttentionCount} items need attention` : 'No items need attention'}
            title={salesAttentionCount ? `${salesAttentionCount} items need attention` : 'No items need attention'}
            onClick={() => {
              if (salesEmiAttention > 0) navigate('Pending EMI');
              else if (salesProcessingAttention > 0) openSalesApplications('Under Processing');
              else showToast('No items need attention right now.');
            }}
          >
            <Bell size={19} />
            {salesAttentionCount > 0 && <span className="notification-count">{formatAttentionCount(salesAttentionCount)}</span>}
          </button>
          <AccountMenu label="Sales User" onSignOut={() => void handleSignOut()} />
        </header>

        <nav className="mobile-tabs" aria-label="Mobile sales navigation">
          {salesNav.map((item) => (
            <button className={item.label === activeView ? 'active' : ''} key={item.label} onClick={() => navigate(item.label)}>
              <item.icon size={17} />
              <span>{mobileNavLabel(item.label)}</span>
            </button>
          ))}
        </nav>

        {selectedApplication ? (
          <ApplicationDetail
            application={selectedApplication}
            emiSchedule={getApplicationEmis(selectedApplication, emiSchedule)}
            onBack={() => setSelectedId(null)}
            onResetPassword={resetPassword}
            onConfirmSeller={confirmSeller}
            onCreateCashRequest={createCashRequest}
          />
        ) : (
          <>
            {dataLoading && <div className="inline-notice">Loading latest Supabase data...</div>}
            {activeView === 'Dashboard' && (
              <Dashboard
                applications={filteredApplications}
                cashRequests={cashRequests}
                emiSchedule={emiSchedule}
                payments={payments}
                onNavigate={navigate}
                onOpenApplications={openSalesApplications}
                onSelect={setSelectedId}
              />
            )}
            {activeView === 'New Application' && (
              <CreateApplication
                draft={draft}
                setDraft={setDraft}
                step={step}
                setStep={setStep}
                onSave={createApplication}
                onCancel={() => navigate('Dashboard')}
              />
            )}
            {activeView === 'Applications' && (
              <ApplicationsView
                applications={salesApplicationsForView}
                statusFilter={salesApplicationStatusFilter}
                onStatusFilterChange={setSalesApplicationStatusFilter}
                onSelect={setSelectedId}
                onNew={() => navigate('New Application')}
              />
            )}
            {activeView === 'Pending EMI' && (
              <PendingEmiView applications={activeSalesCustomers} emiSchedule={emiSchedule} onSelect={setSelectedId} />
            )}
            {activeView === 'Payment Requests' && (
              <CashRequestsView requests={cashRequests} applications={activeSalesCustomers} onSelect={setSelectedId} />
            )}
            {activeView === 'Customers' && <CustomersView applications={activeSalesCustomers} emiSchedule={emiSchedule} onSelect={setSelectedId} />}
          </>
        )}
      </main>

      <nav className="bottom-nav" aria-label="Mobile navigation" />
    </div>
  );
}

function AdminPanel({
  activeView,
  applications,
  cashRequests,
  emiSchedule,
  payments,
  staffProfiles,
  activityLogs,
  logArchives,
  currentProfileId,
  menuOpen,
  navigate,
  onApprove,
  onReject,
  onActivate,
  onClose,
  onForeclose,
  onCashApprove,
  onCashReject,
  onResetPassword,
  onUpdateLoanTerms,
  paymentSettings,
  onSavePaymentSettings,
  onMenuOpen,
  onMenuClose,
  onSignOut,
  showToast,
  onStaffUpdate,
  onStaffInvite,
  onStaffPasswordReset,
  toast,
  draft,
  setDraft,
  applicationStep,
  setApplicationStep,
  onCreateApplication,
  onRecordOfficePayment
}: {
  activeView: AdminView;
  applications: Application[];
  cashRequests: CashRequest[];
  emiSchedule: EmiItem[];
  payments: PaymentItem[];
  staffProfiles: StaffProfile[];
  activityLogs: ActivityLog[];
  logArchives: LogArchive[];
  currentProfileId: string | null;
  menuOpen: boolean;
  navigate: (view: AdminView) => void;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  onActivate: (id: string, disbursement: DisbursementInput) => Promise<void>;
  onClose: (id: string) => void;
  onForeclose: (id: string, settlement: ForeclosureSettlementInput) => Promise<void>;
  onCashApprove: (id: string) => void;
  onCashReject: (id: string) => void;
  onResetPassword: (id: string) => void;
  onUpdateLoanTerms: (id: string, terms: LoanTermsInput, reason: string) => Promise<void>;
  paymentSettings: PaymentSettings;
  onSavePaymentSettings: (settings: PaymentSettings) => Promise<void>;
  onMenuOpen: () => void;
  onMenuClose: () => void;
  onSignOut: () => void;
  showToast: (message: string) => void;
  onStaffUpdate: (profileId: string, changes: Partial<Pick<StaffProfile, 'active' | 'role'>>) => void;
  onStaffInvite: (input: { fullName: string; email: string; active: boolean }) => Promise<void>;
  onStaffPasswordReset: (profileId: string) => Promise<void>;
  toast: string;
  draft: Draft;
  setDraft: React.Dispatch<React.SetStateAction<Draft>>;
  applicationStep: number;
  setApplicationStep: (step: number) => void;
  onCreateApplication: () => void;
  onRecordOfficePayment: (input: OfficePaymentInput) => Promise<void>;
}) {
  const [adminQuery, setAdminQuery] = useState('');
  const [adminStatusFilter, setAdminStatusFilter] = useState<LoanStatus | 'All'>('All');
  const [selectedAdminApplicationId, setSelectedAdminApplicationId] = useState<string | null>(null);
  const [disbursementApplicationId, setDisbursementApplicationId] = useState<string | null>(null);
  const [foreclosureApplicationId, setForeclosureApplicationId] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null);
  const normalizedQuery = adminQuery.trim().toLowerCase();
  const filteredApplications = normalizedQuery
    ? applications.filter((application) =>
        [
          application.id,
          application.customerName,
          application.mobile,
          application.alternateMobile,
          application.assetId,
          application.productName,
          application.guarantorName,
          application.showroomName,
          application.status
        ]
          .join(' ')
          .toLowerCase()
          .includes(normalizedQuery)
      )
    : applications;
  const filteredCashRequests = normalizedQuery
    ? cashRequests.filter((request) =>
        [request.id, request.applicationId, request.customerName, request.emiMonth, request.collectedBy, request.status]
          .join(' ')
          .toLowerCase()
          .includes(normalizedQuery)
      )
    : cashRequests;
  const adminProcessingAttention = applications.filter((application) => application.status === 'Under Processing').length;
  const adminActivationAttention = applications.filter((application) => application.status === 'Approved').length;
  const adminPaymentAttention = cashRequests.filter((request) => request.status === 'Verification Pending').length;
  const adminAttentionCount = adminProcessingAttention + adminActivationAttention + adminPaymentAttention;
  const selectedAdminApplication = filteredApplications.find((application) => application.id === selectedAdminApplicationId) || null;
  const openApplications = (filter: LoanStatus | 'All') => {
    setAdminStatusFilter(filter);
    setSelectedAdminApplicationId(null);
    navigate('Applications Review');
  };
  const confirmLoanAction = (
    applicationId: string,
    title: string,
    message: string,
    confirmLabel: string,
    action: () => void,
    tone: ConfirmAction['tone'] = 'warning'
  ) => {
    const application = applications.find((item) => item.id === applicationId);
    setConfirmAction({
      title,
      message,
      confirmLabel,
      tone,
      details: application
        ? [
            ['Loan ID', application.id],
            ['Customer', application.customerName],
            ['Loan Amount', money(application.loanAmount)]
          ]
        : undefined,
      onConfirm: action
    });
  };
  const runConfirmedAction = () => {
    const action = confirmAction?.onConfirm;
    setConfirmAction(null);
    action?.();
  };
  const requestApprove = (id: string) =>
    confirmLoanAction(
      id,
      'Approve loan application?',
      'This moves the application to the approved stage. Funds are still not released until disbursement is confirmed.',
      'Approve Application',
      () => onApprove(id),
      'success'
    );
  const requestReject = (id: string) =>
    confirmLoanAction(
      id,
      'Reject loan application?',
      'This rejects the application and removes it from the active approval flow.',
      'Reject Application',
      () => onReject(id),
      'danger'
    );
  const requestClose = (id: string) =>
    confirmLoanAction(
      id,
      'Close this loan?',
      'Use this only after the office confirms the loan is fully settled. The customer loan will move to Closed.',
      'Close Loan',
      () => onClose(id),
      'warning'
    );
  const requestForeclosure = (id: string, settlement: ForeclosureSettlementInput) => {
    const application = applications.find((item) => item.id === id);
    setConfirmAction({
      title: 'Confirm foreclosure and close loan?',
      message: 'This records the agreed settlement and permanently closes the loan. Check every figure before continuing.',
      confirmLabel: 'Confirm & Close Loan',
      tone: 'danger',
      details: [
        ['Loan ID', application?.id || id],
        ['Customer', application?.customerName || 'Customer'],
        ['Agreed Settlement', money(settlement.agreedSettlementAmount)],
        ['Product Returned', settlement.productReturned ? 'Yes' : 'No'],
        ['Product Return Value', settlement.productReturned ? money(settlement.productReturnValue) : 'Not applicable'],
        ['Settlement Notes', settlement.notes]
      ],
      onConfirm: () => void onForeclose(id, settlement)
    });
  };
  const requestResetMpin = (id: string) =>
    confirmLoanAction(
      id,
      'Reset customer MPIN?',
      'A new MPIN will be generated. Share it only after offline customer verification.',
      'Reset MPIN',
      () => onResetPassword(id),
      'warning'
    );
  const requestCashDecision = (id: string, status: CashStatus) => {
    const request = cashRequests.find((item) => item.id === id);
    setConfirmAction({
      title: status === 'Approved' ? 'Confirm payment?' : 'Reject payment request?',
      message: status === 'Approved'
        ? 'Confirm only after checking the cash handover or matching the Bank Transfer / QR reference. This will mark the EMI paid.'
        : 'Reject only if the cash handover or payment reference is not acceptable. The EMI will return to pending.',
      confirmLabel: status === 'Approved' ? 'Confirm Payment' : 'Reject Request',
      tone: status === 'Approved' ? 'success' : 'danger',
      details: request
        ? [
            ['Request ID', request.id],
            ['Customer', request.customerName],
            ['Method', request.requestMode === 'manual_bank_qr' ? 'Bank Transfer / QR' : 'Cash'],
            ['Reference', request.paymentReference || 'Not required'],
            ['EMI Due', money(request.emiDueAmount || request.amount)],
            ['Collected', money(request.amount)],
            ['Carry Forward', money(request.shortAmount || 0)]
          ]
        : undefined,
      onConfirm: () => (status === 'Approved' ? onCashApprove(id) : onCashReject(id))
    });
  };

  return (
    <div className="app-shell admin-shell">
      {toast && <div className="toast">{toast}</div>}
      <aside className={`sidebar ${menuOpen ? 'open' : ''}`}>
        <div className="brand">
          <span className="admin-brand-mark">
            <img src="./rfg-logo.png" alt="RFG Financial" />
          </span>
          <div>
            <strong>RFG Admin</strong>
            <span>Operations Management</span>
          </div>
          <button className="icon-button close-menu" onClick={onMenuClose} aria-label="Close menu">
            <X size={18} />
          </button>
        </div>
        <nav className="nav-list" aria-label="Admin navigation">
          {adminNav.map((item) => (
            <button
              className={item.label === activeView ? 'nav-item active' : 'nav-item'}
              key={item.label}
              onClick={() => {
                setSelectedAdminApplicationId(null);
                navigate(item.label);
              }}
            >
              <item.icon size={18} />
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-card">
          <ShieldCheck size={20} />
          <strong>Admin Access</strong>
          <p>Approve loans, verify payments, manage staff and review logs.</p>
        </div>
      </aside>

      <main className="main-panel">
        <header className="topbar">
          <button className="icon-button mobile-menu" onClick={onMenuOpen} aria-label="Open menu">
            <Menu size={20} />
          </button>
          <div className="top-logo">
            <img src="./rfg-logo.png" alt="RFG Financial" />
          </div>
          <div className="search-wrap">
            <Search size={18} />
            <input
              aria-label="Admin search"
              placeholder="Search loan ID, customer, mobile, vehicle number, request ID"
              value={adminQuery}
              onChange={(event) => setAdminQuery(event.target.value)}
            />
          </div>
          <button
            className="icon-button notification-button"
            aria-label={adminAttentionCount ? `${adminAttentionCount} items need attention` : 'No items need attention'}
            title={adminAttentionCount ? `${adminAttentionCount} items need attention` : 'No items need attention'}
            onClick={() => {
              if (adminProcessingAttention > 0) openApplications('Under Processing');
              else if (adminActivationAttention > 0) openApplications('Approved');
              else if (adminPaymentAttention > 0) navigate('Payment Verification');
              else showToast('No items need attention right now.');
            }}
          >
            <Bell size={19} />
            {adminAttentionCount > 0 && <span className="notification-count">{formatAttentionCount(adminAttentionCount)}</span>}
          </button>
          <AccountMenu label="Admin User" onSignOut={onSignOut} />
        </header>

        <nav className="mobile-tabs admin-mobile-tabs" aria-label="Mobile admin navigation">
          {adminNav.slice(0, 5).map((item) => (
            <button
              className={item.label === activeView ? 'active' : ''}
              key={item.label}
              onClick={() => {
                setSelectedAdminApplicationId(null);
                navigate(item.label);
              }}
            >
              <item.icon size={17} />
              <span>{adminMobileLabel(item.label)}</span>
            </button>
          ))}
        </nav>

        {selectedAdminApplication ? (
          <AdminApplicationDetail
            application={selectedAdminApplication}
            emiSchedule={getApplicationEmis(selectedAdminApplication, emiSchedule)}
            payments={payments.filter((item) => applicationScheduleKeys(selectedAdminApplication).includes(item.applicationId))}
            onBack={() => setSelectedAdminApplicationId(null)}
            onApprove={requestApprove}
            onReject={requestReject}
            onActivate={setDisbursementApplicationId}
            onClose={requestClose}
            onForeclose={setForeclosureApplicationId}
            onResetPassword={requestResetMpin}
            onUpdateLoanTerms={onUpdateLoanTerms}
            showToast={showToast}
          />
        ) : activeView === 'Admin Dashboard' ? (
          <AdminDashboard applications={filteredApplications} cashRequests={filteredCashRequests} payments={payments} openApplications={openApplications} navigate={navigate} onSelect={setSelectedAdminApplicationId} />
        ) : activeView === 'New Application' ? (
          <CreateApplication
            draft={draft}
            setDraft={setDraft}
            step={applicationStep}
            setStep={setApplicationStep}
            onSave={onCreateApplication}
            onCancel={() => navigate('Applications Review')}
            workspaceLabel="Admin workflow"
          />
        ) : activeView === 'Applications Review' ? (
          <AdminApplications
            applications={filteredApplications}
            statusFilter={adminStatusFilter}
            setStatusFilter={setAdminStatusFilter}
            onSelect={setSelectedAdminApplicationId}
            onApprove={requestApprove}
            onReject={requestReject}
            onActivate={setDisbursementApplicationId}
            showToast={showToast}
          />
        ) : activeView === 'Customers' ? (
          <AdminCustomers applications={filteredApplications} emiSchedule={emiSchedule} onSelect={setSelectedAdminApplicationId} />
        ) : activeView === 'Payments' ? (
          <AdminPayments
            applications={filteredApplications}
            cashRequests={filteredCashRequests}
            payments={payments}
            staffProfiles={staffProfiles}
            emiSchedule={emiSchedule}
            onSelect={setSelectedAdminApplicationId}
            onRecordPayment={onRecordOfficePayment}
          />
        ) : activeView === 'Payment Verification' ? (
          <AdminBankVerification requests={filteredCashRequests} staffProfiles={staffProfiles} onSelect={setSelectedAdminApplicationId} onApprove={(id) => requestCashDecision(id, 'Approved')} onReject={(id) => requestCashDecision(id, 'Rejected')} />
        ) : activeView === 'Guarantors/Showrooms' ? (
          <AdminSellers applications={filteredApplications} />
        ) : activeView === 'Reports' ? (
          <AdminReports applications={filteredApplications} cashRequests={filteredCashRequests} payments={payments} />
        ) : activeView === 'Activity Logs' ? (
          <AdminActivity applications={filteredApplications} logs={activityLogs} archives={logArchives} />
        ) : activeView === 'Staff Users' ? (
          <AdminStaff
            staffProfiles={staffProfiles}
            currentProfileId={currentProfileId}
            onStaffUpdate={onStaffUpdate}
            onStaffInvite={onStaffInvite}
            onStaffPasswordReset={onStaffPasswordReset}
          />
        ) : (
          <AdminSettings
            settings={paymentSettings}
            onSave={onSavePaymentSettings}
          />
        )}
        {disbursementApplicationId && (
          <DisbursementDialog
            application={applications.find((application) => application.id === disbursementApplicationId) || null}
            onCancel={() => setDisbursementApplicationId(null)}
            onConfirm={async (details) => {
              await onActivate(disbursementApplicationId, details);
              setDisbursementApplicationId(null);
            }}
          />
        )}
        {foreclosureApplicationId && (
          <ForeclosureSettlementDialog
            application={applications.find((application) => application.id === foreclosureApplicationId) || null}
            emiSchedule={applications.find((application) => application.id === foreclosureApplicationId)
              ? getApplicationEmis(applications.find((application) => application.id === foreclosureApplicationId)!, emiSchedule)
              : []}
            onCancel={() => setForeclosureApplicationId(null)}
            onContinue={(settlement) => {
              const applicationId = foreclosureApplicationId;
              setForeclosureApplicationId(null);
              requestForeclosure(applicationId, settlement);
            }}
          />
        )}
        {confirmAction && (
          <ConfirmActionDialog
            action={confirmAction}
            onCancel={() => setConfirmAction(null)}
            onConfirm={runConfirmedAction}
          />
        )}
      </main>
    </div>
  );
}

function LegacyAdminDashboard({
  applications,
  cashRequests,
  openApplications,
  navigate,
  onSelect
}: {
  applications: Application[];
  cashRequests: CashRequest[];
  openApplications: (filter: LoanStatus | 'All') => void;
  navigate: (view: AdminView) => void;
  onSelect: (id: string) => void;
}) {
  const underProcessing = applications.filter((item) => item.status === 'Under Processing').length;
  const approved = applications.filter((item) => item.status === 'Approved').length;
  const active = applications.filter((item) => item.status === 'Active').length;
  const bankReview = cashRequests.filter((item) => item.status === 'Verification Pending').length;
  const totalLoan = applications.reduce((sum, item) => sum + item.loanAmount, 0);
  const disbursedAmount = applications
    .filter((item) => item.status === 'Active' || item.status === 'Closed')
    .reduce((sum, item) => sum + item.loanAmount, 0);
  const totalChargeAmount = applications
    .filter((item) => item.status !== 'Rejected')
    .reduce((sum, item) => sum + item.chargeAmount, 0);
  const pendingVerificationAmount = cashRequests
    .filter((item) => item.status === 'Verification Pending')
    .reduce((sum, item) => sum + item.amount, 0);
  const confirmedCollections = cashRequests.filter((item) => item.status === 'Approved').reduce((sum, item) => sum + item.amount, 0);
  const outstandingAmount = Math.max(disbursedAmount + totalChargeAmount - confirmedCollections, 0);

  return (
    <section className="admin-dashboard-layout">
      <div className="dashboard-command-grid">
      <section className="dashboard-command-card">
        <div>
          <p className="eyebrow">Welcome, Admin</p>
          <h1>Approval work that needs attention</h1>
          <p className="hero-copy">Review applications, verify bank QR payments manually, and keep loan status clean.</p>
        </div>
      </section>
      <aside className="dashboard-action-card">
        <div className="metric-icon success">
          <ClipboardCheck size={21} />
        </div>
        <div>
          <strong>Review Applications</strong>
          <span>{underProcessing} under processing</span>
        </div>
        <button className="primary-action" onClick={() => navigate('Applications Review')} type="button">
          Open Review
          <ArrowRight size={17} />
        </button>
      </aside>
      </div>
      <section className="dashboard-kpi-strip" aria-label="Admin priority metrics">
        <Metric label="Under Processing" value={underProcessing} helper="Needs approve/reject" icon={FileClock} tone="info" onClick={() => openApplications('Under Processing')} />
        <Metric label="Approved" value={approved} helper="Ready to mark active" icon={ClipboardCheck} tone="success" onClick={() => openApplications('Approved')} />
        <Metric label="Active Loans" value={active} helper="EMI cycle running" icon={CheckCircle2} tone="success" onClick={() => openApplications('Active')} />
        <Metric label="Payment Verification" value={bankReview} helper="Review office payments" icon={Banknote} tone="warning" onClick={() => navigate('Payment Verification')} />
      </section>
      <section className="dashboard-finance-band">
            <p>High-priority totals for today’s admin decisions.</p>
        <div className="finance-lead-tile">
          <span>Finance summary</span>
          <strong>{money(totalLoan)}</strong>
          <p>Total Loan Book</p>
          <MiniBar value={confirmedCollections} total={Math.max(totalLoan, confirmedCollections, 1)} tone="success" />
        </div>
        <div className="finance-side-tiles">
          <DashboardFinanceTile label="Outstanding Amount" value={money(outstandingAmount)} helper="Disbursed plus charges minus confirmed collections" amount={outstandingAmount} total={Math.max(totalLoan + totalChargeAmount, outstandingAmount, 1)} tone="warning" />
          <DashboardFinanceTile label="Pending Verification" value={money(pendingVerificationAmount)} helper="Cash/manual QR waiting admin check" amount={pendingVerificationAmount} total={Math.max(pendingVerificationAmount + confirmedCollections, 1)} tone="info" />
          <DashboardFinanceTile label="Confirmed Collections" value={money(confirmedCollections)} helper="Admin-confirmed collections" amount={confirmedCollections} total={Math.max(pendingVerificationAmount + confirmedCollections, 1)} tone="success" />
        </div>
      </section>
      <section className="operations-grid">
        <AdminQueue title="Application Queue" applications={applications.filter((item) => item.status === 'Under Processing').slice(0, 4)} onSelect={onSelect} />
        <AdminCashQueue requests={cashRequests.filter((item) => item.status === 'Verification Pending').slice(0, 5)} onSelect={onSelect} />
      </section>
    </section>
  );
}

function AdminDashboard({
  applications,
  cashRequests,
  payments,
  openApplications,
  navigate,
  onSelect
}: {
  applications: Application[];
  cashRequests: CashRequest[];
  payments: PaymentItem[];
  openApplications: (filter: LoanStatus | 'All') => void;
  navigate: (view: AdminView) => void;
  onSelect: (id: string) => void;
}) {
  const underProcessing = applications.filter((item) => item.status === 'Under Processing').length;
  const approved = applications.filter((item) => item.status === 'Approved').length;
  const active = applications.filter((item) => item.status === 'Active').length;
  const bankReview = cashRequests.filter((item) => item.status === 'Verification Pending').length;
  const totalLoan = applications.reduce((sum, item) => sum + item.loanAmount, 0);
  const disbursedAmount = applications
    .filter((item) => item.status === 'Active' || item.status === 'Closed')
    .reduce((sum, item) => sum + item.loanAmount, 0);
  const totalChargeAmount = applications
    .filter((item) => item.status !== 'Rejected')
    .reduce((sum, item) => sum + item.chargeAmount, 0);
  const confirmedCollections = cashRequests
    .filter((item) => item.status === 'Approved')
    .reduce((sum, item) => sum + item.amount, 0);
  const outstandingAmount = Math.max(disbursedAmount + totalChargeAmount - confirmedCollections, 0);
  const stageRows = [
    {
      label: 'Active',
      value: applications.filter((item) => item.status === 'Active').reduce((sum, item) => sum + item.loanAmount, 0),
      tone: 'success'
    },
    {
      label: 'Approved',
      value: applications.filter((item) => item.status === 'Approved').reduce((sum, item) => sum + item.loanAmount, 0),
      tone: 'info'
    },
    {
      label: 'Processing',
      value: applications.filter((item) => item.status === 'Under Processing').reduce((sum, item) => sum + item.loanAmount, 0),
      tone: 'warning'
    }
  ];

  return (
    <section className="admin-dashboard-v2">
      <header className="dashboard-page-head">
        <div>
          <p className="eyebrow">Admin workspace</p>
          <h1>Operations overview</h1>
          <p>Monitor the portfolio, clear approvals, and verify collections from one place.</p>
        </div>
        <button className="dashboard-review-button" onClick={() => navigate('Applications Review')} type="button">
          Review applications
          <span>{formatDashboardWorkloadCount(underProcessing)}</span>
          <ArrowUpRight size={17} />
        </button>
      </header>

      <section className="dashboard-overview-grid">
        <article className="portfolio-control-panel">
          <div className="portfolio-panel-head">
            <div>
              <span className="section-kicker">Operational summary</span>
              <h2>Live portfolio position</h2>
              <p>System performance and finance indicators</p>
            </div>
            <span className="dashboard-updated"><CheckCircle2 size={14} />Auto-updated: Just now</span>
          </div>
          <div className="portfolio-value-line">
          <div>
            <span>Total loan book</span>
            <strong>{money(totalLoan)}</strong>
          </div>
          <button className="panel-link" onClick={() => navigate('Customers')} type="button">
            {active} active loans
            <ArrowRight size={16} />
          </button>
          <button className="panel-link" onClick={() => navigate('Reports')} type="button">
            Full report
            <ArrowRight size={16} />
          </button>
          </div>
          <PortfolioStageChart rows={stageRows} total={Math.max(totalLoan, 1)} />
          <div className="portfolio-foot">
            <div>
              <span>Disbursed</span>
              <strong>{money(disbursedAmount)}</strong>
            </div>
            <div>
              <span>Outstanding</span>
              <strong>{money(outstandingAmount)}</strong>
            </div>
            <div>
              <span>Collected</span>
              <strong>{money(confirmedCollections)}</strong>
            </div>
            <div>
              <span>Finance charges</span>
              <strong>{money(totalChargeAmount)}</strong>
            </div>
          </div>
        </article>

        <aside className="attention-panel">
          <div className="attention-brand">
            <span><ShieldCheck size={20} /></span>
            <div>
              <strong>RFG Admin</strong>
              <small>Operations system</small>
            </div>
          </div>
          <div className="attention-panel-head">
            <div>
              <span className="section-kicker">Action centre</span>
              <h2>Priority decisions</h2>
            </div>
            <strong>{formatDashboardWorkloadCount(underProcessing + approved + bankReview)}</strong>
          </div>
          <AttentionAction
            icon={FileClock}
            label="Application decisions"
            helper="Approve or reject submitted loans"
            value={underProcessing}
            tone="blue"
            onClick={() => openApplications('Under Processing')}
          />
          <AttentionAction
            icon={ClipboardCheck}
            label="Ready to activate"
            helper="Approved files awaiting activation"
            value={approved}
            tone="green"
            onClick={() => openApplications('Approved')}
          />
          <AttentionAction
            icon={Banknote}
            label="Payment verification"
            helper="Confirm only after checking the bank"
            value={bankReview}
            tone="amber"
            onClick={() => navigate('Payment Verification')}
          />
        </aside>
      </section>

      <section className="dashboard-work-grid">
        <RecentTransactions
          applications={applications}
          payments={payments}
          cashRequests={cashRequests}
          onOpen={() => navigate('Payments')}
          onSelect={onSelect}
        />
        <AdminQueue
          title="Application Queue"
          applications={applications.filter((item) => item.status === 'Under Processing').slice(0, 4)}
          onSelect={onSelect}
          onOpen={() => openApplications('Under Processing')}
        />
      </section>
    </section>
  );
}

function RecentTransactions({
  applications,
  payments,
  cashRequests,
  onOpen,
  onSelect
}: {
  applications: Application[];
  payments: PaymentItem[];
  cashRequests: CashRequest[];
  onOpen: () => void;
  onSelect: (id: string) => void;
}) {
  const applicationBySupabaseId = new Map(
    applications
      .filter((application) => application.supabaseId)
      .map((application) => [application.supabaseId as string, application])
  );
  const applicationByDisplayId = new Map(applications.map((application) => [application.id, application]));
  const pendingRequests = cashRequests
    .filter((request) => request.status !== 'Approved')
    .map((request) => ({
      id: request.id,
      application: applicationByDisplayId.get(request.applicationId),
      amount: request.amount,
      status: request.status,
      date: request.collectedAt,
      mode: request.requestMode === 'manual_bank_qr' ? 'Bank Transfer / QR' : 'Cash'
    }));
  const paymentRows = payments.map((payment) => ({
    id: payment.paymentId,
    application: applicationBySupabaseId.get(payment.applicationId),
    amount: payment.amount,
    status: payment.status,
    date: payment.createdAt,
    mode: formatPaymentMode(payment.mode)
  }));
  const rows = [...paymentRows, ...pendingRequests]
    .sort((left, right) => new Date(right.date).getTime() - new Date(left.date).getTime())
    .slice(0, 5);

  return (
    <section className="recent-transactions-panel">
      <div className="recent-transactions-head">
        <div>
          <span className="section-kicker">Payment activity</span>
          <h2>
            Recent Transactions
            <span>{rows.length}</span>
          </h2>
        </div>
        <button className="queue-head-action" onClick={onOpen} type="button">
          View all
          <ArrowUpRight size={15} />
        </button>
      </div>

      {rows.length ? (
        <div className="recent-transactions-table">
          {rows.map((row) => {
            const application = row.application;
            const customerName = application?.customerName || 'Customer';
            const initials = customerName
              .split(/\s+/)
              .slice(0, 2)
              .map((part) => part.charAt(0))
              .join('')
              .toUpperCase();

            return (
              <button
                className="recent-transaction-row"
                key={`${row.id}-${row.status}`}
                onClick={() => application && onSelect(application.id)}
                type="button"
              >
                <span className="recent-transaction-main">
                  <span className="recent-transaction-customer">
                    <i>{initials || 'CU'}</i>
                    <span>
                      <strong>{customerName}</strong>
                      <em>{application?.mobile || 'Customer record'}</em>
                    </span>
                  </span>
                  <span className="recent-transaction-reference">
                    <strong>{row.id}</strong>
                    <em>{row.mode}</em>
                  </span>
                </span>
                <span className="recent-transaction-summary">
                  <span className="recent-transaction-result">
                    <strong>{money(row.amount)}</strong>
                    <TransactionStatusChip status={row.status} />
                  </span>
                  <span className="recent-transaction-date">
                    <strong>{formatDate(row.date)}</strong>
                    <em>Transaction date</em>
                  </span>
                  <ArrowRight className="recent-transaction-arrow" size={16} />
                </span>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="recent-transactions-empty">
          <span><CreditCard size={24} /></span>
          <strong>No transactions yet</strong>
          <p>Confirmed payments and verification requests will appear here.</p>
        </div>
      )}
    </section>
  );
}

function TransactionStatusChip({ status }: { status?: EmiStatus | CashStatus | null }) {
  const safeStatus = status || 'Pending';
  const normalizedStatus = safeStatus.toLowerCase().replace(/\s+/g, '-');

  return (
    <span className={`transaction-status-chip status-${normalizedStatus}`}>
      {safeStatus}
    </span>
  );
}

function BankRequestStatusChip({ status }: { status: CashStatus }) {
  const label = status === 'Approved' ? 'Paid' : status;
  const normalizedStatus = status === 'Approved' ? 'paid' : status.toLowerCase().replace(/\s+/g, '-');
  return <span className={`transaction-status-chip status-${normalizedStatus}`}>{label}</span>;
}

function paginateItems<T>(items: T[], page: number, pageSize: number) {
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const safePage = Math.min(Math.max(page, 1), totalPages);
  const start = (safePage - 1) * pageSize;
  return {
    items: items.slice(start, start + pageSize),
    page: safePage,
    totalPages,
    start: items.length ? start + 1 : 0,
    end: Math.min(start + pageSize, items.length)
  };
}

function AdminPagination({
  page,
  totalPages,
  start,
  end,
  total,
  label,
  onPageChange
}: {
  page: number;
  totalPages: number;
  start: number;
  end: number;
  total: number;
  label: string;
  onPageChange: (page: number) => void;
}) {
  if (total === 0) return null;
  return (
    <footer className="admin-pagination" aria-label={`${label} pagination`}>
      <span>Showing {start}-{end} of {total} {label}</span>
      <div>
        <button disabled={page <= 1} onClick={() => onPageChange(page - 1)} type="button">
          <ChevronLeft size={16} /> Previous
        </button>
        <strong>Page {page} of {totalPages}</strong>
        <button disabled={page >= totalPages} onClick={() => onPageChange(page + 1)} type="button">
          Next <ArrowRight size={16} />
        </button>
      </div>
    </footer>
  );
}

function AdminApplications({
  applications,
  statusFilter,
  setStatusFilter,
  onSelect,
  onApprove,
  onReject,
  onActivate,
  showToast
}: {
  applications: Application[];
  statusFilter: LoanStatus | 'All';
  setStatusFilter: (filter: LoanStatus | 'All') => void;
  onSelect: (id: string) => void;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  onActivate: (id: string) => void;
  showToast: (message: string) => void;
}) {
  const [page, setPage] = useState(1);
  const reviewApplications = applications.filter((application) =>
    ['Under Processing', 'Approved', 'Rejected'].includes(application.status)
  );
  const filters: Array<LoanStatus | 'All'> = ['All', 'Under Processing', 'Approved', 'Rejected'];
  const effectiveFilter = filters.includes(statusFilter) ? statusFilter : 'All';
  const visibleApplications = effectiveFilter === 'All'
    ? reviewApplications
    : reviewApplications.filter((application) => application.status === effectiveFilter);
  const pagination = paginateItems(visibleApplications, page, 10);
  useEffect(() => setPage(1), [effectiveFilter]);
  useEffect(() => {
    if (page > pagination.totalPages) setPage(pagination.totalPages);
  }, [page, pagination.totalPages]);

  return (
    <section className="panel page-panel applications-review-page">
      <div className="panel-header">
        <div>
          <p className="eyebrow">Loan control</p>
          <h1>Applications Review</h1>
          <p>Review submitted applications, record decisions, and confirm disbursement when funds are actually released.</p>
        </div>
      </div>
      <div className="status-filter-tabs" aria-label="Application status sections">
        {filters.map((filter) => {
          const count = filter === 'All'
            ? reviewApplications.length
            : reviewApplications.filter((application) => application.status === filter).length;
          return (
            <button className={effectiveFilter === filter ? 'active' : ''} key={filter} onClick={() => setStatusFilter(filter)} type="button">
              <span>{filter}</span>
              <strong>{count}</strong>
            </button>
          );
        })}
      </div>
      <div className="admin-list application-review-list">
        {pagination.items.map((application) => (
          <article className={`application-review-row status-${application.status.toLowerCase().replace(/\s+/g, '-')}`} key={application.id}>
            <button
              className="application-review-open"
              onClick={() => onSelect(application.id)}
              aria-label={`View ${application.customerName} application`}
              type="button"
            >
              <span className="application-review-icon">
                {application.status === 'Active' ? <CheckCircle2 size={22} /> : application.status === 'Rejected' ? <X size={22} /> : <FileClock size={22} />}
              </span>
              <span className="application-review-id">
                <small>Loan reference</small>
                <strong>{application.id}</strong>
                <span>{application.date}</span>
              </span>
              <span className="application-review-applicant">
                <small>Applicant</small>
                <strong>{application.customerName}</strong>
                <span>{application.mobile}</span>
              </span>
              <span className="application-review-product">
                <small>Product</small>
                <strong>{application.productName}</strong>
                <span>{application.category} - {application.assetId || 'Reference pending'}</span>
              </span>
              <span className="application-review-amount">
                <small>Loan amount</small>
                <strong>{money(application.loanAmount)}</strong>
                <ApplicationStatusChip application={application} />
              </span>
            </button>
            <div className="application-review-actions">
              <div className="application-review-primary-actions">
                {application.status === 'Under Processing' && (
                  <button className="primary-small" onClick={() => onApprove(application.id)} type="button">
                    Approve
                  </button>
                )}
                {application.status === 'Under Processing' && (
                  <button className="soft-button danger-action" onClick={() => onReject(application.id)} type="button">
                    Reject
                  </button>
                )}
                {application.status === 'Approved' && (
                  <button className="primary-small" onClick={() => onActivate(application.id)} type="button">
                    Confirm Disbursement
                  </button>
                )}
              </div>
              <div className="application-review-secondary-actions">
                {application.status === 'Approved' && (
                  <button className="soft-button" onClick={() => onSelect(application.id)} type="button">
                    Edit Terms
                  </button>
                )}
                <button className="soft-button" onClick={() => onSelect(application.id)} type="button">
                  Reset MPIN
                </button>
                <button className="application-view-button" onClick={() => onSelect(application.id)} type="button">
                  View Details
                  <ArrowRight size={15} />
                </button>
              </div>
            </div>
          </article>
        ))}
        {visibleApplications.length === 0 && (
          <div className="application-review-empty">
            <span><Search size={27} /></span>
            <strong>No applications in this section</strong>
            <p>Try another status or update the search to find a customer application.</p>
          </div>
        )}
      </div>
      <AdminPagination {...pagination} total={visibleApplications.length} label="applications" onPageChange={setPage} />
    </section>
  );
}

function AdminBankVerification({
  requests,
  staffProfiles,
  onSelect,
  onApprove,
  onReject
}: {
  requests: CashRequest[];
  staffProfiles: StaffProfile[];
  onSelect: (id: string) => void;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
}) {
  const [statusFilter, setStatusFilter] = useState<CashStatus>('Verification Pending');
  const [page, setPage] = useState(1);
  const pendingRequests = requests.filter((request) => request.status === 'Verification Pending');
  const approvedRequests = requests.filter((request) => request.status === 'Approved');
  const rejectedRequests = requests.filter((request) => request.status === 'Rejected');
  const pendingAmount = pendingRequests.reduce((sum, request) => sum + request.amount, 0);
  const visibleRequests = requests.filter((request) => request.status === statusFilter);
  const pagination = paginateItems(visibleRequests, page, 10);
  const filters: CashStatus[] = ['Verification Pending', 'Approved', 'Rejected'];
  const staffById = new Map(staffProfiles.map((profile) => [profile.id, profile]));
  useEffect(() => setPage(1), [statusFilter]);
  useEffect(() => {
    if (page > pagination.totalPages) setPage(pagination.totalPages);
  }, [page, pagination.totalPages]);

  return (
    <section className="panel page-panel bank-verification-page">
      <div className="panel-header bank-verification-head">
        <div>
          <p className="eyebrow">Office payment review</p>
          <h1>Payment Verification</h1>
          <p>Confirm cash and Bank Transfer / QR payments before they enter the final payment ledger.</p>
        </div>
        <span className="manual-process-badge"><ShieldCheck size={16} />Manual process</span>
      </div>

      <section className="bank-verification-summary">
        <article className="pending">
          <span><Clock3 size={20} /></span>
          <div><small>Pending review</small><strong>{pendingRequests.length}</strong><em>{money(pendingAmount)} awaiting confirmation</em></div>
        </article>
        <article className="approved">
          <span><CheckCircle2 size={20} /></span>
          <div><small>Paid</small><strong>{approvedRequests.length}</strong><em>Confirmed by admin</em></div>
        </article>
        <article className="rejected">
          <span><X size={20} /></span>
          <div><small>Rejected</small><strong>{rejectedRequests.length}</strong><em>Returned for correction</em></div>
        </article>
      </section>

      <div className="verification-notice bank-safety-notice">
        <span className="bank-safety-icon"><AlertCircle size={22} /></span>
        <div>
          <strong>Verify the collection before confirming payment</strong>
          <span>For bank payments, check the company statement. For cash, confirm the physical collection and staff handover.</span>
        </div>
      </div>

      <section className="bank-verification-queue">
        <header className="bank-queue-toolbar">
          <div>
            <span className="section-kicker">Verification queue</span>
            <h2>Verification Requests</h2>
            <p>Pending, paid and rejected requests remain traceable here.</p>
          </div>
          <div className="bank-status-filters" aria-label="Filter verification requests">
            {filters.map((filter) => (
              <button
                className={statusFilter === filter ? 'active' : ''}
                key={filter}
                onClick={() => setStatusFilter(filter)}
                type="button"
              >
                {filter === 'Verification Pending' ? 'Pending Verification' : filter === 'Approved' ? 'Confirmed / Paid' : filter}
                <span>{requests.filter((request) => request.status === filter).length}</span>
              </button>
            ))}
          </div>
        </header>

        {visibleRequests.length ? (
          <div className="bank-request-list">
            {pagination.items.map((request) => {
              const createdBy = request.createdById ? staffById.get(request.createdById) : undefined;
              const reviewedBy = request.reviewedById ? staffById.get(request.reviewedById) : undefined;
              const isBank = request.requestMode === 'manual_bank_qr';
              return (
              <article className={`bank-request-row ${request.status.toLowerCase().replace(' ', '-')}`} key={request.id}>
                <span className="bank-request-icon">{isBank ? <CreditCard size={22} /> : <Banknote size={22} />}</span>
                <div className="bank-request-customer">
                  <small>Customer</small>
                  <strong>{request.customerName}</strong>
                  <span>{request.id} · {request.emiMonth}</span>
                </div>
                <div className="bank-request-amount">
                  <small>Submitted amount</small>
                  <strong>{money(request.amount)}</strong>
                  <span>{isBank ? 'Bank Transfer / QR' : 'Cash'}</span>
                  {isBank && request.paymentReference && <span>Reference: {request.paymentReference}</span>}
                  {(request.emiDueAmount || request.shortAmount) && (
                    <span className="carry-forward-note">
                      Due {money(request.emiDueAmount || request.amount)}
                      {(request.shortAmount || 0) > 0 ? ` - ${money(request.shortAmount || 0)} moves to next EMI` : ''}
                    </span>
                  )}
                </div>
                <div className="bank-request-audit">
                  <small>Submitted by</small>
                  <strong>{createdBy?.fullName || request.collectedBy || 'Sales User'}</strong>
                  <span title={request.createdById}>Staff ID: {compactUserId(request.createdById)}</span>
                  <span>{formatDateTime(request.createdAt || request.collectedAt)}</span>
                </div>
                <div className="bank-request-review">
                  <small>{request.status === 'Verification Pending' ? 'Review status' : 'Reviewed by'}</small>
                  <strong>{request.status === 'Verification Pending' ? 'Awaiting admin review' : reviewedBy?.fullName || 'Admin User'}</strong>
                  {request.status !== 'Verification Pending' && (
                    <>
                      <span title={request.reviewedById}>Admin ID: {compactUserId(request.reviewedById)}</span>
                      <span>{formatDateTime(request.reviewedAt)}</span>
                    </>
                  )}
                  <BankRequestStatusChip status={request.status} />
                </div>
                <div className="bank-request-actions">
                  <button className="bank-view-loan" onClick={() => onSelect(request.applicationId)} type="button">
                    View Loan
                    <ArrowRight size={15} />
                  </button>
                  {request.status === 'Verification Pending' && (
                    <>
                      <button className="bank-confirm-button" onClick={() => onApprove(request.id)} type="button">
                        <CheckCircle2 size={16} />
                        Confirm Payment
                      </button>
                      <button className="bank-reject-button" onClick={() => onReject(request.id)} type="button">
                        <X size={16} />
                        Reject
                      </button>
                    </>
                  )}
                </div>
              </article>
            );
            })}
          </div>
        ) : (
          <div className="bank-queue-empty">
            <span><ShieldCheck size={28} /></span>
            <strong>No requests in this section</strong>
            <p>Choose another status or wait for a new payment request.</p>
          </div>
        )}
        <footer className="bank-queue-footer">
          <span>Showing {pagination.start}-{pagination.end} of {visibleRequests.length} filtered requests</span>
          <span>Submission and review identities are also retained in Activity Logs</span>
        </footer>
        <AdminPagination {...pagination} total={visibleRequests.length} label="requests" onPageChange={setPage} />
      </section>
    </section>
  );
}

function AdminApplicationDetail({
  application,
  emiSchedule,
  payments,
  onBack,
  onApprove,
  onReject,
  onActivate,
  onClose,
  onForeclose,
  onResetPassword,
  onUpdateLoanTerms,
  showToast
}: {
  application: Application;
  emiSchedule: EmiItem[];
  payments: PaymentItem[];
  onBack: () => void;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  onActivate: (id: string) => void;
  onClose: (id: string) => void;
  onForeclose: (id: string) => void;
  onResetPassword: (id: string) => void;
  onUpdateLoanTerms: (id: string, terms: LoanTermsInput, reason: string) => Promise<void>;
  showToast: (message: string) => void;
}) {
  const confirmedPayments = payments.filter((payment) => isConfirmedPaymentStatus(payment.status));
  const [editingTerms, setEditingTerms] = useState(false);
  const [savingTerms, setSavingTerms] = useState(false);
  const [termsReason, setTermsReason] = useState('');
  const [pendingTerms, setPendingTerms] = useState<LoanTermsInput | null>(null);
  const visibleEmiSchedule = getRenderableEmiSchedule(application, emiSchedule);
  const [termsDraft, setTermsDraft] = useState(() => ({
    productPrice: String(application.productPrice),
    downPayment: String(application.downPayment),
    loanAmount: String(application.loanAmount),
    chargeAmount: String(application.chargeAmount),
    processingFee: String(application.processingFee),
    tenure: String(application.tenure),
    emiAmount: String(application.emiAmount),
    dueDay: String(application.dueDay)
  }));
  const totalLoanPayable = application.loanAmount + application.chargeAmount + application.processingFee;
  const paidSoFar = visibleEmiSchedule
    .reduce((sum, item) => sum + getEmiPaidAmount(item), 0);
  const remainingPayable = visibleEmiSchedule
    .reduce((sum, item) => sum + getEmiPayableAmount(item), 0);
  useEffect(() => {
    if (editingTerms) return;
    setTermsDraft({
      productPrice: String(application.productPrice),
      downPayment: String(application.downPayment),
      loanAmount: String(application.loanAmount),
      chargeAmount: String(application.chargeAmount),
      processingFee: String(application.processingFee),
      tenure: String(application.tenure),
      emiAmount: String(application.emiAmount),
      dueDay: String(application.dueDay)
    });
  }, [
    application.productPrice,
    application.downPayment,
    application.loanAmount,
    application.chargeAmount,
    application.processingFee,
    application.tenure,
    application.emiAmount,
    application.dueDay,
    editingTerms
  ]);
  const updateTerm = (key: keyof typeof termsDraft, value: string) =>
    setTermsDraft((current) => ({ ...current, [key]: value }));
  const submitTerms = async () => {
    if (termsReason.trim().length < 5) {
      showToast('Enter a clear reason for changing the loan terms.');
      return;
    }

    const terms: LoanTermsInput = {
      productPrice: toNumber(termsDraft.productPrice),
      downPayment: toNumber(termsDraft.downPayment),
      loanAmount: toNumber(termsDraft.loanAmount),
      chargeAmount: toNumber(termsDraft.chargeAmount),
      processingFee: toNumber(termsDraft.processingFee),
      tenure: toNumber(termsDraft.tenure),
      emiAmount: Math.round(calculateEmiAmount(
        termsDraft.loanAmount,
        termsDraft.chargeAmount,
        termsDraft.processingFee,
        termsDraft.tenure
      ) * 100) / 100,
      dueDay: toNumber(termsDraft.dueDay)
    };
    if (
      terms.productPrice <= 0
      || terms.downPayment < 0
      || terms.loanAmount <= 0
      || terms.chargeAmount < 0
      || terms.processingFee < 0
      || terms.tenure < 1
      || terms.emiAmount <= 0
      || terms.dueDay < 1
      || terms.dueDay > 31
    ) {
      showToast('Check all loan values before saving.');
      return;
    }

    setPendingTerms(terms);
  };
  const confirmTermsUpdate = async () => {
    if (!pendingTerms) return;
    setSavingTerms(true);
    try {
      await onUpdateLoanTerms(application.id, pendingTerms, termsReason.trim());
      setEditingTerms(false);
      setTermsReason('');
      setPendingTerms(null);
    } catch {
      // The parent action already displays the database error.
    } finally {
      setSavingTerms(false);
    }
  };
  const checklistRows: Array<[string, boolean]> = [
    ['Aadhaar checked', application.checklist.aadhaar],
    ['PAN checked', application.checklist.pan],
    ['Address proof checked', application.checklist.address],
    ['Photo collected', application.checklist.photo],
    ['Signature collected', application.checklist.signature],
    ['Customer OTP checked', application.checklist.customerOtp],
    ['Guarantor OTP checked', application.checklist.sellerOtp]
  ];
  if (application.category === 'Two-Wheeler') {
    checklistRows.push(['RC checked', application.checklist.rc], ['Insurance checked', application.checklist.insurance]);
  }
  if (application.category === 'Electronics') {
    checklistRows.push(['IMEI / serial noted', application.checklist.serialChecked]);
  }

  return (
    <section className="detail-layout admin-detail-layout sales-loan-file">
      <div className="sales-loan-hero">
        <button className="soft-button" onClick={onBack}>
          <ChevronLeft size={16} />
          Back
        </button>
        <div className="sales-loan-identity">
          <p className="eyebrow">Application Detail</p>
          <h1>{application.customerName}</h1>
          <p>{application.id} - {application.mobile} - {application.category} - {application.productName || 'Product not entered'}</p>
        </div>
        <div className="sales-loan-status-card">
          <ApplicationStatusChip application={application} />
          <span>Admin loan file</span>
        </div>
      </div>

      <div className="sales-file-summary">
        <article className="sales-file-main-card">
          <div className="sales-file-main-head">
            <div>
              <p className="eyebrow">Loan Summary</p>
              <h2>{money(totalLoanPayable)}</h2>
              <span>Total loan value including charges and processing fee</span>
            </div>
            <div className="sales-file-product-icon">
              <ProductCategoryIcon category={application.category} size={26} />
            </div>
          </div>
          <div className="sales-file-mini-grid">
            <span>
              <small>EMI Amount</small>
              <strong>{money(application.emiAmount)}</strong>
            </span>
            <span>
              <small>Tenure</small>
              <strong>{application.tenure || 0} months</strong>
            </span>
            <span>
              <small>Remaining</small>
              <strong>{money(remainingPayable)}</strong>
            </span>
          </div>
        </article>

        <article className="sales-access-card">
          <div>
            <ShieldCheck size={20} />
            <div>
              <h2>Customer Login</h2>
              <p>Share only after offline verification</p>
            </div>
          </div>
          <div className="sales-access-values">
            <span><small>Loan ID</small><strong>{application.loginId}</strong></span>
            <span>
              <small>MPIN</small>
              <strong>{application.customerPassword === 'Hidden for security' ? 'Reset to generate' : application.customerPassword}</strong>
            </span>
          </div>
          <button className="primary-action full-width" onClick={() => onResetPassword(application.id)}>
            Reset MPIN
          </button>
        </article>
      </div>

      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>Admin Actions</h2>
            <p>Use after office verification only.</p>
          </div>
        </div>
        <div className="admin-actions detail-actions">
          {application.status === 'Under Processing' && <button className="primary-small" onClick={() => onApprove(application.id)}>Approve</button>}
          {application.status === 'Under Processing' && <button className="soft-button danger-action" onClick={() => onReject(application.id)}>Reject</button>}
          {application.status === 'Approved' && <button className="primary-small" onClick={() => onActivate(application.id)}>Confirm Disbursement &amp; Activate</button>}
          {application.status === 'Active' && <button className="soft-button" onClick={() => onClose(application.id)}>Close Loan</button>}
          {application.status === 'Active' && <button className="soft-button danger-action" onClick={() => onForeclose(application.id)}>Foreclose Loan</button>}
          {application.status === 'Approved' && (
            <button className="soft-button" onClick={() => setEditingTerms((current) => !current)}>Edit Terms</button>
          )}
          <button className="soft-button" onClick={() => onResetPassword(application.id)}>Reset MPIN</button>
        </div>
      </section>

      {application.status === 'Closed' && application.foreclosureSettlement && (
        <section className="panel foreclosure-record-panel">
          <div className="panel-header foreclosure-record-header">
            <div>
              <p className="eyebrow">Closed Loan Record</p>
              <h2>Foreclosure Details</h2>
              <p>This foreclosed account remains in the Closed section.</p>
            </div>
            <span className="foreclosure-record-badge">Foreclosed</span>
          </div>
          <div className="foreclosure-record-grid">
            <span><small>Agreed Settlement</small><strong>{money(application.foreclosureSettlement.agreedSettlementAmount)}</strong></span>
            <span><small>Paid Before Foreclosure</small><strong>{money(application.foreclosureSettlement.paidBeforeForeclosure)}</strong></span>
            <span><small>Product Returned</small><strong>{application.foreclosureSettlement.productReturned ? 'Yes' : 'No'}</strong></span>
            {application.foreclosureSettlement.productReturned && (
              <span><small>Product Return Value</small><strong>{money(application.foreclosureSettlement.productReturnValue)}</strong></span>
            )}
            <span><small>Original Loan Amount</small><strong>{money(application.foreclosureSettlement.originalLoanAmount)}</strong></span>
            <span><small>Foreclosed On</small><strong>{formatDateTime(application.foreclosureSettlement.settledAt)}</strong></span>
          </div>
          <div className="foreclosure-record-notes">
            <small>Settlement Remarks / Reason</small>
            <p>{application.foreclosureSettlement.notes}</p>
          </div>
        </section>
      )}

      {editingTerms && (
        <section className="panel">
          <div className="panel-header">
            <div>
              <h2>Edit Loan Terms</h2>
              <p>Every change is recorded with the admin’s reason.</p>
            </div>
            <button className="soft-button" onClick={() => setEditingTerms(false)} type="button">Cancel</button>
          </div>
          <div className="loan-terms-warning" role="note">
            <AlertCircle size={21} />
            <div>
              <strong>Financial terms will change</strong>
              <p>This can change the customer's payable amount and EMI schedule. Verify the agreement and enter a clear reason before saving.</p>
            </div>
          </div>
          <div className="field-grid two-col">
            <TextField label="Product Price" value={termsDraft.productPrice} onChange={(value) => updateTerm('productPrice', value)} />
            <TextField label="Down Payment" value={termsDraft.downPayment} onChange={(value) => updateTerm('downPayment', value)} />
            <TextField label="Loan Amount" value={termsDraft.loanAmount} onChange={(value) => updateTerm('loanAmount', value)} />
            <TextField label="Charge Amount" value={termsDraft.chargeAmount} onChange={(value) => updateTerm('chargeAmount', value)} />
            <TextField label="Processing Fee" value={termsDraft.processingFee} onChange={(value) => updateTerm('processingFee', value)} />
            <TextField label="Tenure in Months" value={termsDraft.tenure} onChange={(value) => updateTerm('tenure', value)} />
            <TextField
              label="EMI Amount (Automatic)"
              value={String(Math.round(calculateEmiAmount(termsDraft.loanAmount, termsDraft.chargeAmount, termsDraft.processingFee, termsDraft.tenure) * 100) / 100)}
              onChange={() => undefined}
              readOnly
            />
            <TextField label="Reason for Change" value={termsReason} onChange={setTermsReason} />
          </div>
          <div className="form-actions">
            <button className="primary-action" onClick={() => void submitTerms()} disabled={savingTerms} type="button">
              {savingTerms ? 'Saving...' : 'Save Terms'}
            </button>
          </div>
        </section>
      )}
      {pendingTerms && (
        <ConfirmActionDialog
          action={{
            title: 'Confirm loan term changes?',
            message: 'These financial values will replace the current loan terms and the action will be recorded in Activity Logs.',
            confirmLabel: 'Confirm & Save Terms',
            tone: 'warning',
            details: [
              ['Customer', application.customerName],
              ['Loan ID', application.id],
              ['Loan Amount', money(application.loanAmount) + ' -> ' + money(pendingTerms.loanAmount)],
              ['Charge Amount', money(application.chargeAmount) + ' -> ' + money(pendingTerms.chargeAmount)],
              ['Processing Fee', money(application.processingFee) + ' -> ' + money(pendingTerms.processingFee)],
              ['EMI Amount', money(application.emiAmount) + ' -> ' + money(pendingTerms.emiAmount)],
              ['Tenure', application.tenure + ' months -> ' + pendingTerms.tenure + ' months'],
              ['Reason', termsReason.trim()]
            ],
            onConfirm: () => undefined
          }}
          onCancel={() => setPendingTerms(null)}
          onConfirm={() => void confirmTermsUpdate()}
        />
      )}

      <section className="detail-grid sales-file-grid">
        <article className="panel wide sales-finance-panel admin-finance-panel">
          <div className="panel-header">
            <div>
              <h2>Finance Breakdown</h2>
              <p>Admin view of principal, charges, repayment and disbursement values.</p>
            </div>
            <Banknote size={20} />
          </div>
          <div className="sales-finance-tiles admin-finance-tiles">
            <span><small>Product Price</small><strong>{money(application.productPrice)}</strong></span>
            <span><small>Down Payment</small><strong>{money(application.downPayment)}</strong></span>
            <span><small>Loan Amount</small><strong>{money(application.loanAmount)}</strong></span>
            <span><small>Charge Amount</small><strong>{money(application.chargeAmount)}</strong></span>
            <span><small>Processing Fee</small><strong>{money(application.processingFee)}</strong></span>
            <span><small>Total Loan Value</small><strong>{money(totalLoanPayable)}</strong></span>
            <span><small>EMI Amount</small><strong>{money(application.emiAmount)}</strong></span>
            <span><small>Paid So Far</small><strong>{money(paidSoFar)}</strong></span>
            <span><small>Remaining</small><strong>{money(remainingPayable)}</strong></span>
          </div>
          <InfoRows rows={[
            ['Tenure', `${application.tenure} months`],
            ['Disbursed On', application.disbursedAt ? formatDateTime(application.disbursedAt) : 'Not disbursed yet'],
            ['First EMI Due', visibleEmiSchedule[0]?.dueDate ? formatFullDate(visibleEmiSchedule[0].dueDate) : 'Generated after disbursement'],
            ['Transfer Reference', application.disbursementReference || 'Not recorded']
          ]} />
        </article>

        <InfoBlock title="Customer" rows={[
          ['Name', application.customerName],
          ['Mobile', application.mobile],
          ['Alternate Mobile', application.alternateMobile || 'Not entered'],
          ['Address', application.address],
          ['Pincode', application.customerPincode || 'Not entered']
        ]} />
        <InfoBlock title="Product" rows={[
          ['Category', application.category],
          ['Product', application.productName],
          ['Vehicle No. / IMEI', application.assetId],
          ['Remarks', application.remarks || 'No remarks']
        ]} />
        <InfoBlock title="Guarantor / Showroom" rows={[
          ['Guarantor', application.guarantorName],
          ['Guarantor Mobile', application.guarantorMobile],
          ['Guarantor Address', application.guarantorAddress || 'Not entered'],
          ['Guarantor Pincode', application.guarantorPincode || 'Not entered'],
          ['Showroom', application.showroomName],
          ['Showroom Mobile', application.showroomMobile]
        ]} />
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>Physical Checklist</h2>
            <p>No files are stored. This only records physical/offline checks.</p>
          </div>
        </div>
        <div className="checklist-summary">
          {checklistRows.map(([label, done]) => (
            <span className={done ? 'done' : ''} key={String(label)}>
              {done ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
              {label}
            </span>
          ))}
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>EMI Schedule</h2>
            <p>Installments generated when this loan became active.</p>
          </div>
        </div>
        <div className="sales-emi-schedule-wrap">
          <EmiScheduleList items={visibleEmiSchedule} />
        </div>
        <div className="sales-loan-total-strip">
          <span>
            <small>Total Loan Amount</small>
            <strong>{money(totalLoanPayable)}</strong>
          </span>
          <span>
            <small>Paid So Far</small>
            <strong>{money(paidSoFar)}</strong>
          </span>
          <span>
            <small>Remaining</small>
            <strong>{money(remainingPayable)}</strong>
          </span>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>Payment History</h2>
            <p>Confirmed payment ledger for this loan.</p>
          </div>
        </div>
        <div className="payment-list">
          {confirmedPayments.map((payment) => (
            <div className="payment-row" key={payment.id}>
              <div className="payment-avatar"><CreditCard size={18} /></div>
              <div><strong>{payment.paymentId}</strong><span>{formatPaymentMode(payment.mode)} - {formatDate(payment.createdAt)}</span></div>
              <strong>{money(payment.amount)}</strong>
              <EmiStatusChip status={payment.status} />
            </div>
          ))}
          {confirmedPayments.length === 0 && <EmptyState title="No confirmed payments yet" text="Payments appear here after admin verification." />}
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>Activity</h2>
            <p>Recent operational actions for this loan.</p>
          </div>
        </div>
        <div className="activity-list">
          {application.activity.map((item) => <div key={item}><span />{item}</div>)}
        </div>
      </section>
    </section>
  );
}

function AdminPayments({
  applications,
  cashRequests,
  payments,
  staffProfiles,
  emiSchedule,
  onSelect,
  onRecordPayment
}: {
  applications: Application[];
  cashRequests: CashRequest[];
  payments: PaymentItem[];
  staffProfiles: StaffProfile[];
  emiSchedule: EmiItem[];
  onSelect: (id: string) => void;
  onRecordPayment: (input: OfficePaymentInput) => Promise<void>;
}) {
  type LedgerFilter = 'All' | 'Cash' | 'Bank QR' | 'Razorpay' | 'Failed' | 'Rejected';
  const [ledgerFilter, setLedgerFilter] = useState<LedgerFilter>('All');
  const [page, setPage] = useState(1);
  const [recordPaymentOpen, setRecordPaymentOpen] = useState(false);
  const collectedAmount = payments
    .filter((item) => isConfirmedPaymentStatus(item.status))
    .reduce((sum, item) => sum + item.amount, 0);
  const paidPayments = payments.filter((item) => isConfirmedPaymentStatus(item.status));
  const cashPayments = paidPayments.filter((item) => item.mode === 'cash');
  const bankPayments = paidPayments.filter((item) => item.mode === 'manual_bank_qr');
  const razorpayPayments = paidPayments.filter((item) => item.mode.toLowerCase() === 'razorpay');
  const applicationBySupabaseId = new Map(
    applications
      .filter((application) => application.supabaseId)
      .map((application) => [application.supabaseId as string, application])
  );
  const applicationByDisplayId = new Map(applications.map((application) => [application.id, application]));
  const staffById = new Map(staffProfiles.map((profile) => [profile.id, profile]));
  const requestByReference = new Map(cashRequests.map((request) => [request.id, request]));
  const ledgerRows = [
    ...payments
      .filter((payment) => ['Paid', 'Part Paid', 'Failed', 'Rejected'].includes(payment.status))
      .map((payment) => {
      const application = applicationBySupabaseId.get(payment.applicationId);
      const sourceRequest = requestByReference.get(payment.reference);
      const initiatedById = payment.createdById || sourceRequest?.createdById;
      const verifiedById = payment.verifiedById || sourceRequest?.reviewedById;
      const paymentMode = payment.mode === 'manual_bank_qr'
        ? 'Bank QR'
        : payment.mode.toLowerCase() === 'razorpay'
          ? 'Razorpay'
          : 'Cash';
      return {
        key: `payment-${payment.id}`,
        id: payment.paymentId,
        application,
        customerName: application?.customerName || 'Customer',
        mobile: application?.mobile || '',
        amount: payment.amount,
        mode: paymentMode as 'Cash' | 'Bank QR' | 'Razorpay',
        detail: payment.reference || 'Confirmed payment',
        status: payment.status as EmiStatus,
        date: payment.verifiedAt || payment.createdAt,
        initiatedBy: initiatedById
          ? staffById.get(initiatedById)?.fullName || sourceRequest?.collectedBy || 'Staff User'
          : paymentMode === 'Razorpay' ? 'Customer checkout' : sourceRequest?.collectedBy || 'Staff User',
        initiatedById,
        verifiedBy: verifiedById
          ? staffById.get(verifiedById)?.fullName || 'Admin User'
          : paymentMode === 'Razorpay' ? 'Razorpay verification' : 'Admin User',
        verifiedById
      };
    }),
    ...cashRequests.filter((request) => request.status === 'Rejected').map((request) => {
      const application = applicationByDisplayId.get(request.applicationId);
      const initiatedBy = request.createdById ? staffById.get(request.createdById) : undefined;
      const reviewedBy = request.reviewedById ? staffById.get(request.reviewedById) : undefined;
      return {
        key: `request-${request.id}`,
        id: request.id,
        application,
        customerName: request.customerName,
        mobile: application?.mobile || '',
        amount: request.amount,
        mode: request.requestMode === 'manual_bank_qr' ? 'Bank QR' as const : 'Cash' as const,
        detail: request.emiMonth,
        status: 'Rejected' as EmiStatus,
        date: request.reviewedAt || request.createdAt || request.collectedAt,
        initiatedBy: initiatedBy?.fullName || request.collectedBy || 'Sales User',
        initiatedById: request.createdById,
        verifiedBy: reviewedBy?.fullName || 'Admin User',
        verifiedById: request.reviewedById
      };
    })
  ].sort((left, right) => new Date(right.date).getTime() - new Date(left.date).getTime());
  const matchesLedgerFilter = (row: (typeof ledgerRows)[number], filter: LedgerFilter) => {
    if (filter === 'All') return true;
    if (filter === 'Failed' || filter === 'Rejected') return row.status === filter;
    return row.mode === filter;
  };
  const visibleRows = ledgerRows.filter((row) => matchesLedgerFilter(row, ledgerFilter));
  const pagination = paginateItems(visibleRows, page, 10);
  const filters: LedgerFilter[] = ['All', 'Cash', 'Bank QR', 'Razorpay', 'Failed', 'Rejected'];
  useEffect(() => setPage(1), [ledgerFilter]);
  useEffect(() => {
    if (page > pagination.totalPages) setPage(pagination.totalPages);
  }, [page, pagination.totalPages]);

  return (
    <section className="panel page-panel payments-ledger-page">
      <div className="panel-header payments-ledger-head">
        <div>
          <p className="eyebrow">EMI and payment ledger</p>
          <h1>Payments</h1>
          <p>Final ledger of paid, failed and rejected transactions across every payment method.</p>
        </div>
        <div className="payments-head-actions">
          <div className="payments-filter-label">
            <ListFilter size={17} />
            <span>{ledgerFilter === 'All' ? 'All transactions' : ledgerFilter}</span>
          </div>
          <button className="primary-action" onClick={() => setRecordPaymentOpen(true)} type="button">
            <Plus size={17} />
            Record Payment
          </button>
        </div>
      </div>

      <section className="payment-summary-grid" aria-label="Payment summary">
        <article className="payment-summary-card pending">
          <span className="payment-summary-icon"><CreditCard size={21} /></span>
          <div>
            <span>Total payments</span>
            <strong>{paidPayments.length}</strong>
            <small>{money(collectedAmount)} confirmed</small>
          </div>
        </article>
        <article className="payment-summary-card verification">
          <span className="payment-summary-icon"><Banknote size={21} /></span>
          <div>
            <span>Cash</span>
            <strong>{cashPayments.length}</strong>
            <small>{money(cashPayments.reduce((sum, payment) => sum + payment.amount, 0))} collected</small>
          </div>
        </article>
        <article className="payment-summary-card paid">
          <span className="payment-summary-icon"><WalletCards size={21} /></span>
          <div>
            <span>Bank QR</span>
            <strong>{bankPayments.length}</strong>
            <small>{money(bankPayments.reduce((sum, payment) => sum + payment.amount, 0))} confirmed</small>
          </div>
        </article>
        <article className="payment-summary-card collected">
          <span className="payment-summary-icon"><CheckCircle2 size={21} /></span>
          <div>
            <span>Razorpay</span>
            <strong>{razorpayPayments.length}</strong>
            <small>{money(razorpayPayments.reduce((sum, payment) => sum + payment.amount, 0))} online</small>
          </div>
        </article>
      </section>

      <section className="payment-ledger">
        <div className="payment-ledger-toolbar">
          <div>
            <span className="section-kicker">Transaction history</span>
            <h2>Payment Ledger</h2>
            <p>Completed outcomes only. Pending requests stay under Payment Verification.</p>
          </div>
          <div className="payment-status-filters" aria-label="Filter payment records">
            {filters.map((filter) => (
              <button
                className={ledgerFilter === filter ? 'active' : ''}
                key={filter}
                onClick={() => setLedgerFilter(filter)}
                type="button"
              >
                {filter}
                <span>{ledgerRows.filter((row) => matchesLedgerFilter(row, filter)).length}</span>
              </button>
            ))}
          </div>
        </div>

        {visibleRows.length ? (
          <>
            <div className="payment-ledger-labels" aria-hidden="true">
              <span>Customer</span>
              <span>Transaction</span>
              <span>Amount</span>
              <span>Status</span>
              <span>Date</span>
              <span>Action</span>
            </div>
            <div className="payment-ledger-rows">
              {pagination.items.map((row) => (
                <article className="payment-ledger-row" key={row.key}>
                  <button
                    className="payment-ledger-open"
                    onClick={() => row.application && onSelect(row.application.id)}
                    type="button"
                  >
                    <span className="payment-ledger-customer">
                      <i>{row.customerName.slice(0, 1).toUpperCase()}</i>
                      <span>
                        <small>Customer</small>
                        <strong>{row.customerName}</strong>
                        <em>{row.mobile || 'Loan customer'}</em>
                      </span>
                    </span>
                    <span>
                      <small>Transaction</small>
                      <strong>{row.id}</strong>
                      <em>{row.mode} · {row.detail}</em>
                      <em>Initiated by {row.initiatedBy} ({compactUserId(row.initiatedById)})</em>
                      <em>Confirmed by {row.verifiedBy} ({compactUserId(row.verifiedById)})</em>
                    </span>
                    <span className="payment-ledger-amount">
                      <small>Amount</small>
                      <strong>{money(row.amount)}</strong>
                    </span>
                    <span>
                      <small>Status</small>
                      <TransactionStatusChip status={row.status} />
                    </span>
                    <span className="payment-ledger-date">
                      <small>Date</small>
                      <strong>{formatDate(row.date)}</strong>
                    </span>
                  </button>
                  <button
                    className="payment-view-button"
                    disabled={!row.application}
                    onClick={() => row.application && onSelect(row.application.id)}
                    type="button"
                  >
                    View Loan
                    <ArrowRight size={15} />
                  </button>
                </article>
              ))}
            </div>
            <AdminPagination {...pagination} total={visibleRows.length} label="transactions" onPageChange={setPage} />
          </>
        ) : (
          <div className="payment-ledger-empty">
            <span><CreditCard size={27} /></span>
            <strong>No transactions in this section</strong>
            <p>Choose another status or wait for new payment activity.</p>
          </div>
        )}
      </section>
      {recordPaymentOpen && (
        <AdminRecordPaymentDialog
          applications={applications}
          emiSchedule={emiSchedule}
          onCancel={() => setRecordPaymentOpen(false)}
          onConfirm={async (input) => {
            await onRecordPayment(input);
            setRecordPaymentOpen(false);
          }}
        />
      )}
    </section>
  );
}

function AdminRecordPaymentDialog({
  applications,
  emiSchedule,
  onCancel,
  onConfirm
}: {
  applications: Application[];
  emiSchedule: EmiItem[];
  onCancel: () => void;
  onConfirm: (input: OfficePaymentInput) => Promise<void>;
}) {
  const activeApplications = applications.filter((application) => application.status === 'Active');
  const [applicationId, setApplicationId] = useState(activeApplications[0]?.id || '');
  const [loanSearch, setLoanSearch] = useState('');
  const application = activeApplications.find((item) => item.id === applicationId) || null;
  const pendingEmis = application
    ? getPaymentEligibleEmis(getRenderableEmiSchedule(application, emiSchedule))
    : [];
  const [emiId, setEmiId] = useState('');
  const selectedEmi = pendingEmis.find((item) => item.id === emiId) || pendingEmis[0] || null;
  const [amount, setAmount] = useState('');
  const [mode, setMode] = useState<'cash' | 'manual_bank_qr'>('cash');
  const [reference, setReference] = useState('');
  const [remarks, setRemarks] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const payableAmount = selectedEmi ? getEmiPayableAmount(selectedEmi) : 0;

  const searchLoan = () => {
    setError('');
    const query = loanSearch.trim().toLowerCase();
    if (!query) return setError('Enter a Loan ID to search.');
    const match = activeApplications.find((item) => item.id.toLowerCase() === query)
      || activeApplications.find((item) => item.id.toLowerCase().includes(query));
    if (!match) return setError('No active loan matches that Loan ID.');
    setApplicationId(match.id);
  };

  useEffect(() => {
    setEmiId('');
    setAmount('');
  }, [applicationId]);

  useEffect(() => {
    if (selectedEmi) setAmount(String(getEmiPayableAmount(selectedEmi)));
  }, [selectedEmi?.id]);

  const submit = async () => {
    setError('');
    if (!application) return setError('Select an active loan.');
    if (!selectedEmi) return setError('This loan has no pending EMI available.');
    if (mode === 'manual_bank_qr' && !reference.trim()) return setError('Enter the UTR or transaction ID.');
    setSaving(true);
    try {
      await onConfirm({ application, emi: selectedEmi, amount: toNumber(amount), mode, reference, remarks });
    } catch (submitError) {
      setError(getErrorMessage(submitError));
      setSaving(false);
    }
  };

  return (
    <div className="disbursement-dialog-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !saving) onCancel();
    }}>
      <section className="disbursement-dialog admin-payment-dialog" role="dialog" aria-modal="true" aria-labelledby="record-payment-title">
        <div className="disbursement-dialog-header">
          <span><Banknote size={22} /></span>
          <div>
            <p className="eyebrow">Office collection</p>
            <h2 id="record-payment-title">Record &amp; Confirm Payment</h2>
            <p>For cash received or a Bank Transfer / QR payment already verified by Admin.</p>
          </div>
          <button className="icon-button" onClick={onCancel} disabled={saving} aria-label="Close payment form" type="button"><X size={19} /></button>
        </div>

        <div className="dialog-form-grid">
          <label className="full-field admin-loan-search-field">
            <span>Search by Loan ID</span>
            <div className="admin-loan-search-control">
              <Search size={19} aria-hidden="true" />
              <input
                value={loanSearch}
                onChange={(event) => setLoanSearch(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    searchLoan();
                  }
                }}
                placeholder="Enter Loan ID, for example RFG-2606-1007"
                autoComplete="off"
              />
              <button onClick={searchLoan} type="button">Search</button>
            </div>
          </label>
          <label className="full-field">
            <span>Active Loan</span>
            <select value={applicationId} onChange={(event) => setApplicationId(event.target.value)}>
              {!activeApplications.length && <option value="">No active loans</option>}
              {activeApplications.map((item) => <option key={item.id} value={item.id}>{item.id} - {item.customerName}</option>)}
            </select>
          </label>
          <label className="full-field">
            <span>Pending EMI</span>
            <select value={selectedEmi?.id || ''} onChange={(event) => setEmiId(event.target.value)} disabled={!pendingEmis.length}>
              {!pendingEmis.length && <option value="">No pending EMI available</option>}
              {pendingEmis.map((item) => <option key={item.id} value={item.id}>{item.emiMonth} - {money(getEmiPayableAmount(item))}</option>)}
            </select>
          </label>
          <div className="full-field">
            <span>Payment Method</span>
            <div className="payment-method-segments">
              <button className={mode === 'cash' ? 'active' : ''} onClick={() => setMode('cash')} type="button"><Banknote size={17} />Cash</button>
              <button className={mode === 'manual_bank_qr' ? 'active' : ''} onClick={() => setMode('manual_bank_qr')} type="button"><QrCode size={17} />Bank Transfer / QR</button>
            </div>
          </div>
          <label>
            <span>Amount Received</span>
            <input inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder={payableAmount ? String(payableAmount) : '0'} />
          </label>
          <label>
            <span>{mode === 'manual_bank_qr' ? 'UTR / Transaction ID' : 'Receipt Reference (optional)'}</span>
            <input value={reference} onChange={(event) => setReference(event.target.value)} placeholder={mode === 'manual_bank_qr' ? 'Enter verified reference' : 'Optional office receipt'} />
          </label>
          <label className="full-field">
            <span>Remarks (optional)</span>
            <textarea value={remarks} onChange={(event) => setRemarks(event.target.value)} placeholder="Add a short office note" rows={3} />
          </label>
        </div>

        <div className="admin-payment-warning">
          <ShieldCheck size={19} />
          <p><strong>Admin confirmation</strong><span>This immediately updates the EMI and payment ledger. Confirm only after receiving cash or matching the bank reference.</span></p>
        </div>
        {error && <p className="dialog-error">{error}</p>}
        <div className="disbursement-dialog-actions">
          <button className="soft-button" onClick={onCancel} disabled={saving} type="button">Cancel</button>
          <button className="primary-action" onClick={() => void submit()} disabled={saving || !selectedEmi} type="button">
            <CheckCircle2 size={17} />{saving ? 'Confirming...' : 'Confirm Payment'}
          </button>
        </div>
      </section>
    </div>
  );
}

function AdminCustomers({
  applications,
  emiSchedule,
  onSelect
}: {
  applications: Application[];
  emiSchedule: EmiItem[];
  onSelect: (id: string) => void;
}) {
  const [statusFilter, setStatusFilter] = useState<'All' | 'Active' | 'Closed'>('All');
  const [page, setPage] = useState(1);
  const customerRows = applications
    .filter((application) => application.status === 'Active' || application.status === 'Closed')
    .map((application) => {
      const applicationEmis = getApplicationEmis(application, emiSchedule);
      const hasPenalty = application.status === 'Active' && applicationEmis.some((emi) =>
        !isEmiSettledForSequence(emi) && isEmiPastGrace(emi)
      );
      const hasGrace = application.status === 'Active' && !hasPenalty && applicationEmis.some((emi) =>
        !isEmiSettledForSequence(emi) && isEmiDueDatePassed(emi)
      );
      return {
    id: application.id,
    name: application.customerName,
    mobile: application.mobile,
    alternateMobile: application.alternateMobile,
    address: application.address,
    status: application.status,
    category: application.category,
    product: application.productName,
    assetId: application.assetId,
    amount: application.loanAmount,
    date: application.date,
    foreclosed: Boolean(application.foreclosureSettlement),
    paymentHealth: hasPenalty ? 'penalty' : hasGrace ? 'grace' : 'healthy'
      };
    });
  const visibleCustomers = statusFilter === 'All'
    ? customerRows
    : customerRows.filter((customer) => customer.status === statusFilter);
  const pagination = paginateItems(visibleCustomers, page, 12);
  const activeCustomers = customerRows.filter((customer) => customer.status === 'Active').length;
  const closedCustomers = customerRows.filter((customer) => customer.status === 'Closed').length;
  const filters: Array<'All' | 'Active' | 'Closed'> = ['All', 'Active', 'Closed'];
  useEffect(() => setPage(1), [statusFilter]);
  useEffect(() => {
    if (page > pagination.totalPages) setPage(pagination.totalPages);
  }, [page, pagination.totalPages]);

  return (
    <section className="panel page-panel customers-directory-page">
      <div className="panel-header customers-directory-head">
        <div>
          <p className="eyebrow">Customer records</p>
          <h1>Customers</h1>
          <p>Review active borrowers and completed customer loan records.</p>
        </div>
        <div className="customers-filter-label">
          <ListFilter size={17} />
          <span>{statusFilter === 'All' ? 'All records' : statusFilter}</span>
        </div>
      </div>

      <section className="customer-summary-strip" aria-label="Customer record summary">
        <article>
          <span>Total customers</span>
          <strong>{customerRows.length}</strong>
          <small>Active and closed loan customers</small>
        </article>
        <article className="success">
          <span>Active loans</span>
          <strong>{activeCustomers}</strong>
          <small>Currently paying EMI</small>
        </article>
        <article className="info">
          <span>Closed loans</span>
          <strong>{closedCustomers}</strong>
          <small>Completed or settled records</small>
        </article>
      </section>

      <section className="customer-directory">
        <div className="customer-directory-toolbar">
          <div>
            <span className="section-kicker">Customer directory</span>
            <h2>Active and completed customer records</h2>
          </div>
          <div className="customer-status-filters" aria-label="Filter customers by loan status">
            {filters.map((filter) => (
              <button
                className={statusFilter === filter ? 'active' : ''}
                key={filter}
                onClick={() => setStatusFilter(filter)}
                type="button"
              >
                {filter}
                <span>{filter === 'All' ? customerRows.length : customerRows.filter((customer) => customer.status === filter).length}</span>
              </button>
            ))}
          </div>
        </div>

        {visibleCustomers.length ? (
          <>
            <div className="customer-directory-labels" aria-hidden="true">
              <span>Customer</span>
              <span>Product & loan</span>
              <span>Loan value</span>
              <span>Status</span>
              <span>Action</span>
            </div>
            <div className="customer-directory-rows">
              {pagination.items.map((customer) => (
                <article className="customer-directory-row" key={customer.id}>
                  <button className="customer-directory-open" onClick={() => onSelect(customer.id)} type="button">
                    <span className="customer-directory-person">
                      <i>{customer.name.slice(0, 1).toUpperCase()}</i>
                      <span>
                        <small>Customer</small>
                        <strong>{customer.name}</strong>
                        <em>{customer.mobile}</em>
                      </span>
                    </span>
                    <span className="customer-directory-product">
                      <small>Product & loan</small>
                      <strong>{customer.product}</strong>
                      <em>{customer.category}{customer.assetId ? ` - ${customer.assetId}` : ''}</em>
                    </span>
                    <span className="customer-directory-amount">
                      <small>Loan value</small>
                      <strong>{money(customer.amount)}</strong>
                      <em>{customer.id}</em>
                    </span>
                    <span className="customer-directory-status">
                      <small>Status</small>
                      {customer.foreclosed ? (
                        <span className="status-chip foreclosed">Foreclosed</span>
                      ) : customer.status === 'Active' && customer.paymentHealth === 'penalty' ? (
                        <span className="status-chip active-penalty">Penalty Active</span>
                      ) : customer.status === 'Active' && customer.paymentHealth === 'grace' ? (
                        <span className="status-chip active-grace">Grace Period</span>
                      ) : customer.status === 'Active' ? (
                        <span className="status-chip active-healthy">Active</span>
                      ) : (
                        <StatusChip status={customer.status} />
                      )}
                    </span>
                  </button>
                  <button className="customer-view-button" onClick={() => onSelect(customer.id)} type="button">
                    View Details
                    <ArrowRight size={15} />
                  </button>
                </article>
              ))}
            </div>
            <AdminPagination {...pagination} total={visibleCustomers.length} label="customers" onPageChange={setPage} />
          </>
        ) : (
          <div className="customer-directory-empty">
            <span><UsersRound size={27} /></span>
            <strong>No customers in this section</strong>
            <p>Choose another status or update the global search.</p>
          </div>
        )}
      </section>
    </section>
  );
}

function AdminSellers({ applications }: { applications: Application[] }) {
  const [page, setPage] = useState(1);
  const sellers = applications.reduce<Array<{
    key: string;
    guarantorName: string;
    guarantorMobile: string;
    showroomName: string;
    showroomMobile: string;
    applications: number;
    loanValue: number;
    categories: ProductCategory[];
  }>>((rows, application) => {
    const guarantorName = application.guarantorName.trim() || 'Guarantor not entered';
    const guarantorMobile = application.guarantorMobile.trim() || 'Not entered';
    const showroomName = application.showroomName.trim() || 'Showroom not entered';
    const showroomMobile = application.showroomMobile.trim() || 'Not entered';
    const key = [guarantorName, guarantorMobile, showroomName, showroomMobile].join('||').toLowerCase();
    const existing = rows.find((row) => row.key === key);
    if (existing) {
      existing.applications += 1;
      existing.loanValue += application.loanAmount;
      if (!existing.categories.includes(application.category)) existing.categories.push(application.category);
    } else {
      rows.push({
        key,
        guarantorName,
        guarantorMobile,
        showroomName,
        showroomMobile,
        applications: 1,
        loanValue: application.loanAmount,
        categories: [application.category]
      });
    }
    return rows;
  }, []);
  const totalLinkedApplications = sellers.reduce((sum, seller) => sum + seller.applications, 0);
  const linkedLoanValue = sellers.reduce((sum, seller) => sum + seller.loanValue, 0);
  const pagination = paginateItems(sellers, page, 12);
  useEffect(() => {
    if (page > pagination.totalPages) setPage(pagination.totalPages);
  }, [page, pagination.totalPages]);

  return (
    <section className="panel page-panel seller-directory-page">
      <div className="panel-header seller-directory-head">
        <div>
          <p className="eyebrow">Application network</p>
          <h1>Guarantors / Showrooms</h1>
          <p>Read-only guarantor and showroom information collected from submitted loan applications.</p>
        </div>
        <span className="seller-readonly-badge"><ShieldCheck size={16} />Read only</span>
      </div>

      <section className="seller-summary-strip">
        <article>
          <span><Store size={20} /></span>
          <div><small>Guarantor records</small><strong>{sellers.length}</strong></div>
        </article>
        <article>
          <span><ClipboardCheck size={20} /></span>
          <div><small>Linked applications</small><strong>{totalLinkedApplications}</strong></div>
        </article>
        <article className="seller-summary-value">
          <span><WalletCards size={20} /></span>
          <div><small>Linked loan value</small><strong>{money(linkedLoanValue)}</strong></div>
        </article>
      </section>

      <section className="seller-directory">
        <header className="seller-directory-title">
          <div>
            <span>Network directory</span>
            <strong>{sellers.length} guarantor/showroom record{sellers.length === 1 ? '' : 's'}</strong>
          </div>
          <span>Generated from applications</span>
        </header>

        {sellers.length ? (
          <div className="seller-directory-list">
            {pagination.items.map((seller) => (
              <article className="seller-directory-row" key={seller.key}>
                <span className="seller-directory-icon"><Store size={23} /></span>
                <div className="seller-directory-identity">
                  <small>Guarantor</small>
                  <strong>{seller.guarantorName}</strong>
                  <span><Phone size={14} />{seller.guarantorMobile}</span>
                </div>
                <div className="seller-directory-showroom">
                  <small>Showroom</small>
                  <strong>{seller.showroomName}</strong>
                  <span><Phone size={14} />{seller.showroomMobile}</span>
                </div>
                <div className="seller-directory-business">
                  <small>Linked business</small>
                  <strong>{seller.applications} application{seller.applications === 1 ? '' : 's'}</strong>
                  <span>{money(seller.loanValue)} loan value</span>
                </div>
                <div className="seller-directory-categories">
                  <small>Products</small>
                  <div>{seller.categories.map((category) => <span key={category}>{category}</span>)}</div>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="seller-directory-empty">
            <span><Store size={27} /></span>
            <strong>No guarantor records</strong>
            <p>Guarantor and showroom information will appear automatically from submitted applications.</p>
          </div>
        )}
        <AdminPagination {...pagination} total={sellers.length} label="records" onPageChange={setPage} />
      </section>
    </section>
  );
}

function AdminReports({
  applications,
  cashRequests,
  payments
}: {
  applications: Application[];
  cashRequests: CashRequest[];
  payments: PaymentItem[];
}) {
  const totalLoan = applications.reduce((sum, item) => sum + item.loanAmount, 0);
  const activeAmount = applications.filter((item) => item.status === 'Active').reduce((sum, item) => sum + item.loanAmount, 0);
  const approvedAmount = applications.filter((item) => item.status === 'Approved').reduce((sum, item) => sum + item.loanAmount, 0);
  const processingAmount = applications.filter((item) => item.status === 'Under Processing').reduce((sum, item) => sum + item.loanAmount, 0);
  const rejectedAmount = applications.filter((item) => item.status === 'Rejected').reduce((sum, item) => sum + item.loanAmount, 0);
  const closedAmount = applications.filter((item) => item.status === 'Closed').reduce((sum, item) => sum + item.loanAmount, 0);
  const activeApplications = applications.filter((item) => item.status === 'Active');
  const closedApplications = applications.filter((item) => item.status === 'Closed');
  const activeChargeAmount = activeApplications.reduce((sum, item) => sum + item.chargeAmount + item.processingFee, 0);
  const disbursedAmount = activeAmount;
  const closedPrincipalAmount = closedAmount;
  const totalChargeAmount = applications.filter((item) => item.status !== 'Rejected').reduce((sum, item) => sum + item.chargeAmount + item.processingFee, 0);
  const pendingCash = cashRequests.filter((item) => item.status === 'Verification Pending').reduce((sum, item) => sum + item.amount, 0);
  const rejectedCash = cashRequests.filter((item) => item.status === 'Rejected').reduce((sum, item) => sum + item.amount, 0);
  const paidPayments = payments.filter((payment) => isConfirmedPaymentStatus(payment.status));
  const totalCollected = paidPayments.reduce((sum, payment) => sum + payment.amount, 0);
  const cashCollected = paidPayments
    .filter((payment) => payment.mode.toLowerCase().includes('cash'))
    .reduce((sum, payment) => sum + payment.amount, 0);
  const razorpayCollected = paidPayments
    .filter((payment) => payment.mode.toLowerCase() === 'razorpay')
    .reduce((sum, payment) => sum + payment.amount, 0);
  const bankCollected = paidPayments
    .filter((payment) => {
      const mode = payment.mode.toLowerCase();
      return mode.includes('bank') || mode.includes('qr') || mode.includes('manual');
    })
    .reduce((sum, payment) => sum + payment.amount, 0);
  const otherCollected = Math.max(totalCollected - cashCollected - razorpayCollected - bankCollected, 0);
  const nonRejectedLoanTotal = activeAmount + approvedAmount + processingAmount + closedAmount;
  const totalReceivable = activeAmount + activeChargeAmount;
  const totalBalance = Math.max(totalReceivable - totalCollected, 0);
  const collectionProgress = Math.min((totalCollected / Math.max(totalReceivable, 1)) * 100, 100);
  const applicationCounts = {
    processing: applications.filter((item) => item.status === 'Under Processing').length,
    approved: applications.filter((item) => item.status === 'Approved').length,
    active: applications.filter((item) => item.status === 'Active').length,
    closed: applications.filter((item) => item.status === 'Closed').length,
    rejected: applications.filter((item) => item.status === 'Rejected').length
  };
  const requestCounts = {
    total: cashRequests.length,
    pending: cashRequests.filter((item) => item.status === 'Verification Pending').length,
    confirmed: cashRequests.filter((item) => item.status === 'Approved').length,
    rejected: cashRequests.filter((item) => item.status === 'Rejected').length
  };
  const confirmedRazorpayPayments = paidPayments.filter((payment) => payment.mode.toLowerCase() === 'razorpay');
  const razorpayEmiCollected = confirmedRazorpayPayments.reduce((sum, payment) => sum + payment.amount, 0);
  const razorpayGrossCustomerPayment = grossUpRazorpayPayment(razorpayEmiCollected);
  const razorpayFeeRecovered = Math.max(razorpayGrossCustomerPayment - razorpayEmiCollected, 0);
  const razorpayFeeGst = razorpayFeeRecovered * RAZORPAY_FEE_GST_RATE;
  const razorpayGatewayDeduction = razorpayFeeRecovered + razorpayFeeGst;
  const razorpayNetSettlement = razorpayGrossCustomerPayment - razorpayGatewayDeduction;
  const stageRows = [
    { label: 'Active', amount: activeAmount, count: applicationCounts.active, tone: 'green' },
    { label: 'Approved', amount: approvedAmount, count: applicationCounts.approved, tone: 'blue' },
    { label: 'Under Processing', amount: processingAmount, count: applicationCounts.processing, tone: 'amber' },
    { label: 'Closed', amount: closedAmount, count: applicationCounts.closed, tone: 'navy' },
    { label: 'Rejected', amount: rejectedAmount, count: applicationCounts.rejected, tone: 'red' }
  ];
  const maxStageAmount = Math.max(...stageRows.map((row) => row.amount), 1);
  const methodRows = [
    { label: 'Cash', amount: cashCollected, tone: 'amber' },
    { label: 'Bank QR', amount: bankCollected, tone: 'green' },
    { label: 'Razorpay', amount: razorpayCollected, tone: 'blue' },
    ...(otherCollected > 0 ? [{ label: 'Other', amount: otherCollected, tone: 'navy' }] : [])
  ];

  return (
    <section className="panel page-panel report-v3-page">
      <header className="report-v3-head">
        <div>
          <p className="eyebrow">Financial control</p>
          <h1>Finance Reports</h1>
          <p>A single view of portfolio value, collections, loan stages and payment settlement.</p>
        </div>
        <span className="report-v3-live"><span />Live system totals</span>
      </header>

      <section className="report-v3-command">
        <div className="report-v3-position">
          <div className="report-v3-position-top">
            <span className="report-v3-kicker">Net portfolio position</span>
            <span>{collectionProgress.toFixed(1)}% collected</span>
          </div>
          <div className="report-v3-balance-line">
            <div>
              <small>Total outstanding</small>
              <strong>{money(totalBalance)}</strong>
            </div>
          </div>
          <p>Active loan principal and charges still receivable after every confirmed payment.</p>
          <div className="report-v3-progress" aria-label={`${collectionProgress.toFixed(1)} percent collected`}>
            <span style={{ width: `${collectionProgress}%` }} />
          </div>
          <div className="report-v3-position-foot">
            <span><small>Active receivable</small><strong>{money(totalReceivable)}</strong></span>
            <span><small>Collected</small><strong>{money(totalCollected)}</strong></span>
          </div>
        </div>

        <div className="report-v3-kpis">
          <ReportKpiCard icon={WalletCards} label="Valid loan principal" value={money(nonRejectedLoanTotal)} helper={`${applications.length - applicationCounts.rejected} valid applications`} tone="blue" />
          <ReportKpiCard icon={Banknote} label="Active principal" value={money(disbursedAmount)} helper="Running loans only" tone="green" />
          <ReportKpiCard icon={ClipboardCheck} label="Closed principal" value={money(closedPrincipalAmount)} helper={`${applicationCounts.closed} closed loan${applicationCounts.closed === 1 ? '' : 's'}`} tone="amber" />
          <ReportKpiCard icon={Clock3} label="Awaiting verification" value={money(pendingCash)} helper={`${requestCounts.pending} payment request${requestCounts.pending === 1 ? '' : 's'}`} tone="red" />
        </div>
      </section>

      <section className="report-v3-analysis-grid">
        <article className="report-v3-stage-chart">
          <header>
            <div>
              <span className="report-v3-kicker">Portfolio composition</span>
              <h2>Loan value by stage</h2>
            </div>
            <strong>{money(totalLoan)}</strong>
          </header>
          <div className="report-v3-stage-bars">
            {stageRows.map((row) => (
              <div className={`report-v3-stage-row ${row.tone}`} key={row.label}>
                <div>
                  <span>{row.label}</span>
                  <small>{row.count} loan{row.count === 1 ? '' : 's'}</small>
                </div>
                <div className="report-v3-stage-track">
                  <span style={{ width: `${Math.max((row.amount / maxStageAmount) * 100, row.amount > 0 ? 2 : 0)}%` }} />
                </div>
                <strong>{money(row.amount)}</strong>
              </div>
            ))}
          </div>
        </article>

        <aside className="report-v3-collection">
          <div className="report-v3-collection-head">
            <span><CheckCircle2 size={20} /></span>
            <div>
              <small>Collection health</small>
              <strong>{money(totalCollected)}</strong>
              <p>Confirmed payment volume</p>
            </div>
          </div>
          <div className="report-v3-methods">
            {methodRows.map((row) => (
              <div key={row.label}>
                <span><i className={row.tone} />{row.label}</span>
                <strong>{money(row.amount)}</strong>
              </div>
            ))}
          </div>
          <div className="report-v3-verification">
            <div><span>Pending review</span><strong>{requestCounts.pending}</strong></div>
            <div><span>Confirmed</span><strong>{requestCounts.confirmed}</strong></div>
            <div><span>Rejected</span><strong>{requestCounts.rejected}</strong></div>
          </div>
        </aside>
      </section>

      <section className="report-v3-settlement">
        <header>
          <div>
            <span className="report-v3-kicker">Online settlement</span>
            <h2>Razorpay cost recovery</h2>
            <p>The customer covers the gateway fee. RFG bears GST charged on that fee.</p>
          </div>
          <span>{confirmedRazorpayPayments.length} confirmed online payment{confirmedRazorpayPayments.length === 1 ? '' : 's'}</span>
        </header>
        <div className="report-v3-settlement-main">
          <div>
            <small>Gross customer payment</small>
            <strong>{moneyPrecise(razorpayGrossCustomerPayment)}</strong>
            <p>EMI plus the gateway fee recovered from the customer.</p>
          </div>
          <ArrowRight size={24} />
          <div className="net">
            <small>Net settlement to RFG</small>
            <strong>{moneyPrecise(razorpayNetSettlement)}</strong>
            <p>Expected after Razorpay deduction.</p>
          </div>
        </div>
        <div className="report-v3-settlement-breakdown">
          <RazorpaySettlementMetric label="EMI collected" value={razorpayEmiCollected} helper="Contractual EMI value" />
          <RazorpaySettlementMetric label="Fee recovered" value={razorpayFeeRecovered} helper="2% gateway fee" />
          <RazorpaySettlementMetric label="GST on fee" value={razorpayFeeGst} helper="18% of fee, borne by RFG" />
          <RazorpaySettlementMetric label="Gateway deduction" value={razorpayGatewayDeduction} helper="Fee plus GST" />
        </div>
      </section>

      <footer className="report-v3-footnote">
        <ShieldCheck size={17} />
        <span>Figures are calculated from recorded applications, confirmed payments and verification requests.</span>
        <strong>{money(rejectedCash)} rejected collection value</strong>
      </footer>
    </section>
  );
}

function ReportKpiCard({
  icon: Icon,
  label,
  value,
  helper,
  tone
}: {
  icon: typeof Gauge;
  label: string;
  value: string;
  helper: string;
  tone: string;
}) {
  return (
    <article className={`report-v3-kpi ${tone}`}>
      <span><Icon size={19} /></span>
      <div>
        <small>{label}</small>
        <strong>{value}</strong>
        <p>{helper}</p>
      </div>
    </article>
  );
}

function RazorpaySettlementMetric({
  label,
  value,
  helper,
  emphasis = false
}: {
  label: string;
  value: number;
  helper: string;
  emphasis?: boolean;
}) {
  return (
    <article className={emphasis ? 'emphasis' : ''}>
      <span>{label}</span>
      <strong>{moneyPrecise(value)}</strong>
      <small>{helper}</small>
    </article>
  );
}

function AggregateFinanceChart({
  rows
}: {
  rows: Array<{ label: string; value: number; tone: string }>;
}) {
  const maxValue = Math.max(...rows.map((row) => row.value), 1);
  const gridValues = [maxValue, maxValue * 0.75, maxValue * 0.5, maxValue * 0.25, 0];

  return (
    <section className="aggregate-finance-chart">
      <header>
        <div>
          <span className="section-kicker">Financial comparison</span>
          <h2>Total Finance Graph</h2>
          <p>Aggregate loan stages, collections and finance charges recorded in the system.</p>
        </div>
        <div className="aggregate-chart-legend">
          <span><i className="loan" />Loan stages</span>
          <span><i className="collection" />Collections</span>
          <span><i className="charge" />Finance charges</span>
        </div>
      </header>
      <div className="aggregate-chart-body">
        <div className="aggregate-chart-axis" aria-hidden="true">
          {gridValues.map((value) => <span key={value}>{compactMoney(value)}</span>)}
        </div>
        <div className="aggregate-chart-plot">
          <div className="aggregate-chart-grid" aria-hidden="true">
            {gridValues.map((value) => <span key={value} />)}
          </div>
          <div className="aggregate-chart-bars">
            {rows.map((row) => (
              <div className="aggregate-chart-column" key={row.label}>
                <div className="aggregate-chart-value">{money(row.value)}</div>
                <div className="aggregate-chart-bar-track">
                  <span
                    className={row.tone}
                    style={{ height: `${Math.max((row.value / maxValue) * 100, row.value > 0 ? 4 : 0)}%` }}
                  />
                </div>
                <strong>{row.label}</strong>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function FinanceSplitCard({
  icon: Icon,
  title,
  helper,
  totalLabel,
  total,
  segments
}: {
  icon: typeof Gauge;
  title: string;
  helper: string;
  totalLabel: string;
  total: number;
  segments: Array<{ label: string; value: number; tone: string }>;
}) {
  return (
    <article className="finance-split-card">
      <div className="finance-split-head">
        <span><Icon size={19} /></span>
        <div>
          <h2>{title}</h2>
          <p>{helper}</p>
        </div>
        <div>
          <small>{totalLabel}</small>
          <strong>{money(total)}</strong>
        </div>
      </div>
      <div className="finance-split-track">
        {segments.map((segment) => (
          <span
            className={segment.tone}
            key={segment.label}
            style={{ width: `${total > 0 ? Math.max((segment.value / total) * 100, segment.value > 0 ? 2 : 0) : 0}%` }}
          />
        ))}
      </div>
      <div className="finance-split-items">
        {segments.map((segment) => (
          <div className={segment.tone} key={segment.label}>
            <span>{segment.label}</span>
            <strong>{money(segment.value)}</strong>
          </div>
        ))}
      </div>
    </article>
  );
}

function FinanceReportColumn({
  icon: Icon,
  title,
  tone,
  leadLabel,
  leadValue,
  items
}: {
  icon: typeof Gauge;
  title: string;
  tone: string;
  leadLabel: string;
  leadValue: string;
  items: Array<[string, string]>;
}) {
  return (
    <article className={`finance-report-column ${tone}`}>
      <header>
        <span><Icon size={17} /></span>
        <strong>{title}</strong>
      </header>
      <div className="finance-report-lead">
        <span>{leadLabel}</span>
        <strong>{leadValue}</strong>
      </div>
      <div className="finance-report-items">
        {items.map(([label, value]) => (
          <div key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
          </div>
        ))}
      </div>
    </article>
  );
}

function FinanceWorkflowPanel({
  icon: Icon,
  title,
  rows
}: {
  icon: typeof Gauge;
  title: string;
  rows: Array<[string, number, number, string]>;
}) {
  return (
    <article className="finance-workflow-panel">
      <header>
        <span><Icon size={18} /></span>
        <h2>{title}</h2>
      </header>
      <div>
        {rows.map(([label, value, total, tone]) => (
          <div className="finance-workflow-row" key={label}>
            <div>
              <span>{label}</span>
              <strong>{value}</strong>
            </div>
            <div className="finance-workflow-track">
              <span className={tone} style={{ width: `${Math.min((value / Math.max(total, 1)) * 100, 100)}%` }} />
            </div>
          </div>
        ))}
      </div>
    </article>
  );
}

function AdminActivity({
  applications,
  logs,
  archives
}: {
  applications: Application[];
  logs: ActivityLog[];
  archives: LogArchive[];
}) {
  const [page, setPage] = useState(1);
  const fallbackRows: ActivityLog[] = applications.flatMap((item) =>
    item.activity.map((activity, index) => ({
      id: `${item.id}-${index}`,
      text: `${activity} (${item.id})`,
      createdAt: item.date
    }))
  );
  const rows = logs.length ? logs : fallbackRows;
  const pagination = paginateItems(rows, page, 20);
  const groupedRows = pagination.items.reduce<Array<{ key: string; label: string; rows: ActivityLog[] }>>((groups, row) => {
    const validDate = parseAuditDate(row.createdAt);
    const key = validDate.toISOString().slice(0, 10);
    const existing = groups.find((group) => group.key === key);
    if (existing) {
      existing.rows.push(row);
    } else {
      groups.push({
        key,
        label: formatAuditDate(validDate),
        rows: [row]
      });
    }
    return groups;
  }, []);
  useEffect(() => {
    if (page > pagination.totalPages) setPage(pagination.totalPages);
  }, [page, pagination.totalPages]);

  return (
    <section className="panel page-panel activity-page">
      <div className="panel-header activity-page-head">
        <div>
          <p className="eyebrow">Audit logs</p>
          <h1>Activity Logs</h1>
          <p>Chronological record of administrative actions and system events. Older records move automatically to private monthly archives.</p>
        </div>
        <span className="activity-live-state"><span />Live records</span>
      </div>

      <section className="activity-summary-strip">
        <article>
          <span><FileClock size={19} /></span>
          <div><small>Recent records</small><strong>{rows.length}</strong></div>
        </article>
        <article>
          <span><Archive size={19} /></span>
          <div><small>Archived months</small><strong>{archives.length}</strong></div>
        </article>
        <article className="activity-retention-card">
          <span><ShieldCheck size={19} /></span>
          <div><small>Retention policy</small><strong>Current + previous month</strong></div>
        </article>
      </section>

      <div className="activity-archive-layout">
        <section className="activity-timeline-panel">
          <div className="activity-section-head">
            <div>
              <h2>Audit trail</h2>
              <p>Newest actions appear first.</p>
            </div>
            <span>{rows.length} record{rows.length === 1 ? '' : 's'}</span>
          </div>

          <div className="activity-timeline">
            {groupedRows.map((group) => (
              <section className="activity-day-group" key={group.key}>
                <div className="activity-date-divider">
                  <span />
                  <strong>{group.label}</strong>
                  <span />
                </div>
                <div className="activity-day-rows">
                  {group.rows.map((row) => {
                    const meta = getActivityMeta(row.text);
                    const Icon = meta.icon;
                    return (
                      <article className={`activity-event ${meta.tone}`} key={row.id}>
                        <span className="activity-event-dot" />
                        <span className="activity-event-icon"><Icon size={19} /></span>
                        <div className="activity-event-copy">
                          <strong>{row.text}</strong>
                          <span>{meta.description}</span>
                        </div>
                        <div className="activity-event-meta">
                          <span>{shortAuditId(row.id)}</span>
                          <time>{formatAuditTime(row.createdAt)}</time>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>
            ))}
            {rows.length === 0 && <EmptyState title="No recent activity" text="Admin and sales actions will appear here." />}
          </div>
          <AdminPagination {...pagination} total={rows.length} label="activity records" onPageChange={setPage} />
        </section>

        <aside className="archive-history">
          <div className="archive-history-head">
            <span><Archive size={19} /></span>
            <div>
              <h2>Archive history</h2>
              <p>Private monthly storage</p>
            </div>
          </div>
          <div className="archive-month-list">
            {archives.map((archive) => (
              <article className="archive-month-row" key={archive.id}>
                <span className="archive-month-icon"><Archive size={17} /></span>
                <div>
                  <strong>{formatArchiveMonth(archive.archiveMonth)}</strong>
                  <span>{archive.activityCount + archive.loginCount} log records</span>
                  <span className="archive-provider">{formatArchiveProvider(archive.storageProvider)}</span>
                </div>
                <div>
                  <strong>{formatBytes(archive.sizeBytes)}</strong>
                  <span>{formatFullDate(archive.archivedAt.slice(0, 10))}</span>
                </div>
              </article>
            ))}
            {archives.length === 0 && (
              <div className="archive-empty">
                <Archive size={22} />
                <strong>No archived months yet</strong>
                <span>The first row appears after logs become older than the two-month retention window.</span>
              </div>
            )}
          </div>
        </aside>
      </div>
    </section>
  );
}

function getActivityMeta(text: string): {
  icon: typeof Gauge;
  tone: 'success' | 'info' | 'warning' | 'neutral';
  description: string;
} {
  const value = text.toLowerCase();
  if (value.includes('payment') || value.includes('cash')) {
    return { icon: Banknote, tone: 'success', description: 'Payment and collection workflow activity.' };
  }
  if (value.includes('activate') || value.includes('approved') || value.includes('status')) {
    return { icon: CheckCircle2, tone: 'success', description: 'Loan status or approval workflow updated.' };
  }
  if (value.includes('mpin') || value.includes('login') || value.includes('staff')) {
    return { icon: ShieldCheck, tone: 'info', description: 'Account access or security action recorded.' };
  }
  if (value.includes('application') || value.includes('loan')) {
    return { icon: ClipboardCheck, tone: 'info', description: 'Application or loan record updated.' };
  }
  if (value.includes('setting') || value.includes('config')) {
    return { icon: Gauge, tone: 'warning', description: 'Administrative configuration changed.' };
  }
  return { icon: FileClock, tone: 'neutral', description: 'System activity recorded in the audit trail.' };
}

function ReportMetricGroup({ title, items }: { title: string; items: Array<[string, string, string]> }) {
  return (
    <section className={`report-metric-group ${financeToneForGroup(title)}`}>
      <h2>{title}</h2>
      <div>
        {items.map(([label, value, helper]) => (
          <article className={`report-metric-row ${financeToneForLabel(label)}`} key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
            <p>{helper}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function ReportCountPanel({ title, rows }: { title: string; rows: Array<[string, number]> }) {
  const total = Math.max(rows.reduce((sum, [, value]) => sum + value, 0), 1);
  return (
    <section className="report-count-panel">
      <h2>{title}</h2>
      {rows.map(([label, value]) => (
        <div className="report-count-row" key={label}>
          <span>{label}</span>
          <strong>{value}</strong>
          <MiniBar value={value} total={total} tone={label.toLowerCase().includes('confirmed') || label === 'Active' ? 'success' : label.toLowerCase().includes('verification') || label.toLowerCase().includes('processing') ? 'warning' : 'info'} />
        </div>
      ))}
    </section>
  );
}

function AdminStaff({
  staffProfiles,
  currentProfileId,
  onStaffUpdate,
  onStaffInvite,
  onStaffPasswordReset
}: {
  staffProfiles: StaffProfile[];
  currentProfileId: string | null;
  onStaffUpdate: (profileId: string, changes: Partial<Pick<StaffProfile, 'active' | 'role'>>) => void;
  onStaffInvite: (input: { fullName: string; email: string; active: boolean }) => Promise<void>;
  onStaffPasswordReset: (profileId: string) => Promise<void>;
}) {
  const [showInvite, setShowInvite] = useState(false);
  const [inviteName, setInviteName] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteActive, setInviteActive] = useState(true);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState('');
  const [resetProfile, setResetProfile] = useState<StaffProfile | null>(null);
  const activeAdminCount = staffProfiles.filter((profile) => profile.role === 'admin' && profile.active).length;
  const activeSalesCount = staffProfiles.filter((profile) => profile.role === 'sales' && profile.active).length;

  const submitInvite = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError('');
    if (inviteName.trim().length < 2) return setFormError('Enter the staff member\'s full name.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(inviteEmail.trim())) return setFormError('Enter a valid staff email.');
    setBusy(true);
    try {
      await onStaffInvite({ fullName: inviteName.trim(), email: inviteEmail.trim().toLowerCase(), active: inviteActive });
      setInviteName('');
      setInviteEmail('');
      setInviteActive(true);
      setShowInvite(false);
    } catch (error) {
      setFormError(getErrorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const sendReset = async () => {
    if (!resetProfile || busy) return;
    setBusy(true);
    setFormError('');
    try {
      await onStaffPasswordReset(resetProfile.id);
      setResetProfile(null);
    } catch (error) {
      setResetProfile(null);
      setFormError(getErrorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="panel page-panel staff-users-page">
      <div className="panel-header staff-users-header">
        <div>
          <p className="eyebrow">Access control</p>
          <h1>Staff Users</h1>
          <p>Approve staff accounts and manage access within the configured team limits.</p>
        </div>
        <button className="primary-action" disabled={activeSalesCount >= 2 || busy} onClick={() => { setShowInvite((current) => !current); setFormError(''); }}>
          <Plus size={18} />
          {activeSalesCount >= 2 ? 'Sales Limit Reached' : 'Add Staff'}
        </button>
      </div>
      {showInvite && (
        <form className="staff-invite-form" onSubmit={submitInvite}>
          <div className="staff-invite-heading">
            <div>
              <p className="eyebrow">Secure invitation</p>
              <h2>Add Sales Staff</h2>
              <p>The staff member receives a single-use link and creates their own password.</p>
            </div>
            <button className="icon-button" aria-label="Close invitation form" onClick={() => setShowInvite(false)} type="button"><X size={18} /></button>
          </div>
          <div className="staff-invite-fields">
            <label>
              <span>Full Name</span>
              <input autoComplete="name" maxLength={100} onChange={(event) => setInviteName(event.target.value)} placeholder="Enter full name" value={inviteName} />
            </label>
            <label>
              <span>Email</span>
              <input autoComplete="email" maxLength={254} onChange={(event) => setInviteEmail(event.target.value)} placeholder="name@example.com" type="email" value={inviteEmail} />
            </label>
            <label className="staff-invite-access">
              <span>Access after setup</span>
              <select onChange={(event) => setInviteActive(event.target.value === 'active')} value={inviteActive ? 'active' : 'inactive'}>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </label>
          </div>
          {formError && <p className="dialog-error" role="alert">{formError}</p>}
          <div className="staff-invite-actions">
            <button className="soft-button" onClick={() => setShowInvite(false)} type="button">Cancel</button>
            <button className="primary-action" disabled={busy} type="submit"><Mail size={17} />{busy ? 'Sending...' : 'Send Invitation'}</button>
          </div>
        </form>
      )}
      {!showInvite && formError && <p className="staff-page-error" role="alert">{formError}</p>}
      <div className="staff-capacity-strip">
        <StaffCapacity
          icon={ShieldCheck}
          label="Admin seats"
          value={activeAdminCount}
          limit={1}
          helper="One active administrator"
          tone="admin"
        />
        <StaffCapacity
          icon={UsersRound}
          label="Sales seats"
          value={activeSalesCount}
          limit={2}
          helper="Up to two active members"
          tone="sales"
        />
        <div className="staff-capacity-note">
          <span className="staff-policy-icon"><ShieldCheck size={20} /></span>
          <div>
            <span>Access policy</span>
            <strong>{staffProfiles.filter((profile) => profile.active).length} active users</strong>
            <p>One administrator and up to two active sales members.</p>
          </div>
        </div>
      </div>
      <div className="staff-roster">
        <div className="staff-roster-head">
          <div>
            <span>Team directory</span>
            <strong>{staffProfiles.length} staff account{staffProfiles.length === 1 ? '' : 's'}</strong>
          </div>
          <span>Role and access status</span>
        </div>
        {staffProfiles.map((profile) => (
          <article className={`staff-row ${profile.role}`} key={profile.id}>
            <div className="staff-identity">
              <span className="staff-avatar">
                {profile.role === 'admin' ? <ShieldCheck size={18} /> : <UserRound size={18} />}
              </span>
              <div>
                <strong>{profile.fullName}</strong>
                <span>{profile.email}</span>
              </div>
            </div>
            <div className="staff-role-copy">
              <span>Role</span>
              <strong>{profile.role === 'admin' ? 'Administrator' : 'Sales member'}</strong>
              <small>Created {formatDate(profile.createdAt)}</small>
            </div>
            <div className="staff-row-actions">
              <StatusChip status={profile.active ? 'Approved' : 'Verification Pending'} />
              {profile.id === currentProfileId && profile.role === 'admin' ? (
                <span className="staff-self-note">Current admin</span>
              ) : (
                <>
                  {profile.role === 'sales' && (
                    <button className="soft-button staff-reset-button" disabled={busy} onClick={() => setResetProfile(profile)} type="button">
                      <Mail size={16} /> Send Reset Link
                    </button>
                  )}
                  <button
                    className={profile.active ? 'soft-button danger-action' : 'primary-small'}
                    disabled={busy}
                    onClick={() => onStaffUpdate(profile.id, { active: !profile.active })}
                    type="button"
                  >
                    {profile.active ? 'Deactivate' : 'Activate'}
                  </button>
                </>
              )}
            </div>
          </article>
        ))}
        {staffProfiles.length === 0 && <EmptyState title="No staff profiles found" text="Invite the first Sales staff member from this page." />}
      </div>
      {resetProfile && (
        <ConfirmActionDialog
          action={{
            title: 'Send password reset link?',
            message: `A single-use password link will be emailed to ${resetProfile.email}. The Admin will not see or choose the new password.`,
            confirmLabel: busy ? 'Sending...' : 'Send Reset Link',
            tone: 'warning',
            onConfirm: () => undefined
          }}
          onCancel={() => setResetProfile(null)}
          onConfirm={() => void sendReset()}
        />
      )}
    </section>
  );
}

function StaffCapacity({
  icon: Icon,
  label,
  value,
  limit,
  helper,
  tone
}: {
  icon: typeof Gauge;
  label: string;
  value: number;
  limit: number;
  helper: string;
  tone: string;
}) {
  return (
    <article className={`staff-capacity ${tone}`}>
      <span className="staff-capacity-icon"><Icon size={18} /></span>
      <div>
        <span>{label}</span>
        <strong>{value}<small>/{limit}</small></strong>
        <p>{helper}</p>
      </div>
      <MiniBar value={value} total={limit} tone={tone === 'admin' ? 'info' : 'success'} />
    </article>
  );
}

function AdminSettings({
  settings,
  onSave
}: {
  settings: PaymentSettings;
  onSave: (settings: PaymentSettings) => Promise<void>;
}) {
  const [draft, setDraft] = useState(settings);
  const [saving, setSaving] = useState(false);
  useEffect(() => setDraft(settings), [settings]);
  const hasChanges = JSON.stringify(draft) !== JSON.stringify(settings);
  const update = <K extends keyof PaymentSettings>(key: K, value: PaymentSettings[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));
  const submit = async () => {
    setSaving(true);
    try {
      await onSave(draft);
    } catch {
      // The parent action already displays the database error.
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="settings-page">
      <header className="settings-page-head">
        <div>
          <p className="eyebrow">Configuration</p>
          <h1>Settings</h1>
          <p>Manage how staff collect payments and what admins verify.</p>
        </div>
        <span className={hasChanges ? 'settings-save-state changed' : 'settings-save-state'}>
          <CheckCircle2 size={15} />
          {hasChanges ? 'Unsaved changes' : 'Settings saved'}
        </span>
      </header>

      <div className="settings-workspace">
        <div className="settings-main-column">
          <section className="settings-main settings-payment-card">
            <div className="settings-section-head">
              <span className="settings-section-icon"><WalletCards size={20} /></span>
              <div>
                <h2>Payment methods</h2>
                <p>Choose which collection options staff can use.</p>
              </div>
            </div>

            <div className="payment-method-list">
              <PaymentMethodToggle
                icon={Banknote}
                title="Office payment requests"
                description="Sales records Cash or Bank Transfer / QR for admin verification."
                checked={draft.cashRequestEnabled}
                onChange={(value) => setDraft((current) => ({
                  ...current,
                  cashRequestEnabled: value,
                  manualBankQrEnabled: value
                }))}
              />
              <PaymentMethodToggle
                icon={ShieldCheck}
                title="Razorpay"
                description="Enable after the client gateway account is connected."
                checked={draft.razorpayEnabled}
                onChange={(value) => update('razorpayEnabled', value)}
                badge="Setup required"
              />
            </div>
          </section>

        </div>

        <aside className="settings-integrations">
          <div className="settings-integrations-head">
            <span><Bell size={19} /></span>
            <div>
              <p>Connected services</p>
              <h2>Integrations</h2>
            </div>
          </div>
          <p className="settings-integrations-copy">These services will be activated as their accounts and credentials become available.</p>
          <div className="integration-list">
            <IntegrationStatus icon={Bell} title="Firebase" detail="Android EMI reminders" status="Planned" />
            <IntegrationStatus icon={Phone} title="OTP / SMS" detail="Guarantor verification messages" status="Paid setup" />
            <IntegrationStatus icon={ShieldCheck} title="Login alerts" detail="New-device admin email" status="Next" />
          </div>
          <div className="settings-security-note">
            <ShieldCheck size={18} />
            <div>
              <strong>Admin controlled</strong>
              <span>Sales users cannot change payment receiver settings.</span>
            </div>
          </div>
        </aside>
      </div>

      <footer className="settings-save-bar settings-page-save-bar">
        <div>
          <strong>Payment configuration</strong>
          <span>{hasChanges ? 'Review the changes before saving.' : 'All changes are saved.'}</span>
        </div>
        <div className="settings-save-actions">
          <button className="settings-discard-button" onClick={() => setDraft(settings)} disabled={!hasChanges || saving} type="button">
            Discard changes
          </button>
          <button className="primary-action" onClick={() => void submit()} disabled={saving || !hasChanges} type="button">
            {saving ? 'Saving...' : 'Save Changes'}
            <Save size={17} />
          </button>
        </div>
      </footer>
    </section>
  );
}

function PaymentMethodToggle({
  icon: Icon,
  title,
  description,
  checked,
  onChange,
  badge
}: {
  icon: typeof CreditCard;
  title: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  badge?: string;
}) {
  return (
    <div className={checked ? 'payment-method-row enabled' : 'payment-method-row'}>
      <span className="payment-method-icon"><Icon size={19} /></span>
      <div className="payment-method-copy">
        <div>
          <strong>{title}</strong>
          {badge && <span className="method-badge">{badge}</span>}
        </div>
        <p>{description}</p>
      </div>
      <button
        className={checked ? 'settings-switch active' : 'settings-switch'}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={`${checked ? 'Disable' : 'Enable'} ${title}`}
        onClick={() => onChange(!checked)}
      >
        <span />
      </button>
    </div>
  );
}

function IntegrationStatus({
  icon: Icon,
  title,
  detail,
  status
}: {
  icon: typeof Bell;
  title: string;
  detail: string;
  status: string;
}) {
  return (
    <div className="integration-row">
      <span className="integration-icon"><Icon size={17} /></span>
      <div>
        <strong>{title}</strong>
        <span>{detail}</span>
      </div>
      <small>{status}</small>
    </div>
  );
}

function AdminQueue({
  title,
  applications,
  onSelect,
  onOpen
}: {
  title: string;
  applications: Application[];
  onSelect: (id: string) => void;
  onOpen?: () => void;
}) {
  return (
    <article className="panel dashboard-queue-panel application-queue-panel">
      <div className="panel-header">
        <div>
          <h2>{title}</h2>
          <p>Newest applications requiring a decision</p>
        </div>
        <button className="queue-head-action" onClick={onOpen} type="button">
          View all
          <ArrowRight size={15} />
        </button>
      </div>
      <div className="card-list">
        {applications.map((item) => (
          <button className="list-card" key={item.id} onClick={() => onSelect(item.id)} type="button">
            <div>
              <strong>{item.customerName}</strong>
              <span>{item.id} - {money(item.loanAmount)}</span>
            </div>
            <StatusChip status={item.status} />
          </button>
        ))}
        {applications.length === 0 && (
          <div className="dashboard-empty-state">
            <span><Archive size={26} /></span>
            <strong>No applications waiting</strong>
            <p>New loan applications requiring processing will appear here automatically.</p>
            <button onClick={onOpen} type="button">Open applications</button>
          </div>
        )}
      </div>
    </article>
  );
}

function AdminCashQueue({
  requests,
  onSelect,
  onOpen
}: {
  requests: CashRequest[];
  onSelect: (id: string) => void;
  onOpen?: () => void;
}) {
  return (
    <article className="panel dashboard-queue-panel bank-queue-panel">
      <div className="panel-header">
        <div>
          <h2>Payment Verification</h2>
          <p>Confirm only after checking the incoming bank transfer</p>
        </div>
        <button className="queue-head-action" onClick={onOpen} type="button">
          View all
          <ArrowRight size={15} />
        </button>
      </div>
      <div className="card-list">
        {requests.map((item) => (
          <button className="list-card" key={item.id} onClick={() => onSelect(item.applicationId)} type="button">
            <div>
              <strong>{item.customerName}</strong>
              <span>{item.id} - {money(item.amount)}</span>
            </div>
            <StatusChip status={item.status} />
          </button>
        ))}
        {requests.length === 0 && (
          <div className="dashboard-empty-state">
            <span><Banknote size={26} /></span>
            <strong>No payment checks</strong>
            <p>Manual QR requests needing physical bank confirmation will appear here.</p>
            <button onClick={onOpen} type="button">Open verification</button>
          </div>
        )}
      </div>
    </article>
  );
}

function AccountMenu({ label, onSignOut }: { label: string; onSignOut: () => void }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="account-menu">
      <button className="user-pill" onClick={() => setOpen((current) => !current)} aria-expanded={open} aria-haspopup="menu">
        <UserRound size={17} />
        {label}
      </button>
      {open && (
        <div className="account-dropdown" role="menu">
          <span>{label}</span>
          <button onClick={onSignOut} role="menuitem" type="button">
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}

function adminMobileLabel(label: AdminView) {
  if (label === 'Admin Dashboard') return 'Home';
  if (label === 'New Application') return 'New';
  if (label === 'Applications Review') return 'Review';
  if (label === 'Payment Verification') return 'Verify';
  if (label === 'Guarantors/Showrooms') return 'Guarantors';
  return label;
}

function Dashboard({
  applications,
  cashRequests,
  emiSchedule,
  payments,
  onNavigate,
  onOpenApplications,
  onSelect
}: {
  applications: Application[];
  cashRequests: CashRequest[];
  emiSchedule: EmiItem[];
  payments: PaymentItem[];
  onNavigate: (view: View) => void;
  onOpenApplications: (filter: LoanStatus | 'All') => void;
  onSelect: (id: string) => void;
}) {
  const underProcessing = applications.filter((application) => application.status === 'Under Processing').length;
  const activeLoans = applications.filter((application) => application.status === 'Active').length;
  const pendingCash = cashRequests.filter((request) => request.status === 'Verification Pending').length;
  const activeApplicationKeys = new Set(
    applications
      .filter((application) => application.status === 'Active')
      .flatMap((application) => [application.id, application.supabaseId].filter(Boolean) as string[])
  );
  const pendingEmis = emiSchedule.filter((item) => {
    const status = getEffectiveEmiStatus(item);
    return activeApplicationKeys.has(item.applicationId) && (status === 'Pending' || status === 'Overdue');
  }).length;
  const collectionMonths = useMemo(() => {
    const applicationKeys = new Set(
      applications.flatMap((application) => [application.id, application.supabaseId].filter(Boolean) as string[])
    );
    const now = new Date();
    const months = Array.from({ length: 6 }, (_, index) => {
      const date = new Date(now.getFullYear(), now.getMonth() - (5 - index), 1);
      return {
        key: `${date.getFullYear()}-${date.getMonth()}`,
        label: date.toLocaleDateString('en-IN', { month: 'short' }),
        amount: 0
      };
    });
    const monthByKey = new Map(months.map((month) => [month.key, month]));

    payments.forEach((payment) => {
      if (!applicationKeys.has(payment.applicationId) || !isConfirmedPaymentStatus(payment.status)) return;
      const paymentDate = new Date(payment.verifiedAt || payment.createdAt);
      if (Number.isNaN(paymentDate.getTime())) return;
      const month = monthByKey.get(`${paymentDate.getFullYear()}-${paymentDate.getMonth()}`);
      if (month) month.amount += Number(payment.amount) || 0;
    });

    return months;
  }, [applications, payments]);
  const highestMonthlyCollection = Math.max(...collectionMonths.map((month) => month.amount), 0);

  return (
    <>
      <section className="hero-panel">
        <div>
          <p className="eyebrow">Welcome, Sales</p>
          <h1>What needs attention today?</h1>
          <p className="hero-copy">Create applications, follow pending customers, and record office payments for admin verification.</p>
        </div>
        <button className="primary-action" onClick={() => onNavigate('New Application')}>
          <Plus size={18} />
          New Application
        </button>
      </section>

      <section className="metric-grid sales-metrics" aria-label="Sales metrics">
        <Metric label="Under Processing" value={underProcessing} helper="Admin review needed" icon={FileClock} tone="info" onClick={() => onOpenApplications('Under Processing')} />
        <Metric label="Active Loans" value={activeLoans} helper="Customers paying EMI" icon={CheckCircle2} tone="success" onClick={() => onNavigate('Customers')} />
        <Metric label="Pending EMIs" value={pendingEmis} helper="Follow up this month" icon={CalendarClock} tone="warning" onClick={() => onNavigate('Pending EMI')} />
        <Metric label="Payment Requests" value={pendingCash} helper="Waiting admin verification" icon={Banknote} tone="warning" onClick={() => onNavigate('Payment Requests')} />
      </section>

      <section className="content-grid">
        <article className="panel wide">
          <div className="panel-header">
            <div>
              <h2>My Applications</h2>
              <p>Tap View to open full details</p>
            </div>
            <button className="soft-button" onClick={() => onNavigate('Applications')}>
              View All
              <ArrowRight size={16} />
            </button>
          </div>
          <ApplicationTable applications={applications.slice(0, 5)} onSelect={onSelect} compact />
        </article>

        <article className="panel">
          <div className="panel-header">
            <div>
              <h2>Sales Workflow</h2>
              <p>Simple office steps</p>
            </div>
            <ClipboardCheck size={20} />
          </div>
          <div className="timeline">
            {['Create', 'Checklist', 'Guarantor', 'Login', 'Payment Request', 'Admin Review'].map((label, index) => (
              <div className={index < 4 ? 'timeline-step done' : 'timeline-step'} key={label}>
                <span>{index < 4 ? <CheckCircle2 size={14} /> : <span />}</span>
                <strong>{label}</strong>
              </div>
            ))}
          </div>
        </article>

        <article className="panel wide">
          <div className="panel-header">
            <div>
              <h2>Collections - Last 6 Months</h2>
              <p>Confirmed customer payments</p>
            </div>
            <WalletCards size={20} />
          </div>
          <div className="bar-chart" aria-label="Confirmed collections for the last six months">
            {collectionMonths.map((month) => {
              const height = highestMonthlyCollection > 0 ? (month.amount / highestMonthlyCollection) * 100 : 0;
              return (
              <div className="bar-item" key={month.key} title={`${month.label}: ${money(month.amount)}`}>
                <strong>{month.amount > 0 ? money(month.amount) : 'Rs 0'}</strong>
                <div className="bar-track">
                  <span className={month.amount === 0 ? 'empty' : ''} style={{ height: `${height}%` }} />
                </div>
                <small>{month.label}</small>
              </div>
            )})}
          </div>
        </article>

        <article className="panel">
          <div className="panel-header">
            <div>
              <h2>Need Help?</h2>
              <p>Plain actions for staff</p>
            </div>
            <Phone size={20} />
          </div>
          <div className="help-list">
            <button onClick={() => onNavigate('New Application')}>Create new application</button>
            <button onClick={() => onNavigate('Payment Requests')}>Check payment requests</button>
            <button onClick={() => onNavigate('Customers')}>Find customer login</button>
          </div>
        </article>
      </section>
    </>
  );
}

function CreateApplication({
  draft,
  setDraft,
  step,
  setStep,
  onSave,
    onCancel,
    workspaceLabel = 'Sales workflow'
  }: {
  draft: Draft;
  setDraft: React.Dispatch<React.SetStateAction<Draft>>;
  step: number;
  setStep: (step: number) => void;
    onSave: () => void;
    onCancel: () => void;
    workspaceLabel?: string;
  }) {
  const steps = ['Customer', 'Product', 'Guarantor & Showroom', 'Loan Values', 'Checklist', 'Review'];
  const [guarantorOtp, setGuarantorOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [customerOtp, setCustomerOtp] = useState('');
  const [customerOtpSent, setCustomerOtpSent] = useState(false);
  const otpDemoEnabled = ['localhost', '127.0.0.1'].includes(window.location.hostname);
  const calculatedEmi = calculateEmiAmount(
    draft.loanAmount,
    draft.chargeAmount,
    draft.processingFee,
    draft.tenure
  );
  const update = (key: keyof Draft, value: string | ProductCategory) => setDraft((current) => ({ ...current, [key]: value }));
  const updateCheck = (key: keyof Checklist, value: boolean) =>
    setDraft((current) => ({ ...current, checklist: { ...current.checklist, [key]: value } }));
  const goNext = () => {
    const error = getStepError(step, draft);
    if (error) {
      window.dispatchEvent(new CustomEvent('rfg-toast', { detail: error }));
      return;
    }
    setStep(Math.min(steps.length - 1, step + 1));
  };
  const moveToStep = (targetStep: number) => {
    if (targetStep <= step) {
      setStep(targetStep);
      return;
    }

    for (let currentStep = 0; currentStep < targetStep; currentStep += 1) {
      const error = getStepError(currentStep, draft);
      if (error) {
        window.dispatchEvent(new CustomEvent('rfg-toast', { detail: error }));
        setStep(currentStep);
        return;
      }
    }
    setStep(targetStep);
  };

  useEffect(() => {
    setDraft((current) => {
      const nextEmi = calculatedEmi > 0 ? calculatedEmi.toFixed(2) : '';
      return current.emiAmount === nextEmi ? current : { ...current, emiAmount: nextEmi };
    });
  }, [calculatedEmi, setDraft]);

  return (
    <section className="panel app-form-panel">
      <div className="panel-header">
        <div>
          <p className="eyebrow">{workspaceLabel}</p>
          <h1>Create Application</h1>
          <p>Fill the required typed details. Optional fields are clearly marked.</p>
        </div>
        <button className="soft-button" onClick={onCancel}>
          <ChevronLeft size={16} />
          Back
        </button>
      </div>

      <div className="steps step-nav">
        {steps.map((label, index) => (
          <button className={step === index ? 'current' : ''} key={label} onClick={() => moveToStep(index)}>
            {index + 1}. {label}
          </button>
        ))}
      </div>

      {step === 0 && (
        <div className="field-grid two-col">
          <TextField label="Customer Name" value={draft.customerName} onChange={(value) => update('customerName', value)} />
          <TextField label="Mobile Number" value={draft.mobile} onChange={(value) => update('mobile', value)} />
          <TextField label="Alternate Mobile" value={draft.alternateMobile} onChange={(value) => update('alternateMobile', value)} />
          <TextField label="Address" value={draft.address} onChange={(value) => update('address', value)} />
          <TextField label="Pincode" value={draft.customerPincode} onChange={(value) => update('customerPincode', value)} />
          <div className={draft.checklist.customerOtp ? 'guarantor-otp-card customer-otp-card verified' : 'guarantor-otp-card customer-otp-card'}>
            <div>
              <span className="otp-icon"><ShieldCheck size={20} /></span>
              <div>
                <strong>Customer mobile verification <span className="optional-label">Optional for now</span></strong>
                <p>This does not block the application until the SMS provider is connected.</p>
              </div>
            </div>
            <div className="guarantor-otp-controls">
              <button
                className="soft-button"
                type="button"
                disabled={!otpDemoEnabled || !/^[0-9]{10}$/.test(draft.mobile.replace(/\D/g, ''))}
                onClick={() => {
                  setCustomerOtpSent(true);
                  window.dispatchEvent(new CustomEvent('rfg-toast', { detail: 'Demo customer OTP sent. SMS service will be connected later.' }));
                }}
              >
                {customerOtpSent ? 'Resend OTP' : 'Send OTP'}
              </button>
              <input
                aria-label="Customer OTP"
                inputMode="numeric"
                maxLength={6}
                placeholder="Enter OTP"
                value={customerOtp}
                disabled={!otpDemoEnabled || !customerOtpSent || draft.checklist.customerOtp}
                onChange={(event) => setCustomerOtp(event.target.value.replace(/\D/g, ''))}
              />
              <button
                className="primary-small"
                type="button"
                disabled={!otpDemoEnabled || !customerOtpSent || draft.checklist.customerOtp}
                onClick={() => {
                  if (customerOtp.length < 4) {
                    window.dispatchEvent(new CustomEvent('rfg-toast', { detail: 'Enter the demo OTP to mark customer verification complete.' }));
                    return;
                  }
                  updateCheck('customerOtp', true);
                  window.dispatchEvent(new CustomEvent('rfg-toast', { detail: 'Customer OTP marked verified for frontend testing.' }));
                }}
              >
                {draft.checklist.customerOtp ? 'Verified' : 'Verify'}
              </button>
            </div>
          </div>
        </div>
      )}

      {step === 1 && (
        <div className="field-grid two-col">
          <label>
            Product Category
            <select value={draft.category} onChange={(event) => update('category', event.target.value as ProductCategory)}>
              <option>Two-Wheeler</option>
              <option>Electronics</option>
              <option>Others</option>
            </select>
          </label>
          <TextField label="Product Name" value={draft.productName} onChange={(value) => update('productName', value)} />
          <TextField
            label={draft.category === 'Electronics' ? 'IMEI / Serial Number' : draft.category === 'Two-Wheeler' ? 'Vehicle Number' : 'Reference Number'}
            value={draft.assetId}
            onChange={(value) => update('assetId', value)}
          />
          <TextField label="Remarks (Optional)" value={draft.remarks} onChange={(value) => update('remarks', value)} />
        </div>
      )}

      {step === 2 && (
        <>
          <div className="party-section-head">
            <div>
              <span>Guarantor details</span>
              <strong>The guarantor will verify their mobile number by OTP.</strong>
            </div>
            <span className="setup-badge">OTP setup later</span>
          </div>
          <div className="field-grid two-col">
            <TextField label="Guarantor Name" value={draft.guarantorName} onChange={(value) => update('guarantorName', value)} />
            <TextField label="Guarantor Mobile" value={draft.guarantorMobile} onChange={(value) => update('guarantorMobile', value)} />
            <TextField label="Guarantor Address" value={draft.guarantorAddress} onChange={(value) => update('guarantorAddress', value)} />
            <TextField label="Guarantor Pincode" value={draft.guarantorPincode} onChange={(value) => update('guarantorPincode', value)} />
          </div>
          <div className={draft.checklist.sellerOtp ? 'guarantor-otp-card verified' : 'guarantor-otp-card'}>
            <div>
              <span className="otp-icon"><ShieldCheck size={20} /></span>
              <div>
                <strong>Guarantor mobile verification <span className="optional-label">Optional for now</span></strong>
                <p>This does not block the application until the SMS provider is connected.</p>
              </div>
            </div>
            <div className="guarantor-otp-controls">
              <button
                className="soft-button"
                type="button"
                disabled={!otpDemoEnabled}
                onClick={() => {
                  setOtpSent(true);
                  window.dispatchEvent(new CustomEvent('rfg-toast', { detail: 'Demo OTP sent. SMS service will be connected later.' }));
                }}
              >
                {otpSent ? 'Resend OTP' : 'Send OTP'}
              </button>
              <input
                aria-label="Guarantor OTP"
                inputMode="numeric"
                maxLength={6}
                placeholder="Enter OTP"
                value={guarantorOtp}
                disabled={!otpDemoEnabled || !otpSent || draft.checklist.sellerOtp}
                onChange={(event) => setGuarantorOtp(event.target.value.replace(/\D/g, ''))}
              />
              <button
                className="primary-small"
                type="button"
                disabled={!otpDemoEnabled || !otpSent || draft.checklist.sellerOtp}
                onClick={() => {
                  if (guarantorOtp.length < 4) {
                    window.dispatchEvent(new CustomEvent('rfg-toast', { detail: 'Enter the demo OTP to mark verification complete.' }));
                    return;
                  }
                  updateCheck('sellerOtp', true);
                  window.dispatchEvent(new CustomEvent('rfg-toast', { detail: 'Guarantor OTP marked verified for frontend testing.' }));
                }}
              >
                {draft.checklist.sellerOtp ? 'Verified' : 'Verify'}
              </button>
            </div>
          </div>
          <div className="party-section-head showroom-head">
            <div>
              <span>Showroom details</span>
              <strong>Enter the showroom providing the product.</strong>
            </div>
          </div>
          <div className="field-grid two-col">
            <TextField label="Showroom Name" value={draft.showroomName} onChange={(value) => update('showroomName', value)} />
            <TextField label="Showroom Mobile" value={draft.showroomMobile} onChange={(value) => update('showroomMobile', value)} />
          </div>
        </>
      )}

      {step === 3 && (
        <div className="field-grid two-col">
          <TextField label="Product Price" value={draft.productPrice} onChange={(value) => update('productPrice', value)} />
          <TextField label="Down Payment" value={draft.downPayment} onChange={(value) => update('downPayment', value)} />
          <TextField label="Loan Amount" value={draft.loanAmount} onChange={(value) => update('loanAmount', value)} />
          <TextField label="Charge Amount" value={draft.chargeAmount} onChange={(value) => update('chargeAmount', value)} />
          <TextField label="Processing Fee" value={draft.processingFee} onChange={(value) => update('processingFee', value)} />
          <TextField label="Tenure in Months" value={draft.tenure} onChange={(value) => update('tenure', value)} />
          <TextField label="EMI Amount (Automatic)" value={draft.emiAmount} onChange={() => undefined} readOnly />
          <TextField
            label="Total Loan Value (Automatic)"
            value={money(toNumber(draft.loanAmount) + toNumber(draft.chargeAmount) + toNumber(draft.processingFee))}
            onChange={() => undefined}
            readOnly
          />
          <div className="automatic-emi-note">
            <strong>Automatic EMI formula</strong>
            <span>(Loan Amount + Charge Amount + Processing Fee) / Tenure</span>
          </div>
          <div className="automatic-schedule-note">
            <CalendarClock size={20} />
            <div>
              <strong>EMI dates are automatic</strong>
              <span>The first EMI is due one calendar month after admin confirms the actual disbursement.</span>
            </div>
          </div>
        </div>
      )}

      {step === 4 && (
        <div className="check-card-grid">
          <CheckCard label="Aadhaar received physically" checked={draft.checklist.aadhaar} onChange={(value) => updateCheck('aadhaar', value)} />
          <CheckCard label="PAN received physically" checked={draft.checklist.pan} onChange={(value) => updateCheck('pan', value)} />
          <CheckCard label="Address proof received" checked={draft.checklist.address} onChange={(value) => updateCheck('address', value)} />
          <CheckCard label="Photo received physically" checked={draft.checklist.photo} onChange={(value) => updateCheck('photo', value)} />
          <CheckCard label="Signature taken" checked={draft.checklist.signature} onChange={(value) => updateCheck('signature', value)} />
          {draft.category === 'Two-Wheeler' && (
            <>
              <CheckCard label="RC copy checked physically" checked={draft.checklist.rc} onChange={(value) => updateCheck('rc', value)} />
              <CheckCard label="Insurance checked physically" checked={draft.checklist.insurance} onChange={(value) => updateCheck('insurance', value)} />
            </>
          )}
          {draft.category === 'Electronics' && (
            <CheckCard label="IMEI / Serial noted" checked={draft.checklist.serialChecked} onChange={(value) => updateCheck('serialChecked', value)} />
          )}
        </div>
      )}

      {step === 5 && <ReviewDraft draft={draft} />}

      <div className="form-actions">
        <button className="soft-button" onClick={() => setStep(Math.max(0, step - 1))}>
          Previous
        </button>
        {step < steps.length - 1 ? (
          <button className="primary-action" onClick={goNext}>
            Next Step
            <ArrowRight size={16} />
          </button>
        ) : (
          <button className="primary-action" onClick={onSave}>
            Save Application
            <CheckCircle2 size={16} />
          </button>
        )}
      </div>
    </section>
  );
}

function ApplicationDetail({
  application,
  emiSchedule,
  onBack,
  onResetPassword,
  onConfirmSeller,
  onCreateCashRequest
}: {
  application: Application;
  emiSchedule: EmiItem[];
  onBack: () => void;
  onResetPassword: (id: string) => void;
  onConfirmSeller: (id: string) => void;
  onCreateCashRequest: (
    application: Application,
    amount: number,
    selectedEmi: EmiItem,
    remarks: string,
    requestMode: 'cash' | 'manual_bank_qr',
    paymentReference: string
  ) => void;
}) {
  const [cashAmount, setCashAmount] = useState(String(application.emiAmount || ''));
  const [requestMode, setRequestMode] = useState<'cash' | 'manual_bank_qr'>('cash');
  const [paymentReference, setPaymentReference] = useState('');
  const visibleEmiSchedule = getRenderableEmiSchedule(application, emiSchedule);
  const pendingEmis = getPaymentEligibleEmis(visibleEmiSchedule);
  const [emiMonth, setEmiMonth] = useState(pendingEmis[0]?.emiMonth || '');
  const [cashRemarks, setCashRemarks] = useState('');
  useEffect(() => {
    setEmiMonth(pendingEmis[0]?.emiMonth || '');
    setCashAmount(String(pendingEmis[0] ? getEmiPayableAmount(pendingEmis[0]) : application.emiAmount || ''));
  }, [application.id, visibleEmiSchedule.length]);
  const selectedEmi = pendingEmis.find((item) => item.emiMonth === emiMonth);
  const selectedPenalty = selectedEmi ? getEmiPenaltyAmount(selectedEmi) : 0;
  const selectedDuePassed = selectedEmi ? isEmiDueDatePassed(selectedEmi) : false;
  const totalLoanPayable = application.loanAmount + application.chargeAmount + application.processingFee;
  const paidSoFar = visibleEmiSchedule
    .reduce((sum, item) => sum + getEmiPaidAmount(item), 0);
  const remainingPayable = visibleEmiSchedule
    .reduce((sum, item) => sum + getEmiPayableAmount(item), 0);
  const selectedDueAmount = selectedEmi ? getEmiPayableAmount(selectedEmi) : 0;
  const selectedShortAmount = selectedEmi ? Math.max(selectedDueAmount - toNumber(cashAmount), 0) : 0;
  const revealedMpin = application.customerPassword !== 'Hidden for security'
    ? application.customerPassword
    : null;
  const requestSalesMpinReset = () => {
    if (!window.confirm('Reset this customer MPIN? A new MPIN will be shown once and the previous MPIN will stop working.')) return;
    onResetPassword(application.id);
  };

  return (
    <section className="detail-layout sales-loan-file">
      <div className="sales-loan-hero">
        <button className="soft-button sales-back-button" onClick={onBack}>
          <ChevronLeft size={16} />
          Back
        </button>
        <div className="sales-loan-identity">
          <p className="eyebrow">{application.id}</p>
          <h1>{application.customerName}</h1>
          <p>{application.mobile} · {application.category} · {application.productName}</p>
        </div>
        <div className="sales-loan-status-card">
          <StatusChip status={application.status} />
          <span>Loan file</span>
        </div>
      </div>

      <div className="sales-file-summary">
        <article className="sales-file-main-card">
          <div className="sales-file-main-head">
            <div>
              <p className="eyebrow">Loan Summary</p>
              <h2>{money(totalLoanPayable)}</h2>
              <span>Total payable including charges and processing fee</span>
            </div>
            <div className="sales-file-product-icon">
              <ProductCategoryIcon category={application.category} size={26} />
            </div>
          </div>
          <div className="sales-file-mini-grid">
            <span>
              <small>EMI Amount</small>
              <strong>{money(application.emiAmount)}</strong>
            </span>
            <span>
              <small>Tenure</small>
              <strong>{application.tenure || 0} months</strong>
            </span>
            <span>
              <small>Remaining</small>
              <strong>{money(remainingPayable)}</strong>
            </span>
          </div>
        </article>

        <article className="sales-access-card">
          <div>
            <ShieldCheck size={20} />
            <div>
              <h2>Customer Login</h2>
              <p>Share after offline verification</p>
            </div>
          </div>
          <div className="sales-access-values">
            <span><small>Loan ID</small><strong>{application.loginId}</strong></span>
            <span>
              <small>{revealedMpin ? 'New MPIN' : 'MPIN'}</small>
              <strong aria-label={revealedMpin ? 'New MPIN' : 'MPIN protected'}>{revealedMpin || 'Protected'}</strong>
            </span>
          </div>
          {application.status === 'Active' ? (
            <>
              <button className="primary-action full-width" onClick={requestSalesMpinReset} type="button">Reset MPIN</button>
              <p className="sales-mpin-restriction"><ShieldCheck size={16} /> Verify the customer offline. A new MPIN is shown only once.</p>
            </>
          ) : (
            <p className="sales-mpin-restriction"><ShieldCheck size={16} /> MPIN reset becomes available after activation.</p>
          )}
        </article>
      </div>

      <div className="detail-grid sales-file-grid">
        <article className="panel wide sales-finance-panel">
          <div className="panel-header">
            <div>
              <h2>Finance Breakdown</h2>
              <p>Product, disbursement and repayment values</p>
            </div>
            <Banknote size={20} />
          </div>
          <div className="sales-finance-tiles">
            <span><small>Product Price</small><strong>{money(application.productPrice)}</strong></span>
            <span><small>Down Payment</small><strong>{money(application.downPayment)}</strong></span>
            <span><small>Loan Amount</small><strong>{money(application.loanAmount)}</strong></span>
            <span><small>Charge Amount</small><strong>{money(application.chargeAmount)}</strong></span>
            <span><small>Processing Fee</small><strong>{money(application.processingFee)}</strong></span>
            <span><small>Total Loan Value</small><strong>{money(totalLoanPayable)}</strong></span>
            <span><small>Paid So Far</small><strong>{money(paidSoFar)}</strong></span>
          </div>
          <InfoRows
            rows={[
              ['Product', application.productName || 'Not entered'],
              ['Asset / ID', application.assetId || 'Not entered'],
              ['Total Loan Value', money(totalLoanPayable)],
              ['Disbursed On', application.disbursedAt ? formatDateTime(application.disbursedAt) : 'Not disbursed yet'],
              ['First EMI Due', visibleEmiSchedule[0]?.dueDate ? formatFullDate(visibleEmiSchedule[0].dueDate) : 'Generated after disbursement']
            ]}
          />
        </article>

        <article className="panel sales-party-panel">
          <div className="panel-header">
            <div>
              <h2>Guarantor</h2>
              <p>Physical verification details</p>
            </div>
            <ShieldCheck size={20} />
          </div>
          <InfoRows
            rows={[
              ['Name', application.guarantorName || 'Not entered'],
              ['Mobile', application.guarantorMobile || 'Not entered'],
              ['Address', application.guarantorAddress || 'Not entered'],
              ['Pincode', application.guarantorPincode || 'Not entered']
            ]}
          />
        </article>

        <article className="panel sales-party-panel">
          <div className="panel-header">
            <div>
              <h2>Showroom</h2>
              <p>Entered from application</p>
            </div>
            <Store size={20} />
          </div>
          <InfoRows
            rows={[
              ['Name', application.showroomName || 'Not entered'],
              ['Mobile', application.showroomMobile || 'Not entered']
            ]}
          />
        </article>

        {application.status === 'Active' && (
        <article className="panel">
          <div className="panel-header">
            <div>
              <h2>Record Customer Payment</h2>
              <p>Admin verification required</p>
            </div>
            <Banknote size={20} />
          </div>
          <div className="field-stack">
            <div className="office-payment-method-field">
              <span className="field-label" id="payment-method-label">Payment Method</span>
              <div className="office-payment-method-selector" role="radiogroup" aria-labelledby="payment-method-label">
                <button
                  className={requestMode === 'cash' ? 'selected' : ''}
                  type="button"
                  role="radio"
                  aria-checked={requestMode === 'cash'}
                  onClick={() => setRequestMode('cash')}
                >
                  <span className="office-payment-method-icon"><Banknote size={20} /></span>
                  <span><strong>Cash</strong><small>Received at the office</small></span>
                  <span className="office-payment-method-check"><CheckCircle2 size={18} /></span>
                </button>
                <button
                  className={requestMode === 'manual_bank_qr' ? 'selected' : ''}
                  type="button"
                  role="radio"
                  aria-checked={requestMode === 'manual_bank_qr'}
                  onClick={() => setRequestMode('manual_bank_qr')}
                >
                  <span className="office-payment-method-icon"><CreditCard size={20} /></span>
                  <span><strong>Bank Transfer / QR</strong><small>Requires transaction reference</small></span>
                  <span className="office-payment-method-check"><CheckCircle2 size={18} /></span>
                </button>
              </div>
            </div>
            <label>
              <span className="field-label">EMI</span>
              <select
                value={emiMonth}
                onChange={(event) => {
                  const next = pendingEmis.find((item) => item.emiMonth === event.target.value);
                  setEmiMonth(event.target.value);
                  if (next) setCashAmount(String(getEmiPayableAmount(next)));
                }}
              >
                <option value="">Select pending EMI</option>
                {pendingEmis.map((item) => (
                  <option value={item.emiMonth} key={item.id}>
                    {item.emiMonth} - {money(getEmiPayableAmount(item))} - due {formatDate(item.dueDate)}
                  </option>
                ))}
              </select>
            </label>
            <TextField label="Amount Received" value={cashAmount} onChange={setCashAmount} />
            {requestMode === 'manual_bank_qr' && (
              <TextField label="UTR / Transaction ID" value={paymentReference} onChange={setPaymentReference} />
            )}
            {selectedEmi && selectedShortAmount > 0 && toNumber(cashAmount) > 0 && (
              <div className="automatic-emi-note carry-forward-active-note">
                <strong>Partial EMI collected</strong>
                <span>Short by {money(selectedShortAmount)}. After admin approval, this balance will be added to the next EMI.</span>
              </div>
            )}
            {selectedEmi && selectedDuePassed && (
              <div className={selectedPenalty > 0 ? 'automatic-emi-note penalty-active-note' : 'automatic-emi-note grace-active-note'}>
                <strong>{selectedPenalty > 0 ? 'Penalty active' : 'Grace period running'}</strong>
                <span>
                  {selectedPenalty > 0
                    ? `Grace period ended. ${money(FIXED_EMI_PENALTY_AMOUNT)} penalty added to this EMI.`
                    : `Due date passed. Grace period ends on ${formatFullDate(getEmiGraceEndDate(selectedEmi))}.`}
                </span>
              </div>
            )}
            <TextField label="Remarks" value={cashRemarks} onChange={setCashRemarks} />
          </div>
          <button
            className="primary-action full-width"
            onClick={() => {
              if (!selectedEmi) {
                window.dispatchEvent(new CustomEvent('rfg-toast', { detail: 'Select a pending EMI before submitting payment.' }));
                return;
              }
              onCreateCashRequest(application, toNumber(cashAmount), selectedEmi, cashRemarks, requestMode, paymentReference);
            }}
          >
            Submit Payment Request
          </button>
          {pendingEmis.length === 0 && <p className="form-help">No pending EMI is available for a payment request.</p>}
        </article>
        )}

        <article className="panel wide">
          <div className="panel-header">
            <div>
              <h2>EMI Schedule</h2>
              <p>Generated from the confirmed disbursement date</p>
            </div>
            <CalendarClock size={20} />
          </div>
          <div className="sales-emi-schedule-wrap">
            <EmiScheduleList items={visibleEmiSchedule} />
          </div>
          <div className="sales-loan-total-strip">
            <span>
              <small>Total Loan Amount</small>
              <strong>{money(totalLoanPayable)}</strong>
            </span>
            <span>
              <small>Paid So Far</small>
              <strong>{money(paidSoFar)}</strong>
            </span>
            <span>
              <small>Remaining</small>
              <strong>{money(remainingPayable)}</strong>
            </span>
          </div>
        </article>

        <article className="panel wide">
          <div className="panel-header">
            <div>
              <h2>Checklist</h2>
              <p>No files uploaded, only physical check ticks</p>
            </div>
            <ClipboardCheck size={20} />
          </div>
          <ChecklistSummary checklist={application.checklist} category={application.category} />
        </article>

        <article className="panel wide">
          <div className="panel-header">
            <div>
              <h2>Activity</h2>
              <p>Recent actions</p>
            </div>
            <FileClock size={20} />
          </div>
          <div className="activity-list">
            {application.activity.map((item, index) => (
              <div key={`${item}-${index}`}>
                <span />
                {item}
              </div>
            ))}
          </div>
        </article>
      </div>
    </section>
  );
}

function ApplicationsView({
  applications,
  statusFilter,
  onStatusFilterChange,
  onSelect,
  onNew
}: {
  applications: Application[];
  statusFilter: LoanStatus | 'All';
  onStatusFilterChange: (filter: LoanStatus | 'All') => void;
  onSelect: (id: string) => void;
  onNew: () => void;
}) {
  const filters: Array<LoanStatus | 'All'> = ['All', 'Under Processing', 'Approved', 'Active', 'Rejected', 'Closed'];
  const [page, setPage] = useState(1);
  const pagination = paginateItems(applications, page, 10);
  useEffect(() => setPage(1), [statusFilter]);
  useEffect(() => {
    if (page > pagination.totalPages) setPage(pagination.totalPages);
  }, [page, pagination.totalPages]);

  return (
    <section className="panel page-panel">
      <div className="panel-header">
        <div>
          <p className="eyebrow">Sales</p>
          <h1>Applications</h1>
          <p>View customer applications and continue sales work.</p>
        </div>
        <button className="primary-action" onClick={onNew}>
          <Plus size={18} />
          Create Loan
        </button>
      </div>
      <div className="status-filter-tabs sales-status-tabs" role="tablist" aria-label="Application status filter">
        {filters.map((filter) => (
          <button
            className={statusFilter === filter ? 'active' : ''}
            key={filter}
            onClick={() => onStatusFilterChange(filter)}
            type="button"
          >
            <span>{filter}</span>
          </button>
        ))}
      </div>
      <ApplicationTable applications={pagination.items} onSelect={onSelect} />
      <AdminPagination {...pagination} total={applications.length} label="applications" onPageChange={setPage} />
    </section>
  );
}

function CashRequestsView({
  requests,
  applications,
  onSelect
}: {
  requests: CashRequest[];
  applications: Application[];
  onSelect: (id: string) => void;
}) {
  const [requestPage, setRequestPage] = useState(1);
  const [customerPage, setCustomerPage] = useState(1);
  const eligibleApplications = applications.filter((application) => application.status !== 'Rejected');
  const requestPagination = paginateItems(requests, requestPage, 10);
  const customerPagination = paginateItems(eligibleApplications, customerPage, 10);
  useEffect(() => {
    if (requestPage > requestPagination.totalPages) setRequestPage(requestPagination.totalPages);
  }, [requestPage, requestPagination.totalPages]);
  useEffect(() => {
    if (customerPage > customerPagination.totalPages) setCustomerPage(customerPagination.totalPages);
  }, [customerPage, customerPagination.totalPages]);

  return (
    <section className="panel page-panel">
      <div className="panel-header">
        <div>
          <p className="eyebrow">Payments</p>
          <h1>Payment Requests</h1>
          <p>Cash and Bank Transfer / QR records submitted for admin verification.</p>
        </div>
        <Banknote size={24} />
      </div>
      <div className="card-list">
        {requests.length === 0 && <EmptyState title="No payment requests yet" text="Open an active loan and record a customer payment." />}
        {requestPagination.items.map((request) => (
          <button className="list-card" key={request.id} onClick={() => onSelect(request.applicationId)}>
            <div>
              <strong>{request.customerName}</strong>
              <span>{request.requestMode === 'manual_bank_qr' ? 'Bank Transfer / QR' : 'Cash'}</span>
              <span>{request.id} · {request.emiMonth} · {money(request.amount)}</span>
            </div>
            <StatusChip status={request.status} />
          </button>
        ))}
      </div>
      <AdminPagination {...requestPagination} total={requests.length} label="payment requests" onPageChange={setRequestPage} />
      <div className="mini-section">
        <h2>Create from customer</h2>
        <p>Select an active application below to record a customer payment.</p>
        <ApplicationTable applications={customerPagination.items} onSelect={onSelect} compact />
        <AdminPagination {...customerPagination} total={eligibleApplications.length} label="customers" onPageChange={setCustomerPage} />
      </div>
    </section>
  );
}

function PendingEmiView({
  applications,
  emiSchedule,
  onSelect
}: {
  applications: Application[];
  emiSchedule: EmiItem[];
  onSelect: (id: string) => void;
}) {
  const rows = getPendingEmiRows(applications, emiSchedule);
  const [page, setPage] = useState(1);
  const pagination = paginateItems(rows, page, 10);
  useEffect(() => {
    if (page > pagination.totalPages) setPage(pagination.totalPages);
  }, [page, pagination.totalPages]);

  return (
    <section className="panel page-panel">
      <div className="panel-header">
        <div>
          <p className="eyebrow">Follow-up</p>
          <h1>Pending EMI</h1>
          <p>Active customers with EMI payments still pending.</p>
        </div>
        <CalendarClock size={24} />
      </div>
      <div className="card-list emi-followup-list">
        {rows.length === 0 && <EmptyState title="No pending EMI customers" text="Active loan EMIs that need follow-up will appear here." />}
        {pagination.items.map(({ application, emi, status, penalty }) => (
          <button className="list-card emi-followup-card" key={emi.id} onClick={() => onSelect(application.id)} type="button">
            <div>
              <strong>{application.customerName}</strong>
              <span>{application.id} - {application.mobile}</span>
              <small>{emi.emiMonth} due {formatFullDate(emi.dueDate)}</small>
            </div>
            <div className="emi-followup-meta">
              <strong>{money(getEmiPayableAmount(emi))}</strong>
              <span className={penalty > 0 ? 'penalty-label' : isEmiDueDatePassed(emi) ? 'grace-label' : 'pending-label'}>
                {penalty > 0 ? `Penalty ${money(penalty)}` : isEmiDueDatePassed(emi) ? `Grace till ${formatFullDate(getEmiGraceEndDate(emi))}` : status}
              </span>
            </div>
            <ArrowRight size={18} />
          </button>
        ))}
      </div>
      <AdminPagination {...pagination} total={rows.length} label="pending EMIs" onPageChange={setPage} />
    </section>
  );
}

function CustomersView({
  applications,
  emiSchedule,
  onSelect
}: {
  applications: Application[];
  emiSchedule: EmiItem[];
  onSelect: (id: string) => void;
}) {
  const [riskFilter, setRiskFilter] = useState<'normal' | 'grace' | 'penalty'>('normal');
  const [page, setPage] = useState(1);
  const activeApplications = applications.filter((application) => application.status === 'Active');
  const graceApplicationIds = new Set(getApplicationsInGracePeriod(activeApplications, emiSchedule).map((application) => application.id));
  const penaltyApplicationIds = new Set(getApplicationsWithPenalty(activeApplications, emiSchedule).map((application) => application.id));
  const normalApplications = activeApplications.filter((application) => !graceApplicationIds.has(application.id) && !penaltyApplicationIds.has(application.id));
  const visibleApplications = activeApplications.filter((application) => {
    if (riskFilter === 'normal') return !graceApplicationIds.has(application.id) && !penaltyApplicationIds.has(application.id);
    if (riskFilter === 'grace') return graceApplicationIds.has(application.id);
    if (riskFilter === 'penalty') return penaltyApplicationIds.has(application.id);
    return false;
  });
  const pagination = paginateItems(visibleApplications, page, 12);
  useEffect(() => setPage(1), [riskFilter]);
  useEffect(() => {
    if (page > pagination.totalPages) setPage(pagination.totalPages);
  }, [page, pagination.totalPages]);

  return (
    <section className="panel page-panel">
      <div className="panel-header">
        <div>
          <p className="eyebrow">Customers</p>
          <h1>Active Loan Customers</h1>
          <p>Only customers whose loans are active and running EMI cycles.</p>
        </div>
        <UsersRound size={24} />
      </div>
      <div className="status-filter-tabs sales-status-tabs customer-risk-tabs" role="tablist" aria-label="Customer risk filter">
        <button className={riskFilter === 'normal' ? 'active' : ''} onClick={() => setRiskFilter('normal')} type="button">
          <span>Current</span>
          <strong>{normalApplications.length}</strong>
        </button>
        <button className={riskFilter === 'grace' ? 'active' : ''} onClick={() => setRiskFilter('grace')} type="button">
          <span>In Grace Period</span>
          <strong>{graceApplicationIds.size}</strong>
        </button>
        <button className={riskFilter === 'penalty' ? 'active danger' : ''} onClick={() => setRiskFilter('penalty')} type="button">
          <span>With Penalty</span>
          <strong>{penaltyApplicationIds.size}</strong>
        </button>
      </div>
      <div className="customer-grid">
        {visibleApplications.length === 0 && <EmptyState title="No active customers found" text="Active loans matching this filter will appear here." />}
        {pagination.items.map((application) => (
          <button className="customer-card" key={application.id} onClick={() => onSelect(application.id)}>
            <div className="customer-avatar">{application.customerName.slice(0, 1)}</div>
            <div>
              <strong>{application.customerName}</strong>
              <span>{application.mobile}</span>
              <small>{application.id}</small>
            </div>
            <div className="customer-risk-stack">
              <StatusChip status={application.status} />
              {penaltyApplicationIds.has(application.id) && <span className="penalty-label">Penalty</span>}
              {!penaltyApplicationIds.has(application.id) && graceApplicationIds.has(application.id) && <span className="grace-label">Grace</span>}
            </div>
          </button>
        ))}
      </div>
      <AdminPagination {...pagination} total={visibleApplications.length} label="customers" onPageChange={setPage} />
    </section>
  );
}

function ApplicationTable({
  applications,
  onSelect,
  compact = false
}: {
  applications: Application[];
  onSelect: (id: string) => void;
  compact?: boolean;
}) {
  if (applications.length === 0) {
    return <EmptyState title="No applications found" text="Create first application or change your search." />;
  }

  return (
    <div>
      <div className="table-scroll">
        <table className={compact ? 'compact-table' : ''}>
          <thead>
            <tr>
              <th>Loan ID</th>
              <th>Customer</th>
              <th>Mobile</th>
              <th>Product</th>
              <th>Amount</th>
              <th>Status</th>
              <th>Date</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {applications.map((application) => (
              <tr className="clickable-table-row" key={application.id} onClick={() => onSelect(application.id)}>
                <td>{application.id}</td>
                <td>{application.customerName}</td>
                <td>{application.mobile}</td>
                <td>{application.productName || application.category}</td>
                <td>{money(application.loanAmount)}</td>
                <td><StatusChip status={application.status} /></td>
                <td>{application.date}</td>
                <td><button className="text-button" onClick={(event) => { event.stopPropagation(); onSelect(application.id); }} type="button">View</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mobile-card-list">
        {applications.map((application) => (
          <button className="application-card" key={application.id} onClick={() => onSelect(application.id)}>
            <div className="application-card-top">
              <div>
                <span>{application.id}</span>
                <strong>{application.customerName}</strong>
              </div>
              <StatusChip status={application.status} />
            </div>
            <div className="application-card-grid">
              <span>Mobile <strong>{application.mobile}</strong></span>
              <span>Product <strong>{application.productName || application.category}</strong></span>
              <span>Amount <strong>{money(application.loanAmount)}</strong></span>
              <span>Date <strong>{application.date}</strong></span>
            </div>
            <div className="application-card-action">
              View Details
              <ArrowRight size={16} />
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

function PortfolioStageChart({
  rows,
  total
}: {
  rows: Array<{ label: string; value: number; tone: string }>;
  total: number;
}) {
  return (
    <div className="portfolio-stage-chart" aria-label="Loan stage amount distribution">
      {rows.map((row) => (
        <div className="portfolio-stage-row" key={row.label}>
          <div>
            <span>{row.label}</span>
            <strong>{money(row.value)}</strong>
          </div>
          <div className="portfolio-stage-track">
            <span
              className={row.tone}
              style={{ width: `${Math.min(Math.max((row.value / total) * 100, row.value > 0 ? 6 : 0), 100)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function AttentionAction({
  icon: Icon,
  label,
  helper,
  value,
  tone,
  onClick
}: {
  icon: typeof Gauge;
  label: string;
  helper: string;
  value: number;
  tone: string;
  onClick: () => void;
}) {
  return (
    <button className={`attention-action ${tone}`} onClick={onClick} type="button">
      <span className="attention-action-icon">
        <Icon size={18} />
      </span>
      <span className="attention-action-copy">
        <strong>{label}</strong>
        <small>{helper}</small>
      </span>
      <span className="attention-action-value">{formatDashboardWorkloadCount(value)}</span>
      <ArrowRight className="attention-action-arrow" size={16} />
    </button>
  );
}

function Metric({
  label,
  value,
  helper,
  icon: Icon,
  tone,
  onClick
}: {
  label: string;
  value: number | string;
  helper: string;
  icon: typeof Gauge;
  tone: string;
  onClick?: () => void;
}) {
  const content = (
    <>
      <div className="metric-icon">
        <Icon size={20} />
      </div>
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
        <p>{helper}</p>
      </div>
    </>
  );

  if (onClick) {
    return (
      <button className={`metric-card metric-button ${tone}`} onClick={onClick} type="button">
        {content}
      </button>
    );
  }

  return (
    <article className={`metric-card ${tone}`}>
      {content}
    </article>
  );
}

function FinanceCard({ label, value, helper }: { label: string; value: string; helper: string }) {
  return (
    <article className={`finance-card ${financeToneForLabel(label)}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <p>{helper}</p>
    </article>
  );
}

function DashboardFinanceTile({
  label,
  value,
  helper,
  amount,
  total,
  tone
}: {
  label: string;
  value: string;
  helper: string;
  amount: number;
  total: number;
  tone: string;
}) {
  return (
    <article className={`dashboard-finance-tile tone-${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <p>{helper}</p>
      <MiniBar value={amount} total={total} tone={tone} />
    </article>
  );
}

function financeToneForGroup(title: string) {
  const normalized = title.toLowerCase();
  if (normalized.includes('collection')) return 'tone-warning';
  if (normalized.includes('loan stage')) return 'tone-success';
  return 'tone-info';
}

function financeToneForLabel(label: string) {
  const normalized = label.toLowerCase();

  if (normalized.includes('rejected') || normalized.includes('overdue')) return 'tone-danger';
  if (
    normalized.includes('pending')
    || normalized.includes('processing')
    || normalized.includes('verification')
    || normalized.includes('charge')
  ) return 'tone-warning';
  if (
    normalized.includes('active')
    || normalized.includes('confirmed')
    || normalized.includes('paid')
    || normalized.includes('collected')
  ) return 'tone-success';
  if (normalized.includes('closed')) return 'tone-neutral';
  return 'tone-info';
}

function MiniBar({ value, total, tone }: { value: number; total: number; tone: string }) {
  const width = `${Math.min(Math.max((value / Math.max(total, 1)) * 100, value > 0 ? 6 : 0), 100)}%`;
  return (
    <div className="mini-bar" aria-hidden="true">
      <span className={tone} style={{ width }} />
    </div>
  );
}

function TotalFinanceGraph({
  title,
  total,
  segments
}: {
  title: string;
  total: number;
  segments: Array<{ label: string; value: number; tone: string }>;
}) {
  const visibleSegments = segments.filter((segment) => segment.value > 0);
  const safeTotal = Math.max(total, visibleSegments.reduce((sum, segment) => sum + segment.value, 0), 1);

  return (
    <article className="total-graph-card">
      <div className="total-graph-head">
        <span>{title}</span>
        <strong>{money(total)}</strong>
      </div>
      <div className="total-graph-track" aria-label={title}>
        {visibleSegments.length ? (
          visibleSegments.map((segment) => (
            <span
              className={`total-graph-segment ${segment.tone}`}
              key={segment.label}
              style={{ width: `${Math.max((segment.value / safeTotal) * 100, 4)}%` }}
              title={`${segment.label}: ${money(segment.value)}`}
            />
          ))
        ) : (
          <span className="total-graph-empty" />
        )}
      </div>
      <div className="total-graph-legend">
        {segments.map((segment) => (
          <div key={segment.label}>
            <i className={segment.tone} />
            <span>{segment.label}</span>
            <strong>{money(segment.value)}</strong>
          </div>
        ))}
      </div>
    </article>
  );
}

function TextField({
  label,
  value,
  onChange,
  readOnly = false
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  readOnly?: boolean;
}) {
  return (
    <label>
      <span className="field-label">{label}</span>
      <input
        className={readOnly ? 'calculated-input' : ''}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={readOnly ? 'Calculated automatically' : `Enter ${label.toLowerCase()}`}
        readOnly={readOnly}
      />
    </label>
  );
}

function CheckCard({
  label,
  checked,
  onChange
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className={checked ? 'check-card selected' : 'check-card'}>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

function ReviewDraft({ draft }: { draft: Draft }) {
  const totalLoanValue = toNumber(draft.loanAmount) + toNumber(draft.chargeAmount) + toNumber(draft.processingFee);
  return (
    <div className="review-grid">
      <InfoBlock title="Customer" rows={[['Name', draft.customerName || 'Not entered'], ['Mobile', draft.mobile || 'Not entered'], ['Address', draft.address || 'Not entered'], ['Pincode', draft.customerPincode || 'Not entered'], ['OTP', draft.checklist.customerOtp ? 'Verified' : 'Pending setup']]} />
      <InfoBlock title="Product" rows={[['Category', draft.category], ['Product', draft.productName || 'Not entered'], ['Asset', draft.assetId || 'Not entered']]} />
      <InfoBlock title="Loan" rows={[['Loan Amount', money(toNumber(draft.loanAmount))], ['Charge Amount', money(toNumber(draft.chargeAmount))], ['Processing Fee', money(toNumber(draft.processingFee))], ['Total Loan Value', money(totalLoanValue)], ['EMI', money(toNumber(draft.emiAmount))]]} />
      <InfoBlock title="Guarantor" rows={[['Name', draft.guarantorName || 'Not entered'], ['Mobile', draft.guarantorMobile || 'Not entered'], ['Address', draft.guarantorAddress || 'Not entered'], ['Pincode', draft.guarantorPincode || 'Not entered'], ['OTP', draft.checklist.sellerOtp ? 'Verified' : 'Pending setup']]} />
      <InfoBlock title="Showroom" rows={[['Name', draft.showroomName || 'Not entered'], ['Mobile', draft.showroomMobile || 'Not entered']]} />
    </div>
  );
}

function InfoBlock({ title, rows }: { title: string; rows: string[][] }) {
  return (
    <div className="info-block">
      <h2>{title}</h2>
      <InfoRows rows={rows} />
    </div>
  );
}

function InfoRows({ rows }: { rows: string[][] }) {
  return (
    <div className="info-rows">
      {rows.map(([label, value]) => (
        <div key={label}>
          <span>{label}</span>
          <strong>{value}</strong>
        </div>
      ))}
    </div>
  );
}

function ChecklistSummary({ checklist, category }: { checklist: Checklist; category: ProductCategory }) {
  const rows: Array<[keyof Checklist, string]> = [
    ['aadhaar', 'Aadhaar received physically'],
    ['pan', 'PAN received physically'],
    ['address', 'Address proof received'],
    ['photo', 'Photo received physically'],
    ['signature', 'Signature taken'],
    ['customerOtp', checklist.customerOtp ? 'Customer OTP verified' : 'Customer OTP pending setup (optional)'],
    ['sellerOtp', checklist.sellerOtp ? 'Guarantor OTP verified' : 'Guarantor OTP pending setup (optional)']
  ];
  if (category === 'Two-Wheeler') {
    rows.push(['rc', 'RC checked physically'], ['insurance', 'Insurance checked physically']);
  }
  if (category === 'Electronics') {
    rows.push(['serialChecked', 'IMEI / Serial noted']);
  }

  return (
    <div className="checklist-summary">
      {rows.map(([key, label]) => (
        <span className={checklist[key] ? 'done' : ''} key={key}>
          {checklist[key] ? <CheckCircle2 size={15} /> : <AlertCircle size={15} />}
          {label}
        </span>
      ))}
    </div>
  );
}

function getStepError(step: number, draft: Draft): string {
  if (step === 0) {
    if (!draft.customerName.trim()) return 'Customer name is mandatory.';
    if (!draft.mobile.trim()) return 'Customer mobile number is mandatory.';
    if (!/^[0-9]{10}$/.test(draft.mobile.replace(/\D/g, ''))) return 'Enter a valid 10 digit customer mobile number.';
    if (!draft.alternateMobile.trim()) return 'Alternate mobile number is mandatory.';
    if (!/^[0-9]{10}$/.test(draft.alternateMobile.replace(/\D/g, ''))) return 'Enter a valid 10 digit alternate mobile number.';
    if (!draft.address.trim()) return 'Customer address is mandatory.';
    if (!/^[0-9]{6}$/.test(draft.customerPincode.replace(/\D/g, ''))) return 'Enter a valid 6 digit customer pincode.';
  }

  if (step === 1) {
    if (!draft.category) return 'Product category is mandatory.';
    if (!draft.productName.trim()) return 'Product name is mandatory.';
    if (draft.category === 'Two-Wheeler' && !draft.assetId.trim()) return 'Vehicle number is mandatory for two-wheeler.';
    if (draft.category === 'Electronics' && !draft.assetId.trim()) return 'IMEI or serial number is mandatory for electronics.';
    if (draft.category === 'Others' && !draft.assetId.trim()) return 'Reference number is mandatory for others.';
  }

  if (step === 2) {
    if (!draft.guarantorName.trim()) return 'Guarantor name is mandatory.';
    if (!draft.guarantorMobile.trim()) return 'Guarantor mobile number is mandatory.';
    if (!/^[0-9]{10}$/.test(draft.guarantorMobile.replace(/\D/g, ''))) return 'Enter a valid 10 digit guarantor mobile number.';
    if (!draft.guarantorAddress.trim()) return 'Guarantor address is mandatory.';
    if (!/^[0-9]{6}$/.test(draft.guarantorPincode.replace(/\D/g, ''))) return 'Enter a valid 6 digit guarantor pincode.';
    if (!draft.showroomName.trim()) return 'Showroom name is mandatory.';
    if (!draft.showroomMobile.trim()) return 'Showroom mobile number is mandatory.';
    if (!/^[0-9]{10}$/.test(draft.showroomMobile.replace(/\D/g, ''))) return 'Enter a valid 10 digit showroom mobile number.';
  }

  if (step === 3) {
    if (!hasNumber(draft.productPrice) || toNumber(draft.productPrice) <= 0) return 'Enter a valid product price.';
    if (!hasNumber(draft.downPayment) || toNumber(draft.downPayment) < 0) return 'Enter the down payment. Use 0 when there is no down payment.';
    if (!hasNumber(draft.loanAmount) || toNumber(draft.loanAmount) <= 0) return 'Enter a valid loan amount.';
    if (!hasNumber(draft.chargeAmount) || toNumber(draft.chargeAmount) < 0) return 'Enter the finance charge. Use 0 when there is no charge.';
    if (!hasNumber(draft.processingFee) || toNumber(draft.processingFee) < 0) return 'Enter the processing fee. Use 0 when there is no processing fee.';
    if (!hasNumber(draft.tenure) || toNumber(draft.tenure) <= 0) return 'Enter a valid tenure.';
    if (!hasNumber(draft.emiAmount) || toNumber(draft.emiAmount) <= 0) return 'Enter a valid EMI amount.';
  }

  if (step === 4) {
    const required: Array<[boolean, string]> = [
      [draft.checklist.aadhaar, 'Aadhaar received physically is mandatory.'],
      [draft.checklist.pan, 'PAN received physically is mandatory.'],
      [draft.checklist.address, 'Address proof received is mandatory.'],
      [draft.checklist.photo, 'Photo received physically is mandatory.'],
      [draft.checklist.signature, 'Signature taken is mandatory.']
    ];

    if (draft.category === 'Two-Wheeler') {
      required.push([draft.checklist.rc, 'RC checked physically is mandatory for two-wheeler.']);
      required.push([draft.checklist.insurance, 'Insurance checked physically is mandatory for two-wheeler.']);
    }

    if (draft.category === 'Electronics') {
      required.push([draft.checklist.serialChecked, 'IMEI / serial noted is mandatory for electronics.']);
    }

    const missing = required.find(([done]) => !done);
    if (missing) return missing[1];
  }

  if (step === 5) {
    for (let currentStep = 0; currentStep <= 4; currentStep += 1) {
      const error = getStepError(currentStep, draft);
      if (error) return error;
    }
  }

  return '';
}

function AdminDeviceVerificationScreen({
  gate,
  onVerify,
  onResend,
  onSignOut
}: {
  gate: Exclude<AdminDeviceGate, null>;
  onVerify: (otp: string) => Promise<void>;
  onResend: () => Promise<void>;
  onSignOut: () => void;
}) {
  const [otp, setOtp] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [seconds, setSeconds] = useState(gate.status === 'challenge' ? gate.retryAfterSeconds : 0);

  useEffect(() => {
    setSeconds(gate.status === 'challenge' ? gate.retryAfterSeconds : 0);
    setOtp('');
    setError('');
  }, [gate.status, gate.status === 'challenge' ? gate.challengeId : '']);

  useEffect(() => {
    if (seconds <= 0) return;
    const timer = window.setInterval(() => setSeconds((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [seconds > 0]);

  const verify = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!/^[0-9]{6}$/.test(otp)) {
      setError('Enter the 6-digit code from your email.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await onVerify(otp);
    } catch (verificationError) {
      setError(getErrorMessage(verificationError));
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    setBusy(true);
    setError('');
    try {
      await onResend();
    } catch (resendError) {
      setError(getErrorMessage(resendError));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="admin-device-page">
      <section className="admin-device-panel" aria-live="polite">
        <div className="admin-device-brand">
          <img src="/rfg-logo.png" alt="RFG Financial" />
          <span>Protected Admin access</span>
        </div>
        <div className="admin-device-icon"><LockKeyhole size={28} /></div>
        {gate.status === 'checking' && (
          <>
            <h1>Checking this device</h1>
            <p>Please wait while we verify this Admin session.</p>
            <div className="admin-device-progress" />
          </>
        )}
        {gate.status === 'error' && (
          <>
            <h1>Verification unavailable</h1>
            <p>{gate.message}</p>
            <button className="primary-button" type="button" disabled={busy} onClick={() => void resend()}>
              Try again
            </button>
          </>
        )}
        {gate.status === 'challenge' && (
          <form onSubmit={verify}>
            <h1>Verify this Admin login</h1>
            <p>We sent a one-time code to <strong>{gate.email}</strong>.</p>
            <label htmlFor="admin-device-otp">Verification code</label>
            <input
              id="admin-device-otp"
              className="admin-device-otp"
              value={otp}
              onChange={(event) => setOtp(event.target.value.replace(/\D/g, '').slice(0, 6))}
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="000000"
              autoFocus
            />
            {error && <div className="admin-device-error" role="alert"><AlertCircle size={17} />{error}</div>}
            <button className="primary-button" type="submit" disabled={busy || otp.length !== 6}>
              {busy ? 'Verifying...' : 'Verify and continue'}
            </button>
            <button className="admin-device-link" type="button" disabled={busy || seconds > 0} onClick={() => void resend()}>
              {seconds > 0 ? `Send another code in ${seconds}s` : 'Send another code'}
            </button>
          </form>
        )}
        <button className="admin-device-account" type="button" onClick={onSignOut}>Use another account</button>
        <p className="admin-device-note">New devices require email verification. This code expires in 10 minutes.</p>
      </section>
    </main>
  );
}

function PasswordRecoveryScreen({
  onComplete,
  onCancel
}: {
  onComplete: () => Promise<void>;
  onCancel: () => void;
}) {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!supabase) return;
    setError('');
    if (password.length < 12 || !/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password)) {
      setError('Use at least 12 characters with uppercase, lowercase and a number.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    setBusy(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;
      await onComplete();
    } catch (updateError) {
      setError(getAuthErrorMessage(updateError));
      setBusy(false);
    }
  };

  return (
    <main className="admin-device-page password-recovery-page">
      <section className="admin-device-panel password-recovery-panel">
        <div className="admin-device-brand"><img src="./rfg-logo.png" alt="RFG Financial" /><span>Secure staff access</span></div>
        <div className="admin-device-icon"><LockKeyhole size={28} /></div>
        <h1>Create a new password</h1>
        <p>This password will be used for your RFG Admin or Sales account.</p>
        <form onSubmit={submit}>
          <label>
            New password
            <span className="password-field">
              <input autoComplete="new-password" onChange={(event) => setPassword(event.target.value)} placeholder="Enter a strong password" type={showPassword ? 'text' : 'password'} value={password} />
              <button aria-label={showPassword ? 'Hide password' : 'Show password'} onClick={() => setShowPassword((current) => !current)} type="button">{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button>
            </span>
          </label>
          <label>
            Confirm password
            <input autoComplete="new-password" className="recovery-confirm-input" onChange={(event) => setConfirmPassword(event.target.value)} placeholder="Enter it again" type={showPassword ? 'text' : 'password'} value={confirmPassword} />
          </label>
          <p className="password-requirements">At least 12 characters, including uppercase, lowercase and a number.</p>
          {error && <p className="admin-device-error" role="alert"><AlertCircle size={17} />{error}</p>}
          <button className="primary-button" disabled={busy} type="submit">{busy ? 'Updating...' : 'Save Password'}</button>
        </form>
        <button className="admin-device-account" onClick={onCancel} type="button">Cancel and return to login</button>
      </section>
    </main>
  );
}

function AuthScreen({
  onMessage,
  onAuthenticated,
  initialError = ''
}: {
  onMessage: (message: string) => void;
  onAuthenticated: (session: Session) => void;
  initialError?: string;
}) {
  const [mode, setMode] = useState<'login' | 'forgot'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberDevice, setRememberDevice] = useState(() => window.localStorage.getItem('rfg-remember-device') !== 'false');
  const [busy, setBusy] = useState(false);
  const [authError, setAuthError] = useState('');

  useEffect(() => {
    if (initialError) setAuthError(initialError);
  }, [initialError]);

  const submitAuth = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!supabase) return;
    setAuthError('');
    if (!email.trim()) {
      setAuthError('Enter staff email.');
      return;
    }
    if (mode !== 'forgot' && password.length < 6) {
      setAuthError('Password must be at least 6 characters.');
      return;
    }

    setBusy(true);
    try {
      if (mode === 'login') {
        window.localStorage.setItem('rfg-remember-device', String(rememberDevice));
        const { data, error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password
        });
        if (error) throw error;
        if (!data.session) throw new Error('Supabase did not create a login session. Please try again.');
        onAuthenticated(data.session);
      }

      if (mode === 'forgot') {
        const recoveryUrl = new URL(window.location.href);
        recoveryUrl.search = '';
        recoveryUrl.hash = '';
        recoveryUrl.searchParams.set('auth', 'set-password');
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: recoveryUrl.toString()
        });
        if (error) throw error;
        onMessage('Password reset link sent to staff email.');
      }
    } catch (error) {
      setAuthError(getAuthErrorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const loginWithGoogle = async () => {
    if (!supabase) return;
    window.localStorage.setItem('rfg-remember-device', String(rememberDevice));
    setAuthError('');
    setBusy(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: window.location.origin
        }
      });
      if (error) throw error;
    } catch (error) {
      onMessage(getAuthErrorMessage(error));
      setBusy(false);
    }
  };

  return (
    <main className="auth-shell">
      <section className="auth-frame">
        <aside className="auth-visual" aria-hidden="true">
          <div className="auth-visual-brand">
            <img src="./rfg-logo.png" alt="" />
          </div>
          <div className="auth-visual-copy">
            <span>Loan Operations Desk</span>
            <h2>Clear loan work for every office desk.</h2>
            <p>Manage applications, approvals, EMI follow-ups, and payment verification in one simple place.</p>
          </div>
          <div className="auth-workflow">
            <div>
              <ClipboardCheck size={20} />
              <span>Applications</span>
              <strong>Create, review, and approve loan work</strong>
            </div>
            <div>
              <CheckCircle2 size={20} />
              <span>Verification</span>
              <strong>Track checklists, guarantors, and admin decisions</strong>
            </div>
            <div>
              <Banknote size={20} />
              <span>Payments</span>
              <strong>Follow cash, QR, and bank confirmation</strong>
            </div>
          </div>
        </aside>

        <section className="auth-card">
          <div className="auth-brand">
            <img src="./rfg-logo.png" alt="RFG Financial" />
          </div>
          <div className="auth-copy">
            <p className="eyebrow">Staff access</p>
            <h1>{mode === 'login' ? 'Welcome Back' : 'Reset Password'}</h1>
            <p>{mode === 'login' ? 'Login with your staff email to continue admin or sales work.' : 'Enter your staff email. A reset link will be sent there.'}</p>
          </div>

          <form className="auth-form" onSubmit={submitAuth}>
            {mode === 'login' && (
              <>
                <button className="google-auth-button" disabled={busy} onClick={loginWithGoogle} type="button">
                  <GoogleMark />
                  Continue with Google
                </button>
                <div className="auth-divider">
                  <span>or login with email</span>
                </div>
              </>
            )}
            <label>
              <span className="field-label">Email</span>
              <input
                aria-invalid={Boolean(authError)}
                className={authError ? 'auth-input-error' : ''}
                value={email}
                onChange={(event) => {
                  setEmail(event.target.value);
                  setAuthError('');
                }}
                placeholder="staff@rfg-financialgroup.com"
                type="email"
              />
            </label>
            {mode !== 'forgot' && (
              <label>
                <span className="field-label auth-label-row">
                  <span>Password</span>
                  <button className="text-link" onClick={() => setMode('forgot')} type="button">
                    Forgot?
                  </button>
                </span>
                <span className={authError ? 'password-field error' : 'password-field'}>
                  <input
                    aria-describedby={authError ? 'auth-error' : undefined}
                    aria-invalid={Boolean(authError)}
                    value={password}
                    onChange={(event) => {
                      setPassword(event.target.value);
                      setAuthError('');
                    }}
                    placeholder="Enter password"
                    type={showPassword ? 'text' : 'password'}
                  />
                  <button
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    onClick={() => setShowPassword((current) => !current)}
                    type="button"
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </span>
              </label>
            )}
            {authError && (
              <p className="auth-error-message" id="auth-error" role="alert">
                {authError}
              </p>
            )}
            {mode === 'login' && (
              <label className="remember-row">
                <input checked={rememberDevice} onChange={(event) => setRememberDevice(event.target.checked)} type="checkbox" />
                <span>
                  Remember this device
                  <small>Keep me logged in on this browser</small>
                </span>
              </label>
            )}
            <button className="primary-action full-width" disabled={busy} type="submit">
              <ShieldCheck size={18} />
              {busy ? 'Please wait...' : mode === 'login' ? 'Login' : 'Send Reset Link'}
            </button>
            {mode === 'forgot' ? (
              <button className="auth-secondary" onClick={() => setMode('login')} type="button">
                Back to Login
              </button>
            ) : (
              <p className="auth-footnote">New staff accounts are created by admin.</p>
            )}
          </form>
        </section>
      </section>
    </main>
  );
}

function GoogleMark() {
  return (
    <svg aria-hidden="true" className="google-mark" viewBox="0 0 24 24">
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.16v2.84C3.97 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.16C1.42 8.55 1 10.22 1 12s.42 3.45 1.16 4.93l3.68-2.84z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.97 3.47 2.16 7.07l3.68 2.84C6.71 7.31 9.14 5.38 12 5.38z"
        fill="#EA4335"
      />
    </svg>
  );
}

function CustomerApp() {
  const customerParams = new URLSearchParams(window.location.search);
  const isCustomerDemo = ['localhost', '127.0.0.1'].includes(window.location.hostname) && customerParams.get('demo') === '1';
  const supportEmail = 'reliantfuturegroup@gmail.com';
  const supportPhone = '+916001515726';
  const supportPhoneLabel = '+91 60015 15726';
  const [mobile, setMobile] = useState('');
  const [mpin, setMpin] = useState('');
  const [showMpin, setShowMpin] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [payload, setPayload] = useState<CustomerLoanPayload | null>(null);
  const [selectedEmiId, setSelectedEmiId] = useState('');
  const [customerSection, setCustomerSection] = useState<'overview' | 'installments' | 'pay' | 'report'>('overview');
  const [showAllCustomerEmis, setShowAllCustomerEmis] = useState(false);
  const [customerMenuOpen, setCustomerMenuOpen] = useState(false);
  const [customerMenuClosing, setCustomerMenuClosing] = useState(false);
  const [supportOpen, setSupportOpen] = useState(false);
  const [paymentBusy, setPaymentBusy] = useState(false);

  useEffect(() => {
    if (!customerMenuOpen) return;

    const scrollY = window.scrollY;
    const previousPosition = document.body.style.position;
    const previousTop = document.body.style.top;
    const previousWidth = document.body.style.width;
    const previousOverflow = document.body.style.overflow;

    document.body.style.position = 'fixed';
    document.body.style.top = `-${scrollY}px`;
    document.body.style.width = '100%';
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.position = previousPosition;
      document.body.style.top = previousTop;
      document.body.style.width = previousWidth;
      document.body.style.overflow = previousOverflow;
      window.scrollTo(0, scrollY);
    };
  }, [customerMenuOpen]);

  const openEmis = payload?.emiSchedule.filter((emi) => ['Pending', 'Overdue', 'Verification Pending'].includes(getEffectiveEmiStatus(emi))) || [];
  const firstUnpaidEmi = payload?.emiSchedule.find((emi) => !isEmiSettledForSequence(emi)) || null;
  const payableEmis = payload ? getPaymentEligibleEmis(payload.emiSchedule) : [];
  const selectedEmi = payableEmis.find((emi) => emi.id === selectedEmiId) || payableEmis[0];
  const totalOutstanding = payload
    ? payload.emiSchedule
        .reduce((sum, emi) => sum + getEmiPayableAmount(emi), 0)
    : 0;
  const paidAmount = payload
    ? payload.emiSchedule
        .reduce((sum, emi) => sum + getEmiPaidAmount(emi), 0)
    : 0;

  const submitLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setNotice('');
    if (!mobile.trim() || !mpin.trim()) {
      setError('Enter mobile number and MPIN.');
      return;
    }
    if (!/^[0-9]{4,6}$/.test(mpin.trim())) {
      setError('MPIN must be 4 to 6 digits.');
      return;
    }

    setBusy(true);
    try {
      if (!supabase || isCustomerDemo) {
        const demoPayload = buildCustomerDemoPayload(mobile.trim());
        setPayload(demoPayload);
        setSelectedEmiId(demoPayload.emiSchedule.find((emi) => ['Pending', 'Overdue'].includes(getEffectiveEmiStatus(emi)))?.id || '');
        setCustomerSection('overview');
        setShowAllCustomerEmis(false);
        setNotice('Preview mode loaded. Connect Supabase RPCs for live customer login.');
        return;
      }

      const { data, error: loginError } = await supabase.rpc('customer_open_payment_session', {
        p_mobile: mobile.trim(),
        p_plain_mpin: mpin.trim()
      });
      if (loginError) throw loginError;
      if ((data as { ok?: boolean; error_code?: string } | null)?.ok === false) {
        const errorCode = (data as { error_code?: string }).error_code;
        throw new Error(errorCode === 'temporarily_locked'
          ? 'Too many attempts. Wait 15 minutes before trying again.'
          : 'Mobile number or MPIN is incorrect.');
      }
      const nextPayload = mapCustomerPayloadFromRpc(data);
      setPayload(nextPayload);
      setSelectedEmiId(nextPayload.emiSchedule.find((emi) => ['Pending', 'Overdue'].includes(getEffectiveEmiStatus(emi)))?.id || '');
      setCustomerSection('overview');
      setShowAllCustomerEmis(false);
    } catch (loginError) {
      setError(getFriendlyCustomerError(loginError));
    } finally {
      setBusy(false);
    }
  };

  if (!payload) {
    return (
      <main className="customer-app-shell customer-login-shell">
        <section className="customer-login-card">
          <div className="customer-logo-lockup">
            <img src="./rfg-logo.png" alt="RFG" />
          </div>
          <div className="customer-login-copy">
            <h1>Welcome Back</h1>
            <p>Access your purchase account</p>
          </div>
          <form className="customer-login-form" onSubmit={submitLogin}>
            <label>
              <span>Mobile Number</span>
              <div className="customer-input-field">
                <Smartphone size={23} />
                <input inputMode="numeric" maxLength={10} onChange={(event) => setMobile(event.target.value.replace(/\D/g, ''))} placeholder="Enter registered mobile" value={mobile} />
              </div>
            </label>
            <label>
              <span>MPIN</span>
              <div className="customer-pin-field">
                <LockKeyhole size={23} />
                <input inputMode="numeric" maxLength={6} onChange={(event) => setMpin(event.target.value.replace(/\D/g, ''))} placeholder="Enter 4-6 digit MPIN" type={showMpin ? 'text' : 'password'} value={mpin} />
                <button aria-label={showMpin ? 'Hide MPIN' : 'Show MPIN'} onClick={() => setShowMpin((current) => !current)} type="button">
                  {showMpin ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </label>
            {error && <p className="customer-error">{error}</p>}
            {notice && <p className="customer-notice">{notice}</p>}
            <button className="customer-primary" disabled={busy} type="submit">
              <ShieldCheck size={18} />
              {busy ? 'Checking...' : 'Open My Account'}
            </button>
          </form>
          <div className="customer-login-divider" />
          <div className="customer-login-help">
            <p>Customers with an active payment plan only</p>
            <button type="button" onClick={() => setNotice('Please contact RFG staff to reset MPIN after offline verification.')}>
              Forgot MPIN? Contact RFG staff
              <ArrowRight size={18} />
            </button>
          </div>
          <div className="customer-secure-line">
            <ShieldCheck size={17} />
            <span>Secure encrypted login</span>
          </div>
        </section>
        <p className="customer-login-footnote">Your account opens after your vehicle is handed over and your payment plan is marked active by Reliant Future Group LLP.</p>
      </main>
    );
  }

  const application = payload.application;
  const nextEmi = firstUnpaidEmi || openEmis[0];
  const missedPenaltyMonths = payload.emiSchedule.filter((emi) =>
    !isEmiSettledForSequence(emi) && isEmiPastGrace(emi)
  ).length;
  const dueCountdown = getCustomerDueCountdown(nextEmi, missedPenaltyMonths);
  const remainingEmis = payload.emiSchedule.filter((emi) => !isEmiSettledForSequence(emi)).length;
  const payableEmiCount = payableEmis.length;
  const verifyingEmiCount = payload.emiSchedule.filter((emi) => getEffectiveEmiStatus(emi) === 'Verification Pending').length;
  const statusEmi = firstUnpaidEmi || openEmis[0] || null;
  const isPaymentVerifying = statusEmi ? getEffectiveEmiStatus(statusEmi) === 'Verification Pending' : false;
  const lockedEmiCount = Math.max(0, remainingEmis - payableEmiCount - verifyingEmiCount);
  const paidEmis = payload.emiSchedule.filter((emi) => isEmiSettledForSequence(emi)).length;
  const currentDueAmount = nextEmi ? getEmiPayableAmount(nextEmi) : 0;
  const selectedEmiPayable = selectedEmi ? getEmiPayableAmount(selectedEmi) : 0;
  const razorpayCustomerTotal = selectedEmi ? grossUpRazorpayPayment(selectedEmiPayable) : 0;
  const razorpayCustomerFee = Math.max(0, razorpayCustomerTotal - selectedEmiPayable);
  const visibleCustomerEmis = showAllCustomerEmis ? payload.emiSchedule : payload.emiSchedule.slice(0, 3);
  const totalPayable = application.loanAmount + application.chargeAmount + application.processingFee;
  const paidProgress = totalPayable > 0 ? Math.min(100, Math.round((paidAmount / totalPayable) * 100)) : 0;
  const openCustomerMenu = () => {
    setCustomerMenuClosing(false);
    setCustomerMenuOpen(true);
  };
  const closeCustomerMenu = () => {
    setCustomerMenuClosing(true);
    window.setTimeout(() => {
      setCustomerMenuOpen(false);
      setCustomerMenuClosing(false);
    }, 260);
  };
  const customerPaymentHistory = payload.payments
    .slice()
    .sort((a, b) => new Date(b.verifiedAt || b.createdAt).getTime() - new Date(a.verifiedAt || a.createdAt).getTime())
    .map((payment) => {
      const emi = payload.emiSchedule.find((item) => item.id === payment.emiScheduleId);
      return {
        id: payment.id,
        title: emi ? emi.emiMonth : 'Vehicle payment',
        amount: payment.amount,
        mode: formatPaymentMode(payment.mode),
        status: payment.status,
        reference: payment.reference,
        date: payment.verifiedAt || payment.createdAt,
        emiNumber: emi ? payload.emiSchedule.findIndex((item) => item.id === emi.id) + 1 : null
      };
    });
  const goCustomerSection = (section: 'overview' | 'installments' | 'pay' | 'report') => {
    setCustomerSection(section);
    closeCustomerMenu();
  };
  const openCustomerPay = async () => {
    setCustomerSection('pay');
    closeCustomerMenu();
    setError('');
    setNotice('');
    if (!supabase || !mobile.trim() || !mpin.trim()) return;
    try {
      await refreshCustomerLoan();
    } catch (refreshError) {
      setError(getFriendlyCustomerError(refreshError));
    }
  };
  const confirmCustomerExit = () => {
    if (window.confirm('Are you sure you want to exit your account?')) {
      setCustomerMenuOpen(false);
      setCustomerMenuClosing(false);
      setPayload(null);
      setMpin('');
    }
  };

  const refreshCustomerLoan = async () => {
    if (!supabase) return;
    const { data, error: refreshError } = await supabase.rpc('customer_open_payment_session', {
      p_mobile: mobile.trim(),
      p_plain_mpin: mpin.trim()
    });
    if (refreshError) throw refreshError;
    setPayload(mapCustomerPayloadFromRpc(data));
  };

  const startRazorpayPayment = async () => {
    if (!supabase || !payload?.customerSessionToken || !selectedEmi || paymentBusy) return;
    const paymentClient = supabase;
    setPaymentBusy(true);
    setError('');
    setNotice('');
    try {
      await loadRazorpayCheckout();
      const { data: order, error: orderError } = await paymentClient.functions.invoke('razorpay-create-order', {
        body: { customerSessionToken: payload.customerSessionToken, emiScheduleId: selectedEmi.id }
      });
      if (orderError) throw orderError;
      if (!order?.orderId || !order?.keyId || !order?.amount) throw new Error('Online payment could not start.');

      const Razorpay = (window as any).Razorpay;
      const checkout = new Razorpay({
        key: order.keyId,
        order_id: order.orderId,
        amount: order.amount,
        currency: 'INR',
        name: 'Reliant Future Group LLP',
        description: `${payload.application.id} instalment payment`,
        prefill: { name: payload.application.customerName, contact: payload.application.mobile },
        theme: { color: '#00664f' },
        modal: {
          ondismiss: () => {
            setPaymentBusy(false);
            setNotice('Payment window closed. No payment was recorded.');
          }
        },
        handler: async (response: RazorpayCheckoutResponse) => {
          try {
            const { data: verification, error: verificationError } = await paymentClient.functions.invoke('razorpay-verify-payment', {
              body: { customerSessionToken: payload.customerSessionToken, ...response }
            });
            if (verificationError || !verification?.ok) throw verificationError || new Error('Payment verification is pending.');
            await refreshCustomerLoan();
            setNotice('Payment confirmed. Your payment schedule has been updated.');
            setCustomerSection('installments');
          } catch (verificationFailure) {
            setError(getFriendlyCustomerError(verificationFailure));
          } finally {
            setPaymentBusy(false);
          }
        }
      });
      checkout.on('payment.failed', () => {
        setPaymentBusy(false);
        setError('Payment was not completed. No instalment was marked paid. Please try again.');
      });
      checkout.open();
    } catch (paymentError) {
      setPaymentBusy(false);
      setError(getFriendlyCustomerError(paymentError));
    }
  };
  const confirmSupportCall = () => {
    if (window.confirm(`Are you sure you want to call RFG support at ${supportPhoneLabel}?`)) {
      window.location.href = `tel:${supportPhone}`;
    }
  };
  const openSupportEmail = () => {
    window.location.href = `mailto:${supportEmail}`;
  };
  const openSupportWhatsApp = () => {
    window.open(`https://wa.me/${supportPhone.replace(/\D/g, '')}`, '_blank', 'noopener,noreferrer');
  };

  return (
    <main className="customer-app-shell">
      <section className={`customer-phone-frame section-${customerSection}`}>
        <header className="customer-app-header customer-home-header">
          <button className="customer-icon-button" onClick={openCustomerMenu} aria-label="Open customer menu" type="button">
            <Menu size={23} />
          </button>
          <div className="customer-header-title">
            <img src="./rfg-logo.png" alt="RFG" />
            <span>Customer Portal</span>
          </div>
          <button className="customer-icon-button" onClick={confirmCustomerExit} aria-label="Exit account" type="button">
            <LogOut size={23} />
          </button>
        </header>

        {customerMenuOpen && createPortal((
          <div className={`customer-menu-backdrop${customerMenuClosing ? ' closing' : ''}`} onClick={closeCustomerMenu} role="presentation">
            <aside className="customer-menu-drawer" onClick={(event) => event.stopPropagation()} aria-label="Customer menu">
              <div className="customer-menu-head">
                <button onClick={closeCustomerMenu} aria-label="Close customer menu" type="button">
                  <ChevronLeft size={22} />
                </button>
                <div>
                  <strong>{application.customerName}</strong>
                  <span>{application.id}</span>
                </div>
              </div>
              <div className="customer-menu-list">
                <button onClick={() => goCustomerSection('overview')} className="customer-menu-item application" type="button">
                  <FileClock size={22} />
                  <span><strong>My Application</strong><small>Purchase status and vehicle details</small></span>
                  <ArrowRight size={20} />
                </button>
                <button onClick={() => goCustomerSection('overview')} className="customer-menu-item profile" type="button">
                  <UserRound size={22} />
                  <span><strong>Profile Settings</strong><small>Mobile, address and guarantor details</small></span>
                  <ArrowRight size={20} />
                </button>
                <button onClick={() => goCustomerSection('installments')} className="customer-menu-item terms" type="button">
                  <ClipboardCheck size={22} />
                  <span><strong>Terms & Conditions</strong><small>Purchase terms, instalments and payment details</small></span>
                  <ArrowRight size={20} />
                </button>
                <button onClick={() => void openCustomerPay()} className="customer-menu-item pay" type="button">
                  <WalletCards size={22} />
                  <span><strong>Pay Instalment</strong><small>Secure Razorpay payment</small></span>
                  <ArrowRight size={20} />
                </button>
              </div>
              <div className="customer-menu-policy">
                <button className="privacy" onClick={() => setNotice('Privacy Policy content must be approved and published before release.')} type="button">Privacy Policy</button>
                <button className="refund" onClick={() => setNotice('Refund Policy content must be approved and published before release.')} type="button">Refund Policy</button>
                <button className="support" onClick={() => setNotice('Support Policy content must be approved and published before release.')} type="button">Support Policy</button>
              </div>
              <button className="customer-menu-logout" onClick={confirmCustomerExit} type="button">
                <LogOut size={21} />
                Logout
              </button>
              <div className="customer-menu-foot">
                <strong>Reliant Future Group LLP</strong>
                <span>App Version 1.0.0</span>
              </div>
            </aside>
          </div>
        ), document.body)}

        {supportOpen && createPortal((
          <div className="customer-support-backdrop" onClick={() => setSupportOpen(false)} role="presentation">
            <section className="customer-support-sheet" onClick={(event) => event.stopPropagation()} aria-label="RFG customer support">
              <button className="customer-support-close" onClick={() => setSupportOpen(false)} aria-label="Close support" type="button">
                <X size={18} />
              </button>
              <span className="customer-support-icon"><PhoneCall size={24} /></span>
              <p>Customer Support</p>
              <h2>Contact RFG support</h2>
              <div className="customer-support-actions">
                <button onClick={openSupportEmail} type="button">
                  <Mail size={20} />
                  <span><small>Email</small><strong>{supportEmail}</strong></span>
                </button>
                <button onClick={confirmSupportCall} type="button">
                  <PhoneCall size={20} />
                  <span><small>Customer Care</small><strong>{supportPhoneLabel}</strong></span>
                </button>
                <button onClick={openSupportWhatsApp} type="button">
                  <MessageCircle size={20} />
                  <span><small>WhatsApp</small><strong>{supportPhoneLabel}</strong></span>
                </button>
              </div>
            </section>
          </div>
        ), document.body)}

        <section className="customer-brand-hero">
          <p>Welcome, {application.customerName}</p>
          <h1>{money(totalOutstanding)}</h1>
          <span>Outstanding payable</span>
          <div className="customer-hero-grid">
            <strong>{application.productName}</strong>
            <small>{application.category} • {application.assetId || 'Asset ID pending'}</small>
          </div>
        </section>

        <section className="customer-due-card">
          <div className="customer-due-top">
            <StatusChip status={application.status} />
            <button className={`customer-pay-now ${isPaymentVerifying ? 'verifying' : ''}`} disabled={!nextEmi} onClick={() => void openCustomerPay()} type="button">
              {isPaymentVerifying ? 'Verifying' : 'Pay Now'}
            </button>
          </div>
          <div className="customer-due-metrics">
            <div className={`customer-due-countdown ${dueCountdown.tone}`}>
              {dueCountdown.multiplier && <small className="customer-penalty-multiplier">{dueCountdown.multiplier}</small>}
              <strong>{dueCountdown.value}</strong>
              <span>{dueCountdown.label}</span>
            </div>
            <div>
              <span>Amount Due</span>
              <strong>{money(currentDueAmount)}</strong>
            </div>
          </div>
          <div className="customer-remaining-strip">
            <CalendarClock size={22} aria-hidden="true" />
            <span>Remaining balance: <strong>{money(totalOutstanding)}</strong></span>
          </div>
          <div className="customer-action-pair">
            <button className={customerSection === 'overview' ? 'active' : ''} onClick={() => setCustomerSection('overview')} type="button">Overview</button>
            <button className={customerSection === 'installments' ? 'active' : ''} onClick={() => setCustomerSection('installments')} type="button">Installments</button>
            <button className={customerSection === 'pay' ? 'active' : ''} onClick={() => void openCustomerPay()} type="button">Pay</button>
          </div>
        </section>

        <section className="customer-summary-grid">
          <CustomerAmountCard label="Balance After Down Payment" value={money(application.loanAmount)} />
          <CustomerAmountCard label="Monthly Instalment" value={money(application.emiAmount)} />
          <CustomerAmountCard label="Charges + GST" value={money(application.chargeAmount)} />
          <CustomerAmountCard label="Processing Fee" value={money(application.processingFee)} />
          <CustomerAmountCard label="Tenure" value={`${application.tenure} months`} />
        </section>

        <section className="customer-panel customer-dashboard-panel" id="customer-dashboard-section">
          <div className="customer-section-title">
            <div>
              <p className="eyebrow">Purchase dashboard</p>
              <h2>{application.customerName}</h2>
            </div>
            <div className="customer-paid-ring" style={{ '--paid-progress': `${paidProgress}%` } as React.CSSProperties}>
              <strong>{paidProgress}%</strong>
              <span>Paid</span>
            </div>
          </div>
          <div className="customer-loan-snapshot">
            <span>
              <small>Total payable</small>
              <strong>{money(totalPayable)}</strong>
            </span>
            <span>
              <small>Outstanding</small>
              <strong>{money(totalOutstanding)}</strong>
            </span>
          </div>
          <div className="customer-detail-list">
            <CustomerLoanDetail icon={Banknote} label="Product Price" value={money(application.productPrice)} />
            <CustomerLoanDetail icon={WalletCards} label="Down Payment" value={money(application.downPayment)} />
            <CustomerLoanDetail icon={CreditCard} label="Balance Amount" value={money(application.loanAmount)} />
            <CustomerLoanDetail icon={ShieldCheck} label="Charges + GST" value={money(application.chargeAmount)} />
            <CustomerLoanDetail icon={WalletCards} label="Processing Fee" value={money(application.processingFee)} />
            <CustomerLoanDetail icon={CalendarClock} label="Tenure" value={`${application.tenure} months`} />
            <CustomerLoanDetail icon={CheckCircle2} label="Paid So Far" value={money(paidAmount)} />
          </div>
        </section>

        <section className="customer-panel customer-installments-panel" id="customer-installments-section">
          <div className="customer-section-title">
            <div>
              <p className="eyebrow">Payment schedule</p>
              <h2>Installments</h2>
            </div>
            <span className="customer-tenure-pill">{application.tenure} Months</span>
          </div>
          <div className="customer-schedule-summary">
            <span><strong>{payableEmiCount}</strong> payable now</span>
            {verifyingEmiCount > 0 && <span className="verifying"><strong>{verifyingEmiCount}</strong> verifying</span>}
            <span><strong>{lockedEmiCount}</strong> locked</span>
          </div>
          <div className="customer-emi-list">
            {visibleCustomerEmis.map((emi) => {
              const effectiveStatus = getEffectiveEmiStatus(emi);
              const penalty = getEmiPenaltyAmount(emi);
              const duePassed = isEmiDueDatePassed(emi);
              const index = payload.emiSchedule.findIndex((item) => item.id === emi.id);
              const isPayable = payableEmis.some((item) => item.id === emi.id);
              const isSettled = isEmiSettledForSequence(emi);
              const isVerifying = effectiveStatus === 'Verification Pending';
              const timingClass = penalty > 0 ? 'penalty-active' : duePassed ? 'due-warning' : 'timely';
              const stateClass = isSettled ? 'paid' : isVerifying ? 'verifying' : isPayable ? `payable ${timingClass}` : 'locked';
              const StateIcon = isSettled ? CheckCircle2 : isVerifying || isPayable ? Clock3 : LockKeyhole;
              const stateText = effectiveStatus === 'Part Paid'
                ? 'Part Paid'
                : effectiveStatus === 'Paid'
                  ? 'Paid'
                  : isPayable
                    ? penalty > 0 ? 'Penalty Due' : duePassed ? 'Due Now' : 'Payable Now'
                    : effectiveStatus === 'Verification Pending' ? 'Verifying' : 'Locked';
              const carryForward = getEmiCarryForwardAmount(emi);
              const paidForEmi = getEmiPaidAmount(emi);
              return (
                <article
                  aria-current={selectedEmi?.id === emi.id ? 'true' : undefined}
                  className={`customer-emi-row ${stateClass} ${selectedEmi?.id === emi.id ? 'selected' : ''} ${effectiveStatus.toLowerCase().replace(/\s+/g, '-')}`}
                  key={emi.id}
                  onClick={isPayable ? () => setSelectedEmiId(emi.id) : undefined}
                  onKeyDown={isPayable ? (event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      setSelectedEmiId(emi.id);
                    }
                  } : undefined}
                  role={isPayable ? 'button' : undefined}
                  tabIndex={isPayable ? 0 : undefined}
                >
                  <span className="customer-emi-icon"><StateIcon size={16} /></span>
                  <div className="customer-emi-copy">
                    {isPayable && <em>Next instalment</em>}
                    <strong>Installment #{index + 1}</strong>
                    <span>{emi.emiMonth} • Due {formatFullDate(emi.dueDate)}</span>
                    <small>{effectiveStatus === 'Paid' ? 'Paid on' : 'Due'} {formatFullDate(emi.dueDate)}</small>
                    {carryForward > 0 && <small className="carry-forward">Previous balance {money(carryForward)} included</small>}
                    {duePassed && effectiveStatus !== 'Paid' && penalty <= 0 && <small className="grace">Grace till {formatFullDate(getEmiGraceEndDate(emi))}</small>}
                    {penalty > 0 && <small className="penalty">Penalty added: {money(penalty)}</small>}
                    {effectiveStatus === 'Part Paid' && <small className="carry-forward">Paid {money(paidForEmi)}. Balance moved forward.</small>}
                  </div>
                  <div className="customer-emi-amount">
                    <strong>{isSettled ? money(paidForEmi) : money(getEmiDueAmount(emi))}</strong>
                    <small>{stateText}</small>
                  </div>
                </article>
              );
            })}
          </div>
          {payload.emiSchedule.length > 3 && (
            <button className="customer-show-more" onClick={() => setShowAllCustomerEmis((current) => !current)} type="button">
              {showAllCustomerEmis ? 'Show less' : `Show all ${payload.emiSchedule.length} installments`}
              {showAllCustomerEmis ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
            </button>
          )}
        </section>

        <section className="customer-panel customer-pay-panel" id="customer-pay-section">
          <div className="customer-section-title">
            <div>
              <p className="eyebrow">Pay instalment</p>
              <h2>{nextEmi ? 'Razorpay Payment' : 'No pending instalment'}</h2>
            </div>
          </div>
          {!selectedEmi && isPaymentVerifying && (
            <div className="customer-payment-blocked" role="status">
              <Clock3 size={22} />
              <div>
                <strong>Payment verification in progress</strong>
                <span>A cash or Bank Transfer / QR request is already awaiting Admin review. Online payment will unlock if that request is rejected.</span>
              </div>
            </div>
          )}
          {!selectedEmi && !isPaymentVerifying && nextEmi && (
            <div className="customer-payment-blocked" role="status">
              <LockKeyhole size={22} />
              <div>
                <strong>This instalment is not payable yet</strong>
                <span>Please refresh your account or contact RFG support if the status looks incorrect.</span>
              </div>
            </div>
          )}
          {!nextEmi && (
            <div className="customer-payment-blocked paid" role="status">
              <CheckCircle2 size={22} />
              <div><strong>No payment is due</strong><span>All generated installments are settled.</span></div>
            </div>
          )}
          {selectedEmi && (
            <div className="customer-checkout-card">
              <div className="customer-checkout-head">
                <span><WalletCards size={22} /></span>
                <div>
                  <strong>Razorpay Checkout</strong>
                  <small>UPI, card, netbanking and wallet payments</small>
                </div>
              </div>
              <div className="customer-checkout-amount">
                <small>Total payable</small>
                <strong>{money(razorpayCustomerTotal)}</strong>
                <span>Installment #{payload.emiSchedule.findIndex((emi) => emi.id === selectedEmi.id) + 1} due {formatDate(selectedEmi.dueDate)}</span>
              </div>
              <div className="customer-gateway-breakdown" aria-label="Payment breakdown">
                <span><small>Instalment amount</small><strong>{money(selectedEmiPayable)}</strong></span>
                <span><small>Razorpay fee + GST</small><strong>{money(razorpayCustomerFee)}</strong></span>
              </div>
              <p className="customer-gateway-note">The customer covers the gateway fee. RFG bears GST charged by Razorpay on that fee.</p>
            </div>
          )}
          {selectedEmi && (
            <label className="customer-select-field">
              <span>Select instalment</span>
              <select value={selectedEmi.id} onChange={(event) => setSelectedEmiId(event.target.value)}>
                {payableEmis.map((emi) => (
                  <option key={emi.id} value={emi.id}>{emi.emiMonth} - {money(getEmiPayableAmount(emi))}</option>
                ))}
              </select>
            </label>
          )}
          <div className="customer-secure-checkout">
            <ShieldCheck size={24} />
            <div>
              <strong>Secure Checkout</strong>
              <span>Razorpay handles the payment securely. RFG marks the instalment paid after successful confirmation.</span>
            </div>
          </div>
          <button className="customer-razorpay" disabled={!selectedEmi || !payload.paymentSettings.razorpayEnabled || paymentBusy} onClick={startRazorpayPayment} type="button">
            <span>{paymentBusy ? 'Opening Razorpay...' : 'Continue to Razorpay'}</span>
            <ArrowRight size={18} />
          </button>
          {selectedEmi && payload.paymentSettings.razorpayEnabled && (
            <p className="customer-payment-guidance">UPI, cards, netbanking and wallets are available securely in Razorpay.</p>
          )}
          {selectedEmi && !payload.paymentSettings.razorpayEnabled && (
            <p className="customer-payment-unavailable">Online payment is currently disabled by RFG Admin.</p>
          )}
          {notice && <p className="customer-notice">{notice}</p>}
          {error && <p className="customer-error">{error}</p>}
        </section>

        <section className="customer-panel customer-report-panel" id="customer-report-section">
          <div className="customer-section-title">
            <div>
              <p className="eyebrow">Payment report</p>
              <h2>Transaction History</h2>
            </div>
            <span className="customer-tenure-pill">{customerPaymentHistory.length} Records</span>
          </div>
          <div className="customer-report-summary">
            <span><small>Total paid</small><strong>{money(paidAmount)}</strong></span>
            <span><small>Outstanding</small><strong>{money(totalOutstanding)}</strong></span>
          </div>
          <div className="customer-transaction-list">
            {customerPaymentHistory.map((item) => {
              const MethodIcon = item.mode === 'Online payment' ? WalletCards : item.mode === 'Bank Transfer / QR' ? CreditCard : Banknote;
              const modeLabel = item.mode === 'Online payment' ? 'Razorpay' : item.mode === 'Bank Transfer / QR' ? 'Bank Transfer / QR' : 'Cash';
              return (
                <article className="customer-transaction-row" key={item.id}>
                  <span className="customer-transaction-icon"><MethodIcon size={18} /></span>
                  <div>
                    <strong>{item.title}</strong>
                    <small>{item.emiNumber ? `Installment #${item.emiNumber}` : 'Purchase account'} • {modeLabel}</small>
                    {item.reference && <em>Ref: {item.reference}</em>}
                  </div>
                  <aside>
                    <strong>{money(item.amount)}</strong>
                    <small>{item.status}</small>
                    <em>{formatDate(item.date)}</em>
                  </aside>
                </article>
              );
            })}
            {customerPaymentHistory.length === 0 && (
              <div className="customer-report-empty">
                <FileClock size={30} />
                <strong>No transactions yet</strong>
                <span>Paid instalment history will appear here after cash, Razorpay, or Bank Transfer / QR payments are confirmed.</span>
              </div>
            )}
          </div>
        </section>

        <section className="customer-quick-links">
          <button onClick={() => setSupportOpen(true)} type="button"><Phone size={24} /><span>Customer Support</span><ArrowRight size={22} /></button>
          <button onClick={() => setCustomerSection('report')} type="button"><FileClock size={24} /><span>Payment Report</span><ArrowRight size={22} /></button>
        </section>

        <section className="customer-panel customer-device-card">
          <h2>My Product</h2>
          <div className="customer-product-summary">
            <span><ProductCategoryIcon category={application.category} size={31} /></span>
            <div>
              <strong>{application.productName}</strong>
              <small>{application.assetId || 'Asset ID pending'}</small>
            </div>
          </div>
          <div className="customer-product-rows">
            <span><small>Owner</small><strong>{application.customerName}</strong></span>
            <span><small>Showroom</small><strong>{application.showroomName || 'Not added'}</strong></span>
            <span><small>Guarantor</small><strong>{application.guarantorName || 'Not added'}</strong></span>
            <span className="verified"><small>Status</small><strong>Verified</strong></span>
          </div>
        </section>
      </section>
      <nav className="customer-bottom-nav" aria-label="Customer navigation">
        <button className={customerSection === 'overview' ? 'active' : ''} onClick={() => setCustomerSection('overview')} type="button">
          <Gauge size={20} />
          <span>Dashboard</span>
        </button>
        <button className={customerSection === 'installments' ? 'active' : ''} onClick={() => setCustomerSection('installments')} type="button">
          <WalletCards size={20} />
          <span>Purchases</span>
        </button>
        <button onClick={confirmSupportCall} type="button">
          <Phone size={20} />
          <span>Support</span>
        </button>
        <button onClick={openCustomerMenu} type="button">
          <UserRound size={20} />
          <span>Profile</span>
        </button>
      </nav>
      <button className="customer-whatsapp-fab" onClick={openSupportWhatsApp} aria-label="WhatsApp support" type="button">
        <svg viewBox="0 0 32 32" aria-hidden="true" focusable="false">
          <path d="M16.02 3.5C9.16 3.5 3.58 9.03 3.58 15.82c0 2.2.59 4.34 1.72 6.21L3.5 28.5l6.67-1.74a12.55 12.55 0 0 0 5.85 1.47c6.86 0 12.44-5.52 12.44-12.31S22.88 3.5 16.02 3.5Zm0 22.63c-1.89 0-3.73-.51-5.34-1.47l-.39-.23-3.95 1.03 1.05-3.82-.25-.4a10.12 10.12 0 0 1-1.55-5.42c0-5.62 4.68-10.2 10.43-10.2s10.43 4.58 10.43 10.2-4.68 10.31-10.43 10.31Zm5.72-7.64c-.31-.16-1.85-.9-2.14-1-.29-.11-.5-.16-.71.16-.21.31-.81 1-.99 1.2-.18.21-.37.23-.68.08-.31-.16-1.32-.48-2.52-1.53-.93-.82-1.56-1.84-1.74-2.15-.18-.31-.02-.48.14-.64.14-.14.31-.37.47-.55.16-.18.21-.31.31-.52.1-.21.05-.39-.03-.55-.08-.16-.71-1.69-.97-2.31-.26-.61-.52-.52-.71-.53h-.61c-.21 0-.55.08-.84.39-.29.31-1.1 1.06-1.1 2.58s1.13 3 1.29 3.21c.16.21 2.22 3.35 5.38 4.69.75.32 1.34.51 1.79.65.75.24 1.44.21 1.98.13.6-.09 1.85-.74 2.11-1.46.26-.72.26-1.34.18-1.46-.08-.13-.29-.21-.6-.37Z" />
        </svg>
      </button>
    </main>
  );
}

function CustomerAmountCard({ label, value }: { label: string; value: string }) {
  return (
    <article className="customer-amount-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

function CustomerLoanDetail({
  icon: Icon,
  label,
  value
}: {
  icon: typeof Gauge;
  label: string;
  value: string;
}) {
  const labelParts = label.split(' ');
  return (
    <span className="customer-loan-detail-row">
      <i aria-hidden="true"><Icon size={18} /></i>
      <span>
        <small>
          {labelParts.length === 2 ? (
            <>
              {labelParts[0]}
              <br />
              {labelParts[1]}
            </>
          ) : label}
        </small>
        <strong>{value}</strong>
      </span>
    </span>
  );
}

const APPLICATION_META_PREFIX = '[[RFG_APPLICATION_META]]';
const PAYMENT_REQUEST_META_PREFIX = '[[RFG_PAYMENT_REQUEST_META]]';

function serializePaymentRequestRemarks(mode: 'cash' | 'manual_bank_qr', reference: string, notes: string) {
  const metadata = JSON.stringify({ mode, reference: reference.trim() });
  return `${PAYMENT_REQUEST_META_PREFIX}${metadata}\n${notes.trim()}`;
}

function parsePaymentRequestRemarks(value?: string | null) {
  const raw = value || '';
  if (!raw.startsWith(PAYMENT_REQUEST_META_PREFIX)) return { reference: '', notes: raw };
  const lineBreak = raw.indexOf('\n');
  const metadataText = raw.slice(PAYMENT_REQUEST_META_PREFIX.length, lineBreak < 0 ? undefined : lineBreak);
  try {
    const metadata = JSON.parse(metadataText) as { reference?: string };
    return {
      reference: metadata.reference || '',
      notes: lineBreak < 0 ? '' : raw.slice(lineBreak + 1)
    };
  } catch {
    return { reference: '', notes: raw };
  }
}

function serializeApplicationRemarks(application: Application) {
  const metadata = JSON.stringify({
    customerPincode: application.customerPincode,
    guarantorAddress: application.guarantorAddress,
    guarantorPincode: application.guarantorPincode,
    processingFee: application.processingFee
  });
  return `${APPLICATION_META_PREFIX}${metadata}\n${application.remarks || 'No additional remarks.'}`;
}

function parseApplicationRemarks(value?: string | null) {
  const raw = value || '';
  if (!raw.startsWith(APPLICATION_META_PREFIX)) {
    return {
      metadata: { customerPincode: '', guarantorAddress: '', guarantorPincode: '', processingFee: 0 },
      remarks: raw
    };
  }

  const lineBreak = raw.indexOf('\n');
  const metadataText = raw.slice(APPLICATION_META_PREFIX.length, lineBreak < 0 ? undefined : lineBreak);
  try {
    const metadata = JSON.parse(metadataText) as Partial<{
      customerPincode: string;
      guarantorAddress: string;
      guarantorPincode: string;
      processingFee: number;
    }>;
    return {
      metadata: {
        customerPincode: metadata.customerPincode || '',
        guarantorAddress: metadata.guarantorAddress || '',
        guarantorPincode: metadata.guarantorPincode || '',
        processingFee: Number(metadata.processingFee || 0)
      },
      remarks: lineBreak < 0 ? '' : raw.slice(lineBreak + 1)
    };
  } catch {
    return {
      metadata: { customerPincode: '', guarantorAddress: '', guarantorPincode: '', processingFee: 0 },
      remarks: raw
    };
  }
}

function mapApplicationFromSupabase(row: Record<string, any>): Application {
  const checklistRow = Array.isArray(row.document_checklists) ? row.document_checklists[0] : row.document_checklists;
  const applicationRemarks = parseApplicationRemarks(row.remarks);
  return {
    supabaseId: row.id,
    id: row.loan_id,
    customerName: row.customer_name,
    mobile: row.mobile,
    alternateMobile: row.alternate_mobile,
    address: row.address,
    customerPincode: applicationRemarks.metadata.customerPincode,
    category: mapProductCategoryFromDb(row.category),
    productName: row.product_name,
    assetId: row.asset_id,
    guarantorName: row.seller_name,
    guarantorMobile: row.seller_mobile,
    guarantorAddress: applicationRemarks.metadata.guarantorAddress,
    guarantorPincode: applicationRemarks.metadata.guarantorPincode,
    showroomName: row.showroom_name,
    showroomMobile: row.showroom_mobile,
    productPrice: Number(row.product_price || 0),
    downPayment: Number(row.down_payment || 0),
    loanAmount: Number(row.loan_amount || 0),
    chargeAmount: Number(row.charge_amount || 0),
    processingFee: Number(row.processing_fee ?? applicationRemarks.metadata.processingFee ?? 0),
    tenure: Number(row.tenure || 0),
    emiAmount: Number(row.emi_amount || 0),
    dueDay: Number(row.due_day || 5),
    disbursedAt: row.disbursed_at || undefined,
    disbursementReference: row.disbursement_reference || undefined,
    disbursementNotes: row.disbursement_notes || undefined,
    status: mapLoanStatusFromDb(row.status),
    salesPerson: row.sales_person || 'Sales User',
    date: formatDate(row.created_at),
    loginId: row.login_id,
    customerPassword: 'Hidden for security',
    checklist: mapChecklistFromSupabase(checklistRow),
    remarks: applicationRemarks.remarks,
    activity: ['Saved in Supabase']
  };
}

function mapForeclosureSettlementFromSupabase(row: Record<string, any>): ForeclosureSettlement {
  return {
    originalLoanAmount: Number(row.original_loan_amount || 0),
    originalChargeAmount: Number(row.original_charge_amount || 0),
    paidBeforeForeclosure: Number(row.paid_before_foreclosure || 0),
    agreedSettlementAmount: Number(row.agreed_settlement_amount || 0),
    productReturned: Boolean(row.product_returned),
    productReturnValue: Number(row.product_return_value || 0),
    notes: row.settlement_notes || 'No settlement remarks recorded.',
    settledBy: row.settled_by || '',
    settledAt: row.settled_at || ''
  };
}

function mapCashRequestFromSupabase(row: Record<string, any>): CashRequest {
  const loan = Array.isArray(row.loan_applications) ? row.loan_applications[0] : row.loan_applications;
  const requestRemarks = parsePaymentRequestRemarks(row.remarks);
  return {
    supabaseId: row.id,
    id: row.request_id,
    applicationId: loan?.loan_id || '',
    customerName: loan?.customer_name || 'Customer',
    emiMonth: row.emi_month,
    emiScheduleId: row.emi_schedule_id || undefined,
    amount: Number(row.amount || 0),
    emiDueAmount: Number(row.emi_due_amount || row.amount || 0),
    shortAmount: Number(row.short_amount || 0),
    carryForwardAmount: Number(row.carry_forward_amount || 0),
    collectedBy: row.collected_by,
    collectedAt: row.collected_at || formatDate(row.created_at),
    remarks: requestRemarks.notes,
    status: mapCashStatusFromDb(row.status),
    requestMode: row.request_mode === 'manual_bank_qr' ? 'manual_bank_qr' : 'cash',
    paymentReference: requestRemarks.reference,
    createdById: row.created_by || undefined,
    reviewedById: row.reviewed_by || undefined,
    reviewedAt: row.reviewed_at || undefined,
    createdAt: row.created_at || undefined,
    paymentId: row.payment_id || undefined
  };
}

function mapStaffProfileFromSupabase(row: Record<string, any>): StaffProfile {
  return {
    id: row.id,
    fullName: row.full_name || row.email || 'Staff User',
    email: row.email || '',
    role: row.role === 'admin' ? 'admin' : 'sales',
    active: Boolean(row.active),
    createdAt: row.created_at
  };
}

function mapActivityLogFromSupabase(row: Record<string, any>): ActivityLog {
  const details = row.details && typeof row.details === 'object' ? row.details : {};
  const suffix = details.loan_id ? ` (${details.loan_id})` : details.request_id ? ` (${details.request_id})` : '';
  const action = String(row.action || '')
    .replace(/manual bank qr/gi, 'Bank Transfer / QR')
    .replace(/cash request submitted/gi, 'Cash payment request submitted');
  return {
    id: row.id,
    text: `${action}${suffix}`,
    createdAt: row.created_at
  };
}

function mapLogArchiveFromSupabase(row: Record<string, any>): LogArchive {
  return {
    id: row.id,
    archiveMonth: row.archive_month,
    objectKey: row.object_key,
    storageProvider: row.storage_provider || 'other',
    activityCount: Number(row.activity_count || 0),
    loginCount: Number(row.login_count || 0),
    sizeBytes: Number(row.size_bytes || 0),
    archivedAt: row.archived_at
  };
}

function formatArchiveProvider(provider: string) {
  const labels: Record<string, string> = {
    'google-drive': 'Google Drive',
    hostinger: 'Hostinger private storage',
    'cloudflare-r2': 'Cloudflare R2',
    other: 'Private archive'
  };
  return labels[provider] || 'Private archive';
}

function mapEmiFromSupabase(row: Record<string, any>): EmiItem {
  return {
    id: row.id,
    applicationId: row.application_id,
    emiMonth: row.emi_month,
    dueDate: row.due_date,
    amount: Number(row.amount || 0),
    carryForwardAmount: Number(row.carry_forward_amount || 0),
    paidAmount: Number(row.paid_amount || 0),
    status: mapPaymentStatusFromDb(row.status)
  };
}

function mapPaymentFromSupabase(row: Record<string, any>): PaymentItem {
  return {
    id: String(row.id || row.payment_id || crypto.randomUUID()),
    paymentId: String(row.payment_id || row.id || 'Payment'),
    applicationId: String(row.application_id || ''),
    emiScheduleId: row.emi_schedule_id || null,
    amount: Number(row.amount || 0),
    mode: String(row.mode || 'cash'),
    status: mapPaymentStatusFromDb(row.status),
    reference: row.reference || '',
    createdAt: row.created_at || new Date().toISOString(),
    createdById: row.created_by || undefined,
    verifiedById: row.verified_by || undefined,
    verifiedAt: row.verified_at || undefined
  };
}

function mapPaymentSettingsFromSupabase(row: Record<string, any>): PaymentSettings {
  return {
    manualBankQrEnabled: Boolean(row.manual_bank_qr_enabled),
    cashRequestEnabled: Boolean(row.cash_request_enabled),
    razorpayEnabled: Boolean(row.razorpay_enabled),
    bankAccountName: row.bank_account_name || '',
    bankName: row.bank_name || '',
    bankNotes: row.bank_notes || ''
  };
}

function mapCustomerPayloadFromRpc(data: any): CustomerLoanPayload {
  const source = Array.isArray(data) ? data[0] : data;
  if (!source || !source.application) {
    throw new Error('No active customer loan was found.');
  }
  return {
    application: mapApplicationFromSupabase(source.application),
    emiSchedule: (source.emi_schedule || []).map((item: Record<string, any>) => mapEmiFromSupabase(item)),
    payments: (source.payments || []).map((item: Record<string, any>) => mapPaymentFromSupabase(item)),
    paymentSettings: source.payment_settings ? mapPaymentSettingsFromSupabase(source.payment_settings) : defaultPaymentSettings,
    customerSessionToken: source.customer_session_token || undefined
  };
}

function loadRazorpayCheckout() {
  if ((window as any).Razorpay) return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-rfg-razorpay]');
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error('Secure payment service could not load.')), { once: true });
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    script.dataset.rfgRazorpay = 'true';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Secure payment service could not load.'));
    document.head.appendChild(script);
  });
}

function buildCustomerDemoPayload(mobile: string): CustomerLoanPayload {
  const demoApplication: Application = {
    supabaseId: undefined,
    id: 'RFG-DEMO-1001',
    customerName: 'Demo Customer',
    mobile,
    alternateMobile: '',
    address: 'Demo address',
    customerPincode: '783370',
    category: 'Two-Wheeler',
    productName: 'Two-Wheeler Purchase',
    assetId: 'AS-01-DEMO',
    guarantorName: 'Demo Guarantor',
    guarantorMobile: '9999999999',
    guarantorAddress: 'Demo guarantor address',
    guarantorPincode: '783370',
    showroomName: 'Demo Showroom',
    showroomMobile: '8888888888',
    productPrice: 40000,
    downPayment: 10000,
    loanAmount: 30000,
    chargeAmount: 4000,
    processingFee: 1000,
    tenure: 5,
    emiAmount: 7000,
    dueDay: new Date().getDate(),
    disbursedAt: new Date().toISOString(),
    status: 'Active',
    salesPerson: 'Sales User',
    date: formatDate(new Date().toISOString()),
    loginId: mobile,
    customerPassword: 'Hidden for security',
    checklist: emptyChecklist,
    remarks: 'Preview account',
    activity: []
  };
  const schedule = buildEmiSchedule(demoApplication, new Date());
  if (schedule[0]) schedule[0].status = 'Paid';
  if (schedule[1]) {
    const overdueDate = new Date();
    overdueDate.setDate(overdueDate.getDate() - 9);
    schedule[1].dueDate = toDateKey(overdueDate);
    schedule[1].status = 'Overdue';
  }
  const paidAt = new Date();
  paidAt.setDate(paidAt.getDate() - 18);
  const demoPayments: PaymentItem[] = schedule[0]
    ? [
        {
          id: 'demo-pay-cash-1',
          paymentId: 'PAY-DEMO-CASH-1',
          applicationId: demoApplication.id,
          emiScheduleId: schedule[0].id,
          amount: schedule[0].amount,
          mode: 'cash',
          status: 'Paid',
          reference: 'Cash approved by admin',
          createdAt: paidAt.toISOString(),
          verifiedAt: paidAt.toISOString()
        },
        {
          id: 'demo-pay-razorpay-1',
          paymentId: 'PAY-DEMO-RZP-1',
          applicationId: demoApplication.id,
          emiScheduleId: null,
          amount: 2500,
          mode: 'razorpay',
          status: 'Paid',
          reference: 'RZP demo receipt',
          createdAt: new Date().toISOString(),
          verifiedAt: new Date().toISOString()
        },
        {
          id: 'demo-pay-bank-1',
          paymentId: 'PAY-DEMO-BANK-1',
          applicationId: demoApplication.id,
          emiScheduleId: null,
          amount: 1500,
          mode: 'manual_bank_qr',
          status: 'Verification Pending',
          reference: 'UTR demo pending',
          createdAt: new Date().toISOString()
        }
      ]
    : [];
  return {
    application: demoApplication,
    emiSchedule: schedule,
    payments: demoPayments,
    paymentSettings: {
      manualBankQrEnabled: true,
      cashRequestEnabled: true,
      razorpayEnabled: false,
      bankAccountName: 'Reliant Future Group LLP',
      bankName: 'Company bank account',
      bankNotes: 'Transfer first, then submit UTR or voucher number for admin verification.'
    }
  };
}

function getFriendlyCustomerError(error: unknown) {
  const message = getErrorMessage(error).toLowerCase();
  if (message.includes('invalid customer login')) return 'Mobile number or MPIN is incorrect.';
  if (message.includes('no active loan')) return 'No active payment plan is available for this mobile number yet.';
  if (message.includes('already has a request')) return 'This instalment is already waiting for admin verification.';
  if (message.includes('manual bank')) return 'Bank Transfer / QR payments are currently disabled by admin.';
  if (message.includes('function') && message.includes('does not exist')) return 'Customer backend RPC is not installed yet.';
  return getErrorMessage(error);
}

function mapChecklistFromSupabase(row?: Record<string, any>): Checklist {
  if (!row) return emptyChecklist;
  return {
    aadhaar: Boolean(row.aadhaar),
    pan: Boolean(row.pan),
    address: Boolean(row.address),
    photo: Boolean(row.photo),
    signature: Boolean(row.signature),
    customerOtp: Boolean(row.seller_confirmed),
    sellerConfirmed: Boolean(row.seller_confirmed),
    sellerOtp: Boolean(row.seller_otp),
    rc: Boolean(row.rc),
    insurance: Boolean(row.insurance),
    serialChecked: Boolean(row.serial_checked)
  };
}

function mapChecklistToSupabase(checklist: Checklist) {
  return {
    aadhaar: checklist.aadhaar,
    pan: checklist.pan,
    address: checklist.address,
    photo: checklist.photo,
    signature: checklist.signature,
    seller_confirmed: checklist.customerOtp,
    seller_otp: checklist.sellerOtp,
    rc: checklist.rc,
    insurance: checklist.insurance,
    serial_checked: checklist.serialChecked
  };
}

function mapLoanStatusFromDb(status: string): LoanStatus {
  const map: Record<string, LoanStatus> = {
    under_processing: 'Under Processing',
    approved: 'Approved',
    rejected: 'Rejected',
    active: 'Active',
    closed: 'Closed'
  };
  return map[status] || 'Under Processing';
}

function mapLoanStatusToDb(status: LoanStatus) {
  const map: Record<LoanStatus, string> = {
    'Under Processing': 'under_processing',
    Approved: 'approved',
    Rejected: 'rejected',
    Active: 'active',
    Closed: 'closed'
  };
  return map[status];
}

function mapCashStatusFromDb(status: string): CashStatus {
  const map: Record<string, CashStatus> = {
    verification_pending: 'Verification Pending',
    approved: 'Approved',
    rejected: 'Rejected'
  };
  return map[status] || 'Verification Pending';
}

function mapCashStatusToDb(status: CashStatus) {
  const map: Record<CashStatus, string> = {
    'Verification Pending': 'verification_pending',
    Approved: 'approved',
    Rejected: 'rejected'
  };
  return map[status];
}

function mapPaymentStatusFromDb(status?: string | null): EmiStatus {
  const map: Record<string, EmiStatus> = {
    pending: 'Pending',
    verification_pending: 'Verification Pending',
    paid: 'Paid',
    part_paid: 'Part Paid',
    rejected: 'Rejected',
    failed: 'Failed',
    overdue: 'Overdue'
  };
  return map[status || ''] || 'Pending';
}

function mapProductCategoryFromDb(category: string): ProductCategory {
  const map: Record<string, ProductCategory> = {
    two_wheeler: 'Two-Wheeler',
    electronics: 'Electronics',
    others: 'Others'
  };
  return map[category] || 'Others';
}

function mapProductCategoryToDb(category: ProductCategory) {
  if (category === 'Two-Wheeler') return 'two_wheeler';
  if (category === 'Electronics') return 'electronics';
  return 'others';
}

function ProductCategoryIcon({ category, size = 24 }: { category: ProductCategory; size?: number }) {
  if (category === 'Two-Wheeler') return <Bike size={size} />;
  if (category === 'Electronics') return <Smartphone size={size} />;
  return <Store size={size} />;
}

function formatDate(value?: string) {
  if (!value) return 'Today';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Date unavailable';
  return new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short' }).format(date);
}

function formatDateTime(value?: string) {
  if (!value) return 'Not reviewed yet';
  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) {
    return new Intl.DateTimeFormat('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    }).format(parsed);
  }
  return value;
}

function compactUserId(value?: string) {
  if (!value) return 'System';
  if (value.length <= 14) return value;
  return `${value.slice(0, 8)}…${value.slice(-4)}`;
}

function formatAuditDate(value: Date) {
  return new Intl.DateTimeFormat('en-IN', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric'
  }).format(value);
}

function formatAuditTime(value?: string) {
  if (!value) return 'Time unavailable';
  if (!value.includes('T') && !/\d{1,2}:\d{2}/.test(value)) return '—';
  const date = parseAuditDate(value);
  if (Number.isNaN(date.getTime())) return 'Time unavailable';
  return new Intl.DateTimeFormat('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  }).format(date);
}

function parseAuditDate(value?: string) {
  if (!value) return new Date();
  const trimmed = value.trim();
  const shortDate = trimmed.match(/^(\d{1,2})\s+([A-Za-z]{3})$/);
  const date = shortDate
    ? new Date(`${shortDate[1]} ${shortDate[2]} ${new Date().getFullYear()} 12:00:00`)
    : new Date(trimmed);
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function shortAuditId(value: string) {
  const compact = value.replace(/-/g, '').toUpperCase();
  return compact.length > 12 ? `LOG-${compact.slice(0, 8)}` : compact;
}

function formatFullDate(value?: string) {
  if (!value) return 'Not set';
  return new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(`${value}T00:00:00`));
}

function formatPaymentMode(mode?: string | null) {
  if (mode === 'manual_bank_qr') return 'Bank Transfer / QR';
  if (mode === 'razorpay') return 'Online payment';
  return 'Cash';
}

function formatArchiveMonth(value: string) {
  return new Intl.DateTimeFormat('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(`${value.slice(0, 10)}T00:00:00Z`));
}

function formatBytes(value: number) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function isMissingDisbursementSchemaError(error: unknown) {
  if (!error || typeof error !== 'object') return false;
  const supabaseError = error as { code?: string; message?: string; details?: string };
  const text = `${supabaseError.message || ''} ${supabaseError.details || ''}`.toLowerCase();
  return (
    ['42703', 'PGRST204'].includes(supabaseError.code || '') ||
    text.includes('disbursed_') ||
    text.includes('disbursement_') ||
    text.includes('permission denied for table loan_applications')
  );
}

function getErrorMessage(error: unknown) {
  let message = '';

  if (error instanceof Error) message = error.message;
  else if (typeof error === 'string') message = error;
  else if (error && typeof error === 'object') {
    const supabaseError = error as {
      message?: unknown;
      details?: unknown;
      hint?: unknown;
      code?: unknown;
    };
    message = [supabaseError.message, supabaseError.details, supabaseError.hint]
      .find((value) => typeof value === 'string' && value.trim().length > 0) as string || '';
  }

  const normalized = message.toLowerCase();
  if (normalized.includes('cash payment requests are currently disabled')) {
    return 'Office payment requests are disabled by admin. Contact admin if this payment method should be enabled.';
  }
  if (normalized.includes('manual bank qr requests are currently disabled')) {
    return 'Bank Transfer / QR payments are disabled by admin. Please use another available payment method.';
  }
  if (normalized.includes('permission denied') || normalized.includes('admin access is required')) {
    return 'You do not have permission to perform this action.';
  }
  if (normalized.includes('already has a request waiting for admin')) {
    return 'This EMI is already waiting for admin verification.';
  }
  if (normalized.includes('already reviewed')) {
    return 'This payment request has already been reviewed. Refresh to see its latest status.';
  }
  if (normalized.includes('invalid loan status change')) {
    return 'This loan cannot move to that status from its current stage.';
  }
  if (normalized.includes('could not find the function') || normalized.includes('pgrst202')) {
    return 'The required backend update is not installed yet. Ask the administrator to run the latest Supabase migration.';
  }
  if (message.trim()) return message.trim();
  return 'Something went wrong. Please try again.';
}

function getAuthErrorMessage(error: unknown) {
  const message = getErrorMessage(error).toLowerCase();
  if (message.includes('invalid login') || message.includes('invalid credentials')) {
    return 'Email or password is incorrect.';
  }
  if (message.includes('email not confirmed')) {
    return 'This staff email is not confirmed yet.';
  }
  if (message.includes('rate limit') || message.includes('too many')) {
    return 'Too many attempts. Please wait and try again.';
  }
  return getErrorMessage(error);
}

function isErrorMessage(message: string) {
  return /invalid|incorrect|failed|could not|not active|error|rejected|missing|denied|violates|permission/i.test(message);
}

function ConfirmActionDialog({
  action,
  onCancel,
  onConfirm
}: {
  action: ConfirmAction;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const Icon = action.tone === 'danger' ? AlertCircle : action.tone === 'success' ? CheckCircle2 : ShieldCheck;

  return (
    <div className="disbursement-dialog-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onCancel();
    }}>
      <section className={`confirm-action-dialog tone-${action.tone || 'warning'}`} role="dialog" aria-modal="true" aria-labelledby="confirm-action-title">
        <div className="confirm-action-header">
          <span><Icon size={23} /></span>
          <div>
            <p className="eyebrow">Confirmation required</p>
            <h2 id="confirm-action-title">{action.title}</h2>
          </div>
          <button className="icon-button" onClick={onCancel} aria-label="Close confirmation" type="button">
            <X size={19} />
          </button>
        </div>
        <div className="confirm-action-body">
          <p>{action.message}</p>
          {action.details && (
            <div className="confirm-action-details">
              {action.details.map(([label, value]) => (
                <div key={label}>
                  <span>{label}</span>
                  <strong>{value}</strong>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="confirm-action-actions">
          <button className="soft-button" onClick={onCancel} type="button">Cancel</button>
          <button className={action.tone === 'danger' ? 'danger-confirm-button' : 'primary-action'} onClick={onConfirm} type="button">
            {action.confirmLabel}
          </button>
        </div>
      </section>
    </div>
  );
}

function ForeclosureSettlementDialog({
  application,
  emiSchedule,
  onCancel,
  onContinue
}: {
  application: Application | null;
  emiSchedule: EmiItem[];
  onCancel: () => void;
  onContinue: (settlement: ForeclosureSettlementInput) => void;
}) {
  const paidSoFar = emiSchedule.reduce((sum, item) => sum + getEmiPaidAmount(item), 0);
  const scheduleOutstanding = emiSchedule.reduce((sum, item) => sum + getEmiPayableAmount(item), 0);
  const fallbackOutstanding = application
    ? Math.max(application.loanAmount + application.chargeAmount + application.processingFee - paidSoFar, 0)
    : 0;
  const currentOutstanding = scheduleOutstanding || fallbackOutstanding;
  const [settlementAmount, setSettlementAmount] = useState(() => String(Math.round(currentOutstanding * 100) / 100));
  const [productReturned, setProductReturned] = useState(false);
  const [productReturnValue, setProductReturnValue] = useState('0');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');

  if (!application) return null;

  const continueToWarning = () => {
    const agreedSettlementAmount = toNumber(settlementAmount);
    const returnedValue = productReturned ? toNumber(productReturnValue) : 0;
    if (agreedSettlementAmount < 0) {
      setError('Agreed settlement amount cannot be negative.');
      return;
    }
    if (returnedValue < 0) {
      setError('Product return value cannot be negative.');
      return;
    }
    if (notes.trim().length < 10) {
      setError('Enter clear settlement terms of at least 10 characters.');
      return;
    }
    onContinue({
      agreedSettlementAmount,
      productReturned,
      productReturnValue: returnedValue,
      notes: notes.trim()
    });
  };

  return (
    <div className="disbursement-dialog-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onCancel();
    }}>
      <section className="disbursement-dialog foreclosure-dialog" role="dialog" aria-modal="true" aria-labelledby="foreclosure-title">
        <div className="disbursement-dialog-header">
          <span><Scale size={22} /></span>
          <div>
            <p className="eyebrow">Early settlement</p>
            <h2 id="foreclosure-title">Set Foreclosure Terms</h2>
            <p>{application.id} - {application.customerName}</p>
          </div>
          <button className="icon-button" onClick={onCancel} aria-label="Close foreclosure terms" type="button">
            <X size={19} />
          </button>
        </div>

        <div className="foreclosure-summary">
          <span><small>Original Loan Value</small><strong>{money(application.loanAmount + application.chargeAmount + application.processingFee)}</strong></span>
          <span><small>Paid So Far</small><strong>{money(paidSoFar)}</strong></span>
          <span><small>Current Outstanding</small><strong>{money(currentOutstanding)}</strong></span>
        </div>

        <div className="foreclosure-fields">
          <label>
            <span>Agreed Final Settlement Amount</span>
            <input type="number" min="0" step="0.01" value={settlementAmount} onChange={(event) => setSettlementAmount(event.target.value)} />
            <small>The final amount mutually agreed for early closure.</small>
          </label>
          <label className="foreclosure-check">
            <input type="checkbox" checked={productReturned} onChange={(event) => setProductReturned(event.target.checked)} />
            <span><strong>Product returned to RFG/showroom</strong><small>Enable this when the financed product is taken back as part of settlement.</small></span>
          </label>
          {productReturned && (
            <label>
              <span>Agreed Product Return Value</span>
              <input type="number" min="0" step="0.01" value={productReturnValue} onChange={(event) => setProductReturnValue(event.target.value)} />
            </label>
          )}
          <label>
            <span>Settlement Terms / Reason</span>
            <textarea rows={4} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Record what was mutually agreed and why the loan is being foreclosed." />
          </label>
          {error && <p className="foreclosure-error"><AlertCircle size={16} />{error}</p>}
        </div>

        <div className="confirm-action-actions">
          <button className="soft-button" onClick={onCancel} type="button">Cancel</button>
          <button className="danger-confirm-button" onClick={continueToWarning} type="button">Save &amp; Review Closure</button>
        </div>
      </section>
    </div>
  );
}

function DisbursementDialog({
  application,
  onCancel,
  onConfirm
}: {
  application: Application | null;
  onCancel: () => void;
  onConfirm: (details: DisbursementInput) => Promise<void>;
}) {
  const [disbursedAt, setDisbursedAt] = useState(() => toLocalDateTimeInputValue(new Date()));
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  if (!application) return null;

  const parsedDisbursement = new Date(disbursedAt);
  const firstDueDate = Number.isNaN(parsedDisbursement.getTime())
    ? null
    : addCalendarMonthsClamped(parsedDisbursement, 1);
  const referenceMissing = !reference.trim();
  const dateInvalid = Number.isNaN(parsedDisbursement.getTime());
  const dateInFuture = !dateInvalid && parsedDisbursement.getTime() > Date.now() + 5 * 60 * 1000;

  const submit = async () => {
    if (dateInvalid) return;
    if (dateInFuture) return;
    if (referenceMissing) return;

    setSaving(true);
    try {
      await onConfirm({
        disbursedAt,
        reference: reference.trim(),
        notes: notes.trim()
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="disbursement-dialog-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !saving) onCancel();
    }}>
      <section className="disbursement-dialog" role="dialog" aria-modal="true" aria-labelledby="disbursement-title">
        <div className="disbursement-dialog-header">
          <span><Banknote size={22} /></span>
          <div>
            <p className="eyebrow">Approved loan</p>
            <h2 id="disbursement-title">Confirm Disbursement &amp; Activate</h2>
            <p>{application.id} - {application.customerName}</p>
          </div>
          <button className="icon-button" onClick={onCancel} disabled={saving} aria-label="Close disbursement confirmation" type="button">
            <X size={19} />
          </button>
        </div>

        <div className="disbursement-dialog-alert">
          <CalendarClock size={19} />
          <p>
            This date starts the loan. The first EMI will be due one calendar month later, on
            <strong> {firstDueDate ? formatFullDate(toDateKey(firstDueDate)) : 'a valid date'}</strong>.
          </p>
        </div>

        <div className="disbursement-dialog-fields">
          <label>
            Actual disbursement date and time
            <input
              type="datetime-local"
              value={disbursedAt}
              max={toLocalDateTimeInputValue(new Date())}
              onChange={(event) => setDisbursedAt(event.target.value)}
            />
          </label>
          <label>
            Transfer reference / voucher number
            <input
              value={reference}
              placeholder="UTR, transaction ID or voucher no."
              onChange={(event) => setReference(event.target.value)}
            />
            <small className={referenceMissing ? 'field-warning-text' : 'field-help-text'}>
              Required to activate: enter bank UTR, transaction ID, or cash voucher number.
            </small>
          </label>
          <label className="disbursement-notes-field">
            Notes <span>Optional</span>
            <textarea
              value={notes}
              placeholder="Add a short disbursement note"
              onChange={(event) => setNotes(event.target.value)}
            />
          </label>
        </div>

        <div className="disbursement-dialog-summary">
          <div><span>Loan amount</span><strong>{money(application.loanAmount)}</strong></div>
          <div><span>Tenure</span><strong>{application.tenure} months</strong></div>
          <div><span>Monthly EMI</span><strong>{money(application.emiAmount)}</strong></div>
        </div>

        <div className="disbursement-dialog-actions">
          <button className="soft-button" onClick={onCancel} disabled={saving} type="button">Cancel</button>
          <button
            className="primary-action"
            onClick={() => void submit()}
            disabled={saving || referenceMissing || dateInvalid || dateInFuture}
            type="button"
          >
            {saving ? 'Activating...' : 'Confirm & Activate'}
          </button>
        </div>
      </section>
    </div>
  );
}

function EmptyState({ title, text }: { title: string; text: string }) {
  return (
    <div className="empty-state">
      <Home size={28} />
      <strong>{title}</strong>
      <p>{text}</p>
    </div>
  );
}

function LoadingScreen() {
  return (
    <div className="loading-screen">
      <img src="./rfg-logo.png" alt="Reliant Future Group" />
      <div className="loader-line">
        <span />
      </div>
      <p>Loading RFG panel...</p>
    </div>
  );
}

function EmiScheduleList({ items }: { items: EmiItem[] }) {
  if (!items.length) {
    return <EmptyState title="EMI schedule not generated" text="The schedule appears after admin confirms the actual disbursement and activates the loan." />;
  }

  return (
    <div className="payment-list">
      {items.map((item, index) => {
        const effectiveStatus = getEffectiveEmiStatus(item);
        const penalty = getEmiPenaltyAmount(item);
        const dueAmount = getEmiDueAmount(item);
        const paidAmount = getEmiPaidAmount(item);
        const carryForward = getEmiCarryForwardAmount(item);
        const duePassed = isEmiDueDatePassed(item);
        return (
          <div className="payment-row" key={item.id}>
            <div className="payment-avatar"><CalendarClock size={18} /></div>
            <div>
              <strong>EMI {index + 1} - {item.emiMonth}</strong>
              <span>Due {formatFullDate(item.dueDate)}{duePassed ? ` - Grace till ${formatFullDate(getEmiGraceEndDate(item))}` : ''}</span>
              {carryForward > 0 && <span className="carry-forward-note">Previous balance {money(carryForward)} included</span>}
              {penalty > 0 && <span>Base {money(item.amount)} - Penalty {money(penalty)}</span>}
              {effectiveStatus === 'Part Paid' && <span className="carry-forward-note">Paid {money(paidAmount)}. Short balance moved to next EMI.</span>}
            </div>
            <strong>{effectiveStatus === 'Part Paid' ? money(paidAmount) : money(dueAmount)}</strong>
            <EmiStatusChip status={effectiveStatus} />
          </div>
        );
      })}
    </div>
  );
}

function StatusChip({ status }: { status: LoanStatus | CashStatus }) {
  const key = status.toLowerCase().replace(/\s+/g, '-');
  return <span className={`status-chip ${key}`}>{status}</span>;
}

function ApplicationStatusChip({ application }: { application: Application }) {
  if (application.status === 'Closed' && application.foreclosureSettlement) {
    return <span className="status-chip foreclosed">Foreclosed</span>;
  }
  return <StatusChip status={application.status} />;
}

function EmiStatusChip({ status }: { status: EmiStatus }) {
  const key = status.toLowerCase().replace(/\s+/g, '-');
  return <span className={`status-chip ${key}`}>{status}</span>;
}

function money(value: number) {
  return `Rs ${Math.round(value || 0).toLocaleString('en-IN')}`;
}

function formatAttentionCount(value: number) {
  return value > 9 ? '9+' : String(value);
}

function formatDashboardWorkloadCount(value: number) {
  return value > 100 ? '100+' : String(value);
}

function calculateEmiAmount(
  loanAmount: string | number,
  chargeAmount: string | number,
  processingFee: string | number,
  tenure: string | number
) {
  const asNumber = (value: string | number) => Number(value || 0);
  const months = asNumber(tenure);
  if (months <= 0) return 0;
  return (asNumber(loanAmount) + asNumber(chargeAmount) + asNumber(processingFee)) / months;
}

function addCalendarMonthsClamped(value: Date, months: number) {
  const result = new Date(value);
  const originalDay = result.getDate();
  result.setDate(1);
  result.setMonth(result.getMonth() + months);
  const lastDay = new Date(result.getFullYear(), result.getMonth() + 1, 0).getDate();
  result.setDate(Math.min(originalDay, lastDay));
  return result;
}

function parseDateKey(value?: string) {
  if (!value) return null;
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
}

function addDays(value: Date, days: number) {
  const next = new Date(value);
  next.setDate(next.getDate() + days);
  return next;
}

function applicationScheduleKeys(application: Application) {
  return [application.id, application.supabaseId].filter(Boolean) as string[];
}

function getApplicationEmis(application: Application, emiSchedule: EmiItem[]) {
  const keys = new Set(applicationScheduleKeys(application));
  return emiSchedule.filter((item) => keys.has(item.applicationId));
}

function getPendingEmiRows(applications: Application[], emiSchedule: EmiItem[]) {
  return applications
    .flatMap((application) =>
      getApplicationEmis(application, emiSchedule)
        .filter((emi) => {
          const status = getEffectiveEmiStatus(emi);
          return status === 'Pending' || status === 'Overdue';
        })
        .map((emi) => ({
          application,
          emi,
          status: getEffectiveEmiStatus(emi),
          penalty: getEmiPenaltyAmount(emi)
        }))
    )
    .sort((left, right) => left.emi.dueDate.localeCompare(right.emi.dueDate));
}

function getApplicationsInGracePeriod(applications: Application[], emiSchedule: EmiItem[]) {
  return applications.filter((application) =>
    getApplicationEmis(application, emiSchedule).some((emi) => {
      const status = getEffectiveEmiStatus(emi);
      return !isEmiSettledForSequence(emi) && isEmiDueDatePassed(emi) && getEmiPenaltyAmount(emi) === 0;
    })
  );
}

function getApplicationsWithPenalty(applications: Application[], emiSchedule: EmiItem[]) {
  return applications.filter((application) =>
    getApplicationEmis(application, emiSchedule).some((emi) => !isEmiSettledForSequence(emi) && getEmiPenaltyAmount(emi) > 0)
  );
}

function getRenderableEmiSchedule(application: Application, emiSchedule: EmiItem[]) {
  const persistedSchedule = getApplicationEmis(application, emiSchedule);
  if (persistedSchedule.length > 0) return persistedSchedule;
  // Supabase is the only source of truth for persisted loans. Never fabricate
  // database identifiers in the browser for a payment workflow.
  if (application.supabaseId) return emiSchedule;
  if (application.status !== 'Active' || !application.disbursedAt) return emiSchedule;

  const disbursedAt = new Date(application.disbursedAt);
  if (Number.isNaN(disbursedAt.getTime())) return emiSchedule;
  return buildEmiSchedule(application, disbursedAt);
}

function getEmiGraceEndDate(item: EmiItem) {
  const dueDate = parseDateKey(item.dueDate);
  return dueDate ? toDateKey(addDays(dueDate, GRACE_PERIOD_DAYS)) : item.dueDate;
}

type CustomerDueCountdown = {
  value: string;
  label: string;
  tone: string;
  multiplier?: string;
};

function getCustomerDueCountdown(item?: EmiItem | null, missedPenaltyMonths = 0): CustomerDueCountdown {
  if (!item) return { value: 'Paid', label: 'No EMI Due', tone: 'settled' };

  const effectiveStatus = getEffectiveEmiStatus(item);
  if (effectiveStatus === 'Verification Pending') {
    return { value: 'Pending', label: 'Payment Verification', tone: 'verification' };
  }

  const dueDate = parseDateKey(item.dueDate);
  if (!dueDate) return { value: '--', label: 'Due Date Pending', tone: 'normal' };

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  dueDate.setHours(0, 0, 0, 0);
  const dayMs = 24 * 60 * 60 * 1000;

  if (today < dueDate) {
    return {
      value: String(Math.ceil((dueDate.getTime() - today.getTime()) / dayMs)),
      label: 'Days To Due',
      tone: 'normal'
    };
  }

  if (today.getTime() === dueDate.getTime()) {
    return { value: 'Today', label: 'EMI Due', tone: 'due' };
  }

  const graceEnd = addDays(dueDate, GRACE_PERIOD_DAYS);
  graceEnd.setHours(0, 0, 0, 0);
  if (today <= graceEnd) {
    const graceDaysLeft = Math.ceil((graceEnd.getTime() - today.getTime()) / dayMs);
    return graceDaysLeft > 0
      ? { value: String(graceDaysLeft), label: 'Grace Days Left', tone: 'grace' }
      : { value: 'Today', label: 'Grace Ends Today', tone: 'grace' };
  }

  return {
    value: money(getEmiPenaltyAmount(item)),
    label: 'Penalty Applied',
    tone: 'penalty',
    multiplier: `${money(FIXED_EMI_PENALTY_AMOUNT)} × ${Math.max(1, missedPenaltyMonths)} missed month${missedPenaltyMonths === 1 ? '' : 's'}`
  };
}

function isEmiDueDatePassed(item: EmiItem) {
  if (!['Pending', 'Overdue'].includes(item.status)) return false;
  const dueDate = parseDateKey(item.dueDate);
  if (!dueDate) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  dueDate.setHours(0, 0, 0, 0);
  return today > dueDate;
}

function isEmiDueWithinDays(item: EmiItem, days: number) {
  const status = getEffectiveEmiStatus(item);
  if (status !== 'Pending' && status !== 'Overdue') return false;
  const dueDate = parseDateKey(item.dueDate);
  if (!dueDate) return false;
  const cutoff = addDays(new Date(), days);
  cutoff.setHours(23, 59, 59, 999);
  return dueDate <= cutoff;
}

function isEmiPastGrace(item: EmiItem) {
  if (!['Pending', 'Overdue'].includes(item.status)) return false;
  const graceEnd = parseDateKey(getEmiGraceEndDate(item));
  if (!graceEnd) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  graceEnd.setHours(0, 0, 0, 0);
  return today > graceEnd;
}

function getEffectiveEmiStatus(item: EmiItem): EmiStatus {
  if (item.status === 'Pending' && isEmiPastGrace(item)) return 'Overdue';
  return item.status;
}

function getEmiPenaltyAmount(item: EmiItem) {
  return isEmiPastGrace(item) ? FIXED_EMI_PENALTY_AMOUNT : 0;
}

function getEmiCarryForwardAmount(item: EmiItem) {
  return Number(item.carryForwardAmount || 0);
}

function getEmiDueAmount(item: EmiItem) {
  return item.amount + getEmiCarryForwardAmount(item) + getEmiPenaltyAmount(item);
}

function getEmiPaidAmount(item: EmiItem) {
  if (typeof item.paidAmount === 'number' && item.paidAmount > 0) return item.paidAmount;
  return getEffectiveEmiStatus(item) === 'Paid' ? getEmiDueAmount(item) : 0;
}

function isEmiSettledForSequence(item: EmiItem) {
  const status = getEffectiveEmiStatus(item);
  return status === 'Paid' || status === 'Part Paid';
}

function hasEmiMonthArrived(item: EmiItem, today = new Date()) {
  const dueDate = parseDateKey(item.dueDate);
  if (!dueDate) return false;
  return dueDate.getFullYear() < today.getFullYear()
    || (dueDate.getFullYear() === today.getFullYear() && dueDate.getMonth() <= today.getMonth());
}

function getPaymentEligibleEmis(items: EmiItem[], today = new Date()) {
  const ordered = [...items].sort((left, right) => {
    const leftDate = parseDateKey(left.dueDate)?.getTime() || 0;
    const rightDate = parseDateKey(right.dueDate)?.getTime() || 0;
    return leftDate - rightDate;
  });
  const firstUnsettled = ordered.find((item) => !isEmiSettledForSequence(item)) || null;

  return ordered.filter((item, index) => {
    const status = getEffectiveEmiStatus(item);
    if (status !== 'Pending' && status !== 'Overdue') return false;
    const earlierVerificationPending = ordered
      .slice(0, index)
      .some((earlier) => getEffectiveEmiStatus(earlier) === 'Verification Pending');
    if (earlierVerificationPending) return false;
    return item.id === firstUnsettled?.id || hasEmiMonthArrived(item, today);
  });
}

function isConfirmedPaymentStatus(status: EmiStatus) {
  return status === 'Paid' || status === 'Part Paid';
}

function getEmiPayableAmount(item: EmiItem) {
  return isEmiSettledForSequence(item) ? 0 : getEmiDueAmount(item);
}

function buildEmiSchedule(application: Application, disbursedAt: Date): EmiItem[] {
  return Array.from({ length: application.tenure }, (_, index) => {
    const dueDate = addCalendarMonthsClamped(disbursedAt, index + 1);
    return {
      id: `${application.id}-EMI-${index + 1}`,
      applicationId: application.supabaseId || application.id,
      emiMonth: new Intl.DateTimeFormat('en-IN', { month: 'short', year: 'numeric' }).format(dueDate),
      dueDate: toDateKey(dueDate),
      amount: application.emiAmount,
      carryForwardAmount: 0,
      paidAmount: 0,
      status: 'Pending'
    };
  });
}

function toDateKey(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function toLocalDateTimeInputValue(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  const hours = String(value.getHours()).padStart(2, '0');
  const minutes = String(value.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function moneyPrecise(value: number) {
  return `Rs ${Number(value || 0).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
}

function grossUpRazorpayPayment(netAmount: number) {
  if (!Number.isFinite(netAmount) || netAmount <= 0) return 0;
  return Math.ceil((netAmount * 100) / (1 - RAZORPAY_FEE_RATE)) / 100;
}

function compactMoney(value: number) {
  if (value >= 10000000) return `Rs ${(value / 10000000).toFixed(value % 10000000 === 0 ? 0 : 1)}Cr`;
  if (value >= 100000) return `Rs ${(value / 100000).toFixed(value % 100000 === 0 ? 0 : 1)}L`;
  if (value >= 1000) return `Rs ${(value / 1000).toFixed(value % 1000 === 0 ? 0 : 1)}K`;
  return `Rs ${Math.round(value || 0)}`;
}

function mobileNavLabel(label: View) {
  if (label === 'New Application') return 'New';
  if (label === 'Applications') return 'Apps';
  if (label === 'Pending EMI') return 'EMI';
  if (label === 'Payment Requests') return 'Pay';
  return label;
}

function toNumber(value: string) {
  return Number(String(value).replace(/[^0-9.]/g, '')) || 0;
}

function hasNumber(value: string) {
  const normalized = String(value).replace(/[^0-9.]/g, '');
  return normalized.length > 0 && Number.isFinite(Number(normalized));
}

function generatePin() {
  return String(Math.floor(1000 + Math.random() * 9000));
}

function nextLoanId(count: number) {
  return `RFG-2406-${String(30 + count).padStart(3, '0')}`;
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
