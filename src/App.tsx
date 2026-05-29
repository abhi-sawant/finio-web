import { BrowserRouter, Routes, Route, Navigate } from 'react-router';
import { Toaster } from 'sonner';
import { Layout } from '@/components/layout/Layout';
import Dashboard from '@/pages/Dashboard';
import Accounts from '@/pages/Accounts';
import Transactions from '@/pages/Transactions';
import Analytics from '@/pages/Analytics';
import Settings from '@/pages/Settings';
import AddTransaction from '@/pages/AddTransaction';
import AddAccount from '@/pages/AddAccount';
import ManageCategories from '@/pages/ManageCategories';
import ManageLabels from '@/pages/ManageLabels';
import Budgets from '@/pages/Budgets';
import Recurring from '@/pages/Recurring';
import Login from '@/pages/auth/Login';
import Register from '@/pages/auth/Register';
import VerifyOtp from '@/pages/auth/VerifyOtp';
import ForgotPassword from '@/pages/auth/ForgotPassword';
import ResetPassword from '@/pages/auth/ResetPassword';

export default function App() {
  return (
    <BrowserRouter>
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
      <Toaster position="top-center" richColors closeButton />
    </BrowserRouter>
  );
}
