import { useState } from 'react';
import { useNavigate, Link } from 'react-router';
import { Mail } from 'lucide-react';
import { api } from '@/services/api';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export default function ForgotPassword() {
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      toast.error('Please enter your email');
      return;
    }

    setLoading(true);
    try {
      await api.forgotPassword(email);
      toast.success('If an account exists, an OTP has been sent.');
      navigate('/reset-password', { state: { email } });
    } catch (err: any) {
      toast.error(err.message || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col justify-center px-6 py-12">
      <div className="mx-auto w-full max-w-sm">

        <div className="mb-8 text-center">
          <h1 className="text-foreground text-2xl font-bold">Forgot Password</h1>
          <p className="text-muted-foreground mt-2">
            Enter your email and we'll send you an OTP to reset your password.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="relative">
            <Mail className="text-muted-foreground absolute top-1/2 left-3 z-10 h-5 w-5 -translate-y-1/2" />
            <Input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="bg-card h-auto w-full rounded-xl py-3 pr-4 pl-11"
              autoComplete="email"
            />
          </div>

          <Button
            type="submit"
            disabled={loading}
            className="bg-grad-primary shadow-glow-primary h-auto w-full rounded-xl py-3 font-semibold text-white disabled:opacity-50"
          >
            {loading ? 'Sending...' : 'Send OTP'}
          </Button>
        </form>

        <p className="text-muted-foreground mt-6 text-center text-sm">
          Remember your password?{' '}
          <Link to="/login" className="text-primary font-medium hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
