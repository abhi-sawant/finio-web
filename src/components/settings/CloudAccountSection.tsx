import { useState } from 'react';
import { useNavigate } from 'react-router';
import { ChevronRight, User, LogIn, LogOut, KeyRound, UserX } from 'lucide-react';
import { toast } from 'sonner';
import { useAuthStore } from '@/store/useAuthStore';
import { api } from '@/services/api';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useConfirm } from '@/components/ui/use-confirm';

export function CloudAccountSection() {
  const navigate = useNavigate();
  const confirm = useConfirm();

  const token = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const clearAuth = useAuthStore((s) => s.clearAuth);
  const setAuth = useAuthStore((s) => s.setAuth);

  const [showChangePassword, setShowChangePassword] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);

  const [showDeleteAccount, setShowDeleteAccount] = useState(false);
  const [deleteAccountPassword, setDeleteAccountPassword] = useState('');
  const [deletingAccount, setDeletingAccount] = useState(false);

  const handleChangePassword = async () => {
    if (newPassword.length < 8) {
      toast.error('New password must be at least 8 characters');
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error('New passwords do not match');
      return;
    }
    if (!token) return;
    setChangingPassword(true);
    try {
      const res = await api.updateProfile(token, {
        current_password: currentPassword,
        new_password: newPassword,
      });
      setAuth(res.token, res.user);
      toast.success('Password changed');
      setShowChangePassword(false);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to change password');
    } finally {
      setChangingPassword(false);
    }
  };

  const handleDeleteCloudAccount = async () => {
    if (!token || !deleteAccountPassword) return;
    setDeletingAccount(true);
    try {
      await api.deleteAccount(token, deleteAccountPassword);
      clearAuth();
      setShowDeleteAccount(false);
      setDeleteAccountPassword('');
      toast.success('Cloud account and backups permanently deleted');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete account');
    } finally {
      setDeletingAccount(false);
    }
  };

  const handleLogout = async () => {
    const confirmed = await confirm({
      title: 'Sign out?',
      description: 'Your finance data stays on this device — only cloud backup is disconnected.',
      confirmLabel: 'Sign out',
    });
    if (confirmed) {
      clearAuth();
      toast.success('Signed out');
    }
  };

  return (
    <>
      <div className="card-elevated divide-border divide-y overflow-hidden rounded-2xl">
        {token && user ? (
          <>
            <div className="bg-grad-primary-soft flex items-center gap-3 p-4">
              <div className="bg-grad-primary shadow-glow-primary flex h-11 w-11 items-center justify-center rounded-full">
                <User size={18} className="text-white" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{user.name}</p>
                <p className="text-muted-foreground truncate text-xs">{user.email}</p>
              </div>
            </div>
            <button
              onClick={() => setShowChangePassword(true)}
              className="hover:bg-muted/50 flex w-full items-center gap-3 p-4 transition-colors"
            >
              <KeyRound size={18} className="text-muted-foreground" />
              <span className="text-sm font-medium">Change Password</span>
            </button>
            <button
              onClick={handleLogout}
              className="hover:bg-muted/50 flex w-full items-center gap-3 p-4 transition-colors"
            >
              <LogOut size={18} className="text-destructive" />
              <span className="text-destructive text-sm font-medium">Sign Out</span>
            </button>
            <button
              onClick={() => setShowDeleteAccount(true)}
              className="hover:bg-muted/50 flex w-full items-center gap-3 p-4 transition-colors"
            >
              <UserX size={18} className="text-destructive" />
              <span className="text-destructive text-sm font-medium">Delete Cloud Account</span>
            </button>
          </>
        ) : (
          <button
            onClick={() => navigate('/login')}
            className="flex w-full items-center justify-between p-4"
          >
            <div className="flex items-center gap-3">
              <div className="bg-grad-primary shadow-glow-primary flex h-10 w-10 items-center justify-center rounded-full">
                <LogIn size={16} className="text-white" />
              </div>
              <div className="text-left">
                <p className="text-sm font-medium">Sign In</p>
                <p className="text-muted-foreground text-xs">Sync your data across devices</p>
              </div>
            </div>
            <ChevronRight size={16} className="text-muted-foreground" />
          </button>
        )}
      </div>

      {/* Change password */}
      <Dialog
        open={showChangePassword}
        onOpenChange={(open) => {
          setShowChangePassword(open);
          if (!open) {
            setCurrentPassword('');
            setNewPassword('');
            setConfirmPassword('');
          }
        }}
      >
        <DialogContent className="bg-card top-1/3 mx-auto w-11/12 rounded-2xl sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Change Password</DialogTitle>
            <DialogDescription>Sign in on other devices again after this.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="mb-1.5 block text-xs font-medium">Current Password</Label>
              <Input
                type="password"
                autoComplete="current-password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="bg-muted h-auto rounded-lg border-0 px-3 py-2"
              />
            </div>
            <div>
              <Label className="mb-1.5 block text-xs font-medium">New Password</Label>
              <Input
                type="password"
                autoComplete="new-password"
                placeholder="Min 8 characters"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="bg-muted h-auto rounded-lg border-0 px-3 py-2"
              />
            </div>
            <div>
              <Label className="mb-1.5 block text-xs font-medium">Confirm New Password</Label>
              <Input
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="bg-muted h-auto rounded-lg border-0 px-3 py-2"
              />
            </div>
            <Button
              onClick={handleChangePassword}
              disabled={changingPassword || !currentPassword || !newPassword}
              className="bg-grad-primary shadow-glow-primary h-auto w-full rounded-lg py-2.5 text-sm font-medium text-white disabled:opacity-60"
            >
              {changingPassword ? 'Changing...' : 'Change Password'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete cloud account */}
      <Dialog
        open={showDeleteAccount}
        onOpenChange={(open) => {
          setShowDeleteAccount(open);
          if (!open) setDeleteAccountPassword('');
        }}
      >
        <DialogContent className="bg-card top-1/3 mx-auto w-11/12 rounded-2xl sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Cloud Account?</DialogTitle>
            <DialogDescription>
              Your account and every backup on the server will be permanently deleted. This cannot
              be undone. Finance data on this device is not affected.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="mb-1.5 block text-xs font-medium">Confirm Password</Label>
              <Input
                type="password"
                autoComplete="current-password"
                value={deleteAccountPassword}
                onChange={(e) => setDeleteAccountPassword(e.target.value)}
                className="bg-muted h-auto rounded-lg border-0 px-3 py-2"
              />
            </div>
            <Button
              onClick={handleDeleteCloudAccount}
              disabled={deletingAccount || !deleteAccountPassword}
              className="bg-destructive h-auto w-full rounded-lg py-2.5 text-sm font-medium text-white disabled:opacity-60"
            >
              {deletingAccount ? 'Deleting...' : 'Permanently Delete Account'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
