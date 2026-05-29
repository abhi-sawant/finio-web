import { useState } from 'react';
import { useNavigate, Link } from 'react-router';
import { Mail, ArrowLeft } from 'lucide-react';
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
    <div className="min-h-screen flex flex-col justify-center px-6 py-12 bg-background">
      <div className="mx-auto w-full max-w-sm">
        <Button
          variant="ghost"
          onClick={() => navigate('/login')}
          className="h-auto p-0 flex items-center gap-1 text-muted-foreground mb-8 hover:bg-transparent hover:text-foreground"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to login
        </Button>

        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-foreground">Forgot Password</h1>
          <p className="text-muted-foreground mt-2">
            Enter your email and we'll send you an OTP to reset your password.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground z-10" />
            <Input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-auto w-full pl-11 pr-4 py-3 rounded-xl bg-card"
              autoComplete="email"
            />
          </div>

          <Button
            type="submit"
            disabled={loading}
            className="w-full h-auto py-3 rounded-xl bg-grad-primary text-white font-semibold shadow-glow-primary disabled:opacity-50"
          >
            {loading ? 'Sending...' : 'Send OTP'}
          </Button>
        </form>

        <p className="mt-6 text-center text-muted-foreground text-sm">
          Remember your password?{' '}
          <Link to="/login" className="text-primary font-medium hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
