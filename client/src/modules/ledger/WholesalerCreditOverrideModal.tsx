import React, { useState } from 'react';
import { 
  ShieldCheck, 
  AlertTriangle, 
  X, 
  FileText 
} from 'lucide-react';
import { LedgerService } from './ledgerService';
import { ModalBackdrop } from '../../components/ui/DismissOnOutsideClick';

interface WholesalerCreditOverrideModalProps {
  orderId: string;
  orderNumber: string;
  retailerName: string;
  currentBalance: number;
  creditLimit: number;
  overdueAmount?: number;
  onClose: () => void;
  onSuccess: (reason: string) => void;
}

export const WholesalerCreditOverrideModal: React.FC<WholesalerCreditOverrideModalProps> = ({
  orderId,
  orderNumber,
  retailerName,
  currentBalance,
  creditLimit,
  overdueAmount = 0,
  onClose,
  onSuccess,
}) => {
  const [reason, setReason] = useState('Festival restock goodwill approved by Seth');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const quickReasons = [
    'Festival restock goodwill approved by Seth',
    'Post-dated cheque (PDC) received in godown',
    'VIP 10-year kirana relationship with owner guarantee',
    'Emergency bulk order - partial cash paid at counter',
  ];

  const handleConfirmOverride = async () => {
    if (!reason.trim()) {
      setError('Please provide a valid override reason for CA audit logs.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      await LedgerService.overrideOrderCredit(orderId, reason);
      onSuccess(reason);
    } catch (e: any) {
      setError(e.message || 'Failed to authorize credit override');
      setIsSubmitting(false);
    }
  };

  return (
    <ModalBackdrop onClose={onClose} className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-white border-2 border-amber-500 rounded-3xl max-w-lg w-full p-6 sm:p-8 space-y-6 shadow-2xl animate-in zoom-in-95 duration-200 text-slate-900">
        
        {/* Header */}
        <div className="flex items-start justify-between border-b border-slate-100 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-amber-500 text-slate-950 flex items-center justify-center shadow-lg shadow-amber-500/20 shrink-0 font-bold">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded bg-amber-100 text-amber-800">
                Owner Dispatch Authority
              </span>
              <h3 className="font-black text-slate-900 text-lg mt-0.5">
                B2B Credit Limit Override
              </h3>
              <p className="text-xs text-slate-500 font-mono">
                Order #{orderNumber} &bull; {retailerName}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Risk Exposure Summary */}
        <div className="p-4 rounded-2xl bg-amber-50/80 border border-amber-200 text-xs space-y-2">
          <div className="font-bold text-amber-900 flex items-center gap-1.5">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
            Current Credit Exposure
          </div>
          <div className="grid grid-cols-3 gap-2 pt-1 text-center font-mono">
            <div className="p-2 rounded-xl bg-white border border-amber-200">
              <span className="text-[10px] text-slate-500 uppercase font-sans">Outstanding</span>
              <div className="font-bold text-slate-900 text-xs">
                ₹{currentBalance.toLocaleString('en-IN')}
              </div>
            </div>
            <div className="p-2 rounded-xl bg-white border border-amber-200">
              <span className="text-[10px] text-slate-500 uppercase font-sans">Approved Limit</span>
              <div className="font-bold text-slate-900 text-xs">
                ₹{creditLimit.toLocaleString('en-IN')}
              </div>
            </div>
            <div className="p-2 rounded-xl bg-white border border-amber-200">
              <span className="text-[10px] text-slate-500 uppercase font-sans">Overdue Debt</span>
              <div className="font-black text-rose-600 text-xs">
                ₹{overdueAmount.toLocaleString('en-IN')}
              </div>
            </div>
          </div>
          <p className="text-[11px] text-amber-800 pt-1 leading-relaxed">
            By overriding, you accept operational credit risk and authorize your godown manager to pack and dispatch this order.
          </p>
        </div>

        {/* Override Justification Input */}
        <div className="space-y-2">
          <label className="text-xs font-bold text-slate-700 flex items-center gap-1">
            <FileText className="w-3.5 h-3.5 text-slate-500" />
            Audit Justification (Recorded for CA Audit):
          </label>
          <textarea
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Specify reason for temporary credit override..."
            className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500 font-medium"
          />

          {/* Quick preset chips */}
          <div className="flex flex-wrap gap-1.5 pt-1">
            {quickReasons.map((chip, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => setReason(chip)}
                className="text-[10px] px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium transition"
              >
                {chip}
              </button>
            ))}
          </div>
        </div>

        {error && (
          <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold">
            {error}
          </div>
        )}

        {/* Footer Actions */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-100 text-xs font-semibold transition"
          >
            Cancel
          </button>

          <button
            onClick={handleConfirmOverride}
            disabled={isSubmitting || !reason.trim()}
            className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-black text-xs transition flex items-center gap-2 shadow-lg shadow-amber-500/25 disabled:opacity-50"
          >
            <ShieldCheck className="w-4 h-4" />
            {isSubmitting ? 'Authorizing...' : 'Authorize & Allow Dispatch'}
          </button>
        </div>

      </div>
    </ModalBackdrop>
  );
};
