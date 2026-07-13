import { type FormEvent, useEffect, useState } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { Eye, EyeOff } from 'lucide-react';
import { Button, Card, Input, Spinner, ThemeToggle } from '../components/ui/index.js';
import { validateResetToken, resetPassword } from '../api/auth.js';
import { ApiError } from '../api/client.js';

type PageState = 'validating' | 'invalid' | 'form' | 'success';

export function ResetPassword() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token') ?? '';

  const [pageState, setPageState] = useState<PageState>('validating');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Validate token on mount — shows spinner then switches to 'form' or 'invalid'
  useEffect(() => {
    if (!token) {
      setPageState('invalid');
      return;
    }
    validateResetToken(token).then((valid) => {
      setPageState(valid ? 'form' : 'invalid');
    });
  }, [token]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }

    setLoading(true);
    try {
      await resetPassword(token, newPassword);
      setPageState('success');
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

          {pageState === 'validating' && (
            <div className="flex flex-col items-center gap-4 py-8">
              <Spinner />
              <p className="text-pip-secondary text-sm">Verifying your reset link…</p>
            </div>
          )}

          {pageState === 'invalid' && (
            <div className="flex flex-col items-center gap-4 py-4">
              <div className="text-5xl">⚠️</div>
              <h1 className="font-sora font-bold text-xl text-pip-text">Link Invalid or Expired</h1>
              <p className="text-pip-secondary text-sm leading-relaxed">
                This password reset link is invalid or has expired (links expire after 1 hour).
                Please request a new one.
              </p>
              <Link to="/forgot-password" className="w-full">
                <Button variant="primary" className="w-full py-2.5 mt-2">
                  Request New Link
                </Button>
              </Link>
              <Link
                to="/login"
                className="text-sm text-pip-muted hover:text-pip-accent transition-colors duration-200"
              >
                ← Back to Sign In
              </Link>
            </div>
          )}

          {pageState === 'form' && (
            <>
              <h1 className="font-sora font-bold text-2xl text-pip-text mb-2">Set New Password</h1>
              <p className="text-pip-secondary text-sm mb-8">
                Choose a strong password for your account.
              </p>
              <form onSubmit={handleSubmit} className="flex flex-col gap-4 text-left">
                <div className="relative">
                  <Input
                    id="new-password"
                    label="New Password"
                    type={showPassword ? 'text' : 'password'}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="••••••••"
                    className="pr-10"
                    required
                    minLength={8}
                  />
                  <button
                    type="button"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    className="absolute right-3 bottom-2.5 text-pip-muted hover:text-pip-text"
                    onClick={() => setShowPassword((v) => !v)}
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>

                <Input
                  id="confirm-password"
                  label="Confirm Password"
                  type={showPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  minLength={8}
                />

                {error && <p className="text-err-text text-sm">{error}</p>}

                <Button
                  variant="primary"
                  type="submit"
                  className="w-full py-3"
                  disabled={loading}
                >
                  {loading ? (
                    <div className="flex items-center justify-center gap-2">
                      <Spinner size="sm" />
                      <span>Resetting…</span>
                    </div>
                  ) : (
                    'Reset Password'
                  )}
                </Button>
              </form>
            </>
          )}

          {pageState === 'success' && (
            <div className="flex flex-col items-center gap-4 py-4">
              <div className="text-5xl">✅</div>
              <h1 className="font-sora font-bold text-xl text-pip-text">Password Reset!</h1>
              <p className="text-pip-secondary text-sm leading-relaxed">
                Your password has been updated successfully. You can now sign in with your new password.
              </p>
              <Button
                variant="primary"
                className="w-full py-2.5 mt-2"
                onClick={() => navigate('/login')}
              >
                Go to Sign In
              </Button>
            </div>
          )}

        </Card>
      </div>
    </div>
  );
}
