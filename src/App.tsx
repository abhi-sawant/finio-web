import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router';
import { Toaster } from 'sonner';
import { Layout } from '@/components/layout/Layout';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { ConfirmProvider } from '@/components/ui/confirm';
import { useFinanceStore } from '@/store/useFinanceStore';
import { useAppLockStore } from '@/store/useAppLockStore';
import { useAutoLock } from '@/hooks/useAutoLock';

const Onboarding = lazy(() =>
  import('@/components/onboarding/Onboarding').then((m) => ({ default: m.Onboarding })),
);

const LockScreen = lazy(() =>
  import('@/components/applock/LockScreen').then((m) => ({ default: m.LockScreen })),
);

// Lazy-loaded pages (route-based code splitting)
const Dashboard = lazy(() => import('@/pages/Dashboard'));
const Accounts = lazy(() => import('@/pages/Accounts'));
const Transactions = lazy(() => import('@/pages/Transactions'));
const Analytics = lazy(() => import('@/pages/Analytics'));
const Settings = lazy(() => import('@/pages/Settings'));
const AddTransaction = lazy(() => import('@/pages/AddTransaction'));
const AddAccount = lazy(() => import('@/pages/AddAccount'));
const ManageCategories = lazy(() => import('@/pages/ManageCategories'));
const ManageLabels = lazy(() => import('@/pages/ManageLabels'));
const Budgets = lazy(() => import('@/pages/Budgets'));
const Recurring = lazy(() => import('@/pages/Recurring'));
const Goals = lazy(() => import('@/pages/Goals'));
const Debts = lazy(() => import('@/pages/Debts'));
const Loans = lazy(() => import('@/pages/Loans'));
const AddLoan = lazy(() => import('@/pages/AddLoan'));
const ImportCsv = lazy(() => import('@/pages/ImportCsv'));
const CategoryRules = lazy(() => import('@/pages/CategoryRules'));
const Merchants = lazy(() => import('@/pages/Merchants'));
const Login = lazy(() => import('@/pages/auth/Login'));
const Register = lazy(() => import('@/pages/auth/Register'));
const VerifyOtp = lazy(() => import('@/pages/auth/VerifyOtp'));
const ForgotPassword = lazy(() => import('@/pages/auth/ForgotPassword'));
const ResetPassword = lazy(() => import('@/pages/auth/ResetPassword'));

function PageLoader() {
  return (
    <div className="flex h-screen items-center justify-center">
      <div className="border-primary h-8 w-8 animate-spin rounded-full border-4 border-t-transparent" />
    </div>
  );
}

function AppRoutes() {
  const isHydrated = useFinanceStore((s) => s.isHydrated);
  const onboardedAt = useFinanceStore((s) => s.settings.onboardedAt);
  const isLockReady = useAppLockStore((s) => s.isReady);
  const isLocked = useAppLockStore((s) => s.isLocked);

  // Gate on both hydrations so a returning user never sees the wizard — or a flash of their
  // balances — before the persisted state lands.
  //
  // Every gate here renders *instead of* <Routes> and never navigates, which is what lets a
  // share target, a manifest shortcut or a notification click survive them: the URL — query
  // string and all — is untouched, and matches the moment the gates lift. Redirecting to "/"
  // from any of them would silently break every deep-link entry point.
  //
  // Lock before onboarding: in practice the states are disjoint, but if they ever co-occur a
  // locked app must not show a wizard that a stranger could complete.
  if (!isHydrated || !isLockReady) return <PageLoader />;
  if (isLocked) return <LockScreen />;
  if (!onboardedAt) return <Onboarding />;

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="accounts" element={<Accounts />} />
        <Route path="transactions" element={<Transactions />} />
        <Route path="analytics" element={<Analytics />} />
        <Route path="settings" element={<Settings />} />
      </Route>
      <Route path="add-transaction" element={<AddTransaction />} />
      <Route path="edit-transaction/:id" element={<AddTransaction />} />
      {/* Web Share Target. Must be an explicit route — the "*" catch-all below redirects to
          "/" and would drop the shared payload's query params on the way. */}
      <Route path="share-target" element={<AddTransaction />} />
      <Route path="add-account" element={<AddAccount />} />
      <Route path="edit-account/:id" element={<AddAccount />} />
      <Route path="manage-categories" element={<ManageCategories />} />
      <Route path="manage-labels" element={<ManageLabels />} />
      <Route path="budgets" element={<Budgets />} />
      <Route path="recurring" element={<Recurring />} />
      <Route path="goals" element={<Goals />} />
      <Route path="debts" element={<Debts />} />
      <Route path="loans" element={<Loans />} />
      <Route path="add-loan" element={<AddLoan />} />
      <Route path="edit-loan/:id" element={<AddLoan />} />
      <Route path="import-csv" element={<ImportCsv />} />
      <Route path="category-rules" element={<CategoryRules />} />
      <Route path="merchants" element={<Merchants />} />
      <Route path="login" element={<Login />} />
      <Route path="register" element={<Register />} />
      <Route path="verify-otp" element={<VerifyOtp />} />
      <Route path="forgot-password" element={<ForgotPassword />} />
      <Route path="reset-password" element={<ResetPassword />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  // Here rather than in AppRoutes: AppRoutes is inside <Suspense>, and a suspending lazy route
  // would tear down the visibility listener while its chunk loads. App never suspends.
  useAutoLock();

  return (
    <ErrorBoundary>
      <BrowserRouter>
        <ConfirmProvider>
          <Suspense fallback={<PageLoader />}>
            <AppRoutes />
          </Suspense>
          <Toaster position="top-center" richColors closeButton />
        </ConfirmProvider>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
