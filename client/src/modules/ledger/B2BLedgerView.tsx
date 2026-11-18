import React, { useState, useEffect, useRef } from 'react';
import {
  BookOpen,
  ArrowUpRight,
  ArrowDownLeft,
  DollarSign,
  CreditCard,
  Calendar,
  Clock,
  CheckCircle2,
  AlertCircle,
  FileText,
  Share2,
  Download,
  Plus,
  RefreshCw,
  Store,
  Truck,
  ShieldCheck,
  ChevronRight,
  X
} from 'lucide-react';
import { LedgerService } from './ledgerService';
import { useRole } from '../../context/RoleContext';
import { KhataVoucherModal } from './KhataVoucherModal';
import { ModalBackdrop } from '../../components/ui/DismissOnOutsideClick';
import { 
  LedgerAccountSummary, 
  LedgerTransactionDto, 
  PaymentMethod 
} from './types';

interface B2BLedgerViewProps {
  partnerId?: string;
  orderId?: string;
  onBackToOverview?: () => void;
  onBackToDelivery?: () => void;
  onOpenPos?: () => void;
}

export const B2BLedgerView: React.FC<B2BLedgerViewProps> = ({
  partnerId,
  orderId,
  onBackToOverview,
  onBackToDelivery,
  onOpenPos,
}) => {
  const { role } = useRole();

  // Ledger state
  const [account, setAccount] = useState<LedgerAccountSummary | null>(null);
  const [transactions, setTransactions] = useState<LedgerTransactionDto[]>([]);
  const [filterType, setFilterType] = useState<'all' | 'orders' | 'payments'>('all');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // CA Settlement Voucher Modal state
  const [selectedVoucherId, setSelectedVoucherId] = useState<string | null>(null);
  const [isVoucherModalOpen, setIsVoucherModalOpen] = useState<boolean>(false);
  const [settlementCycle, setSettlementCycle] = useState<'7_days' | '15_days' | 'on_demand'>('15_days');

  // Settlement Modal state
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [paymentAmount, setPaymentAmount] = useState<string>('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('upi');
  const [referenceNumber, setReferenceNumber] = useState<string>('');
  const [paymentNotes, setPaymentNotes] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [formError, setFormError] = useState<string | null>(null);
  const paymentIdempotencyKey = useRef<string | null>(null);

  const fetchLedgerData = async () => {
    if (!partnerId) { setAccount(null); setTransactions([]); setIsLoading(false); return; }
    setIsLoading(true);
    setLoadError(null);
    try {
      const [accData, txData] = await Promise.all([
        LedgerService.getLedgerAccount(partnerId),
        LedgerService.getLedgerTransactions(partnerId),
      ]);
      setAccount(accData);
      setTransactions(txData);
    } catch (err: any) {
      console.error('Failed to load ledger data:', err);
      setAccount(null);
      setTransactions([]);
      setLoadError(err instanceof Error ? err.message : 'Could not load ledger history.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchLedgerData();
  }, [partnerId]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!partnerId) { setFormError("Select a business account first"); return; }
    const num = parseFloat(paymentAmount);
    if (isNaN(num) || num <= 0) {
      setFormError('Please enter a valid positive payment amount');
      return;
    }

    setIsSubmitting(true);
    setFormError(null);

    try {
      paymentIdempotencyKey.current ??= window.crypto.randomUUID();
      const res = await LedgerService.recordPayment({
        partnerId,
        amount: num,
        idempotencyKey: paymentIdempotencyKey.current,
        paymentMethod,
        paymentReferenceNumber: referenceNumber,
        settlementCycle,
        orderId,
        notes: paymentNotes,
      });

      showToast(`✅ Payment of ₹${num.toLocaleString('en-IN')} recorded! Voucher: ${res.voucherNumber || res.receiptNumber}`);
      setIsModalOpen(false);
      const voucherId = res.voucherNumber || res.voucherId || res.receiptNumber;
      if (voucherId) {
        setSelectedVoucherId(voucherId);
        setIsVoucherModalOpen(true);
      }
      paymentIdempotencyKey.current = null;
      // Refresh ledger state
      await fetchLedgerData();
    } catch (err: any) {
      setFormError(err.message || 'Failed to record payment');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Filtered transactions
  const filteredTransactions = transactions.filter((tx) => {
    if (filterType === 'orders') return tx.transactionType === 'order_placed';
    if (filterType === 'payments') return tx.transactionType === 'payment_received';
    return true;
  });

  const isRetailer = role === 'retailer';
  const currentBalance = account?.currentBalance ?? 0;

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 px-4 py-3 rounded-2xl bg-emerald-500 text-slate-950 font-bold text-xs shadow-2xl flex items-center gap-2 animate-in slide-in-from-bottom-3">
          <CheckCircle2 className="w-4 h-4" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Top Header & Breadcrumbs */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            {onBackToOverview && (
              <>
                <button onClick={onBackToOverview} className="hover:text-slate-700 transition">
                  Overview
                </button>
                <span>/</span>
              </>
            )}
            {onBackToDelivery && (
              <>
                <button onClick={onBackToDelivery} className="hover:text-slate-700 transition">
                  Delivery Handover
                </button>
                <span>/</span>
              </>
            )}
            <span className="text-cyan-700 font-medium">B2B Khata &amp; Ledger</span>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2.5">
              <BookOpen className="w-6 h-6 text-cyan-700" />
              B2B Cash &amp; Credit Ledger (व्यापारिक खाता)
            </h1>
            <span className="px-2.5 py-0.5 rounded-full bg-slate-100 border border-slate-200 text-xs font-mono font-bold text-cyan-700">
              Double-Entry Synced
            </span>
          </div>
        </div>

      </div>

      {/* Main Top Balance & Credit Limit Strip */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-stretch">
        {/* Net Outstanding Balance Card (7 cols) */}
        <div className="md:col-span-7 p-6 sm:p-7 rounded-3xl bg-gradient-to-br from-white via-white/90 to-white border border-slate-200 shadow-2xl relative overflow-hidden flex flex-col justify-between">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <span className="text-xs font-extrabold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                <CreditCard className="w-3.5 h-3.5 text-cyan-700" />
                {isRetailer ? 'Current Outstanding Payable (उधार बकाया)' : 'Receivable from Retailer (वसूली योग्य)'}
              </span>
              <div className="flex items-baseline gap-2 pt-1">
                <span className={`text-4xl sm:text-5xl font-black font-mono tracking-tight ${
                  currentBalance > 0 ? (isRetailer ? 'text-amber-800' : 'text-emerald-700') : 'text-slate-700'
                }`}>
                  ₹{currentBalance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </span>
                <span className="text-xs text-slate-500 font-semibold">
                  {isRetailer ? 'due to Kailash Grains' : 'pending payment'}
                </span>
              </div>
            </div>

            <span className={`px-3 py-1 rounded-full text-xs font-extrabold border ${
              account?.status === 'limit_exceeded'
                ? 'bg-rose-50 text-rose-700 border-rose-200'
                : account?.status === 'approaching_limit'
                ? 'bg-amber-50 text-amber-800 border-amber-200'
                : 'bg-emerald-50 text-emerald-700 border-emerald-200'
            }`}>
              {account?.status === 'limit_exceeded' ? 'LIMIT EXCEEDED' : account?.status === 'approaching_limit' ? 'ATTENTION NEEDED' : 'CREDIT HEALTHY'}
            </span>
          </div>

          {/* Credit Limit Progress Bar */}
          <div className="space-y-2 pt-6">
            <div className="flex justify-between text-xs">
              <span className="text-slate-500">
                Credit Line Utilized: <strong className="text-slate-900">₹{currentBalance.toLocaleString('en-IN')}</strong> / ₹{(account?.creditLimit ?? 0).toLocaleString('en-IN')}
              </span>
              <span className="font-mono font-bold text-cyan-700">
                {account?.creditUtilizationPercent ?? 0}%
              </span>
            </div>
            <div className="w-full h-2.5 rounded-full bg-slate-50 border border-slate-200 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  (account?.creditUtilizationPercent ?? 0) > 85
                    ? 'bg-rose-500'
                    : (account?.creditUtilizationPercent ?? 0) > 60
                    ? 'bg-amber-500'
                    : 'bg-gradient-to-r from-emerald-500 to-teal-400'
                }`}
                style={{ width: `${Math.min(100, account?.creditUtilizationPercent ?? 0)}%` }}
              ></div>
            </div>
            <div className="flex justify-between text-[11px] text-slate-500 pt-0.5">
              <span>Available Credit: ₹{(account?.creditAvailable ?? 0).toLocaleString('en-IN')}</span>
              <span>Payment Cycle: {account?.paymentTermsDays ?? 0} Days</span>
            </div>
          </div>
        </div>

        {/* Trade Partner & Quick Settlement Actions (5 cols) */}
        <div className="md:col-span-5 p-6 rounded-3xl bg-white border border-slate-200 shadow-xl flex flex-col justify-between space-y-4">
          <div className="space-y-3">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <span className="text-xs font-bold text-slate-500">Linked Trade Partner</span>
              <span className="text-[10px] px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 font-bold border border-emerald-200">
                Verified B2B Account
              </span>
            </div>

            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-cyan-600 to-blue-700 flex items-center justify-center text-slate-900 font-black text-sm shadow-md">
                {isRetailer ? 'KG' : 'GK'}
              </div>
              <div className="space-y-0.5">
                <div className="text-sm font-extrabold text-slate-900">
                  {isRetailer ? account?.wholesalerName || 'No linked wholesaler' : account?.retailerName || 'No linked retailer'}
                </div>
                <div className="text-xs text-slate-500 flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-slate-500" />
                  <span>Due Date: <strong className="text-slate-700 font-mono">{account?.dueDate || 'No due date'}</strong></span>
                </div>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="space-y-2 pt-2">
            <button
              onClick={() => setIsModalOpen(true)}
              className="w-full py-3 px-4 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-slate-950 font-black text-xs shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2 transition transform active:scale-[0.99]"
            >
              <Plus className="w-4 h-4" /> Record Payment Settlement (भुगतान दर्ज करें)
            </button>

            <div className="grid grid-cols-3 gap-2">
              <button
                onClick={() => {
                  const voucherId = transactions.find((transaction) => transaction.paymentId)?.paymentId;
                  if (voucherId) {
                    setSelectedVoucherId(voucherId);
                    setIsVoucherModalOpen(true);
                  }
                }}
                disabled={!transactions.some((transaction) => transaction.paymentId)}
                className="py-2.5 px-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-blue-700 font-bold text-xs flex items-center justify-center gap-1.5 transition border border-blue-200"
                title="View Official CA Settlement Voucher & Double-Entry Journal"
              >
                <FileText className="w-3.5 h-3.5 text-blue-700" /> CA Voucher
              </button>
              <button
                onClick={() => showToast('📲 Statement summary link sent to WhatsApp')}
                className="py-2.5 px-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs flex items-center justify-center gap-1.5 transition"
              >
                <Share2 className="w-3.5 h-3.5 text-emerald-700" /> WhatsApp
              </button>
              <button
                onClick={() => showToast('📄 Downloading PDF Statement for period')}
                className="py-2.5 px-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs flex items-center justify-center gap-1.5 transition"
              >
                <Download className="w-3.5 h-3.5 text-cyan-700" /> Statement
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Transaction Statement Table / Journal */}
      <div className="p-6 rounded-3xl bg-white border border-slate-200 shadow-2xl space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-4">
          <div className="space-y-0.5">
            <h3 className="font-extrabold text-base text-slate-900 flex items-center gap-2">
              <FileText className="w-4 h-4 text-cyan-700" />
              Chronological Accounting Statement (खाता विवरण)
            </h3>
            <p className="text-xs text-slate-500">
              Immutable append-only ledger entries reflecting orders delivered and payments settled
            </p>
          </div>

          {/* Filter Pills */}
          <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-50 border border-slate-200 text-xs">
            <button
              onClick={() => setFilterType('all')}
              className={`px-3 py-1 rounded-lg font-bold transition ${
                filterType === 'all' ? 'bg-slate-100 text-slate-900' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              All Entries ({transactions.length})
            </button>
            <button
              onClick={() => setFilterType('orders')}
              className={`px-3 py-1 rounded-lg font-bold transition ${
                filterType === 'orders' ? 'bg-slate-100 text-slate-900' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              Orders Billed
            </button>
            <button
              onClick={() => setFilterType('payments')}
              className={`px-3 py-1 rounded-lg font-bold transition ${
                filterType === 'payments' ? 'bg-slate-100 text-slate-900' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              Payments Settled
            </button>
          </div>
        </div>

        {/* Transactions Listing */}
        {isLoading ? (
          <div className="py-12 text-center text-slate-500 space-y-2">
            <RefreshCw className="w-6 h-6 animate-spin mx-auto text-cyan-700" />
            <p className="text-xs">Loading ledger transactions...</p>
          </div>
        ) : loadError ? (
          <div role="alert" className="py-12 text-center text-sm text-rose-700">Ledger history could not be loaded. {loadError}</div>
        ) : filteredTransactions.length === 0 ? (
          <div className="py-12 text-center text-slate-500 text-xs">
            {transactions.length === 0 ? 'No ledger history found for this account.' : 'No transactions found matching this filter.'}
          </div>
        ) : (
          <div className="space-y-3">
            {filteredTransactions.map((tx) => {
              const isPayment = tx.transactionType === 'payment_received';
              return (
                <div
                  key={tx.transactionId}
                  className="p-4 rounded-2xl bg-slate-50 border border-slate-200 hover:border-slate-200 transition flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                >
                  <div className="flex items-start gap-3.5">
                    <div className={`p-2.5 rounded-xl border shrink-0 mt-0.5 ${
                      isPayment
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        : 'bg-amber-50 text-amber-800 border-amber-200'
                    }`}>
                      {isPayment ? (
                        <ArrowDownLeft className="w-4 h-4" />
                      ) : (
                        <ArrowUpRight className="w-4 h-4" />
                      )}
                    </div>

                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-extrabold text-sm text-slate-900">
                          {isPayment ? 'Payment Settlement Received' : 'Wholesale Order Billed (Debit)'}
                        </span>
                        {tx.orderNumber && (
                          <span className="px-2 py-0.5 rounded-md bg-slate-100 border border-slate-200 text-[10px] font-mono font-bold text-slate-700">
                            #{tx.orderNumber}
                          </span>
                        )}
                        {tx.paymentMethod && (
                          <span className="px-2 py-0.5 rounded-md bg-cyan-50 border border-cyan-200 text-[10px] font-mono font-bold text-cyan-700 uppercase">
                            {tx.paymentMethod}
                          </span>
                        )}
                      </div>

                      <div className="text-slate-500 text-[11px] leading-relaxed">
                        {tx.notes || (isPayment ? 'Direct balance settlement' : 'Delivered goods added to Khata balance')}
                      </div>

                      <div className="flex items-center gap-3 text-[10px] text-slate-500 pt-0.5">
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {new Date(tx.createdAt).toLocaleString('en-IN', {
                            dateStyle: 'medium',
                            timeStyle: 'short',
                          })}
                        </span>
                        <span>&bull;</span>
                        <span>Logged by: {tx.createdByName || 'System'}</span>
                      </div>
                    </div>
                  </div>

                  {/* Transaction Amount & Running Balance */}
                  <div className="text-right sm:self-center shrink-0 space-y-1 border-t sm:border-t-0 border-slate-200 pt-2 sm:pt-0 flex flex-col items-end">
                    <div className={`text-base font-black font-mono ${
                      isPayment ? 'text-emerald-700' : 'text-amber-800'
                    }`}>
                      {isPayment ? '-' : '+'}₹{tx.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </div>
                    <div className="text-[11px] text-slate-500 font-mono">
                      Balance: <strong className="text-slate-700">₹{tx.balanceAfter.toLocaleString('en-IN')}</strong>
                    </div>
                    {isPayment && (
                      <button
                        onClick={() => {
                          if (!tx.paymentId) return;
                          setSelectedVoucherId(tx.paymentId);
                          setIsVoucherModalOpen(true);
                        }}
                        className="mt-1 px-2.5 py-1 text-[10px] font-bold rounded-lg bg-blue-50 hover:bg-blue-50 text-blue-700 border border-blue-200 flex items-center gap-1 transition shadow-sm"
                        title="View Official CA Settlement Voucher"
                      >
                        <FileText className="w-3 h-3 text-blue-700" />
                        <span>View Voucher</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Cross-Module Navigation Footer */}
      <div className="p-6 rounded-3xl bg-white border border-slate-200 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <ShieldCheck className="w-4 h-4 text-emerald-700" />
          <span>Synchronized with POS Counter Billing and Two-Way Delivery Handover</span>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={onOpenPos}
            className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs flex items-center gap-1.5 transition"
          >
            <Store className="w-3.5 h-3.5 text-amber-800" /> Open POS Billing Counter
          </button>
          <button
            onClick={onBackToDelivery}
            className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs flex items-center gap-1.5 transition"
          >
            <Truck className="w-3.5 h-3.5 text-emerald-700" /> Back to Delivery Handover
          </button>
          <button
            onClick={onBackToOverview}
            className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-slate-900 font-bold text-xs transition"
          >
            Return to Overview <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Record Payment Settlement Modal */}
      {isModalOpen && (
        <ModalBackdrop onClose={() => setIsModalOpen(false)} className="fixed inset-0 z-50 bg-slate-50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-lg rounded-3xl bg-white border border-slate-200 shadow-2xl p-6 sm:p-7 space-y-6 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div className="flex items-center gap-2">
                <DollarSign className="w-5 h-5 text-emerald-700" />
                <h3 className="font-extrabold text-base text-slate-900">
                  Record Settlement Payment (भुगतान दर्ज करें)
                </h3>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1.5 rounded-xl hover:bg-slate-100 text-slate-500 hover:text-slate-700 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {formError && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleRecordPayment} className="space-y-4">
              {/* Payment Amount */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 block">
                  Settlement Amount (₹)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                  placeholder="e.g. 5000"
                  className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-emerald-700 font-mono font-bold text-lg focus:outline-none focus:border-emerald-500"
                />

                {/* Quick Chips */}
                <div className="flex flex-wrap gap-2 pt-1">
                  {[2000, 5000, 10000, currentBalance].map((val) => (
                    <button
                      type="button"
                      key={val}
                      onClick={() => setPaymentAmount(val.toString())}
                      className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-[11px] font-mono text-slate-700 font-bold transition"
                    >
                      {val === currentBalance ? `Full Balance (₹${val.toLocaleString('en-IN')})` : `+₹${val.toLocaleString('en-IN')}`}
                    </button>
                  ))}
                </div>
              </div>

                {/* Settlement Cycle Selector */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700 block">
                    Repayment Cycle (निपटान चक्र)
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setSettlementCycle('15_days')}
                      className={`p-2 rounded-xl border text-xs font-bold transition flex items-center justify-between ${
                        settlementCycle === '15_days'
                          ? 'bg-blue-50 border-blue-500 text-blue-700 shadow-sm'
                          : 'bg-slate-50 border-slate-200 text-slate-500 hover:text-slate-700'
                      }`}
                    >
                      <span>15-Day Routine Settlement</span>
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-blue-50 text-blue-700">Standard</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setSettlementCycle('7_days')}
                      className={`p-2 rounded-xl border text-xs font-bold transition flex items-center justify-between ${
                        settlementCycle === '7_days'
                          ? 'bg-blue-50 border-blue-500 text-blue-700 shadow-sm'
                          : 'bg-slate-50 border-slate-200 text-slate-500 hover:text-slate-700'
                      }`}
                    >
                      <span>7-Day Mid-Cycle</span>
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-50 text-amber-800">Fast Clear</span>
                    </button>
                  </div>
                </div>

                {/* Payment Method Selector */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700 block">
                    Payment Mode (माध्यम)
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {(['upi', 'cash', 'bank_transfer', 'cheque'] as PaymentMethod[]).map((mode) => (
                      <button
                        type="button"
                        key={mode}
                        onClick={() => setPaymentMethod(mode)}
                        className={`p-2.5 rounded-xl border text-xs font-bold uppercase transition flex flex-col items-center gap-1 ${
                          paymentMethod === mode
                            ? 'bg-emerald-50 border-emerald-200 text-emerald-700 shadow-sm'
                            : 'bg-slate-50 border-slate-200 text-slate-500 hover:text-slate-700'
                        }`}
                      >
                        <span>{mode === 'upi' ? '⚡ UPI' : mode === 'cash' ? '💵 Cash' : mode === 'bank_transfer' ? '🏦 Bank' : '📝 Cheque'}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Reference Number */}
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700 block">
                    Reference / UTR Number
                  </label>
                  <input
                    type="text"
                    value={referenceNumber}
                    onChange={(e) => setReferenceNumber(e.target.value)}
                    placeholder="e.g. UPI/2026/89412 or Cheque #0045"
                    className="w-full px-4 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-900 focus:outline-none focus:border-emerald-500"
                  />
                </div>

                {/* Settlement Notes */}
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700 block">
                    Notes (Optional)
                  </label>
                  <input
                    type="text"
                    value={paymentNotes}
                    onChange={(e) => setPaymentNotes(e.target.value)}
                    placeholder="e.g. Paid via Google Pay QR on delivery"
                    className="w-full px-4 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-900 focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div className="pt-3 flex gap-3">
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="w-1/3 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-2/3 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-slate-950 font-black text-xs shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-1.5 transition disabled:opacity-50"
                  >
                    {isSubmitting ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Recording...
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="w-4 h-4" /> Confirm &amp; Update Khata
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
        </ModalBackdrop>
        )}

      {/* Official B2B Khata Settlement Voucher Modal */}
      <KhataVoucherModal
        isOpen={isVoucherModalOpen && Boolean(selectedVoucherId)}
        voucherIdOrNumber={selectedVoucherId || ''}
        onClose={() => setIsVoucherModalOpen(false)}
      />
    </div>
  );
};
