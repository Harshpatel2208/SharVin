import React, { useEffect, useState } from 'react';
import { Building2, KeyRound, Save } from 'lucide-react';

interface BusinessProfile {
  tradeName: string;
  gstin: string;
  address: { addressLine1: string; addressLine2: string; city: string; state: string; postalCode: string };
  deliveryRadiusKm: number | null;
}

const emptyProfile: BusinessProfile = {
  tradeName: '', gstin: '',
  address: { addressLine1: '', addressLine2: '', city: '', state: '', postalCode: '' },
  deliveryRadiusKm: null,
};

async function requestSettings(path: string, method = 'GET', payload?: unknown) {
  const response = await fetch(path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${sessionStorage.getItem('sharvin_token') || ''}`,
    },
    ...(payload ? { body: JSON.stringify(payload) } : {}),
  });
  const body = await response.json();
  if (!response.ok || !body.success) throw new Error(body.error || 'Settings could not be saved.');
  return body.data;
}

export const BusinessSettingsView: React.FC = () => {
  const [profile, setProfile] = useState<BusinessProfile>(emptyProfile);
  const [newPin, setNewPin] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [isSavingPin, setIsSavingPin] = useState(false);
  const [profileMessage, setProfileMessage] = useState('');
  const [pinMessage, setPinMessage] = useState('');
  const [profileError, setProfileError] = useState('');
  const [pinError, setPinError] = useState('');

  useEffect(() => {
    let mounted = true;
    requestSettings('/api/v1/auth/profile')
      .then((data: BusinessProfile) => { if (mounted) setProfile({ ...emptyProfile, ...data, address: { ...emptyProfile.address, ...data.address } }); })
      .catch((error) => { if (mounted) setProfileError(error instanceof Error ? error.message : 'Could not load business profile.'); })
      .finally(() => { if (mounted) setIsLoading(false); });
    return () => { mounted = false; };
  }, []);

  const saveProfile = async (event: React.FormEvent) => {
    event.preventDefault();
    setProfileError('');
    setProfileMessage('');
    const gstin = profile.gstin.trim().toUpperCase();
    if (gstin && !/^[A-Z0-9]{15}$/.test(gstin)) {
      setProfileError('GSTIN must be exactly 15 alphanumeric characters.');
      return;
    }
    setIsSavingProfile(true);
    try {
      const data = await requestSettings('/api/v1/auth/profile', 'PATCH', { ...profile, gstin });
      setProfile({ ...emptyProfile, ...data, address: { ...emptyProfile.address, ...data.address } });
      setProfileMessage('Business profile saved.');
    } catch (error) {
      setProfileError(error instanceof Error ? error.message : 'Could not save business profile.');
    } finally { setIsSavingProfile(false); }
  };

  const savePin = async (event: React.FormEvent) => {
    event.preventDefault();
    setPinError('');
    setPinMessage('');
    if (!/^\d{4}$/.test(newPin)) { setPinError('Enter a 4-digit numeric PIN.'); return; }
    setIsSavingPin(true);
    try {
      await requestSettings('/api/v1/auth/pin', 'PATCH', { newPin });
      setNewPin('');
      setPinMessage('Master Owner PIN updated.');
    } catch (error) {
      setPinError(error instanceof Error ? error.message : 'Could not update Master Owner PIN.');
    } finally { setIsSavingPin(false); }
  };

  const updateAddress = (field: keyof BusinessProfile['address'], value: string) => {
    setProfile((current) => ({ ...current, address: { ...current.address, [field]: value } }));
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6 bg-slate-50 pb-10">
      <header>
        <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">Business settings</p>
        <h1 className="mt-1 text-2xl font-bold text-slate-900">Settings</h1>
        <p className="mt-1 text-sm text-slate-500">Manage your business profile and account security.</p>
      </header>

      {isLoading ? <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500">Loading business settings…</div> : (
        <>
          <form onSubmit={saveProfile} className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
            <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
              <Building2 className="h-5 w-5 text-blue-600" />
              <div><h2 className="font-semibold text-slate-900">Business Profile</h2><p className="text-xs text-slate-500">Details used for trade, compliance, and delivery.</p></div>
            </div>
            {profileError && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{profileError}</p>}
            {profileMessage && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{profileMessage}</p>}
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="text-sm font-medium text-slate-700">Trade Name<input required minLength={2} value={profile.tradeName} onChange={(e) => setProfile({ ...profile, tradeName: e.target.value })} className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900" /></label>
              <label className="text-sm font-medium text-slate-700">GSTIN<input value={profile.gstin} maxLength={15} onChange={(e) => setProfile({ ...profile, gstin: e.target.value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase() })} pattern="[A-Z0-9]{15}" title="Enter exactly 15 alphanumeric characters" placeholder="15-character GSTIN" className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 uppercase text-slate-900" /></label>
              <label className="text-sm font-medium text-slate-700 sm:col-span-2">Address Line 1<input required value={profile.address.addressLine1} onChange={(e) => updateAddress('addressLine1', e.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900" /></label>
              <label className="text-sm font-medium text-slate-700 sm:col-span-2">Address Line 2<input value={profile.address.addressLine2} onChange={(e) => updateAddress('addressLine2', e.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900" /></label>
              <label className="text-sm font-medium text-slate-700">City<input required value={profile.address.city} onChange={(e) => updateAddress('city', e.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900" /></label>
              <label className="text-sm font-medium text-slate-700">State<input required value={profile.address.state} onChange={(e) => updateAddress('state', e.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900" /></label>
              <label className="text-sm font-medium text-slate-700">Postal Code<input required value={profile.address.postalCode} onChange={(e) => updateAddress('postalCode', e.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900" /></label>
              {profile.deliveryRadiusKm !== null && <label className="text-sm font-medium text-slate-700">Delivery Radius (km)<input required type="number" min="0" max="500" value={profile.deliveryRadiusKm} onChange={(e) => setProfile({ ...profile, deliveryRadiusKm: Number(e.target.value) })} className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900" /></label>}
            </div>
            <button type="submit" disabled={isSavingProfile} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"><Save className="h-4 w-4" />{isSavingProfile ? 'Saving…' : 'Save Business Profile'}</button>
          </form>

          <form onSubmit={savePin} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
            <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
              <KeyRound className="h-5 w-5 text-blue-600" />
              <div><h2 className="font-semibold text-slate-900">Security</h2><p className="text-xs text-slate-500">Set a new 4-digit Master Owner PIN.</p></div>
            </div>
            {pinError && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{pinError}</p>}
            {pinMessage && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{pinMessage}</p>}
            <label className="block max-w-xs text-sm font-medium text-slate-700">New Master Owner PIN<input required type="password" inputMode="numeric" autoComplete="new-password" pattern="[0-9]{4}" maxLength={4} value={newPin} onChange={(e) => setNewPin(e.target.value.replace(/\D/g, '').slice(0, 4))} placeholder="4 digits" className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900" /></label>
            <button type="submit" disabled={isSavingPin || newPin.length !== 4} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"><KeyRound className="h-4 w-4" />{isSavingPin ? 'Updating…' : 'Update PIN'}</button>
          </form>
        </>
      )}
    </div>
  );
};
