import React, { useState } from 'react';
import { 
  AlertTriangle, 
  CreditCard, 
  Clock, 
  ArrowRight, 
  X, 
  ShieldAlert, 
  CheckCircle2, 
  PhoneCall, 
  Send
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { CreditProfileSummary } from './types';
import { ModalBackdrop } from '../../components/ui/DismissOnOutsideClick';

interface RetailerCreditFreezeModalProps {
  creditProfile: CreditProfileSummary;
  cartTotal?: number;
  onClose: () => void;
  onRequestOverride?: (reason: string) => void;
}

export const RetailerCreditFreezeModal: React.FC<RetailerCreditFreezeModalProps> = ({
  creditProfile,
  cartTotal = 0,
  onClose,
  onRequestOverride,
}) => {
  const navigate = useNavigate();
  const [overrideRequested, setOverrideRequested] = useState(false);
  const [overrideNote, setOverrideNote] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isOverdue = creditProfile.isOverdue;
  const isCreditExceeded = creditProfile.isCreditExceeded;

  const prospectiveTotal = creditProfile.currentBalance + cartTotal;
  const prospectiveExcess = Math.max(0, prospectiveTotal - creditProfile.creditLimit);

  const handleSendOverrideRequest = () => {
    if (!overrideNote.trim()) return;
    setIsSubmitting(true);
    setTimeout(() => {
      setIsSubmitting(false);
      setOverrideRequested(true);
      if (onRequestOverride) {
        onRequestOverride(overrideNote);
      }
    }, 500);
  };

  return (
    <ModalBackdrop onClose={onClose} className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white border-2 border-rose-500 rounded-3xl max-w-xl w-full p-6 sm:p-8 space-y-6 shadow-2xl animate-in zoom-in-95 duration-200 my-8 text-slate-900">
        
        {/* Massive Alert Header */}
        <div className="flex items-start justify-between border-b border-rose-100 pb-5">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-rose-500 text-white flex items-center justify-center shadow-lg shadow-rose-500/30 shrink-0 animate-bounce">
              <ShieldAlert className="w-7 h-7" />
            </div>
            <div>
              <span className="px-2.5 py-0.5 rounded-full bg-rose-100 text-rose-800 text-[11px] font-black uppercase tracking-wider">
                {isOverdue ? '🛑 OVERDUE BILL FREEZE' : '⚠️ CREDIT LIMIT EXHAUSTED'}
              </span>
              <h2 className="text-xl font-black text-rose-950 mt-1">
                Restock Checkout Blocked by Wholesaler
              </h2>
              <p className="text-xs text-rose-700/90 font-medium">
                Supplier: <span className="font-bold text-slate-900">{creditProfile.wholesalerName}</span>
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

        {/* Primary Alert Banner with Dynamic Indian Currency Figures */}
        <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-xs space-y-2">
          {isCreditExceeded && (
            <div className="space-y-1">
              <div className="font-black text-sm text-rose-900 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                Credit Limit Exhausted (Outstanding: ₹{creditProfile.currentBalance.toLocaleString('en-IN')} / Limit: ₹{creditProfile.creditLimit.toLocaleString('en-IN')})
              </div>
              <p className="text-rose-800 leading-relaxed">
                Your store currently has <span className="font-bold">₹{creditProfile.currentBalance.toLocaleString('en-IN')}</span> in outstanding credit against your approved limit of <span className="font-bold">₹{creditProfile.creditLimit.toLocaleString('en-IN')}</span>. 
                {cartTotal > 0 && (
                  <span> Adding this order of ₹{cartTotal.toLocaleString('en-IN')} puts total exposure at <span className="font-bold text-rose-950">₹{prospectiveTotal.toLocaleString('en-IN')}</span> (exceeding by ₹{prospectiveExcess.toLocaleString('en-IN')}).</span>
                )}
              </p>
            </div>
          )}

          {isOverdue && (
            <div className="space-y-1 pt-1">
              <div className="font-black text-sm text-rose-900 flex items-center gap-2">
                <Clock className="w-4 h-4 text-rose-600 shrink-0" />
                Overdue Invoices Detected ({creditProfile.overdueInvoices.length} bill{creditProfile.overdueInvoices.length > 1 ? 's' : ''} past payment terms)
              </div>
              <p className="text-rose-800 leading-relaxed">
                Wholesaler terms specify payment within <span className="font-bold">{creditProfile.paymentTermDays} days</span>. You have unpaid invoices exceeding this timeframe totaling <span className="font-black text-rose-950">₹{creditProfile.overdueAmount.toLocaleString('en-IN')}</span>.
              </p>
            </div>
          )}
        </div>

        {/* Credit Utilization Visual Meter */}
        <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
          <div className="flex items-center justify-between text-xs">
            <span className="font-bold text-slate-700">Credit Line Utilization</span>
            <span className="font-mono font-black text-rose-600">
              {creditProfile.creditUtilizationPercent}% Exhausted
            </span>
          </div>

          <div className="w-full bg-slate-200 rounded-full h-3 overflow-hidden p-0.5">
            <div 
              className={`h-full rounded-full transition-all duration-500 ${
                creditProfile.creditUtilizationPercent >= 100 
                  ? 'bg-rose-600' 
                  : 'bg-amber-500'
              }`}
              style={{ width: `${Math.min(100, creditProfile.creditUtilizationPercent)}%` }}
            />
          </div>

          <div className="grid grid-cols-3 gap-2 pt-1 text-center">
            <div className="p-2 rounded-xl bg-white border border-slate-200">
              <span className="text-[10px] text-slate-500 uppercase font-semibold">Outstanding Debt</span>
              <div className="font-mono font-bold text-slate-900 text-xs">
                ₹{creditProfile.currentBalance.toLocaleString('en-IN')}
              </div>
            </div>
            <div className="p-2 rounded-xl bg-white border border-slate-200">
              <span className="text-[10px] text-slate-500 uppercase font-semibold">Wholesale Limit</span>
              <div className="font-mono font-bold text-slate-900 text-xs">
                ₹{creditProfile.creditLimit.toLocaleString('en-IN')}
              </div>
            </div>
            <div className="p-2 rounded-xl bg-white border border-slate-200">
              <span className="text-[10px] text-slate-500 uppercase font-semibold">Min. Settlement</span>
              <div className="font-mono font-black text-emerald-600 text-xs">
                ₹{creditProfile.minSettlementRequired.toLocaleString('en-IN')}
              </div>
            </div>
          </div>
        </div>

        {/* Overdue Invoices Breakdown Table (if overdue exists) */}
        {creditProfile.overdueInvoices.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-rose-600" /> Overdue Invoices List
            </h4>
            <div className="overflow-x-auto rounded-xl border border-rose-200 bg-rose-50/50">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="text-slate-600 border-b border-rose-200 bg-rose-100/60 text-[11px]">
                    <th className="py-2 px-3">Invoice Number</th>
                    <th className="py-2 px-3">Amount</th>
                    <th className="py-2 px-3">Due Date</th>
                    <th className="py-2 px-3 text-right">Overdue</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-rose-100">
                  {creditProfile.overdueInvoices.map((inv) => (
                    <tr key={inv.invoiceId} className="hover:bg-rose-100/40">
                      <td className="py-2 px-3 font-mono font-bold text-slate-900">{inv.invoiceNumber}</td>
                      <td className="py-2 px-3 font-mono font-semibold text-rose-900">₹{inv.amount.toLocaleString('en-IN')}</td>
                      <td className="py-2 px-3 text-slate-600">{new Date(inv.dueDate).toLocaleDateString('en-IN')}</td>
                      <td className="py-2 px-3 text-right">
                        <span className="px-2 py-0.5 rounded-full bg-rose-500 text-white font-black text-[10px]">
                          +{inv.daysOverdue} Days
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Emergency Override Request Drawer */}
        <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 space-y-3">
          <div className="flex items-center justify-between">
            <span className="font-bold text-amber-900 text-xs flex items-center gap-1.5">
              <PhoneCall className="w-3.5 h-3.5 text-amber-700" /> Need Emergency Dispatch?
            </span>
            <span className="text-[10px] text-amber-700 font-medium">Requires Wholesaler Seth Approval</span>
          </div>

          {overrideRequested ? (
            <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>
                <strong>Override Request Dispatched!</strong> Wholesaler notified with reason: "{overrideNote}". Awaiting Seth approval.
              </span>
            </div>
          ) : (
            <div className="space-y-2">
              <input
                type="text"
                placeholder="Reason (e.g. Festival crowd restock, will pay via NEFT tomorrow morning)..."
                value={overrideNote}
                onChange={(e) => setOverrideNote(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-white border border-amber-300 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500 font-medium"
              />
              <button
                onClick={handleSendOverrideRequest}
                disabled={!overrideNote.trim() || isSubmitting}
                className="w-full py-2 rounded-xl bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-slate-950 font-bold text-xs transition flex items-center justify-center gap-2 shadow-sm"
              >
                <Send className="w-3.5 h-3.5" /> Request Emergency Wholesaler Override
              </button>
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row items-center justify-end gap-3 pt-2">
          <button
            onClick={onClose}
            className="w-full sm:w-auto px-4 py-2.5 rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-100 text-xs font-semibold transition"
          >
            Review Cart Items
          </button>

          <button
            onClick={() => {
              onClose();
              navigate('/ledger');
            }}
            className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs transition flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/25"
          >
            <CreditCard className="w-4 h-4" />
            Settle Khata Ledger (₹{creditProfile.minSettlementRequired.toLocaleString('en-IN')})
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>

      </div>
    </ModalBackdrop>
  );
};
