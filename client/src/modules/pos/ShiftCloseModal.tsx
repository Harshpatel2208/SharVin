import React, { useState } from 'react';

interface ShiftCloseModalProps {
  onSubmit: (expectedCash: number) => void;
  onCancel: () => void;
}

export const ShiftCloseModal: React.FC<ShiftCloseModalProps> = ({ onSubmit, onCancel }) => {
  const [cashAmount, setCashAmount] = useState('');
  const expectedCash = Number(cashAmount);
  const isValid = cashAmount.trim() !== '' && Number.isFinite(expectedCash) && expectedCash >= 0;

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!isValid) return;
    onSubmit(expectedCash);
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-end bg-slate-950/40 sm:items-center sm:justify-center sm:p-4" role="presentation">
      <form
        onSubmit={handleSubmit}
        className="w-full rounded-t-3xl bg-white p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-2xl sm:max-w-md sm:rounded-2xl sm:p-6"
        role="dialog"
        aria-modal="true"
        aria-labelledby="shift-close-title"
      >
        <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-slate-300 sm:hidden" />
        <h2 id="shift-close-title" className="text-xl font-bold text-slate-950">Close your shift</h2>
        <p className="mt-1 text-sm leading-5 text-slate-500">
          Count the cash before signing out. This amount will be used for the end-of-day Galla check.
        </p>

        <label htmlFor="expected-cash" className="mt-6 block text-sm font-semibold text-slate-800">
          Expected Cash in Drawer
        </label>
        <div className="mt-2 flex min-h-14 items-center rounded-xl bg-slate-50 px-4 ring-1 ring-slate-300 focus-within:ring-2 focus-within:ring-blue-600">
          <span className="mr-2 text-xl font-bold text-slate-500">₹</span>
          <input
            id="expected-cash"
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            autoFocus
            required
            value={cashAmount}
            onChange={(event) => setCashAmount(event.target.value)}
            placeholder="0.00"
            className="min-w-0 flex-1 bg-transparent text-2xl font-bold text-slate-950 outline-none placeholder:text-slate-300"
          />
        </div>

        <div className="mt-6 grid grid-cols-2 gap-3">
          <button type="button" onClick={onCancel} className="min-h-12 rounded-xl bg-slate-100 px-4 text-sm font-bold text-slate-700">
            Cancel
          </button>
          <button type="submit" disabled={!isValid} className="min-h-12 rounded-xl bg-blue-600 px-4 text-sm font-bold text-white disabled:bg-slate-300">
            Submit &amp; Sign Out
          </button>
        </div>
      </form>
    </div>
  );
};
