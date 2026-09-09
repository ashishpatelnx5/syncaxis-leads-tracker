import { useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { Logo } from '../components/Logo';
import { EyeIcon, EyeOffIcon } from '../components/icons';

export function LoginPage() {
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await login(username, password);
    } catch (err: any) {
      setError(err.message || 'Invalid username or password');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="login-screen">
      <form className="login-card" onSubmit={handleSubmit}>
        <Logo />
        <h1>Leads Tracker</h1>
        <p className="login-hint">Sign in with your team credentials to continue.</p>

        {error && <div className="alert alert-error">{error}</div>}

        <label>
          Username
          <input value={username} onChange={(e) => setUsername(e.target.value)} autoFocus required />
        </label>
        <label>
          Password
          <div className="password-field">
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <button
              type="button"
              className="password-toggle"
              onClick={() => setShowPassword((v) => !v)}
              title={showPassword ? 'Hide password' : 'Show password'}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? <EyeOffIcon /> : <EyeIcon />}
            </button>
          </div>
        </label>

        <button type="submit" className="btn btn-primary login-submit" disabled={submitting}>
          {submitting ? 'Signing in...' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}
