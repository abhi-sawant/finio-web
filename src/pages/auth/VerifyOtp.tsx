import { useState, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router';
import { api } from '@/services/api';
import { useAuthStore } from '@/store/useAuthStore';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export default function VerifyOtp() {
  const navigate = useNavigate();
  const location = useLocation();
  const setAuth = useAuthStore((s) => s.setAuth);

  const email = (location.state as { email?: string })?.email || '';
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const handleChange = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return;
    const newOtp = [...otp];
    newOtp[index] = value.slice(-1);
    setOtp(newOtp);

    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const text = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    const newOtp = [...otp];
    for (let i = 0; i < text.length; i++) {
      newOtp[i] = text[i];
    }
    setOtp(newOtp);
    const focusIndex = Math.min(text.length, 5);
    inputRefs.current[focusIndex]?.focus();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const code = otp.join('');
    if (code.length !== 6) {
      toast.error('Please enter the full 6-digit OTP');
      return;
    }

    setLoading(true);
    try {
      const result = await api.verifyOtp(email, code);
      setAuth(result.token, result.user);
      toast.success('Email verified successfully!');
      navigate('/', { replace: true });
    } catch (err: any) {
      toast.error(err.message || 'Verification failed');
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setResending(true);
    try {
      await api.resendOtp(email);
      toast.success('New OTP sent to your email');
    } catch (err: any) {
      toast.error(err.message || 'Failed to resend OTP');
    } finally {
      setResending(false);
    }
  };

  if (!email) {
    navigate('/register', { replace: true });
    return null;
  }

  return (
    <div className="flex min-h-screen flex-col justify-center px-6 py-12">
      <div className="mx-auto w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-foreground text-2xl font-bold">Verify Your Email</h1>
          <p className="text-muted-foreground mt-2">Enter the 6-digit code sent to</p>
          <p className="text-foreground font-medium">{email}</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="flex justify-center gap-2" onPaste={handlePaste}>
            {otp.map((digit, i) => (
              <Input
                key={i}
                ref={(el) => {
                  inputRefs.current[i] = el;
                }}
                type="text"
                inputMode="numeric"
                maxLength={1}
                value={digit}
                onChange={(e) => handleChange(i, e.target.value)}
                onKeyDown={(e) => handleKeyDown(i, e)}
                className="bg-card h-14 w-12 rounded-xl text-center text-xl font-bold"
              />
            ))}
          </div>

          <Button
            type="submit"
            disabled={loading}
            className="bg-grad-primary shadow-glow-primary h-auto w-full rounded-xl py-3 font-semibold text-white disabled:opacity-50"
          >
            {loading ? 'Verifying...' : 'Verify'}
          </Button>
        </form>

        <div className="mt-6 text-center">
          <Button
            variant="ghost"
            onClick={handleResend}
            disabled={resending}
            className="text-primary h-auto p-0 text-sm hover:bg-transparent hover:underline disabled:opacity-50"
          >
            {resending ? 'Sending...' : "Didn't receive the code? Resend"}
          </Button>
        </div>
      </div>
    </div>
  );
}
