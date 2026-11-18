import React, { useState } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { Building2, LockKeyhole, Store } from 'lucide-react';
import { useRole } from '../../context/RoleContext';
import { DevQuickLogin } from './DevQuickLogin';

export const LoginView: React.FC = () => {
  const { isAuthenticated, login } = useRole();
  const location = useLocation();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const destination = (location.state as { from?: string } | null)?.from || '/';

  if (isAuthenticated) return <Navigate to={destination} replace />;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await login(identifier.trim(), password);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Unable to sign in. Check your credentials.');
    } finally {
      setSubmitting(false);
    }
  };

  const fillCredentials = (nextIdentifier: string, nextPassword?: string) => {
    setIdentifier(nextIdentifier);
    if (nextPassword) setPassword(nextPassword);
    setError('');
  };

  return (
    <main className="min-h-screen bg-slate-50 flex flex-col items-center justify-center px-4 py-10 pb-24">
      <section className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-8 shadow-xl">
        <div className="mx-auto mb-6 grid h-14 w-14 place-items-center rounded-2xl bg-blue-600 text-white shadow-lg shadow-blue-600/20">
          <Building2 className="h-7 w-7" />
        </div>
        <div className="text-center">
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">Sign in to SharVin</h1>
          <p className="mt-2 text-sm text-slate-500">Use your business or staff account credentials.</p>
        </div>
        <form className="mt-8 space-y-5" onSubmit={submit}>
          <label className="block text-sm font-semibold text-slate-700">
            Phone number or email
            <input
              autoComplete="username"
              required
              value={identifier}
              onChange={(event) => setIdentifier(event.target.value)}
              className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 font-normal outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
              placeholder="you@business.com"
            />
          </label>
          <label className="block text-sm font-semibold text-slate-700">
            Password
            <input
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 font-normal outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
              placeholder="Enter your password"
            />
          </label>
          {error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>}
          <button disabled={submitting} className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 font-bold text-white transition hover:bg-blue-700 disabled:cursor-wait disabled:opacity-60">
            <LockKeyhole className="h-4 w-4" />
            {submitting ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
        <div className="mt-7 flex items-center justify-center gap-5 border-t border-slate-100 pt-5 text-xs text-slate-500">
          <span className="inline-flex items-center gap-1"><Store className="h-3.5 w-3.5" />Retailers</span>
          <span className="inline-flex items-center gap-1"><Building2 className="h-3.5 w-3.5" />Wholesalers &amp; staff</span>
        </div>
        <p className="mt-5 text-center text-sm text-slate-500">
          New to SharVin? <Link to="/signup" className="font-bold text-blue-700 hover:text-blue-800">Create an account</Link>
        </p>
      </section>
      {import.meta.env.DEV && <DevQuickLogin onFillCredentials={fillCredentials} />}
    </main>
  );
};
