import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  Printer,
  ArrowLeft,
  CheckCircle2,
  RefreshCw
} from 'lucide-react';
import { PublicInvoiceVerificationResult } from './invoiceTypes';

export const PublicInvoiceVerifyView: React.FC = () => {
  const { invoiceId } = useParams<{ invoiceId: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState<boolean>(true);
  const [verification, setVerificationResult] = useState<PublicInvoiceVerificationResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (invoiceId) {
      verifyInvoice(invoiceId);
    }
  }, [invoiceId]);

  const verifyInvoice = async (id: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/invoices/verify/${encodeURIComponent(id)}`);
      const data = await res.json();
      if (!res.ok && !data.data) {
        setError(data.error || 'Verification service unreachable.');
        return;
      }
      setVerificationResult(data.data || null);
    } catch (err: any) {
      setError(err.message || 'Verification service unreachable.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FAFAFA] text-slate-800 p-4 sm:p-6 lg:p-8 font-sans">
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Top Header */}
        <div className="flex items-center justify-between border-b border-slate-200 pb-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate(-1)}
              className="p-2 rounded-xl bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 shadow-xs"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div>
              <div className="flex items-center gap-2 text-xs font-bold text-blue-600 uppercase tracking-wider">
                <span>SharVin Digital Tax Seal</span> &bull; <span>Govt GSTN Verifier</span>
              </div>
              <h1 className="text-xl font-black text-slate-900 tracking-tight">
                Cryptographic Invoice Verification
              </h1>
            </div>
          </div>

          <button
            onClick={() => window.print()}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white border border-slate-200 text-slate-700 text-xs font-semibold shadow-xs hover:bg-slate-50"
          >
            <Printer className="w-4 h-4 text-blue-600" />
            Print Certificate
          </button>
        </div>

        {loading ? (
          <div className="py-24 text-center space-y-3 bg-white border border-slate-200 rounded-2xl shadow-xs">
            <RefreshCw className="w-8 h-8 text-blue-600 animate-spin mx-auto" />
            <p className="text-xs font-bold text-slate-600">Verifying digital signature against SharVin ledger...</p>
          </div>
        ) : error ? (
          <div className="p-6 bg-rose-50 border border-rose-200 rounded-2xl text-center space-y-2">
            <AlertTriangle className="w-10 h-10 text-rose-600 mx-auto" />
            <h3 className="font-bold text-rose-900">Verification Failure</h3>
            <p className="text-xs text-rose-700">{error}</p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Verification Status Card */}
            {verification?.authentic && !verification.isTampered ? (
              <div className="p-5 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-900 shadow-xs space-y-2">
                <div className="flex items-center gap-2.5 font-bold text-sm">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                  <span>✓ Official Authentic Tax Invoice Verified</span>
                </div>
                <p className="text-xs text-emerald-700">
                  {verification.message} This invoice was digitally signed upon delivery confirmation.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-emerald-800 pt-2">
                  <span><strong>Invoice:</strong> {verification.invoiceNumber}</span>
                  <span><strong>Issuer:</strong> {verification.issuerName || 'Verified SharVin supplier'}</span>
                  <span><strong>Issued:</strong> {verification.issuedAt ? new Date(verification.issuedAt).toLocaleDateString('en-IN') : 'Not available'}</span>
                  <span><strong>Total:</strong> {verification.totalInvoiceAmount !== undefined ? `₹${verification.totalInvoiceAmount.toFixed(2)}` : 'Not available'}</span>
                </div>
              </div>
            ) : (
              <div className="p-5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-900 shadow-xs space-y-2">
                <div className="flex items-center gap-2.5 font-bold text-sm text-rose-700">
                  <AlertTriangle className="w-5 h-5 text-rose-600 animate-bounce" />
                  <span>⚠️ INTEGRITY BREACH: INVALID / TAMPERED INVOICE</span>
                </div>
                <p className="text-xs text-rose-700">
                  {verification?.tamperDetails || 'The digital signature hash does not match server records. Payload has been altered.'}
                </p>
              </div>
            )}

          </div>
        )}
      </div>
    </div>
  );
};
