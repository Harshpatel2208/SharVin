import React, { useState, useEffect } from 'react';
import {
  X,
  Printer,
  Download,
  ShieldCheck,
  Copy,
  Check,
  Building2,
  FileText,
  AlertTriangle
} from 'lucide-react';
import { KhataSettlementVoucherDto } from './types';
import { LedgerService } from './ledgerService';
import { ModalBackdrop } from '../../components/ui/DismissOnOutsideClick';

interface KhataVoucherModalProps {
  voucherIdOrNumber: string;
  isOpen: boolean;
  onClose: () => void;
}

export const KhataVoucherModal: React.FC<KhataVoucherModalProps> = ({
  voucherIdOrNumber,
  isOpen,
  onClose,
}) => {
  const [voucher, setVoucher] = useState<KhataSettlementVoucherDto | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<boolean>(false);
  const [isDownloading, setIsDownloading] = useState<boolean>(false);

  useEffect(() => {
    if (!isOpen || !voucherIdOrNumber) return;

    let isMounted = true;
    setIsLoading(true);
    setError(null);

    LedgerService.getSettlementVoucher(voucherIdOrNumber)
      .then((data) => {
        if (isMounted) setVoucher(data);
      })
      .catch((err) => {
        if (isMounted) { setError(err.message || 'Voucher could not be loaded.'); setVoucher(null); }
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, voucherIdOrNumber]);

  if (!isOpen) return null;

  const handleCopyHash = () => {
    if (voucher?.digitalSignatureHash) {
      navigator.clipboard.writeText(voucher.digitalSignatureHash);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleDownloadCsv = async () => {
    if (!voucher) return;
    setIsDownloading(true);
    try {
      await LedgerService.downloadVoucherCsv(voucher.voucherNumber || voucher.voucherId);
    } catch (e: any) {
      console.error('Failed to download voucher CSV:', e);
    } finally {
      setIsDownloading(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <ModalBackdrop onClose={onClose} className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div 
        id="khata-voucher-modal"
        className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-3xl max-h-[92vh] flex flex-col overflow-hidden text-slate-800"
      >
        {/* MODAL HEADER */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/80">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-slate-900">B2B Khata Settlement Voucher</h3>
                <span className="text-[11px] font-mono font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1">
                  <ShieldCheck className="w-3 h-3" />
                  CA Verified
                </span>
              </div>
              <p className="text-xs text-slate-500 font-mono">
                {voucher?.voucherNumber || voucherIdOrNumber} &bull; Statutory Repayment Record
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleDownloadCsv}
              disabled={isDownloading || !voucher}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 hover:border-slate-300 transition shadow-sm disabled:opacity-50"
              title="Download CA RFC-4180 CSV Export"
            >
              <Download className="w-3.5 h-3.5" />
              <span>{isDownloading ? 'Exporting...' : 'Export CSV'}</span>
            </button>
            <button
              onClick={handlePrint}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 hover:border-slate-300 transition shadow-sm"
              title="Print Voucher Receipt"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print</span>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition"
              title="Close modal"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* MODAL BODY */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {isLoading ? (
            <div className="py-16 text-center space-y-3">
              <div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto" />
              <p className="text-sm font-medium text-slate-500">Loading statutory settlement voucher details...</p>
            </div>
          ) : error ? (
            <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-sm flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          ) : voucher ? (
            <>
              {/* STATUS & SUMMARY STRIP */}
              <div className="p-4 rounded-xl bg-gradient-to-r from-blue-50/70 via-slate-50 to-emerald-50/50 border border-slate-200 flex flex-wrap items-center justify-between gap-4">
                <div className="space-y-1">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500">Settlement Type</span>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-slate-900 capitalize">
                      {voucher.settlementCycle === '7_days' ? '7-Day Mid-Cycle Repayment' : '15-Day Routine Settlement'}
                    </span>
                    <span className="px-2 py-0.5 text-[10px] font-mono font-bold rounded-md bg-blue-100 text-blue-700">
                      {voucher.paymentMethod.toUpperCase()}
                    </span>
                  </div>
                </div>

                <div className="space-y-1">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500">Receipt Ref #</span>
                  <div className="text-sm font-mono font-bold text-slate-800">{voucher.receiptNumber}</div>
                </div>

                <div className="space-y-1">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500">Settlement Date</span>
                  <div className="text-sm font-medium text-slate-800">
                    {new Date(voucher.paymentDate).toLocaleDateString('en-IN', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </div>
                </div>

                <div className="space-y-1 text-right">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500">Amount Cleared</span>
                  <div className="text-lg font-mono font-extrabold text-emerald-600">
                    ₹{voucher.amountPaid.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </div>
                </div>
              </div>

              {/* TWO PARTIES GRID */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* PAYER (RETAILER) */}
                <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                      Debtor / Kirana Retailer
                    </span>
                    <span className="text-[10px] px-2 py-0.2 rounded-full bg-slate-200 font-semibold text-slate-700">
                      Payer
                    </span>
                  </div>
                  <h4 className="text-sm font-bold text-slate-900">{voucher.payer.name}</h4>
                  <div className="text-xs text-slate-600 space-y-0.5">
                    <div>GSTIN: <span className="font-mono font-bold text-slate-800">{voucher.payer.gstin}</span></div>
                    {voucher.payer.pan && <div>PAN: <span className="font-mono text-slate-700">{voucher.payer.pan}</span></div>}
                    <div className="text-slate-500 text-[11px]">{voucher.payer.address}</div>
                    {voucher.payer.contactNumber && (
                      <div className="text-slate-500 text-[11px]">Contact: {voucher.payer.contactNumber}</div>
                    )}
                  </div>
                </div>

                {/* PAYEE (WHOLESALER) */}
                <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                      Creditor / Wholesaler Depot
                    </span>
                    <span className="text-[10px] px-2 py-0.2 rounded-full bg-blue-100 font-semibold text-blue-700">
                      Payee
                    </span>
                  </div>
                  <h4 className="text-sm font-bold text-slate-900">{voucher.payee.name}</h4>
                  <div className="text-xs text-slate-600 space-y-0.5">
                    <div>GSTIN: <span className="font-mono font-bold text-slate-800">{voucher.payee.gstin}</span></div>
                    {voucher.payee.pan && <div>PAN: <span className="font-mono text-slate-700">{voucher.payee.pan}</span></div>}
                    <div className="text-slate-500 text-[11px]">{voucher.payee.address}</div>
                    {voucher.payee.contactNumber && (
                      <div className="text-slate-500 text-[11px]">Godown: {voucher.payee.contactNumber}</div>
                    )}
                  </div>
                </div>
              </div>

              {/* FINANCIAL BREAKDOWN CARDS */}
              <div className="grid grid-cols-3 gap-3">
                <div className="p-3.5 rounded-xl border border-slate-200 bg-white shadow-sm space-y-1">
                  <span className="text-[10px] uppercase font-bold text-slate-500">Opening Balance</span>
                  <div className="text-base font-mono font-bold text-slate-900">
                    ₹{voucher.openingBalance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </div>
                  <span className="text-[10px] text-slate-400">Total trade debit outstanding</span>
                </div>

                <div className="p-3.5 rounded-xl border border-emerald-200 bg-emerald-50/50 shadow-sm space-y-1">
                  <span className="text-[10px] uppercase font-bold text-emerald-700">Repayment Credited</span>
                  <div className="text-base font-mono font-bold text-emerald-700">
                    - ₹{voucher.amountPaid.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </div>
                  <span className="text-[10px] text-emerald-600 font-medium">Lump-sum cleared via {voucher.paymentMethod.toUpperCase()}</span>
                </div>

                <div className="p-3.5 rounded-xl border border-blue-200 bg-blue-50/40 shadow-sm space-y-1">
                  <span className="text-[10px] uppercase font-bold text-blue-800">Closing Balance</span>
                  <div className="text-base font-mono font-bold text-blue-900">
                    ₹{voucher.closingBalance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </div>
                  <span className="text-[10px] text-blue-600 font-medium">Net remaining Khata debt</span>
                </div>
              </div>

              {/* DOUBLE-ENTRY JOURNAL SECTION */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                    <Building2 className="w-3.5 h-3.5 text-blue-600" />
                    Double-Entry General Journal (Statutory CA Audit)
                  </span>
                  <span className="text-[10px] font-mono text-slate-400">Golden Rules of Accounting</span>
                </div>

                <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-sm">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-100 text-slate-600 font-semibold border-b border-slate-200">
                      <tr>
                        <th className="py-2.5 px-3">Account Particulars & Head</th>
                        <th className="py-2.5 px-3 text-right">Debit (₹)</th>
                        <th className="py-2.5 px-3 text-right">Credit (₹)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      <tr>
                        <td className="py-2.5 px-3">
                          <span className="font-bold text-slate-900">{voucher.journalEntry.debitAccount}</span>
                          <span className="ml-2 text-[10px] font-medium text-emerald-600">(Asset Increased)</span>
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900">
                          ₹{voucher.journalEntry.debitAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono text-slate-400">—</td>
                      </tr>
                      <tr>
                        <td className="py-2.5 px-3 pl-8">
                          <span className="text-slate-700">To <strong className="text-slate-900">{voucher.journalEntry.creditAccount}</strong></span>
                          <span className="ml-2 text-[10px] font-medium text-blue-600">(Sundry Debtor Cleared)</span>
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono text-slate-400">—</td>
                        <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900">
                          ₹{voucher.journalEntry.creditAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </td>
                      </tr>
                    </tbody>
                    <tfoot className="bg-slate-50 border-t border-slate-200 text-slate-700 font-semibold">
                      <tr>
                        <td className="py-2 px-3 text-[11px] italic text-slate-500">
                          Narration: {voucher.journalEntry.narration}
                        </td>
                        <td className="py-2 px-3 text-right font-mono font-bold text-slate-900">
                          ₹{voucher.journalEntry.debitAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="py-2 px-3 text-right font-mono font-bold text-slate-900">
                          ₹{voucher.journalEntry.creditAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>

              {/* CRYPTOGRAPHIC DIGITAL SIGNATURE SEAL */}
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-600">
                    <ShieldCheck className="w-4 h-4" />
                    <span>Cryptographic Tamper-Proof Seal (SHA-256)</span>
                  </div>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-mono font-bold border border-emerald-200">
                    STATUS: VERIFIED IMMUTABLE
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2 bg-white p-2 rounded-lg font-mono text-[11px] text-slate-700 border border-slate-200">
                  <span className="truncate">{voucher.digitalSignatureHash}</span>
                  <button
                    onClick={handleCopyHash}
                    className="flex-shrink-0 p-1 rounded hover:bg-slate-100 text-slate-500 hover:text-slate-900 transition"
                    title="Copy SHA-256 Signature"
                  >
                    {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
                <p className="text-[10px] text-slate-400 leading-relaxed">
                  This settlement voucher is mathematically sealed using SHA-256 digital hashing over voucher number, receipt reference, trade party GSTINs, and closing ledger balance in compliance with Section 134 of the Indian Companies Act &amp; GST B2B record-keeping standards.
                </p>
              </div>
            </>
          ) : null}
        </div>

        {/* MODAL FOOTER */}
        <div className="px-6 py-3.5 border-t border-slate-100 bg-slate-50 flex items-center justify-between">
          <span className="text-xs text-slate-500">
            Official B2B Khata Settlement Record &bull; SharVin SaaS
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={handleDownloadCsv}
              disabled={isDownloading || !voucher}
              className="px-3.5 py-1.5 text-xs font-semibold text-white bg-blue-600 rounded-xl hover:bg-blue-700 transition shadow-sm disabled:opacity-50"
            >
              Download CA Spreadsheet
            </button>
            <button
              onClick={onClose}
              className="px-4 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-xl hover:bg-slate-100 transition shadow-sm"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </ModalBackdrop>
  );
};
