import React, { useState } from 'react';
import { 
  SlidersHorizontal, 
  CreditCard, 
  Clock, 
  Save, 
  X, 
  CheckCircle2 
} from 'lucide-react';
import { LedgerService } from './ledgerService';
import { ModalBackdrop } from '../../components/ui/DismissOnOutsideClick';

interface RetailerCreditSetting {
  partnerId: string;
  retailerName: string;
  ownerName: string;
  location: string;
  currentBalance: number;
  creditLimit: number;
  paymentTermDays: number;
  isOverdue: boolean;
}

interface WholesalerCreditTermsModalProps {
  onClose: () => void;
  onTermsUpdated?: (partnerId: string, limit: number, days: number) => void;
}

export const WholesalerCreditTermsModal: React.FC<WholesalerCreditTermsModalProps> = ({
  onClose,
  onTermsUpdated,
}) => {
  const [retailers, setRetailers] = useState<RetailerCreditSetting[]>([]);
  const [editingPartnerId, setEditingPartnerId] = useState<string | null>(null);
  const [editLimit, setEditLimit] = useState<number>(50000);
  const [editDays, setEditDays] = useState<number>(15);
  const [saveSuccessMessage, setSaveSuccessMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const handleStartEdit = (r: RetailerCreditSetting) => {
    setEditingPartnerId(r.partnerId);
    setEditLimit(r.creditLimit);
    setEditDays(r.paymentTermDays);
    setSaveSuccessMessage(null);
  };

  const handleSaveTerms = async (partnerId: string) => {
    setIsSaving(true);
    try {
      await LedgerService.updateCreditTerms(partnerId, editLimit, editDays);
      setRetailers((prev) =>
        prev.map((r) =>
          r.partnerId === partnerId
            ? { ...r, creditLimit: editLimit, paymentTermDays: editDays }
            : r
        )
      );
      setSaveSuccessMessage(`Credit terms updated for ${retailers.find(r => r.partnerId === partnerId)?.retailerName}: ₹${editLimit.toLocaleString('en-IN')} limit, ${editDays}-day terms.`);
      setEditingPartnerId(null);
      if (onTermsUpdated) {
        onTermsUpdated(partnerId, editLimit, editDays);
      }
    } catch (e: any) {
      alert(e.message || 'Failed to update credit terms');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <ModalBackdrop onClose={onClose} className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-white border-2 border-slate-200 rounded-3xl max-w-2xl w-full p-6 sm:p-8 space-y-6 shadow-2xl animate-in zoom-in-95 duration-200 text-slate-900 max-h-[90vh] overflow-y-auto">
        
        {/* Header */}
        <div className="flex items-start justify-between border-b border-slate-100 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-blue-600 text-white flex items-center justify-center shadow-lg shadow-blue-600/20 shrink-0 font-bold">
              <SlidersHorizontal className="w-6 h-6" />
            </div>
            <div>
              <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded bg-blue-100 text-blue-800">
                Risk Management
              </span>
              <h3 className="font-black text-slate-900 text-lg mt-0.5">
                B2B Credit Limits &amp; Payment Terms
              </h3>
              <p className="text-xs text-slate-500">
                Configure bilateral credit caps and payment term days per connected retailer
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

        {saveSuccessMessage && (
          <div className="p-3 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center gap-2 font-medium">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            {saveSuccessMessage}
          </div>
        )}

        {/* Retailers List */}
        <div className="space-y-3">
          {retailers.length === 0 && (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-8 text-center">
              <p className="text-sm font-medium text-slate-900">No connected retailer accounts are available.</p>
              <p className="mt-1 text-xs text-slate-500">Credit terms will appear here after a retailer relationship is established.</p>
            </div>
          )}
          {retailers.map((r) => {
            const isEditing = editingPartnerId === r.partnerId;
            const isExceeded = r.currentBalance > r.creditLimit;

            return (
              <div
                key={r.partnerId}
                className={`p-4 rounded-2xl border transition-all ${
                  isExceeded || r.isOverdue
                    ? 'bg-rose-50/50 border-rose-200'
                    : 'bg-slate-50 border-slate-200'
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-900 text-sm">{r.retailerName}</span>
                      {isExceeded && (
                        <span className="px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 text-[10px] font-bold">
                          ⚠️ Limit Exceeded
                        </span>
                      )}
                      {r.isOverdue && (
                        <span className="px-2 py-0.5 rounded-full bg-rose-500 text-white text-[10px] font-black">
                          🛑 Overdue Bills
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-500 flex items-center gap-2 mt-0.5">
                      <span>{r.ownerName}</span>
                      <span>&bull;</span>
                      <span>{r.location}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 text-xs font-mono">
                    <div className="text-right">
                      <span className="text-[10px] text-slate-400 font-sans uppercase">Current Debt</span>
                      <div className="font-bold text-slate-900">
                        ₹{r.currentBalance.toLocaleString('en-IN')}
                      </div>
                    </div>

                    {!isEditing && (
                      <button
                        onClick={() => handleStartEdit(r)}
                        className="px-3 py-1.5 rounded-xl bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 font-bold text-xs shadow-xs transition"
                      >
                        Edit Terms
                      </button>
                    )}
                  </div>
                </div>

                {isEditing ? (
                  <div className="mt-4 pt-3 border-t border-slate-200 grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
                    <div>
                      <label className="text-[11px] font-bold text-slate-700 block mb-1">
                        Credit Limit (₹)
                      </label>
                      <input
                        type="number"
                        step="5000"
                        value={editLimit}
                        onChange={(e) => setEditLimit(Number(e.target.value))}
                        className="w-full px-3 py-2 rounded-xl border border-slate-300 font-mono text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>

                    <div>
                      <label className="text-[11px] font-bold text-slate-700 block mb-1">
                        Payment Term (Days)
                      </label>
                      <input
                        type="number"
                        min="1"
                        max="90"
                        value={editDays}
                        onChange={(e) => setEditDays(Number(e.target.value))}
                        className="w-full px-3 py-2 rounded-xl border border-slate-300 font-mono text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleSaveTerms(r.partnerId)}
                        disabled={isSaving}
                        className="flex-1 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-md transition flex items-center justify-center gap-1.5"
                      >
                        <Save className="w-3.5 h-3.5" /> Save
                      </button>
                      <button
                        onClick={() => setEditingPartnerId(null)}
                        className="px-3 py-2 rounded-xl border border-slate-300 text-slate-600 hover:bg-slate-100 text-xs transition"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-3 pt-2 border-t border-slate-200/60 flex items-center justify-between text-xs text-slate-600 font-mono">
                    <span className="flex items-center gap-1 font-sans">
                      <CreditCard className="w-3.5 h-3.5 text-blue-600" /> Limit: <strong className="font-mono text-slate-900">₹{r.creditLimit.toLocaleString('en-IN')}</strong>
                    </span>
                    <span className="flex items-center gap-1 font-sans">
                      <Clock className="w-3.5 h-3.5 text-amber-600" /> Terms: <strong className="font-mono text-slate-900">{r.paymentTermDays} Days</strong>
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="flex justify-end pt-2 border-t border-slate-100">
          <button
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-medium text-xs transition"
          >
            Close Settings
          </button>
        </div>

      </div>
    </ModalBackdrop>
  );
};
