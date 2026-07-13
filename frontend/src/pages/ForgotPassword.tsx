import { type FormEvent, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, Card, Input, Spinner, ThemeToggle } from '../components/ui/index.js';
import { requestPasswordReset } from '../api/auth.js';
import { ApiError } from '../api/client.js';

type ViewState = 'form' | 'sent';

export function ForgotPassword() {
  const [view, setView] = useState<ViewState>('form');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await requestPasswordReset(email);
      setView('sent');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-base login-bg p-4 relative">
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>
      <div className="w-full max-w-md">
        <Card className="p-8 text-center">
          <h1 className="font-sora font-bold text-2xl text-pip-text mb-2">Reset Password</h1>

          {view === 'form' ? (
            <>
              <p className="text-pip-secondary text-sm mb-8">
                Enter your account email and we'll send you a reset link.
              </p>
              <form onSubmit={handleSubmit} className="flex flex-col gap-4 text-left">
                <Input
                  id="reset-email"
                  label="Email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="your@email.com"
                  required
                />

                {error && <p className="text-err-text text-sm">{error}</p>}

                <Button variant="primary" type="submit" className="w-full py-3" disabled={loading}>
                  {loading ? (
                    <div className="flex items-center justify-center gap-2">
                      <Spinner size="sm" />
                      <span>Sending…</span>
                    </div>
                  ) : (
                    'Send Reset Link'
                  )}
                </Button>
              </form>
            </>
          ) : (
            /* Sent confirmation view */
            <div className="flex flex-col items-center gap-4 py-4">
              <div className="text-5xl">📬</div>
              <p className="text-pip-secondary text-sm leading-relaxed">
                If <span className="text-pip-text font-medium">{email}</span> is linked to an account,
                a password reset link has been sent. Check your inbox (and spam folder).
              </p>
              <p className="text-pip-muted text-xs">The link expires in 1 hour.</p>
              <Button
                variant="ghost"
                className="mt-2 text-sm"
                onClick={() => { setView('form'); setEmail(''); setError(''); }}
              >
                Try a different email
              </Button>
            </div>
          )}

          <div className="mt-6 border-t border-pip-border">
            <Link
              to="/login"
              className="text-sm text-pip-muted hover:text-pip-accent transition-colors duration-200"
            >
              ← Back to Sign In
            </Link>
          </div>
        </Card>
      </div>
    </div>
  );
}
