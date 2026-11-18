import React, { useState } from 'react';
import { ModalBackdrop } from '../../components/ui/DismissOnOutsideClick';
import { CreditNoteDto } from './types';
import { DeliveryService } from './deliveryService';

interface CreditNoteModalProps {
  creditNote: CreditNoteDto;
  onClose: () => void;
  onDisputeResolved?: () => void;
  userRole?: 'retailer' | 'wholesaler';
}

export const CreditNoteModal: React.FC<CreditNoteModalProps> = ({
  creditNote,
  onClose,
  onDisputeResolved,
  userRole = 'retailer',
}) => {
  const [downloading, setDownloading] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [resolveSuccess, setResolveSuccess] = useState<string | null>(null);

  const handleDownloadCsv = async () => {
    try {
      setDownloading(true);
      await DeliveryService.downloadCreditNoteCsv(creditNote.creditNoteId);
    } catch (err: any) {
      alert(err.message || 'Failed to download Credit Note CSV');
    } finally {
      setDownloading(false);
    }
  };

  const handleApproveCreditNote = async () => {
    try {
      setResolving(true);
      await DeliveryService.resolveDispute(creditNote.orderId, {
        action: 'approve_credit_note',
        resolutionNotes: 'Wholesaler approved statutory credit note and damage allowance in full. Escrow dispute hold released.',
      });
      setResolveSuccess('Credit note approved & Escrow hold released to Khata ledger!');
      if (onDisputeResolved) {
        onDisputeResolved();
      }
    } catch (err: any) {
      alert(err.message || 'Failed to approve credit note');
    } finally {
      setResolving(false);
    }
  };

  const isApproved = creditNote.status === 'approved_by_wholesaler' || Boolean(resolveSuccess);

  return (
    <ModalBackdrop onClose={onClose} className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-fade-in">
      <div 
        className="bg-white rounded-2xl shadow-2xl border border-slate-200/80 w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden text-slate-800"
        role="dialog"
        aria-modal="true"
        aria-labelledby="credit-note-title"
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/70">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-200/60 flex items-center justify-center text-blue-600 shadow-sm">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 id="credit-note-title" className="text-lg font-bold text-slate-900">
                  Statutory B2B Credit Note
                </h2>
                <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                  isApproved 
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' 
                    : 'bg-amber-50 text-amber-700 border border-amber-200'
                }`}>
                  {isApproved ? 'Approved by Wholesaler' : 'Issued (Escrow Held)'}
                </span>
              </div>
              <p className="text-xs text-slate-500 font-mono">
                {creditNote.creditNoteNumber} • Order Ref: {creditNote.orderNumber}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
            title="Close"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Modal Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {resolveSuccess && (
            <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-sm font-medium flex items-center gap-2.5 shadow-sm">
              <svg className="w-5 h-5 text-emerald-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span>{resolveSuccess}</span>
            </div>
          )}

          {/* Trade Parties Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/50">
              <span className="text-xs font-semibold uppercase tracking-wider text-blue-600">Issuer / Supplier</span>
              <h3 className="text-base font-bold text-slate-900 mt-1">{creditNote.payer.name}</h3>
              <p className="text-xs text-slate-600 mt-1 font-mono">GSTIN: {creditNote.payer.gstin}</p>
              <p className="text-xs text-slate-500 mt-1">{creditNote.payer.address}</p>
              {creditNote.payer.contactNumber && (
                <p className="text-xs text-slate-500 mt-0.5">Contact: {creditNote.payer.contactNumber}</p>
              )}
            </div>

            <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/50">
              <span className="text-xs font-semibold uppercase tracking-wider text-emerald-600">Recipient / Retailer</span>
              <h3 className="text-base font-bold text-slate-900 mt-1">{creditNote.payee.name}</h3>
              <p className="text-xs text-slate-600 mt-1 font-mono">GSTIN: {creditNote.payee.gstin}</p>
              <p className="text-xs text-slate-500 mt-1">{creditNote.payee.address}</p>
              {creditNote.payee.contactNumber && (
                <p className="text-xs text-slate-500 mt-0.5">Contact: {creditNote.payee.contactNumber}</p>
              )}
            </div>
          </div>

          {/* Itemized Rejection Table */}
          <div className="border border-slate-200 rounded-xl overflow-hidden shadow-sm">
            <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                Itemized Rejected Units & Statutory Allowance
              </h4>
              <span className="text-xs text-slate-500">GST Commodity Rate: 5%</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-100/60 text-slate-600 font-semibold border-b border-slate-200">
                    <th className="py-2.5 px-4">Product Description</th>
                    <th className="py-2.5 px-3 text-center">Qty Returned</th>
                    <th className="py-2.5 px-3 text-right">Agreed Rate</th>
                    <th className="py-2.5 px-3 text-right">Taxable Credit</th>
                    <th className="py-2.5 px-3 text-right">GST (5%)</th>
                    <th className="py-2.5 px-4 text-right">Total Credit Note</th>
                    <th className="py-2.5 px-4">Inspection Note</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {creditNote.items.map((item, idx) => (
                    <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                      <td className="py-3 px-4 font-medium text-slate-900">{item.productName}</td>
                      <td className="py-3 px-3 text-center">
                        <span className="inline-block px-2 py-0.5 rounded bg-rose-50 text-rose-700 border border-rose-200 font-semibold">
                          {item.rejectedQuantity} units
                        </span>
                      </td>
                      <td className="py-3 px-3 text-right font-mono text-slate-700">₹{item.unitPrice.toFixed(2)}</td>
                      <td className="py-3 px-3 text-right font-mono text-slate-700">₹{item.taxableAmount.toFixed(2)}</td>
                      <td className="py-3 px-3 text-right font-mono text-slate-700">₹{item.gstAmount.toFixed(2)}</td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-slate-900">₹{item.totalCreditAmount.toFixed(2)}</td>
                      <td className="py-3 px-4 text-slate-500 capitalize">{item.reason.replace(/_/g, ' ')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Financial Breakdown Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl">
              <span className="text-xs text-slate-500 font-medium">Original Order Total</span>
              <p className="text-base font-bold text-slate-800 mt-1 font-mono">
                ₹{creditNote.originalOrderAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </p>
            </div>
            <div className="p-3.5 bg-emerald-50/50 border border-emerald-200/80 rounded-xl">
              <span className="text-xs text-emerald-700 font-medium">Net Accepted Goods Value</span>
              <p className="text-base font-bold text-emerald-800 mt-1 font-mono">
                ₹{creditNote.acceptedOrderAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </p>
            </div>
            <div className="p-3.5 bg-blue-50/50 border border-blue-200/80 rounded-xl">
              <span className="text-xs text-blue-700 font-medium">Credit Note / Escrow Hold</span>
              <p className="text-base font-bold text-blue-800 mt-1 font-mono">
                ₹{creditNote.creditNoteAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </p>
            </div>
          </div>

          {/* Double-Entry General Journal (CA Audit) */}
          <div className="p-4 rounded-xl border border-blue-100 bg-blue-50/30">
            <div className="flex items-center gap-2 mb-2">
              <svg className="w-4 h-4 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
              </svg>
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-900">
                Double-Entry Accounting Journal (CA Specification)
              </h4>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
              <div className="bg-white p-2.5 rounded-lg border border-slate-200 font-mono">
                <span className="text-slate-400 block text-[10px]">DEBIT ACCOUNT</span>
                <span className="font-semibold text-slate-800">{creditNote.doubleEntryJournal.debitAccount}</span>
                <span className="block font-bold text-slate-900 mt-1">₹{creditNote.doubleEntryJournal.debitAmount.toFixed(2)}</span>
              </div>
              <div className="bg-white p-2.5 rounded-lg border border-slate-200 font-mono">
                <span className="text-slate-400 block text-[10px]">CREDIT ACCOUNT</span>
                <span className="font-semibold text-slate-800">{creditNote.doubleEntryJournal.creditAccount}</span>
                <span className="block font-bold text-slate-900 mt-1">₹{creditNote.doubleEntryJournal.creditAmount.toFixed(2)}</span>
              </div>
            </div>
            <p className="text-[11px] text-slate-500 mt-2 italic">
              Narration: {creditNote.doubleEntryJournal.narration}
            </p>
          </div>

          {/* Cryptographic Seal */}
          <div className="p-3.5 bg-slate-50 border border-slate-200 text-slate-700 rounded-xl font-mono text-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <div>
                <span className="text-slate-400 text-[10px] uppercase tracking-wider block">SHA-256 Digital Signature Seal</span>
                <span className="text-emerald-700 text-[11px] break-all">{creditNote.digitalSignatureHash}</span>
              </div>
            </div>
            <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-semibold whitespace-nowrap">
              TAMPER PROOF SEALED
            </span>
          </div>
        </div>

        {/* Modal Footer Actions */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4 border-t border-slate-100 bg-slate-50/70">
          <div className="flex items-center gap-2">
            <button
              onClick={handleDownloadCsv}
              disabled={downloading}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-xl transition-all shadow-sm disabled:opacity-50"
            >
              <svg className="w-4 h-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              {downloading ? 'Downloading...' : 'Download CA RFC-4180 CSV'}
            </button>
          </div>

          <div className="flex items-center gap-3">
            {userRole === 'wholesaler' && !isApproved && (
              <button
                onClick={handleApproveCreditNote}
                disabled={resolving}
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl transition-all shadow-sm disabled:opacity-50"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                {resolving ? 'Approving...' : 'Approve Credit Note & Release Escrow'}
              </button>
            )}

            <button
              onClick={onClose}
              className="px-5 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-all shadow-sm"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </ModalBackdrop>
  );
};
