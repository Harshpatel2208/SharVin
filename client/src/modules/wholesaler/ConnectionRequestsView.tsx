import { useState, useEffect, useCallback } from 'react';
import { Users, Building2, Phone, MapPin, FileText, Loader2, AlertCircle, CheckCircle2, X } from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:5000';

interface RetailerInfo {
  id: string;
  fullName: string;
  businessName: string | null;
  phoneNumber: string;
  addresses: { city: string; state: string }[];
  retailerProfile: { gstNumber: string | null } | null;
}

interface PendingRequest {
  id: string;
  retailerId: string;
  wholesalerId: string;
  createdAt: string;
  retailer: RetailerInfo;
}

interface AcceptModalState {
  connectionId: string;
  retailerName: string;
  creditLimit: string;
  paymentTermDays: string;
}

export default function ConnectionRequestsView() {
  const [requests, setRequests] = useState<PendingRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<AcceptModalState | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const fetchRequests = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = sessionStorage.getItem('sharvin_token');
      const res = await fetch(`${API_BASE}/api/v1/wholesalers/requests/pending`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Failed to load requests');
      setRequests(json.data ?? []);
    } catch (err: any) {
      setError(err.message ?? 'Network error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const openModal = (req: PendingRequest) => {
    setModal({
      connectionId: req.id,
      retailerName: req.retailer.businessName ?? req.retailer.fullName,
      creditLimit: '50000',
      paymentTermDays: '30',
    });
  };

  const closeModal = () => {
    if (!submitting) setModal(null);
  };

  const handleAccept = async () => {
    if (!modal) return;
    const creditLimit = Number(modal.creditLimit);
    const paymentTermDays = Number(modal.paymentTermDays);
    if (isNaN(creditLimit) || creditLimit < 0) { alert('Enter a valid credit limit'); return; }
    if (isNaN(paymentTermDays) || paymentTermDays < 1) { alert('Enter valid payment terms (minimum 1 day)'); return; }

    setSubmitting(true);
    try {
      const token = sessionStorage.getItem('sharvin_token');
      const res = await fetch(`${API_BASE}/api/v1/wholesalers/requests/${modal.connectionId}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ creditLimit, paymentTermDays }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Failed to accept request');

      // Optimistic removal from list
      setRequests((prev) => prev.filter((r) => r.id !== modal.connectionId));
      showToast(`✓ Connected with ${modal.retailerName} — ₹${creditLimit.toLocaleString('en-IN')} credit granted`);
      setModal(null);
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
        <span className="ml-3 text-slate-600">Loading connection requests…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-3 p-4 bg-rose-50 border border-rose-200 rounded-lg text-rose-700 max-w-lg mx-auto mt-8">
        <AlertCircle className="w-5 h-5 flex-shrink-0" />
        <span>{error}</span>
        <button onClick={fetchRequests} className="ml-auto text-sm underline">Retry</button>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Toast */}
      {toastMessage && (
        <div className="fixed top-4 right-4 z-50 bg-emerald-600 text-white px-4 py-3 rounded-lg shadow-lg flex items-center gap-2 text-sm">
          <CheckCircle2 className="w-4 h-4" />
          {toastMessage}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 bg-purple-100 rounded-lg">
          <Users className="w-6 h-6 text-purple-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Connection Requests</h1>
          <p className="text-sm text-slate-500">Review and accept retailer partnership requests</p>
        </div>
        <span className="ml-auto text-sm text-slate-400">
          {requests.length} pending request{requests.length !== 1 ? 's' : ''}
        </span>
      </div>

      {requests.length === 0 ? (
        <div className="text-center py-16 text-slate-500">
          <Users className="w-12 h-12 mx-auto mb-3 text-slate-300" />
          <p className="font-medium">No pending requests</p>
          <p className="text-sm mt-1">New connection requests from retailers will appear here.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {requests.map((req) => {
            const retailer = req.retailer;
            const displayName = retailer.businessName ?? retailer.fullName;
            const location = retailer.addresses[0]
              ? [retailer.addresses[0].city, retailer.addresses[0].state].filter(Boolean).join(', ')
              : null;
            const requestedOn = new Date(req.createdAt).toLocaleDateString('en-IN', {
              day: 'numeric', month: 'short', year: 'numeric',
            });

            return (
              <div
                key={req.id}
                className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 flex flex-col sm:flex-row sm:items-center gap-4"
              >
                {/* Info */}
                <div className="flex-1 space-y-2">
                  <div className="flex items-center gap-2">
                    <Building2 className="w-5 h-5 text-purple-500 flex-shrink-0" />
                    <h2 className="font-semibold text-slate-900">{displayName}</h2>
                    <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full ml-auto sm:ml-0">
                      Requested {requestedOn}
                    </span>
                  </div>

                  <div className="flex flex-wrap gap-4 text-sm text-slate-500">
                    <span className="flex items-center gap-1.5">
                      <Phone className="w-4 h-4" />
                      {retailer.phoneNumber}
                    </span>
                    {location && (
                      <span className="flex items-center gap-1.5">
                        <MapPin className="w-4 h-4" />
                        {location}
                      </span>
                    )}
                    {retailer.retailerProfile?.gstNumber && (
                      <span className="flex items-center gap-1.5">
                        <FileText className="w-4 h-4" />
                        GST: {retailer.retailerProfile.gstNumber}
                      </span>
                    )}
                  </div>
                </div>

                {/* CTA */}
                <button
                  onClick={() => openModal(req)}
                  className="sm:flex-shrink-0 py-2 px-5 bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium rounded-lg transition-colors"
                >
                  Accept &amp; Set Terms
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Accept Modal */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-slate-900 text-lg">Set Credit Terms</h3>
              <button onClick={closeModal} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-sm text-slate-600 mb-5">
              Setting terms for <span className="font-semibold text-slate-900">{modal.retailerName}</span>
            </p>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Credit Limit (₹)
                </label>
                <input
                  type="number"
                  min="0"
                  value={modal.creditLimit}
                  onChange={(e) => setModal({ ...modal, creditLimit: e.target.value })}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  placeholder="e.g. 50000"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Payment Terms (Days)
                </label>
                <input
                  type="number"
                  min="1"
                  value={modal.paymentTermDays}
                  onChange={(e) => setModal({ ...modal, paymentTermDays: e.target.value })}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  placeholder="e.g. 30"
                />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={closeModal}
                disabled={submitting}
                className="flex-1 py-2 px-4 border border-slate-300 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleAccept}
                disabled={submitting}
                className="flex-1 py-2 px-4 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-400 text-white text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Accepting…
                  </>
                ) : (
                  'Confirm & Accept'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

