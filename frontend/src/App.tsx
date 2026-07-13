import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Toaster } from 'sonner';
import { useEffect, useState, type FormEvent, createContext, useContext } from 'react';
import { AdminDashboard } from './pages/AdminDashboard.js';
import { PMDashboard } from './pages/PMDashboard.js';
import { PgMDashboard } from './pages/PgMDashboard.js';
import { CXODashboard } from './pages/CXODashboard.js';
import { ForgotPassword } from './pages/ForgotPassword.js';
import { ResetPassword } from './pages/ResetPassword.js';
import { Button, Card, Spinner, ErrorBanner, Input, ThemeToggle, ConfirmDialogProvider } from './components/ui/index.js';
import { Eye, EyeOff } from 'lucide-react';
import { credentialsLogin, checkSession, logout, type AuthUser } from './api/auth.js';
import { tokenStore } from './utils/tokenStore.js';
import { ApiError, apiFetch } from './api/client.js';

interface AuthContextType {
  user: AuthUser | null;
  loading: boolean;
  setUser: (user: AuthUser | null) => void;
}

const AuthContext = createContext<AuthContextType>({ user: null, loading: true, setUser: () => { } });

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkSession()
      .then((data) => setUser(data))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  return <AuthContext.Provider value={{ user, loading, setUser }}>{children}</AuthContext.Provider>;
}

function getDashboardRoute(role: string) {
  if (role === 'system_admin') return '/admin';
  if (role === 'pm') return '/pm';
  if (role === 'program_manager') return '/pgm';
  if (role === 'cxo') return '/cxo';
  return '/login';
}

function Login() {
  const { user, setUser } = useAuth();
  const [showCredentials, setShowCredentials] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    if (user) {
      navigate(getDashboardRoute(user.role), { replace: true });
    }
  }, [user, navigate]);

  async function handleSignIn(event: FormEvent) {
    event.preventDefault();
    setError('');
    setLoading(true);
    try {
      const loggedInUser = await credentialsLogin(email, password);
      setUser(loggedInUser);
      navigate(getDashboardRoute(loggedInUser.role));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Invalid email or password');
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
          <h1 className="font-sora font-bold text-2xl text-pip-text mb-2">Project Intelligence</h1>
          <p className="text-pip-secondary text-sm mb-8">Sign in to access your executive dashboard</p>

          {!showCredentials ? (
            <>
              <Button
                variant="primary"
                className="w-full py-3"
                onClick={() => { window.location.href = 'http://localhost:4000/auth/login'; }}
              >
                <div className="flex items-center justify-center gap-3">
                  <svg width="18" height="18" viewBox="0 0 21 21" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <rect width="10" height="10" fill="#F25022" />
                    <rect x="11" width="10" height="10" fill="#7FBA00" />
                    <rect y="11" width="10" height="10" fill="#00A4EF" />
                    <rect x="11" y="11" width="10" height="10" fill="#FFB900" />
                  </svg>
                  <span>Continue with Microsoft 365</span>
                </div>
              </Button>

              <div className="relative my-6">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-pip-border"></div>
                </div>
                <div className="relative flex justify-center text-xs">
                  <span className="bg-surface-1 px-2 text-pip-muted uppercase tracking-widest">or</span>
                </div>
              </div>

              <Button
                variant="secondary"
                className="w-full"
                onClick={() => { setShowCredentials(true); setError(''); }}
              >
                Standard Credentials
              </Button>
            </>
          ) : (
            <div className="text-left">
              <button
                type="button"
                className="login-back-btn text-pip-muted hover:text-accent transition-colors duration-200 text-sm mb-4 flex items-center gap-1"
                onClick={() => { setShowCredentials(false); setError(''); setEmail(''); setPassword(''); setShowPassword(false); }}
              >
                ← Use Microsoft 365 instead
              </button>

              <form onSubmit={handleSignIn} className="flex flex-col gap-4">
                <Input
                  label="Email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="your@email.com"
                  required
                />

                <div className="relative">
                  <Input
                    label="Password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="pr-10"
                    required
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

                <div className="text-right">
                  <a
                    href="/forgot-password"
                    className="text-xs text-pip-muted hover:text-pip-accent transition-colors duration-200"
                  >
                    Forgot password?
                  </a>
                </div>

                {error && <p className="text-err-text text-sm">{error}</p>}

                <Button variant="primary" type="submit" className="w-full py-3" disabled={loading}>
                  {loading ? (
                    <div className="flex items-center justify-center gap-2">
                      <Spinner size="sm" />
                      <span>Signing in…</span>
                    </div>
                  ) : (
                    'Sign In'
                  )}
                </Button>
              </form>
            </div>
          )}
        </Card>

        <p className="text-center mt-6 text-pip-muted text-xs">
          Contact your system administrator if you need access.
        </p>
      </div>
    </div>
  );
}

function AuthSuccess() {
  const location = useLocation();
  const [error, setError] = useState('');
  const { setUser } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const code = params.get('code');

    if (code) {
      apiFetch<{ user: AuthUser; accessToken?: string }>('/auth/exchange', {
        method: 'POST',
        body: JSON.stringify({ code })
      }).then(({ user, accessToken }) => {
        if (accessToken) tokenStore.setToken(accessToken);
        setUser(user);
        navigate(getDashboardRoute(user.role));
      }).catch(err => {
        setError(err.message || 'Authentication failed');
      });
    }
  }, [location, navigate, setUser]);

  if (error) {
    return <Navigate to={`/auth/error?message=${encodeURIComponent(error)}`} />;
  }
  return <div className="p-8 text-center text-pip-secondary">Completing sign-in...</div>;
}

function AuthError() {
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const message = params.get('message');

  return (
    <div className="min-h-screen flex items-center justify-center bg-base login-bg p-4 relative">
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>
      <Card className="w-full max-w-md p-8 text-center">
        <div className="text-5xl mb-4">⚠️</div>
        <h2 className="font-sora font-bold text-xl text-pip-text mb-4">Authentication Error</h2>
        <ErrorBanner
          message={message === 'account_not_provisioned' ? 'Your account has not been activated. Contact your administrator.' : (message ?? 'An unexpected error occurred.')}
          className="mb-6 text-left"
        />
        <Button
          variant="secondary"
          className="w-full"
          onClick={() => { window.location.href = '/login'; }}
        >
          Return to Login
        </Button>
      </Card>
    </div>
  );
}

function ProtectedRoute({ children, allowedRoles }: { children: React.ReactNode, allowedRoles: string[] }) {
  const { user, loading, setUser } = useAuth();

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-base"><Spinner /></div>;
  }

  if (!user) return <Navigate to="/login" />;

  if (!allowedRoles.includes(user.role)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-base login-bg p-4">
        <Card className="w-full max-w-md p-8 text-center">
          <h2 className="font-sora font-bold text-xl text-err-text mb-2">Access Denied</h2>
          <p className="text-pip-secondary text-sm mb-6">
            You do not have the required role to access this dashboard.
          </p>
          <Button
            variant="secondary"
            onClick={async () => {
              await logout();
              setUser(null);
              window.location.href = '/login';
            }}
          >
            Sign In as Different User
          </Button>
        </Card>
      </div>
    );
  }
  return <>{children}</>;
}

function RootRedirect() {
  const { user, loading } = useAuth();

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-base"><Spinner /></div>;
  }

  if (user) {
    return <Navigate to={getDashboardRoute(user.role)} replace />;
  }

  return <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <AuthProvider>
      <ConfirmDialogProvider>
        <BrowserRouter>
          <Toaster position="top-right" richColors closeButton />
          <Routes>
            <Route path="/" element={<RootRedirect />} />
            <Route path="/login" element={<Login />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/auth/reset-password" element={<ResetPassword />} />
            <Route path="/auth/success" element={<AuthSuccess />} />
            <Route path="/auth/error" element={<AuthError />} />

            <Route path="/admin" element={
              <ProtectedRoute allowedRoles={['system_admin']}><AdminDashboard /></ProtectedRoute>
            } />
            <Route path="/pm" element={
              <ProtectedRoute allowedRoles={['pm']}><PMDashboard /></ProtectedRoute>
            } />
            <Route path="/pgm" element={
              <ProtectedRoute allowedRoles={['program_manager']}><PgMDashboard /></ProtectedRoute>
            } />
            <Route path="/cxo" element={
              <ProtectedRoute allowedRoles={['cxo']}><CXODashboard /></ProtectedRoute>
            } />

            <Route path="*" element={<Navigate to="/login" />} />
          </Routes>
        </BrowserRouter>
      </ConfirmDialogProvider>
    </AuthProvider>
  );
}
