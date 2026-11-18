import React, { useCallback, useEffect, useState } from 'react';
import { FlaskConical, LoaderCircle, LogIn, PenLine, RefreshCw, UserCheck } from 'lucide-react';
import { AuthenticatedUser, useRole } from '../../context/RoleContext';

const TOKEN_KEY = 'sharvin_token';

interface DevUser {
  id: string;
  fullName: string;
  email: string | null;
  userType: 'retailer' | 'wholesaler';
  businessName: string | null;
  isEmailVerified: boolean;
  demoPassword?: string | null;
}

interface DevQuickLoginProps {
  /** Pre-fills the login form inputs (Fill Credentials action). */
  onFillCredentials: (identifier: string, password?: string) => void;
}

/**
 * Development-only "Quick Test Accounts" card rendered on the login screen.
 * Lists every registered owner account from the database (signup-created
 * accounts appear immediately) and offers 1-Click Sign In via the gated
 * /auth/dev-* endpoints. Renders nothing when the server disables them.
 */
export const DevQuickLogin: React.FC<DevQuickLoginProps> = ({ onFillCredentials }) => {
  const { user, setSession } = useRole();
  const [accounts, setAccounts] = useState<DevUser[]>([]);
  const [available, setAvailable] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const response = await fetch('/api/v1/auth/dev-users');
      if (!response.ok) {
        setAvailable(false);
        return;
      }
      const body = await response.json();
      if (!body.success || !Array.isArray(body.data)) {
        setAvailable(false);
        return;
      }
      setAccounts(body.data as DevUser[]);
      setAvailable(true);
    } catch {
      setAvailable(false);
    }
  }, []);

  // Load on mount, refresh when returning to /login, and poll so newly
  // registered accounts appear without a manual reload.
  useEffect(() => {
    void load();
    const interval = setInterval(load, 20_000);
    return () => clearInterval(interval);
  }, [load, user]);

  if (!available || accounts.length === 0) return null;

  const adoptSession = (data: { token: string; user: AuthenticatedUser }) => {
    sessionStorage.setItem(TOKEN_KEY, data.token);
    setSession(data.user);
  };

  const oneClickSignIn = async (account: DevUser) => {
    setError('');
    setBusyId(account.id);
    try {
      if (account.isEmailVerified) {
        const response = await fetch('/api/v1/auth/dev-login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: account.id }),
        });
        const body = await response.json();
        if (!response.ok || !body.success || !body.data?.token) {
          throw new Error(body?.error || 'Quick sign-in failed');
        }
        adoptSession(body.data);
      } else {
        // Dev shortcut: skip the emailed OTP, verify, and sign in with the
        // session the production verification flow issues.
        const response = await fetch('/api/v1/auth/dev-verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: account.id }),
        });
        const body = await response.json();
        if (!response.ok || !body.success || !body.data?.token) {
          throw new Error(body?.error || 'Dev verification failed');
        }
        adoptSession(body.data);
        await load();
      }
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Quick sign-in failed');
    } finally {
      setBusyId(null);
    }
  };

  const fillCredentials = (account: DevUser) => {
    if (!account.email) return;
    onFillCredentials(account.email, account.demoPassword || undefined);
  };

  return (
    <section className="mt-6 w-full max-w-md rounded-3xl border border-slate-200 bg-white p-6 shadow-sm" aria-label="Quick test accounts">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FlaskConical className="h-4 w-4 text-blue-600" />
          <h2 className="text-sm font-extrabold tracking-tight text-slate-900">Quick Test Accounts</h2>
          <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-blue-700 border border-blue-200">
            DEV ONLY · {accounts.length}
          </span>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-[10px] font-bold text-slate-500 hover:bg-slate-50"
          title="Reload accounts from the database"
        >
          <RefreshCw className="h-3 w-3" /> Refresh
        </button>
      </div>
      <p className="mt-1 text-[11px] text-slate-500">
        Live accounts from the database — newly signed-up businesses appear here automatically.
      </p>
      <div className="mt-4 max-h-72 space-y-2 overflow-y-auto pr-1">
        {accounts.map((account) => (
          <article key={account.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50/60 p-3">
            <div className="min-w-0">
              <p className="truncate text-xs font-bold text-slate-900">
                {account.businessName || account.fullName}
                {!account.isEmailVerified && (
                  <span className="ml-2 rounded-full bg-amber-50 px-1.5 py-0.5 text-[9px] font-semibold text-amber-700 border border-amber-200">
                    unverified
                  </span>
                )}
              </p>
              <p className="truncate text-[11px] text-slate-500">
                {account.userType === 'retailer' ? 'Retailer' : 'Wholesaler'} · {account.fullName}
              </p>
              <p className="truncate font-mono text-[10px] text-slate-400">{account.email || 'no email on file'}</p>
            </div>
            <div className="flex shrink-0 flex-col gap-1.5">
              <button
                type="button"
                onClick={() => void oneClickSignIn(account)}
                disabled={busyId !== null}
                className="flex items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-[11px] font-bold text-white transition hover:bg-blue-700 disabled:cursor-wait disabled:opacity-60"
              >
                {busyId === account.id ? <LoaderCircle className="h-3 w-3 animate-spin" /> : <LogIn className="h-3 w-3" />}
                1-Click Sign In
              </button>
              {account.demoPassword && account.email && (
                <button
                  type="button"
                  onClick={() => fillCredentials(account)}
                  className="flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-bold text-slate-600 transition hover:bg-slate-50"
                >
                  <PenLine className="h-3 w-3" /> Fill Credentials
                </button>
              )}
            </div>
          </article>
        ))}
      </div>
      {error && (
        <p role="alert" className="mt-3 flex items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-[11px] text-rose-700">
          <UserCheck className="h-3.5 w-3.5 shrink-0" /> {error}
        </p>
      )}
    </section>
  );
};
