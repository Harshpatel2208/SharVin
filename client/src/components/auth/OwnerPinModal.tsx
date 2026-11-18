import React, { useState, useEffect } from 'react';
import { ShieldAlert, X, Delete, Lock, CheckCircle2 } from 'lucide-react';
import { useRole } from '../../context/RoleContext';
import { ModalBackdrop } from '../ui/DismissOnOutsideClick';

export const OwnerPinModal: React.FC = () => {
  const { pinModalOpen, setPinModalOpen, pendingProtectedAction, verifyPin } = useRole();
  const [pin, setPin] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState<boolean>(false);
  const [isSuccess, setIsSuccess] = useState<boolean>(false);

  useEffect(() => {
    if (pinModalOpen) {
      setPin('');
      setError(null);
      setIsSuccess(false);
    }
  }, [pinModalOpen]);

  // Physical keyboard support
  useEffect(() => {
    if (!pinModalOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key >= '0' && e.key <= '9') {
        if (pin.length < 4) {
          handleDigitPress(e.key);
        }
      } else if (e.key === 'Backspace') {
        handleBackspace();
      } else if (e.key === 'Escape') {
        setPinModalOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [pinModalOpen, pin]);

  if (!pinModalOpen) return null;

  const handleDigitPress = async (digit: string) => {
    if (pin.length >= 4 || isVerifying || isSuccess) return;
    const newPin = pin + digit;
    setPin(newPin);
    setError(null);

    if (newPin.length === 4) {
      setIsVerifying(true);
      const ok = await verifyPin(newPin);
      setIsVerifying(false);
      if (ok) {
        setIsSuccess(true);
      } else {
        setError('Incorrect Owner PIN. Please try again.');
        setPin('');
      }
    }
  };

  const handleBackspace = () => {
    if (pin.length > 0 && !isVerifying) {
      setPin(pin.slice(0, -1));
      setError(null);
    }
  };

  const handleClear = () => {
    setPin('');
    setError(null);
  };

  return (
    <ModalBackdrop onClose={() => setPinModalOpen(false)}>
      <div 
        className="w-full max-w-sm bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden transform animate-in zoom-in-95 duration-200"
        role="dialog"
        aria-modal="true"
      >
        {/* Modal Header */}
        <div className="p-6 pb-4 border-b border-slate-100 flex items-start justify-between bg-gradient-to-b from-slate-50 to-white">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600 shadow-sm">
              <Lock className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-amber-700 bg-amber-100/60 px-2 py-0.5 rounded-full">
                  Counter Security
                </span>
              </div>
              <h3 className="text-base font-extrabold text-slate-900 mt-0.5">
                Master Owner (Seth) PIN
              </h3>
            </div>
          </div>
          <button
            onClick={() => setPinModalOpen(false)}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100 transition"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 pt-4 flex flex-col items-center">
          <p className="text-xs text-slate-600 text-center leading-relaxed mb-5">
            Operating in <span className="font-bold text-slate-900">Counter Staff (Chhotu) Mode</span>. Enter the 4-digit master PIN to {pendingProtectedAction || 'access confidential B2B data'}.
          </p>

          {/* 4-Box PIN Display Indicators */}
          <div className="flex items-center justify-center gap-3.5 mb-4">
            {[0, 1, 2, 3].map((index) => {
              const isFilled = pin.length > index;
              return (
                <div
                  key={index}
                  className={`w-12 h-14 rounded-2xl flex items-center justify-center border-2 transition-all duration-200 ${
                    error
                      ? 'border-rose-300 bg-rose-50 text-rose-700'
                      : isSuccess
                      ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                      : isFilled
                      ? 'border-blue-600 bg-blue-50/50 shadow-sm shadow-blue-500/10'
                      : 'border-slate-200 bg-slate-50'
                  }`}
                >
                  {isFilled ? (
                    <div className="w-3.5 h-3.5 rounded-full bg-blue-600 animate-in zoom-in-75 duration-150"></div>
                  ) : (
                    <div className="w-2 h-2 rounded-full bg-slate-300"></div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Error / Success Feedback */}
          {error && (
            <div className="flex items-center gap-1.5 text-xs text-rose-600 font-semibold mb-3 animate-in shake duration-200">
              <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {isSuccess && (
            <div className="flex items-center gap-1.5 text-xs text-emerald-600 font-bold mb-3 animate-in fade-in duration-200">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>PIN Verified! Access Unlocked.</span>
            </div>
          )}

          {/* Numeric Keypad Grid */}
          <div className="grid grid-cols-3 gap-2.5 w-full max-w-[280px] mb-4">
            {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
              <button
                key={digit}
                type="button"
                onClick={() => handleDigitPress(digit)}
                disabled={isVerifying || isSuccess}
                className="h-12 rounded-2xl bg-white hover:bg-slate-100 border border-slate-200 text-slate-800 text-lg font-bold shadow-xs active:scale-95 transition flex items-center justify-center select-none"
              >
                {digit}
              </button>
            ))}

            <button
              type="button"
              onClick={handleClear}
              disabled={pin.length === 0 || isVerifying || isSuccess}
              className="h-12 rounded-2xl bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-500 text-xs font-bold transition flex items-center justify-center select-none disabled:opacity-40"
            >
              Clear
            </button>

            <button
              type="button"
              onClick={() => handleDigitPress('0')}
              disabled={isVerifying || isSuccess}
              className="h-12 rounded-2xl bg-white hover:bg-slate-100 border border-slate-200 text-slate-800 text-lg font-bold shadow-xs active:scale-95 transition flex items-center justify-center select-none"
            >
              0
            </button>

            <button
              type="button"
              onClick={handleBackspace}
              disabled={pin.length === 0 || isVerifying || isSuccess}
              className="h-12 rounded-2xl bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-600 hover:text-slate-900 transition flex items-center justify-center select-none disabled:opacity-40"
              aria-label="Backspace"
            >
              <Delete className="w-5 h-5" />
            </button>
          </div>

        </div>
      </div>
    </ModalBackdrop>
  );
};
