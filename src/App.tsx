import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router';
import { Toaster } from 'sonner';
import { Layout } from '@/components/layout/Layout';
import { ErrorBoundary } from '@/components/ErrorBoundary';

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

export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <Suspense fallback={<PageLoader />}>
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
            <Route path="add-account" element={<AddAccount />} />
            <Route path="edit-account/:id" element={<AddAccount />} />
            <Route path="manage-categories" element={<ManageCategories />} />
            <Route path="manage-labels" element={<ManageLabels />} />
            <Route path="budgets" element={<Budgets />} />
            <Route path="recurring" element={<Recurring />} />
            <Route path="login" element={<Login />} />
            <Route path="register" element={<Register />} />
            <Route path="verify-otp" element={<VerifyOtp />} />
            <Route path="forgot-password" element={<ForgotPassword />} />
            <Route path="reset-password" element={<ResetPassword />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
        <Toaster position="top-center" richColors closeButton />
      </BrowserRouter>
    </ErrorBoundary>
  );
}
