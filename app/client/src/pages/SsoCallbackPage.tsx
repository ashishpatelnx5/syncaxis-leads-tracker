import { useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { Logo } from '../components/Logo';

// Landed on from the Portal's "Leads Tracker" tile (?ssoCode=...) - exchanges
// the handoff code for a real session so the user never sees a login screen
// if they were already signed in to the Portal. Rendered outside the normal
// authenticated/unauthenticated split in App.tsx, since it has to work
// before a session exists here at all.
export function SsoCallbackPage() {
  const { loginWithCode } = useAuth();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get('ssoCode');
    if (!code) {
      setError('Missing sign-in code.');
      return;
    }
    loginWithCode(code)
      .then(() => {
        // Full reload rather than a client-side redirect - simplest way to
        // land in the normal authenticated app tree with a fresh session.
        window.location.href = '/';
      })
      .catch((err: any) => setError(err.message || 'Sign-in failed.'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="login-screen">
      <div className="login-card">
        <Logo />
        <h1>Leads Tracker</h1>
        {error ? (
          <>
            <div className="alert alert-error">{error}</div>
            <a className="btn btn-primary login-submit" href="/">Go to sign-in</a>
          </>
        ) : (
          <p className="login-hint">Signing you in via Syncaxis Company Portal...</p>
        )}
      </div>
    </div>
  );
}
