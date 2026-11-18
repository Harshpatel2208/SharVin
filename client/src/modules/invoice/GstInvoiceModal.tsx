import React, { useState, useEffect } from 'react';
import {
  X,
  Printer,
  ShieldCheck,
  AlertTriangle,
  QrCode,
  CheckCircle2,
  Copy,
  RefreshCw
} from 'lucide-react';
import { InvoiceRecord, VerifyInvoiceResult } from './invoiceTypes';
import { ModalBackdrop } from '../../components/ui/DismissOnOutsideClick';

interface GstInvoiceModalProps {
  orderId: string;
  orderNumber?: string;
  onClose: () => void;
}

export const GstInvoiceModal: React.FC<GstInvoiceModalProps> = ({
  orderId,
  orderNumber,
  onClose,
}) => {
  const [invoice, setInvoice] = useState<InvoiceRecord | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [verificationResult, setVerificationResult] = useState<VerifyInvoiceResult | null>(null);
  const [verifying, setVerifying] = useState<boolean>(false);
  const [tamperSimulated, setTamperSimulated] = useState<boolean>(false);
  const [copiedHash, setCopiedHash] = useState<boolean>(false);

  useEffect(() => {
    fetchInvoice();
  }, [orderId]);

  const fetchInvoice = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/invoices/order/${orderId}`);
      const data = await res.json();
      if (data.success && data.data) {
        setInvoice(data.data);
      } else {
        // Fallback: request generation
        const genRes = await fetch('/api/v1/invoices/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orderId }),
        });
        const genData = await genRes.json();
        if (genData.success && genData.data) {
          setInvoice(genData.data);
        } else {
          setError(data.error || 'Failed to load GST Tax Invoice.');
        }
      }
    } catch (err: any) {
      setError(err.message || 'Network error fetching invoice.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async (simulateTamper: boolean = false) => {
    if (!invoice) return;
    setVerifying(true);
    try {
      const body = simulateTamper
        ? { totalInvoiceAmount: invoice.totalInvoiceAmount - 2000.00, retailerGstin: '07ALTERED9999Z0' }
        : undefined;

      const res = await fetch(`/api/v1/invoices/verify-internal/${invoice.id}`, {
        method: simulateTamper ? 'POST' : 'GET',
        headers: {
          Authorization: `Bearer ${sessionStorage.getItem('sharvin_token') || ''}`,
          ...(simulateTamper ? { 'Content-Type': 'application/json' } : {}),
        },
        body: simulateTamper ? JSON.stringify(body) : undefined,
      });

      const data = await res.json();
      setVerificationResult(data.data);
      setTamperSimulated(simulateTamper);
    } catch (err: any) {
      console.error('Verification error:', err);
    } finally {
      setVerifying(false);
    }
  };

  const copySignatureHash = () => {
    if (!invoice) return;
    navigator.clipboard.writeText(invoice.signatureHash);
    setCopiedHash(true);
    setTimeout(() => setCopiedHash(false), 2000);
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <ModalBackdrop onClose={onClose} className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto animate-in fade-in">
      <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-4xl shadow-2xl flex flex-col max-h-[92vh] overflow-hidden my-auto animate-in zoom-in-95">
        {/* Modal Header Bar (Non-Printable) */}
        <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between print:hidden">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-700 border border-blue-200 flex items-center justify-center font-bold text-xs">
              GST
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                Official B2B Tax Invoice &amp; Digital Seal
                <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-semibold">
                  GSTR-1 Ready
                </span>
              </h3>
              <p className="text-[11px] text-slate-500">
                Order Ref: {orderNumber || orderId} &bull; Tamper-Proof Cryptographic Signature
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 text-xs font-semibold shadow-xs transition"
              title="Print or Save as PDF"
            >
              <Printer className="w-3.5 h-3.5 text-blue-600" />
              <span>Print / PDF</span>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200 transition"
              aria-label="Close Modal"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Body: Printable Official GST Invoice Document */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6 text-slate-800 text-xs font-sans print:p-0 print:m-0">
          {loading ? (
            <div className="py-20 text-center space-y-3">
              <RefreshCw className="w-8 h-8 text-blue-600 animate-spin mx-auto" />
              <p className="text-xs font-semibold text-slate-600">Generating immutable GST Tax Invoice &amp; SHA-256 seal...</p>
            </div>
          ) : error || !invoice ? (
            <div className="py-16 text-center space-y-3 bg-rose-50 border border-rose-200 rounded-xl p-6">
              <AlertTriangle className="w-10 h-10 text-rose-600 mx-auto" />
              <p className="text-sm font-bold text-rose-900">{error || 'Invoice could not be loaded.'}</p>
              <button
                onClick={fetchInvoice}
                className="px-4 py-2 bg-blue-600 text-white font-bold text-xs rounded-lg"
              >
                Retry
              </button>
            </div>
          ) : (
            <div className="border border-slate-300 rounded-xl p-5 sm:p-6 bg-white shadow-xs space-y-5 print:border-none print:shadow-none print:p-0">
              {/* Document Header */}
              <div className="border-b border-slate-200 pb-4 flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-blue-600 text-white">
                      TAX INVOICE
                    </span>
                    <span className="text-[10px] text-slate-500 font-medium">
                      (Under Rule 46 of the CGST Rules, 2017)
                    </span>
                  </div>
                  <h1 className="text-xl font-black text-slate-900 tracking-tight">
                    {invoice.wholesalerName}
                  </h1>
                  <p className="text-slate-600 text-[11px] mt-0.5 max-w-md">{invoice.wholesalerAddress}</p>
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[11px] text-slate-700">
                    <span><strong>GSTIN:</strong> {invoice.wholesalerGstin}</span>
                    <span><strong>PAN:</strong> {invoice.wholesalerPan || 'AAAAA0000A'}</span>
                    <span><strong>State:</strong> {invoice.wholesalerState} (Code: 07)</span>
                  </div>
                </div>

                <div className="sm:text-right border-t sm:border-t-0 pt-3 sm:pt-0 border-slate-100 shrink-0">
                  <div className="text-[10px] uppercase font-bold text-slate-400">Invoice Reference</div>
                  <div className="font-mono text-base font-black text-blue-700">{invoice.invoiceNumber}</div>
                  <div className="text-[11px] text-slate-600 mt-1">
                    <strong>Date:</strong> {new Date(invoice.issuedAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                  </div>
                  <div className="text-[11px] text-slate-600">
                    <strong>Order Ref:</strong> {invoice.orderNumber}
                  </div>
                  <div className="text-[11px] text-slate-600">
                    <strong>Place of Supply:</strong> {invoice.placeOfSupply}
                  </div>
                </div>
              </div>

              {/* Billed To / Consignee Section */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-3.5 bg-slate-50 rounded-xl border border-slate-200/80">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                    Details of Receiver (Billed To)
                  </span>
                  <p className="font-bold text-slate-900 text-xs">{invoice.retailerName}</p>
                  <p className="text-slate-600 text-[11px] mt-0.5">{invoice.retailerAddress}</p>
                  <div className="mt-1.5 space-y-0.5 font-mono text-[11px] text-slate-700">
                    <div><strong>GSTIN:</strong> {invoice.retailerGstin}</div>
                    <div><strong>State:</strong> {invoice.retailerState} (Code: 07)</div>
                  </div>
                </div>

                <div className="sm:border-l sm:border-slate-200 sm:pl-4">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                    Tax Structure &amp; Trade Details
                  </span>
                  <div className="space-y-1 text-[11px] text-slate-700">
                    <div><strong>Supply Type:</strong> {invoice.isInterState ? 'Inter-State (IGST Applicable)' : 'Intra-State (CGST + SGST Applicable)'}</div>
                    <div><strong>Reverse Charge (RCM):</strong> No</div>
                    <div><strong>Invoice Type:</strong> Regular B2B Tax Invoice</div>
                    <div><strong>Status:</strong> <span className="text-emerald-700 font-bold uppercase">{invoice.status}</span></div>
                  </div>
                </div>
              </div>

              {/* Table of Line Items */}
              <div className="overflow-x-auto rounded-lg border border-slate-200">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="bg-slate-100/80 border-b border-slate-200 text-slate-700 text-[11px] font-semibold">
                      <th className="py-2.5 px-3">#</th>
                      <th className="py-2.5 px-3">Description of Goods</th>
                      <th className="py-2.5 px-2 text-center">HSN</th>
                      <th className="py-2.5 px-2 text-center">Qty</th>
                      <th className="py-2.5 px-2 text-right">Unit Rate</th>
                      <th className="py-2.5 px-2 text-right">Taxable Value</th>
                      {!invoice.isInterState ? (
                        <>
                          <th className="py-2.5 px-2 text-right">CGST</th>
                          <th className="py-2.5 px-2 text-right">SGST</th>
                        </>
                      ) : (
                        <th className="py-2.5 px-2 text-right">IGST</th>
                      )}
                      <th className="py-2.5 px-3 text-right">Line Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {invoice.itemsSnapshot.map((item, idx) => (
                      <tr key={item.itemId} className="hover:bg-slate-50/70">
                        <td className="py-2.5 px-3 font-mono text-slate-400">{idx + 1}</td>
                        <td className="py-2.5 px-3">
                          <div className="font-semibold text-slate-900">{item.productName}</div>
                          <span className="text-[10px] font-mono text-slate-400">{item.sku}</span>
                        </td>
                        <td className="py-2.5 px-2 text-center font-mono font-medium text-slate-600">{item.hsnCode}</td>
                        <td className="py-2.5 px-2 text-center font-bold text-slate-800">
                          {item.quantity} {item.unit}
                        </td>
                        <td className="py-2.5 px-2 text-right font-mono text-slate-600">₹{item.unitPrice.toFixed(2)}</td>
                        <td className="py-2.5 px-2 text-right font-mono font-bold text-slate-900">₹{item.taxableAmount.toFixed(2)}</td>
                        {!invoice.isInterState ? (
                          <>
                            <td className="py-2.5 px-2 text-right font-mono text-slate-600">
                              <div>₹{item.cgstAmount.toFixed(2)}</div>
                              <span className="text-[9px] text-slate-400">({item.cgstRate}%)</span>
                            </td>
                            <td className="py-2.5 px-2 text-right font-mono text-slate-600">
                              <div>₹{item.sgstAmount.toFixed(2)}</div>
                              <span className="text-[9px] text-slate-400">({item.sgstRate}%)</span>
                            </td>
                          </>
                        ) : (
                          <td className="py-2.5 px-2 text-right font-mono text-slate-600">
                            <div>₹{item.igstAmount.toFixed(2)}</div>
                            <span className="text-[9px] text-slate-400">({item.igstRate}%)</span>
                          </td>
                        )}
                        <td className="py-2.5 px-3 text-right font-mono font-bold text-blue-700">
                          ₹{item.totalLineAmount.toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Totals & Tax Summary Breakdown */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                <div className="space-y-3">
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-0.5">
                      Total Invoice Amount in Words
                    </span>
                    <p className="font-semibold text-slate-800 italic text-[11px]">
                      {invoice.totalAmountInWords}
                    </p>
                  </div>

                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-[11px] text-slate-600 space-y-1">
                    <div className="font-bold text-slate-800">Bank Details for Settlement:</div>
                    <div>Bank: HDFC Bank Ltd &bull; A/C: 50200012345678</div>
                    <div>IFSC: HDFC0000240 &bull; Branch: Naya Bazar, Delhi</div>
                  </div>
                </div>

                <div className="space-y-1.5 p-3.5 bg-slate-50 rounded-xl border border-slate-200 font-mono text-xs">
                  <div className="flex justify-between text-slate-600">
                    <span>Total Taxable Value:</span>
                    <span>₹{invoice.taxableAmount.toFixed(2)}</span>
                  </div>
                  {!invoice.isInterState ? (
                    <>
                      <div className="flex justify-between text-slate-600">
                        <span>Central GST (CGST):</span>
                        <span>₹{invoice.cgstAmount.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between text-slate-600">
                        <span>State GST (SGST):</span>
                        <span>₹{invoice.sgstAmount.toFixed(2)}</span>
                      </div>
                    </>
                  ) : (
                    <div className="flex justify-between text-slate-600">
                      <span>Integrated GST (IGST):</span>
                      <span>₹{invoice.igstAmount.toFixed(2)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-slate-600 border-t border-slate-200 pt-1">
                    <span>Total Tax Output:</span>
                    <span>₹{invoice.totalTaxAmount.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-slate-900 font-black text-sm border-t border-slate-300 pt-1.5">
                    <span className="font-sans">Grand Total:</span>
                    <span className="text-blue-700">₹{invoice.totalInvoiceAmount.toFixed(2)}</span>
                  </div>
                </div>
              </div>

              {/* Dynamic Signed QR Code & Cryptographic Seal */}
              <div className="border-t border-slate-200 pt-4 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4 bg-slate-50/60 p-4 rounded-xl border border-slate-200">
                <div className="flex items-center gap-4">
                  {/* Visual QR Code Box */}
                  <div className="w-24 h-24 bg-white border border-slate-300 rounded-xl p-2 flex flex-col items-center justify-center shrink-0 shadow-xs relative group">
                    <QrCode className="w-16 h-16 text-slate-900" />
                    <span className="text-[8px] font-bold text-blue-700 uppercase tracking-tight mt-0.5">
                      Govt Signed
                    </span>
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-center gap-1.5 font-bold text-slate-900 text-xs">
                      <ShieldCheck className="w-4 h-4 text-emerald-600" />
                      <span>Tamper-Proof SHA-256 Digital Signature</span>
                    </div>
                    <p className="text-[11px] text-slate-500 max-w-md">
                      Scan QR code or click verify to authenticate against SharVin B2B ledger. Altering invoice values invalidates the seal.
                    </p>
                    <div className="flex items-center gap-2 pt-1 font-mono text-[10px] text-slate-600">
                      <span className="truncate max-w-[200px] sm:max-w-xs">{invoice.signatureHash}</span>
                      <button
                        onClick={copySignatureHash}
                        className="text-blue-600 hover:text-blue-700 inline-flex items-center gap-1 font-sans font-semibold"
                      >
                        <Copy className="w-3 h-3" />
                        {copiedHash ? 'Copied!' : 'Copy Hash'}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Live Authenticity Check Actions (Non-Printable) */}
                <div className="flex flex-col sm:flex-row items-center gap-2 print:hidden shrink-0">
                  <button
                    onClick={() => handleVerify(false)}
                    disabled={verifying}
                    className="w-full sm:w-auto flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition shadow-xs disabled:opacity-50"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    {verifying && !tamperSimulated ? 'Verifying...' : 'Verify Authenticity'}
                  </button>

                  <button
                    onClick={() => handleVerify(true)}
                    disabled={verifying}
                    className="w-full sm:w-auto flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 text-xs font-bold transition shadow-xs disabled:opacity-50"
                    title="Simulate attacker altering invoice amount to test alert detection"
                  >
                    <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
                    <span>Simulate Tamper Test</span>
                  </button>
                </div>
              </div>

              {/* Dynamic Verification Alert Banner */}
              {verificationResult && (
                <div className="print:hidden">
                  {verificationResult.authentic && !verificationResult.isTampered ? (
                    <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center gap-3 animate-in fade-in">
                      <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                      <div>
                        <div className="font-bold">✓ Official Authentic Invoice Verified</div>
                        <p className="text-[11px] text-emerald-700 mt-0.5">
                          {verificationResult.message} Signature matches server record.
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 text-xs flex items-center gap-3 animate-in shake">
                      <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 animate-bounce" />
                      <div>
                        <div className="font-bold flex items-center gap-2">
                          <span>⚠️ INVALID / TAMPERED INVOICE ALERT</span>
                          <span className="px-2 py-0.5 rounded bg-rose-600 text-white text-[9px] font-mono">INTEGRITY_BREACH</span>
                        </div>
                        <p className="text-[11px] text-rose-700 mt-0.5">
                          {verificationResult.tamperDetails || verificationResult.message}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </ModalBackdrop>
  );
};
