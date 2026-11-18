import { useState, useEffect, useCallback } from 'react';
import { Building2, MapPin, Tag, Phone, Loader2, AlertCircle, CheckCircle2, Wifi } from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:5000';

interface WholesalerCard {
  id: string;
  businessName: string;
  phoneNumber: string;
  city: string | null;
  state: string | null;
  gstNumber: string | null;
  productCategories: string[] | null;
}

export default function NetworkDiscoveryView() {
  const [wholesalers, setWholesalers] = useState<WholesalerCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Track which wholesaler IDs have been sent a request
  const [sentIds, setSentIds] = useState<Set<string>>(new Set());
  const [sendingId, setSendingId] = useState<string | null>(null);

  const fetchWholesalers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = sessionStorage.getItem('sharvin_token');
      const res = await fetch(`${API_BASE}/api/v1/wholesalers/discover`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Failed to load wholesalers');
      setWholesalers(json.data ?? []);
    } catch (err: any) {
      setError(err.message ?? 'Network error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchWholesalers();
  }, [fetchWholesalers]);

  const sendRequest = async (wholesalerId: string) => {
    setSendingId(wholesalerId);
    try {
      const token = sessionStorage.getItem('sharvin_token');
      const res = await fetch(`${API_BASE}/api/v1/wholesalers/connect/${wholesalerId}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (!res.ok && res.status !== 409) throw new Error(json.error ?? 'Failed to send request');
      // Mark as sent regardless (409 means already pending — idempotent success)
      setSentIds((prev) => new Set([...prev, wholesalerId]));
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    } finally {
      setSendingId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
        <span className="ml-3 text-slate-600">Discovering wholesalers…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-3 p-4 bg-rose-50 border border-rose-200 rounded-lg text-rose-700 max-w-lg mx-auto mt-8">
        <AlertCircle className="w-5 h-5 flex-shrink-0" />
        <span>{error}</span>
        <button onClick={fetchWholesalers} className="ml-auto text-sm underline">Retry</button>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 bg-blue-100 rounded-lg">
          <Wifi className="w-6 h-6 text-blue-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Network Discovery</h1>
          <p className="text-sm text-slate-500">Find and connect with verified wholesalers</p>
        </div>
        <span className="ml-auto text-sm text-slate-400">
          {wholesalers.length} wholesaler{wholesalers.length !== 1 ? 's' : ''} available
        </span>
      </div>

      {wholesalers.length === 0 ? (
        <div className="text-center py-16 text-slate-500">
          <Building2 className="w-12 h-12 mx-auto mb-3 text-slate-300" />
          <p className="font-medium">No new wholesalers to discover</p>
          <p className="text-sm mt-1">You are already connected to all available wholesalers.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {wholesalers.map((w) => {
            const isSent = sentIds.has(w.id);
            const isSending = sendingId === w.id;
            return (
              <div
                key={w.id}
                className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 flex flex-col gap-3 hover:shadow-md transition-shadow"
              >
                {/* Business name */}
                <div className="flex items-start gap-2">
                  <Building2 className="w-5 h-5 text-blue-500 mt-0.5 flex-shrink-0" />
                  <h2 className="font-semibold text-slate-900 leading-tight">{w.businessName}</h2>
                </div>

                {/* Location */}
                {(w.city || w.state) && (
                  <div className="flex items-center gap-2 text-sm text-slate-500">
                    <MapPin className="w-4 h-4 flex-shrink-0" />
                    <span>{[w.city, w.state].filter(Boolean).join(', ')}</span>
                  </div>
                )}

                {/* Phone */}
                <div className="flex items-center gap-2 text-sm text-slate-500">
                  <Phone className="w-4 h-4 flex-shrink-0" />
                  <span>{w.phoneNumber}</span>
                </div>

                {/* GST */}
                {w.gstNumber && (
                  <div className="text-xs text-slate-400 font-mono bg-slate-50 px-2 py-1 rounded">
                    GST: {w.gstNumber}
                  </div>
                )}

                {/* Product categories */}
                {w.productCategories && w.productCategories.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {w.productCategories.slice(0, 3).map((cat) => (
                      <span
                        key={cat}
                        className="inline-flex items-center gap-1 text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full"
                      >
                        <Tag className="w-3 h-3" />
                        {cat}
                      </span>
                    ))}
                    {w.productCategories.length > 3 && (
                      <span className="text-xs text-slate-400">+{w.productCategories.length - 3} more</span>
                    )}
                  </div>
                )}

                {/* CTA */}
                <div className="mt-auto pt-2 border-t border-slate-100">
                  {isSent ? (
                    <div className="flex items-center gap-2 text-emerald-600 text-sm font-medium">
                      <CheckCircle2 className="w-4 h-4" />
                      Request Sent
                    </div>
                  ) : (
                    <button
                      onClick={() => sendRequest(w.id)}
                      disabled={isSending}
                      className="w-full py-2 px-4 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
                    >
                      {isSending ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Sending…
                        </>
                      ) : (
                        'Send Connect Request'
                      )}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

