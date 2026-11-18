import React from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  BrainCircuit,
  Download,
  Mic2,
  ShieldCheck,
} from 'lucide-react';
import heroBanner from '../../assets/hero_banner.png';
import logoText from '../../assets/logo_text.png';

const features = [
  {
    icon: Mic2,
    eyebrow: 'Voice-to-Cart',
    title: 'Speak. Order. Done.',
    description: 'Order inventory simply by speaking in Gujarati or Hindi. No more typing.',
    tone: 'bg-violet-50 text-violet-700',
  },
  {
    icon: BrainCircuit,
    eyebrow: '15-Day AI Predictor',
    title: 'Never run out again.',
    description: 'Know exactly when and how much to order based on your 7-day sales velocity.',
    tone: 'bg-blue-50 text-blue-700',
  },
  {
    icon: ShieldCheck,
    eyebrow: 'Secure Galla',
    title: 'Every rupee accounted for.',
    description: 'Role-based shift closing to ensure your cash drawer always matches your sales.',
    tone: 'bg-emerald-50 text-emerald-700',
  },
];

export const LandingPageView: React.FC = () => (
  <div className="min-h-screen bg-white text-slate-950">
    <header className="border-b border-white/10 bg-slate-950">
      <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5 sm:px-8" aria-label="Public navigation">
        <Link to="/" className="block overflow-hidden rounded-lg bg-slate-900" aria-label="SharVin B2B home">
          <img src={logoText} alt="SharVin — Innovation & Growth" className="h-12 w-36 object-cover object-center sm:w-44" />
        </Link>
        <Link to="/login" className="rounded-full px-4 py-2 text-sm font-bold text-white transition hover:bg-white/10">
          Sign in
        </Link>
      </nav>
    </header>

    <main>
      <section className="relative isolate overflow-hidden bg-slate-950 px-5 pb-20 pt-20 sm:px-8 sm:pb-28 sm:pt-28">
        <div
          aria-hidden="true"
          className="absolute inset-0 -z-20 bg-cover bg-center"
          style={{ backgroundImage: `url(${heroBanner})` }}
        />
        <div aria-hidden="true" className="absolute inset-0 -z-10 bg-gradient-to-r from-slate-950/95 via-slate-950/80 to-blue-950/70" />
        <div className="mx-auto max-w-5xl text-center">
          <span className="inline-flex rounded-full border border-amber-300/40 bg-amber-300/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.16em] text-amber-200 backdrop-blur-sm">
            Built for Indian business
          </span>
          <h1 className="mx-auto mt-7 max-w-4xl text-4xl font-black leading-[1.08] tracking-[-0.04em] text-white drop-shadow-lg sm:text-6xl lg:text-7xl">
            SharVin B2B: The Smartest Way to Manage Retail &amp; Wholesale.
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg leading-8 text-slate-200 sm:text-xl">
            Replace your Khata, automate your inventory, and negotiate in real-time.
          </p>

          <div className="mt-10 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
            <Link
              to="/login"
              className="inline-flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-blue-600 px-7 text-base font-bold text-white shadow-lg shadow-blue-950/30 transition hover:bg-blue-500 active:scale-[0.98]"
            >
              Login / Register <ArrowRight className="h-5 w-5" />
            </Link>
            <a
              href="#download"
              className="inline-flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-white/10 px-7 text-base font-bold text-white ring-1 ring-white/30 backdrop-blur-sm transition hover:bg-white/20 active:scale-[0.98]"
            >
              <Download className="h-5 w-5" /> Download App (APK)
            </a>
          </div>
          <p className="mt-4 text-sm text-slate-300">
            New to SharVin? <Link to="/signup" className="font-bold text-amber-200 hover:underline">Create your business account</Link>
          </p>
        </div>
      </section>

      <section className="border-y border-slate-100 bg-slate-50 px-5 py-20 sm:px-8 sm:py-24" aria-labelledby="features-title">
        <div className="mx-auto max-w-6xl">
          <div className="max-w-2xl">
            <p className="text-sm font-bold uppercase tracking-[0.16em] text-blue-700">Killer hooks</p>
            <h2 id="features-title" className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">Less work. Better decisions.</h2>
          </div>
          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {features.map(({ icon: Icon, eyebrow, title, description, tone }) => (
              <article key={eyebrow} className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
                <span className={`grid h-12 w-12 place-items-center rounded-2xl ${tone}`}><Icon className="h-6 w-6" /></span>
                <p className="mt-6 text-xs font-bold uppercase tracking-[0.14em] text-slate-500">{eyebrow}</p>
                <h3 className="mt-2 text-xl font-black tracking-tight text-slate-950">{title}</h3>
                <p className="mt-3 text-sm leading-6 text-slate-600">{description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="download" className="px-5 py-16 sm:px-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-6 rounded-3xl bg-slate-950 px-6 py-10 text-center text-white sm:flex-row sm:px-10 sm:text-left">
          <div>
            <p className="text-sm font-bold text-blue-300">Android app</p>
            <h2 className="mt-1 text-2xl font-black">APK download is coming soon.</h2>
            <p className="mt-2 text-sm text-slate-400">Use the fast web app today on any phone, tablet, or computer.</p>
          </div>
          <Link to="/signup" className="inline-flex min-h-12 shrink-0 items-center justify-center rounded-xl bg-white px-6 text-sm font-bold text-slate-950 hover:bg-slate-100">
            Start on the web
          </Link>
        </div>
      </section>
    </main>

    <footer className="border-t border-slate-100 px-5 py-8 sm:px-8">
      <p className="mx-auto max-w-6xl text-center text-xs font-semibold tracking-wide text-slate-500">
        100% Offline Capable <span className="mx-2 text-slate-300">|</span> RSA-256 Encrypted Invoicing <span className="mx-2 text-slate-300">|</span> Automated Double-Entry Khata
      </p>
    </footer>
  </div>
);
