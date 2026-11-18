import React, { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { ArrowRight, Building2, Store } from 'lucide-react';
import { SignUpInput, useRole } from '../../context/RoleContext';

const initialForm: SignUpInput = {
  fullName: '',
  businessName: '',
  userType: 'retailer',
  email: '',
  password: '',
  phoneNumber: '',
};

export const SignupView: React.FC = () => {
  const { isAuthenticated, user, signup, verifyEmail, resendVerificationOtp } = useRole();
  const [form, setForm] = useState(initialForm);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [verificationEmail, setVerificationEmail] = useState(() => sessionStorage.getItem('sharvin_pending_verification_email') || '');
  const [otp, setOtp] = useState('');
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setTimeout(() => setCooldown((remaining) => Math.max(0, remaining - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  if (isAuthenticated) return <Navigate to={user?.userType === 'wholesaler' ? '/wholesaler/orders' : '/pos'} replace />;

  const update = <K extends keyof SignUpInput>(key: K, value: SignUpInput[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await signup({ ...form, email: form.email.trim().toLowerCase(), phoneNumber: form.phoneNumber.trim() });
      const email = form.email.trim().toLowerCase();
      setVerificationEmail(email);
      setCooldown(60);
    } catch (failure) {
      const message = failure instanceof Error ? failure.message : 'Unable to create your account. Please retry.';
      setError(message);
      if (message.includes('could not send the verification email')) {
        const email = form.email.trim().toLowerCase();
        setVerificationEmail(email);
        sessionStorage.setItem('sharvin_pending_verification_email', email);
        setCooldown(0);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const verify = async (event: React.FormEvent) => {
    event.preventDefault();
    if (otp.length !== 6) return;
    setError('');
    setSubmitting(true);
    try {
      await verifyEmail(verificationEmail, otp);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Invalid or expired code. Please try again.');
      setOtp('');
    } finally {
      setSubmitting(false);
    }
  };

  const resend = async () => {
    setError('');
    setSubmitting(true);
    try {
      await resendVerificationOtp(verificationEmail);
      setCooldown(60);
      setOtp('');
    } catch (failure) {
      const message = failure instanceof Error ? failure.message : 'Unable to resend the code right now.';
      setError(message);
      if (message.includes('could not deliver to this email address')) {
        setVerificationEmail('');
        sessionStorage.removeItem('sharvin_pending_verification_email');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const inputClass = 'mt-1.5 w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100';

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10 pb-24 flex items-center justify-center">
      <section className="w-full max-w-xl rounded-3xl border border-slate-200 bg-white p-7 shadow-xl sm:p-9">
        <div className="mx-auto mb-5 grid h-14 w-14 place-items-center rounded-2xl bg-blue-600 text-white shadow-lg shadow-blue-600/20">
          <Building2 className="h-7 w-7" />
        </div>
        <header className="text-center">
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">{verificationEmail ? 'Verify your email' : 'Create your SharVin account'}</h1>
          <p className="mt-2 text-sm text-slate-500">{verificationEmail ? <>Enter the 6-digit code sent to <strong>{verificationEmail}</strong>.</> : 'Set up your business workspace to get started.'}</p>
        </header>

        {!verificationEmail ? <form className="mt-7 grid gap-4 sm:grid-cols-2" onSubmit={submit}>
          <label className="text-sm font-semibold text-slate-700">
            Full name
            <input required minLength={2} maxLength={120} autoComplete="name" value={form.fullName} onChange={(event) => update('fullName', event.target.value)} className={inputClass} />
          </label>
          <label className="text-sm font-semibold text-slate-700">
            Business name
            <input required minLength={2} maxLength={160} autoComplete="organization" value={form.businessName} onChange={(event) => update('businessName', event.target.value)} className={inputClass} />
          </label>
          <label className="text-sm font-semibold text-slate-700">
            Business role
            <select value={form.userType} onChange={(event) => update('userType', event.target.value as SignUpInput['userType'])} className={inputClass}>
              <option value="retailer">Retailer</option>
              <option value="wholesaler">Wholesaler</option>
            </select>
          </label>
          <label className="text-sm font-semibold text-slate-700">
            Phone
            <input required type="tel" inputMode="tel" autoComplete="tel" pattern="\+?[1-9][0-9]{9,14}" title="Use 10 to 15 digits, optionally starting with +" value={form.phoneNumber} onChange={(event) => update('phoneNumber', event.target.value)} className={inputClass} placeholder="+919876543210" />
          </label>
          <label className="text-sm font-semibold text-slate-700 sm:col-span-2">
            Email
            <input required type="email" maxLength={254} autoComplete="email" value={form.email} onChange={(event) => update('email', event.target.value)} className={inputClass} placeholder="you@business.com" />
          </label>
          <label className="text-sm font-semibold text-slate-700 sm:col-span-2">
            Password
            <input required type="password" minLength={12} maxLength={72} autoComplete="new-password" value={form.password} onChange={(event) => update('password', event.target.value)} className={inputClass} />
            <span className="mt-1 block text-xs font-normal text-slate-500">Use at least 12 characters.</span>
          </label>
          {error && <p role="alert" className="sm:col-span-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>}
          <button disabled={submitting} className="sm:col-span-2 mt-1 flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 font-bold text-white transition hover:bg-blue-700 disabled:cursor-wait disabled:opacity-60">
            {form.userType === 'retailer' ? <Store className="h-4 w-4" /> : <Building2 className="h-4 w-4" />}
            {submitting ? 'Creating account…' : 'Create business account'}
            {!submitting && <ArrowRight className="h-4 w-4" />}
          </button>
        </form> : <form className="mt-7 space-y-4" onSubmit={verify}>
          <label className="block text-sm font-semibold text-slate-700">
            Verification code
            <input required autoFocus autoComplete="one-time-code" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} value={otp} onChange={(event) => setOtp(event.target.value.replace(/\D/g, '').slice(0, 6))} className={`${inputClass} text-center font-mono text-2xl font-extrabold tracking-[0.55em]`} placeholder="••••••" />
          </label>
          <p className="text-center text-xs text-slate-500">The code expires 10 minutes after it was sent.</p>
          {error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>}
          <button disabled={submitting || otp.length !== 6} className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 font-bold text-white transition hover:bg-blue-700 disabled:cursor-wait disabled:opacity-60">
            {submitting ? 'Verifying…' : 'Verify email and continue'}
          </button>
          <div className="text-center text-sm text-slate-500">
            {cooldown > 0 ? <span>Resend code in {cooldown}s</span> : <button type="button" onClick={() => void resend()} disabled={submitting} className="font-bold text-blue-700 hover:text-blue-800 disabled:opacity-50">Resend code</button>}
          </div>
          <button type="button" onClick={() => { setVerificationEmail(''); setOtp(''); setError(''); sessionStorage.removeItem('sharvin_pending_verification_email'); }} className="block w-full text-center text-xs font-semibold text-slate-500 hover:text-slate-700">Use a different email</button>
        </form>}
        {!verificationEmail && <p className="mt-6 text-center text-sm text-slate-500">Already have an account? <Link to="/login" className="font-bold text-blue-700 hover:text-blue-800">Sign in</Link></p>}
      </section>
    </main>
  );
};
