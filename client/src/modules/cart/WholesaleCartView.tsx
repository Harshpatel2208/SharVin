import React, { useState, useMemo, useEffect } from 'react';
import { 
  ShoppingCart, 
  Building2, 
  Truck, 
  CheckCircle2, 
  AlertTriangle, 
  Trash2, 
  Plus, 
  Minus, 
  ArrowRight, 
  ArrowLeft, 
  MessageSquare, 
  Store, 
  Sparkles, 
  FileText, 
  Package, 
  X
} from 'lucide-react';
import { 
  WholesaleSupplierCart, 
  SubmittedWholesaleOrder 
} from './types';
import { LedgerService } from '../ledger/ledgerService';
import { CreditProfileSummary } from '../ledger/types';
import { RetailerCreditFreezeModal } from '../ledger/RetailerCreditFreezeModal';
import { ReorderPredictorCard } from '../inventory/ReorderPredictorCard';
import { ModalBackdrop } from '../../components/ui/DismissOnOutsideClick';

async function requestCartApi<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${sessionStorage.getItem('sharvin_token') || ''}`,
      ...init.headers,
    },
  });
  const body = await response.json();
  if (!response.ok || !body.success) throw new Error(body.error || 'The cart request could not be completed.');
  return body.data as T;
}

interface WholesaleCartViewProps {
  onBackToPos?: () => void;
  onBackToRestock?: () => void;
  onBackToOverview?: () => void;
  onOpenLiveNegotiation?: (orderId: string, orderNumber: string) => void;
}

export const WholesaleCartView: React.FC<WholesaleCartViewProps> = ({
  onBackToPos,
  onBackToRestock,
  onBackToOverview,
  onOpenLiveNegotiation,
}) => {
  const [carts, setCarts] = useState<WholesaleSupplierCart[]>([]);
  const [selectedWholesalerId, setSelectedWholesalerId] = useState<string>('');
  const [isLoadingCarts, setIsLoadingCarts] = useState(true);
  const [cartError, setCartError] = useState<string | null>(null);
  
  // Modal state for submitting order
  const [submittingCart, setSubmittingCart] = useState<WholesaleSupplierCart | null>(null);
  const [submittedOrders, setSubmittedOrders] = useState<SubmittedWholesaleOrder[]>([]);
  const [successOrder, setSuccessOrder] = useState<SubmittedWholesaleOrder | null>(null);

  // Credit Limit & Overdue Freeze states (Phase 3 Task 6)
  const [blockedCreditProfile, setBlockedCreditProfile] = useState<CreditProfileSummary | null>(null);
  const [isCheckingCredit, setIsCheckingCredit] = useState(false);
  const [isSubmittingOrder, setIsSubmittingOrder] = useState(false);

  const loadCarts = async () => {
    setIsLoadingCarts(true);
    setCartError(null);
    try {
      const data = await requestCartApi<{ totalCarts: number; carts: WholesaleSupplierCart[] }>('/api/v1/cart');
      const loadedCarts = data.carts || [];
      setCarts(loadedCarts);
      setSelectedWholesalerId((current) => loadedCarts.some((cart) => cart.wholesaler.wholesalerId === current)
        ? current
        : loadedCarts[0]?.wholesaler.wholesalerId || '');
    } catch (error) {
      setCartError(error instanceof Error ? error.message : 'Could not load wholesale carts.');
      setCarts([]);
    } finally {
      setIsLoadingCarts(false);
    }
  };

  useEffect(() => { void loadCarts(); }, []);

  // Active selected cart
  const currentCart = useMemo(() => {
    return carts.find((c) => c.wholesaler.wholesalerId === selectedWholesalerId) || carts[0] || null;
  }, [carts, selectedWholesalerId]);

  // Aggregate stats across all supplier carts
  const overallStats = useMemo(() => {
    const totalSuppliers = carts.length;
    let totalItems = 0;
    let totalUnits = 0;
    let totalValue = 0;
    let allCompliant = true;

    carts.forEach((cart) => {
      totalItems += cart.items.length;
      cart.items.forEach((item) => {
        totalUnits += item.quantity;
        totalValue += item.lineTotal;
        if (!item.isMoqSatisfied) {
          allCompliant = false;
        }
      });
    });

    return {
      totalSuppliers,
      totalItems,
      totalUnits,
      totalValue,
      allCompliant,
    };
  }, [carts]);

  // Adjust item quantity
  const handleUpdateQuantity = async (_wholesalerId: string, orderItemId: string, newQty: number) => {
    if (newQty < 0) return;
    try {
      await requestCartApi(`/api/v1/cart/items/${encodeURIComponent(orderItemId)}`, {
        method: 'PATCH', body: JSON.stringify({ quantity: newQty }),
      });
      await loadCarts();
    } catch (error) {
      setCartError(error instanceof Error ? error.message : 'Could not update the cart item.');
    }
  };

  // Fix MOQ to minimum requirement with 1-click
  const handleFixMoq = (wholesalerId: string, orderItemId: string) => {
    const item = carts.find((cart) => cart.wholesaler.wholesalerId === wholesalerId)?.items.find((cartItem) => cartItem.orderItemId === orderItemId);
    if (item) void handleUpdateQuantity(wholesalerId, orderItemId, item.minimumOrderQuantity);
  };

  // Fix all MOQs for current supplier
  const handleFixAllMoqs = (wholesalerId: string) => {
    const cart = carts.find((candidate) => candidate.wholesaler.wholesalerId === wholesalerId);
    if (!cart) return;
    void Promise.all(cart.items.filter((item) => !item.isMoqSatisfied).map((item) =>
      requestCartApi(`/api/v1/cart/items/${encodeURIComponent(item.orderItemId)}`, {
        method: 'PATCH', body: JSON.stringify({ quantity: item.minimumOrderQuantity }),
      })
    )).then(loadCarts).catch((error) => setCartError(error instanceof Error ? error.message : 'Could not update cart quantities.'));
  };

  // Remove single line item
  const handleRemoveItem = async (_wholesalerId: string, orderItemId: string) => {
    try {
      await requestCartApi(`/api/v1/cart/items/${encodeURIComponent(orderItemId)}`, { method: 'DELETE' });
      await loadCarts();
    } catch (error) {
      setCartError(error instanceof Error ? error.message : 'Could not remove the cart item.');
    }
  };

  // Clear entire cart for a supplier
  const handleClearSupplierCart = async (wholesalerId: string) => {
    try {
      await requestCartApi(`/api/v1/cart/wholesaler/${encodeURIComponent(wholesalerId)}`, { method: 'DELETE' });
      await loadCarts();
    } catch (error) {
      setCartError(error instanceof Error ? error.message : 'Could not clear this supplier cart.');
    }
  };

  // Update delivery method
  const handleSetDeliveryMethod = (
    wholesalerId: string, 
    method: 'local_driver' | 'threePL_shipping'
  ) => {
    setCarts((prevCarts) =>
      prevCarts.map((cart) => {
        if (cart.wholesaler.wholesalerId !== wholesalerId) return cart;
        return {
          ...cart,
          deliveryMethod: method,
        };
      })
    );
  };

  // Initiate order submission with Credit Limit & Overdue verification gate
  const handleInitiateOrderSubmission = async (cart: WholesaleSupplierCart) => {
    setIsCheckingCredit(true);
    try {
      const profile = await LedgerService.getCreditProfile(cart.wholesaler.wholesalerId, {
        cartTotal: cart.summary.subtotal,
      });

      if (profile.isBlocked) {
        setBlockedCreditProfile(profile);
        setIsCheckingCredit(false);
        return;
      }
    } catch (e) {
      setCartError(e instanceof Error ? e.message : 'Credit eligibility could not be checked.');
      setIsCheckingCredit(false);
      return;
    }
    setIsCheckingCredit(false);
    setSubmittingCart(cart);
  };

  // Confirm order submission to live bargaining
  const handleConfirmOrderSubmission = async () => {
    if (!submittingCart) return;
    setIsSubmittingOrder(true);
    setCartError(null);
    try {
      const submitted = await requestCartApi<SubmittedWholesaleOrder>(`/api/v1/cart/wholesaler/${encodeURIComponent(submittingCart.wholesaler.wholesalerId)}/submit`, {
        method: 'POST',
        body: JSON.stringify({ deliveryMethod: submittingCart.deliveryMethod || 'local_driver' }),
      });
      const recorded = { ...submitted, submittedAt: new Date().toLocaleString(), deliveryMethod: submittingCart.deliveryMethod || 'local_driver' };
      setSubmittingCart(null);
      await loadCarts();
      if (onOpenLiveNegotiation) {
        onOpenLiveNegotiation(recorded.orderId, recorded.orderNumber);
      } else {
        setSubmittedOrders((prev) => [recorded, ...prev]);
        setSuccessOrder(recorded);
      }
    } catch (error) {
      setCartError(error instanceof Error ? error.message : 'Could not submit this order.');
    } finally {
      setIsSubmittingOrder(false);
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      {/* Top Header & Breadcrumb */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-6">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <button 
              onClick={onBackToOverview} 
              className="hover:text-slate-800 transition"
            >
              Overview
            </button>
            <span>/</span>
            <button 
              onClick={onBackToRestock} 
              className="hover:text-slate-800 transition"
            >
              1-Click Restock Hub
            </button>
            <span>/</span>
            <span className="text-amber-600 font-medium">Multi-Supplier Wholesale Carts</span>
          </div>

          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-50 border border-amber-200 text-amber-600 flex items-center justify-center shadow-lg shadow-amber-500/10">
              <ShoppingCart className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-2xl font-black text-slate-900 tracking-tight">
                Wholesale Restock Carts
              </h1>
              <p className="text-xs text-slate-400">
                Supplier-isolated draft orders with MOQ compliance verification &amp; rate lock submission
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={onBackToRestock}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white border border-slate-200 hover:border-slate-300 text-slate-700 text-xs font-semibold transition"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back to Restock Alerts
          </button>
          <button
            onClick={onBackToPos}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white border border-slate-200 hover:border-slate-300 text-slate-700 text-xs font-semibold transition"
          >
            <Store className="w-3.5 h-3.5 text-amber-600" /> POS Billing
          </button>
          <button type="button" onClick={() => void loadCarts()} disabled={isLoadingCarts} className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs font-medium transition disabled:opacity-50">
            Refresh carts
          </button>
        </div>
      </div>

      {cartError && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{cartError}</div>}

      {/* Phase 3 Task 7: 7-Day Velocity AI Reorder Predictor Card */}
      <ReorderPredictorCard />

      {/* Aggregate Carts Summary Banner */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 rounded-2xl bg-white border border-slate-200 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-amber-50 text-amber-600 border border-amber-200 flex items-center justify-center">
            <Building2 className="w-6 h-6" />
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Suppliers Active</span>
            <div className="text-xl font-black text-slate-900">{overallStats.totalSuppliers} Distributors</div>
            <span className="text-[11px] text-slate-400">Isolated order drafts</span>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-white border border-slate-200 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 border border-blue-200 flex items-center justify-center">
            <Package className="w-6 h-6" />
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Total Restock Units</span>
            <div className="text-xl font-black text-slate-900">{overallStats.totalUnits} Units</div>
            <span className="text-[11px] text-slate-400">{overallStats.totalItems} distinct line items</span>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-white border border-slate-200 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-200 flex items-center justify-center">
            <Sparkles className="w-6 h-6" />
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Total Cart Estimate</span>
            <div className="text-xl font-black text-emerald-600">
              ₹{overallStats.totalValue.toLocaleString('en-IN')}
            </div>
            <span className="text-[11px] text-slate-400">Before live bargaining</span>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-white border border-slate-200 flex items-center gap-4">
          <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
            overallStats.allCompliant 
              ? 'bg-emerald-50 text-emerald-600 border border-emerald-200' 
              : 'bg-rose-50 text-rose-600 border border-rose-200'
          }`}>
            {overallStats.allCompliant ? (
              <CheckCircle2 className="w-6 h-6" />
            ) : (
              <AlertTriangle className="w-6 h-6" />
            )}
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">MOQ Compliance</span>
            <div className={`text-base font-bold ${overallStats.allCompliant ? 'text-emerald-600' : 'text-rose-600'}`}>
              {overallStats.allCompliant ? '100% Satisfied' : 'MOQ Deficit Found'}
            </div>
            <span className="text-[11px] text-slate-400">
              {overallStats.allCompliant ? 'Ready for live rate locking' : 'Adjust unit quantities'}
            </span>
          </div>
        </div>
      </div>

      {/* Main Multi-Supplier View Area */}
      {isLoadingCarts ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">Loading your wholesale carts…</div>
      ) : carts.length === 0 ? (
        <div className="rounded-3xl bg-white border border-slate-200 p-12 text-center space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-slate-100 text-slate-500 flex items-center justify-center mx-auto">
            <ShoppingCart className="w-8 h-8" />
          </div>
          <div className="max-w-md mx-auto space-y-2">
            <h3 className="text-lg font-bold text-slate-900">All Wholesale Carts Are Empty</h3>
            <p className="text-xs text-slate-400">
              You do not have any pending restock draft orders. Add items from a connected supplier catalog or from a replenishment alert.
            </p>
          </div>
          <div className="pt-2 flex justify-center gap-3">
            <button
              onClick={onBackToRestock}
              className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-sm transition"
            >
              Go to 1-Click Restock Hub
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Left Column: Supplier Tabs List (4 Cols) */}
          <div className="lg:col-span-4 space-y-3">
            <div className="flex items-center justify-between px-1">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                Select Wholesaler ({carts.length})
              </span>
              <span className="text-[11px] text-slate-500">Click to inspect</span>
            </div>

            <div className="space-y-2.5">
              {carts.map((cart) => {
                const isSelected = cart.wholesaler.wholesalerId === currentCart?.wholesaler.wholesalerId;
                const hasViolations = cart.summary.moqViolations.length > 0;

                return (
                  <div
                    key={cart.wholesaler.wholesalerId}
                    onClick={() => setSelectedWholesalerId(cart.wholesaler.wholesalerId)}
                    className={`p-4 rounded-2xl cursor-pointer transition-all border text-left flex flex-col justify-between space-y-3 ${
                      isSelected
                        ? 'bg-white border-blue-500 shadow-sm ring-1 ring-blue-500/20'
                        : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-mono font-bold text-amber-600">
                          {cart.orderNumber}
                        </span>
                        <div className="flex items-center gap-1.5">
                          {hasViolations ? (
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200 font-semibold">
                              MOQ Deficit
                            </span>
                          ) : (
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-semibold">
                              MOQ Met
                            </span>
                          )}
                        </div>
                      </div>

                      <h3 className="font-bold text-slate-900 text-sm mt-1.5 line-clamp-1">
                        {cart.wholesaler.businessName}
                      </h3>
                      <p className="text-[11px] text-slate-400">
                        {cart.wholesaler.businessCategory || 'FMCG Distributor'} &bull; {cart.items.length} items
                      </p>
                    </div>

                    <div className="pt-2 border-t border-slate-200 flex items-center justify-between text-xs">
                      <div>
                        <span className="text-[10px] text-slate-500 block">Draft Subtotal</span>
                        <span className="font-extrabold text-slate-900">
                          ₹{cart.summary.subtotal.toLocaleString('en-IN')}
                        </span>
                      </div>

                      <div className="text-right">
                        <span className="text-[10px] text-slate-500 block">Total Qty</span>
                        <span className="font-semibold text-slate-700">
                          {cart.summary.totalQuantity} Units
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Submitted Orders History Preview */}
            {submittedOrders.length > 0 && (
              <div className="mt-6 p-4 rounded-2xl bg-emerald-50 border border-emerald-200 space-y-3">
                <div className="flex items-center gap-2 text-emerald-600 text-xs font-bold uppercase tracking-wider">
                  <CheckCircle2 className="w-4 h-4" /> Submitted to Live Bargaining ({submittedOrders.length})
                </div>
                <div className="space-y-2">
                  {submittedOrders.map((sub) => (
                    <div key={sub.orderId} className="p-2.5 rounded-xl bg-slate-50 border border-emerald-200 text-xs space-y-1">
                      <div className="flex justify-between items-center">
                        <span className="font-mono font-bold text-emerald-600">{sub.orderNumber}</span>
                        <span className="text-[10px] text-slate-400">{sub.submittedAt}</span>
                      </div>
                      <div className="text-slate-800 font-medium truncate">{sub.wholesalerName}</div>
                      <div className="flex justify-between text-[11px] text-slate-400">
                        <span>{sub.totalItems} items ({sub.deliveryMethod})</span>
                        <span className="font-bold text-emerald-700">₹{sub.subtotal.toLocaleString('en-IN')}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right Column: Selected Supplier Cart Details & Actions (8 Cols) */}
          {currentCart && (
            <div className="lg:col-span-8 space-y-6">
              {/* Supplier Header Card */}
              <div className="p-6 rounded-3xl bg-white border border-slate-200 space-y-4 shadow-sm">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                        {currentCart.orderNumber}
                      </span>
                      <span className="text-xs px-2 py-0.5 rounded bg-blue-50 text-blue-600 border border-blue-200 font-medium">
                        Status: Negotiating / Draft
                      </span>
                    </div>
                    <h2 className="text-xl font-black text-slate-900 mt-1">
                      {currentCart.wholesaler.businessName}
                    </h2>
                    <div className="text-xs text-slate-400 flex flex-wrap items-center gap-x-3 gap-y-1 mt-1">
                      {currentCart.wholesaler.phoneNumber && (
                        <span>Phone: <span className="text-slate-700">{currentCart.wholesaler.phoneNumber}</span></span>
                      )}
                      {currentCart.wholesaler.gstNumber && (
                        <span>GST: <span className="font-mono text-slate-700">{currentCart.wholesaler.gstNumber}</span></span>
                      )}
                      <span>Category: <span className="text-slate-700">{currentCart.wholesaler.businessCategory || 'FMCG Goods'}</span></span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleClearSupplierCart(currentCart.wholesaler.wholesalerId)}
                      className="px-3 py-1.5 rounded-xl text-xs font-semibold text-rose-600 hover:text-rose-700 bg-rose-50 hover:bg-rose-50 border border-rose-200 transition flex items-center gap-1.5"
                    >
                      <Trash2 className="w-3.5 h-3.5" /> Clear Supplier Cart
                    </button>
                  </div>
                </div>

                {/* Delivery Method Selector */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
                  <div>
                    <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                      <Truck className="w-4 h-4 text-amber-600" /> Fulfillment Delivery Method:
                    </span>
                    <span className="text-[11px] text-slate-500">Select how this wholesaler will dispatch goods</span>
                  </div>

                  <div className="flex items-center gap-2 bg-slate-50 p-1 rounded-xl border border-slate-200 text-xs">
                    <button
                      onClick={() => handleSetDeliveryMethod(currentCart.wholesaler.wholesalerId, 'local_driver')}
                      className={`px-3 py-1.5 rounded-lg font-semibold transition ${
                        currentCart.deliveryMethod === 'local_driver'
                          ? 'bg-blue-600 text-white shadow-sm font-bold'
                          : 'text-slate-400 hover:text-slate-800'
                      }`}
                    >
                      Local Van / Tempo
                    </button>
                    <button
                      onClick={() => handleSetDeliveryMethod(currentCart.wholesaler.wholesalerId, 'threePL_shipping')}
                      className={`px-3 py-1.5 rounded-lg font-semibold transition ${
                        currentCart.deliveryMethod === 'threePL_shipping'
                          ? 'bg-blue-600 text-white shadow-sm font-bold'
                          : 'text-slate-400 hover:text-slate-800'
                      }`}
                    >
                      3PL Shipping / Courier
                    </button>
                  </div>
                </div>

                {/* MOQ Violation Warning Banner */}
                {!currentCart.summary.allMoqSatisfied && (
                  <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                    <div className="flex items-start gap-3">
                      <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                      <div>
                        <h4 className="text-sm font-bold text-rose-700">Minimum Order Quantity (MOQ) Not Met</h4>
                        <p className="text-xs text-rose-600/80 mt-0.5">
                          {currentCart.summary.moqViolations.length} item(s) are below the supplier's wholesale threshold. You must satisfy MOQs before locking rates.
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => handleFixAllMoqs(currentCart.wholesaler.wholesalerId)}
                      className="px-3.5 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs transition shrink-0 shadow-sm"
                    >
                      Fix All MOQs
                    </button>
                  </div>
                )}
              </div>

              {/* Line Items Table / List */}
              <div className="space-y-3">
                <div className="flex items-center justify-between px-1">
                  <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <Package className="w-4 h-4 text-amber-600" /> Cart Line Items ({currentCart.items.length})
                  </h3>
                  <span className="text-xs text-slate-400">
                    Calculated at wholesale quote rates
                  </span>
                </div>

                <div className="space-y-2.5">
                  {currentCart.items.map((item) => {
                    const isBelowMoq = !item.isMoqSatisfied;
                    const deficit = item.minimumOrderQuantity - item.quantity;

                    return (
                      <div
                        key={item.orderItemId}
                        className={`p-4 rounded-2xl border transition-all ${
                          isBelowMoq
                            ? 'bg-rose-50 border-rose-200'
                            : 'bg-white border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                          {/* Item Info */}
                          <div className="space-y-1.5 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              {item.brandName && (
                                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-slate-50 text-slate-600 border border-slate-200">
                                  {item.brandName}
                                </span>
                              )}
                              <span className="text-xs font-mono text-slate-500">
                                #{item.barcode}
                              </span>

                              {/* Yellow Near-Expiry Badge (<= 45 days) */}
                              {item.isNearExpiryWarning && (
                                <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md bg-amber-50 text-amber-800 border border-amber-200 shadow-xs">
                                  <AlertTriangle className="w-3 h-3 text-amber-600" />
                                  ⚠️ Near-Expiry: {item.daysUntilExpiry} days left {item.batchNumber ? `(${item.batchNumber})` : ''}
                                </span>
                              )}

                              {/* Near-Expiry Clearance Tag (<= 60 days) */}
                              {item.isNearExpiryClearance && !item.isNearExpiryWarning && (
                                <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md bg-orange-50 text-orange-800 border border-orange-200">
                                  <Sparkles className="w-3 h-3 text-orange-600" />
                                  Near-Expiry Clearance {item.batchNumber ? `[Batch: ${item.batchNumber}]` : ''}
                                </span>
                              )}

                              {/* Out of Stock in Godown Badge */}
                              {(item.isOutOfStock || item.stockAvailable === 0) && (
                                <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md bg-rose-50 text-rose-700 border border-rose-200">
                                  <AlertTriangle className="w-3 h-3 text-rose-600" />
                                  Out of Stock in Wholesaler Godown
                                </span>
                              )}
                            </div>

                            <h4 className="font-bold text-slate-900 text-base">
                              {item.productName}
                            </h4>

                            <div className="text-xs text-slate-400 flex flex-wrap items-center gap-x-3 gap-y-1">
                              <span>
                                Quoted Price: <span className="font-bold text-slate-800">₹{item.quotedUnitPrice.toFixed(2)}</span> / {item.unitOfMeasure}
                              </span>
                              <span>&bull;</span>
                              <span>
                                Wholesaler MOQ: <span className="font-bold text-amber-600">{item.minimumOrderQuantity} {item.unitOfMeasure}s</span>
                              </span>
                              <span>&bull;</span>
                              <span className={item.stockAvailable === 0 ? 'text-rose-600 font-bold' : 'text-slate-500'}>
                                In Supplier Stock: {item.stockAvailable ?? 0}
                              </span>
                              {item.batchNumber && (
                                <>
                                  <span>&bull;</span>
                                  <span className="font-mono text-slate-400 text-[11px]">Batch: {item.batchNumber}</span>
                                </>
                              )}
                              {item.expiryDate && (
                                <>
                                  <span>&bull;</span>
                                  <span className="text-slate-400 text-[11px]">Expiry: {item.expiryDate}</span>
                                </>
                              )}
                            </div>
                          </div>

                          {/* Stepper Controls & Actions */}
                          <div className="flex items-center justify-between md:justify-end gap-6 border-t md:border-t-0 border-slate-200 pt-3 md:pt-0">
                            {/* Quantity Stepper */}
                            <div className="flex flex-col items-center gap-1">
                              <div className="flex items-center gap-2 bg-slate-50 p-1 rounded-xl border border-slate-200">
                                <button
                                  onClick={() => handleUpdateQuantity(
                                    currentCart.wholesaler.wholesalerId, 
                                    item.orderItemId, 
                                    item.quantity - 1
                                  )}
                                  disabled={item.quantity <= 1 || item.isOutOfStock || item.stockAvailable === 0}
                                  className="w-7 h-7 rounded-lg bg-slate-100 hover:bg-slate-200 disabled:opacity-40 text-slate-800 flex items-center justify-center transition"
                                >
                                  <Minus className="w-3.5 h-3.5" />
                                </button>
                                
                                <input
                                  type="number"
                                  disabled={item.isOutOfStock || item.stockAvailable === 0}
                                  value={item.quantity}
                                  onChange={(e) => {
                                    const val = parseInt(e.target.value, 10);
                                    if (!isNaN(val) && val >= 1) {
                                      handleUpdateQuantity(currentCart.wholesaler.wholesalerId, item.orderItemId, val);
                                    }
                                  }}
                                  className="w-14 text-center font-bold text-sm bg-transparent text-slate-900 focus:outline-none disabled:text-slate-500"
                                />

                                <button
                                  onClick={() => handleUpdateQuantity(
                                    currentCart.wholesaler.wholesalerId, 
                                    item.orderItemId, 
                                    item.quantity + 1
                                  )}
                                  disabled={item.isOutOfStock || item.stockAvailable === 0 || (item.stockAvailable !== null && item.quantity >= item.stockAvailable!)}
                                  title={item.isOutOfStock || item.stockAvailable === 0 ? 'Item out of stock in wholesaler godown' : 'Increase quantity'}
                                  className="w-7 h-7 rounded-lg bg-slate-100 hover:bg-slate-200 disabled:opacity-40 text-slate-800 flex items-center justify-center transition"
                                >
                                  <Plus className="w-3.5 h-3.5" />
                                </button>
                              </div>

                              {/* MOQ Status Badge & 1-Click Fix */}
                              {isBelowMoq ? (
                                <div className="flex items-center gap-1.5">
                                  <span className="text-[10px] font-bold text-rose-600">
                                    Below MOQ (-{deficit})
                                  </span>
                                  <button
                                    onClick={() => handleFixMoq(currentCart.wholesaler.wholesalerId, item.orderItemId)}
                                    className="text-[10px] font-bold text-rose-700 underline hover:text-slate-900"
                                  >
                                    Bump to {item.minimumOrderQuantity}
                                  </button>
                                </div>
                              ) : (
                                <span className="text-[10px] font-semibold text-emerald-600 flex items-center gap-1">
                                  <CheckCircle2 className="w-3 h-3" /> MOQ Satisfied
                                </span>
                              )}
                            </div>

                            {/* Line Total */}
                            <div className="text-right min-w-[100px]">
                              <span className="text-[10px] text-slate-500 block uppercase tracking-wider">Line Total</span>
                              <span className="text-base font-black text-amber-600">
                                ₹{item.lineTotal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </span>
                            </div>

                            {/* Trash Button */}
                            <button
                              onClick={() => handleRemoveItem(currentCart.wholesaler.wholesalerId, item.orderItemId)}
                              title="Remove item from draft order"
                              className="p-2 rounded-xl text-slate-500 hover:text-rose-600 hover:bg-rose-50 transition"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Order Submission Action Footer */}
              <div className="p-6 rounded-3xl bg-white border border-slate-200 space-y-5 shadow-sm">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-5">
                  <div className="space-y-1">
                    <span className="text-xs uppercase font-bold text-slate-400 tracking-wider">
                      Supplier Order Breakdown
                    </span>
                    <div className="text-xs text-slate-400">
                      Total Units: <span className="text-slate-900 font-semibold">{currentCart.summary.totalQuantity} {currentCart.items.length === 1 ? 'item' : 'items'}</span> &bull; 
                      Dispatch: <span className="text-slate-900 font-semibold">{currentCart.deliveryMethod === 'threePL_shipping' ? '3PL Shipping' : 'Local Van Delivery'}</span>
                    </div>
                  </div>

                  <div className="text-right">
                    <span className="text-xs text-slate-400 block">Total Quoted Subtotal</span>
                    <span className="text-2xl font-black text-amber-600">
                      ₹{currentCart.summary.subtotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                  <div className="text-xs text-slate-400 flex items-center gap-2">
                    <FileText className="w-4 h-4 text-slate-500" />
                    <span>Submission will initiate real-time negotiation tab in Milestone 4.</span>
                  </div>

                  <button
                    id="btn-submit-cart"
                    onClick={() => handleInitiateOrderSubmission(currentCart)}
                    disabled={!currentCart.summary.canSubmit || isCheckingCredit || isSubmittingOrder}
                    className={`w-full sm:w-auto px-6 py-3 rounded-2xl font-black text-sm flex items-center justify-center gap-2 shadow-lg transition-all transform active:scale-95 ${
                      currentCart.summary.canSubmit
                        ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-sm cursor-pointer'
                        : 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed shadow-none'
                    }`}
                  >
                    <MessageSquare className="w-4 h-4" />
                    {isCheckingCredit ? 'Verifying Credit Line...' : 'Submit for Live Price Bargaining'}
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Order Submission Confirmation Modal */}
      {submittingCart && (
        <ModalBackdrop onClose={() => setSubmittingCart(null)} className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-3xl max-w-lg w-full p-6 sm:p-8 space-y-6 shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between border-b border-slate-200 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-amber-50 text-amber-600 border border-amber-200 flex items-center justify-center">
                  <MessageSquare className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-black text-slate-900 text-lg">Submit Restock Order</h3>
                  <span className="text-xs font-mono text-amber-600">{submittingCart.orderNumber}</span>
                </div>
              </div>
              <button 
                onClick={() => setSubmittingCart(null)}
                className="p-1 rounded-xl text-slate-400 hover:text-slate-900 hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
                <div className="flex justify-between">
                  <span className="text-slate-400">Wholesaler:</span>
                  <span className="font-bold text-slate-900">{submittingCart.wholesaler.businessName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Total Items:</span>
                  <span className="font-bold text-slate-900">{submittingCart.items.length} Products ({submittingCart.summary.totalQuantity} units)</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Fulfillment Method:</span>
                  <span className="font-bold text-amber-600">
                    {submittingCart.deliveryMethod === 'threePL_shipping' ? '3PL Shipping / Courier' : 'Local Van / Tempo Handover'}
                  </span>
                </div>
                <div className="flex justify-between pt-2 border-t border-slate-200 text-sm">
                  <span className="text-slate-400 font-semibold">Initial Cart Total:</span>
                  <span className="font-black text-amber-600">₹{submittingCart.summary.subtotal.toLocaleString('en-IN')}</span>
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-blue-50 border border-blue-200 text-blue-800 space-y-1">
                <div className="font-bold text-blue-900 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5" /> What happens next?
                </div>
                <p className="text-[11px] text-blue-800/80 leading-relaxed">
                  This order will open an interactive bargaining session with {submittingCart.wholesaler.businessName}. You and the wholesaler can negotiate rates, after which a <strong>Bilateral Rate Lock</strong> seals the transaction before delivery dispatch.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => setSubmittingCart(null)}
                className="px-4 py-2.5 rounded-xl text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 text-xs font-semibold transition"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmOrderSubmission}
                disabled={isSubmittingOrder}
                className="px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-black text-xs shadow-sm transition"
              >
                {isSubmittingOrder ? 'Submitting RFQ…' : 'Confirm &amp; Start Live Bargaining'}
              </button>
            </div>
          </div>
        </ModalBackdrop>
      )}

      {/* Success Modal / Banner */}
      {successOrder && (
        <ModalBackdrop onClose={() => setSuccessOrder(null)} className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white border border-emerald-200 rounded-3xl max-w-md w-full p-6 sm:p-8 space-y-5 text-center shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="w-16 h-16 rounded-3xl bg-emerald-50 border border-emerald-200 text-emerald-600 flex items-center justify-center mx-auto shadow-lg shadow-emerald-500/20">
              <CheckCircle2 className="w-8 h-8" />
            </div>

            <div className="space-y-2">
              <h3 className="text-xl font-black text-slate-900">Order Submitted for Negotiation!</h3>
              <p className="text-xs text-slate-400">
                Draft <span className="font-mono text-amber-600">{successOrder.orderNumber}</span> sent to{' '}
                <strong className="text-slate-900">{successOrder.wholesalerName}</strong>.
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 text-xs space-y-2 text-left">
              <div className="flex justify-between">
                <span className="text-slate-400">Subtotal:</span>
                <span className="font-bold text-emerald-600">₹{successOrder.subtotal.toLocaleString('en-IN')}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Items:</span>
                <span className="font-semibold text-slate-800">{successOrder.totalItems} distinct line items</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Status:</span>
                <span className="font-bold text-amber-600">Pending Live Price Bargaining</span>
              </div>
            </div>

            <div className="pt-2 flex flex-col gap-2.5">
              {onOpenLiveNegotiation && (
                <button
                  onClick={() => {
                    const oId = successOrder.orderId;
                    const oNum = successOrder.orderNumber;
                    setSuccessOrder(null);
                    onOpenLiveNegotiation(oId, oNum);
                  }}
                  className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-black text-xs shadow-sm flex items-center justify-center gap-2 transition"
                >
                  <MessageSquare className="w-4 h-4" /> Open Live Bargaining &amp; Rate Lock (Milestone 4)
                </button>
              )}
              <button
                onClick={() => {
                  setSuccessOrder(null);
                }}
                className="w-full py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs shadow-md transition"
              >
                Continue Managing Wholesale Carts
              </button>
              <button
                onClick={onBackToPos}
                className="w-full py-2.5 rounded-xl bg-white hover:bg-slate-100 text-slate-400 hover:text-slate-800 font-semibold text-xs border border-slate-200 transition"
              >
                Return to POS Billing Counter
              </button>
            </div>
          </div>
        </ModalBackdrop>
      )}
      {/* High-Visibility Blocking Alert Modal (Phase 3 Task 6) */}
      {blockedCreditProfile && (
        <RetailerCreditFreezeModal
          creditProfile={blockedCreditProfile}
          cartTotal={currentCart?.summary.subtotal || 0}
          onClose={() => setBlockedCreditProfile(null)}
          onRequestOverride={(reason) => {
            setCartError(`Credit override requests are not available yet. Contact the wholesaler directly. (${reason})`);
          }}
        />
      )}
    </div>
  );
};
