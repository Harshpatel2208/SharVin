import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Layers,
  CheckCircle2,
  AlertTriangle,
  Clock,
  ShieldCheck,
  MessageSquare,
  Truck,
  X,
  Store,
  Building2,
  SlidersHorizontal,
  Search,
  FileSpreadsheet,
  FileText,
  LoaderCircle
} from 'lucide-react';
import { useRole } from '../../context/RoleContext';
import { GstInvoiceModal } from '../invoice/GstInvoiceModal';
import { CaGstr1ExportModal } from '../invoice/CaGstr1ExportModal';
import { WholesalerCreditTermsModal } from '../ledger/WholesalerCreditTermsModal';
import { WholesalerCreditOverrideModal } from '../ledger/WholesalerCreditOverrideModal';
import { LedgerService } from '../ledger/ledgerService';
import { OrderService, ApiOrder } from '../orders/orderService';
import { chatSocketService } from '../chat/chatSocketService';
import { ModalBackdrop } from '../../components/ui/DismissOnOutsideClick';

export interface WholesalerOrder {
  id: string;
  orderNumber: string;
  retailerName: string;
  retailerOwner: string;
  retailerPhone: string;
  retailerLocation: string;
  status: 'quoted' | 'bargaining' | 'locked' | 'dispatched' | 'delivered';
  createdAt: string;
  items: Array<{
    itemId: string;
    productName: string;
    sku: string;
    requestedQty: number;
    unit: string;
    godownAvailableStock: number;
    quotedPrice: number;
    currentOfferedPrice: number;
    costPrice: number;
    marginFloor: number;
  }>;
  totalQuotedValue: number;
  currentOfferValue: number;
  notes?: string;
  hasCreditRisk?: boolean;
  creditRiskReason?: string;
  retailerDebt?: number;
  retailerLimit?: number;
  creditOverridden?: boolean;
  creditOverrideReason?: string;
}

// Coerce a Prisma Decimal (serialized to string over JSON) or number to a safe number.
const toNum = (v: unknown): number =>
  v === null || v === undefined || v === '' ? 0 : Number(v) || 0;

const statusTone = (status: string): string => {
  if (status === 'locked' || status === 'delivered') return 'bg-emerald-50 text-emerald-700';
  if (status === 'quoted' || status === 'bargaining') return 'bg-amber-50 text-amber-800';
  if (status === 'cancelled' || status === 'rejected') return 'bg-rose-50 text-rose-700';
  return 'bg-slate-100 text-slate-600';
};

// Map a raw GET /api/v1/orders record into the workspace's WholesalerOrder shape.
function mapApiOrder(raw: ApiOrder): WholesalerOrder {
  const lifecycle = String(raw.lifecycleStatus || '').toLowerCase();
  const legacy = String(raw.orderStatus || '').toLowerCase();
  let status: WholesalerOrder['status'];
  if (lifecycle === 'delivered' || lifecycle === 'partially_fulfilled' || legacy === 'delivered') status = 'delivered';
  else if (lifecycle === 'dispatched' || legacy === 'in_transit' || legacy === 'dispatched') status = 'dispatched';
  else if (lifecycle === 'accepted' || lifecycle === 'picking' || ['price_locked', 'deal_locked', 'locked'].includes(legacy)) status = 'locked';
  else if (lifecycle === 'submitted' || ['negotiating', 'rate_proposed'].includes(legacy)) status = 'bargaining';
  else status = 'quoted';

  const items = (Array.isArray(raw.orderItems) ? raw.orderItems : []).map((oi) => {
    const base = toNum(oi.wholesalerProduct?.basePrice);
    const quotedPrice = oi.quotedUnitPrice != null ? toNum(oi.quotedUnitPrice) : base;
    const currentOfferedPrice = oi.finalUnitPrice != null ? toNum(oi.finalUnitPrice) : quotedPrice;
    const marginFloor = oi.wholesalerProduct?.marginFloorPrice != null
      ? toNum(oi.wholesalerProduct.marginFloorPrice)
      : Math.round(base * 0.7 * 100) / 100;
    return {
      itemId: oi.id,
      productName: oi.product?.productName || 'Product',
      sku: oi.product?.manufacturerBarcode || oi.product?.systemGeneratedBarcode || '',
      requestedQty: toNum(oi.quantity),
      unit: oi.product?.unitOfMeasure || 'pcs',
      godownAvailableStock: oi.wholesalerProduct?.stockQuantity != null ? toNum(oi.wholesalerProduct.stockQuantity) : 0,
      quotedPrice,
      currentOfferedPrice,
      costPrice: base,
      marginFloor,
    };
  });

  const addr = raw.retailer?.addresses?.[0];
  return {
    id: raw.id,
    orderNumber: raw.orderNumber,
    retailerName: raw.retailer?.businessName || raw.retailer?.fullName || 'Retailer',
    retailerOwner: raw.retailer?.fullName || '',
    retailerPhone: raw.retailer?.phoneNumber || '',
    retailerLocation: addr ? [addr.city, addr.state].filter(Boolean).join(', ') : '',
    status,
    createdAt: raw.createdAt ? new Date(raw.createdAt).toLocaleDateString() : '',
    items,
    totalQuotedValue: items.reduce((s, i) => s + i.quotedPrice * i.requestedQty, 0),
    currentOfferValue: items.reduce((s, i) => s + i.currentOfferedPrice * i.requestedQty, 0),
  };
}



export const WholesalerWorkspaceView: React.FC = () => {
  const { profile } = useRole();
  const navigate = useNavigate();

  const [orders, setOrders] = useState<WholesalerOrder[]>([]);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  
  // CA GSTR-1 and GST Tax Invoice Modals
  const [showGstr1Modal, setShowGstr1Modal] = useState<boolean>(false);
  const [selectedInvoiceOrder, setSelectedInvoiceOrder] = useState<{ id: string; orderNumber: string } | null>(null);

  // Credit Terms & Override Modals (Phase 3 Task 6)
  const [showCreditTermsModal, setShowCreditTermsModal] = useState<boolean>(false);
  const [overridingOrder, setOverridingOrder] = useState<WholesalerOrder | null>(null);

  // Counter-offer modal
  const [counterModalOrder, setCounterModalOrder] = useState<WholesalerOrder | null>(null);
  const [actionSheetOrder, setActionSheetOrder] = useState<WholesalerOrder | null>(null);
  const [counterRates, setCounterRates] = useState<Record<string, number>>({});
  const [counterNote, setCounterNote] = useState<string>('');
  const [actionSuccessMessage, setActionSuccessMessage] = useState<string | null>(null);

  // Live pipeline load state (P1.5): orders are fetched from the backend on mount.
  const [isLoadingOrders, setIsLoadingOrders] = useState<boolean>(true);
  const [orderLoadError, setOrderLoadError] = useState<string | null>(null);
  // P1.6: which order has a negotiation action in flight, and the last error toast.
  const [pendingActionId, setPendingActionId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const reloadOrders = useCallback(async () => {
    try {
      const raw = await OrderService.fetchWholesalerOrders();
      setOrders(raw.map(mapApiOrder));
      setOrderLoadError(null);
    } catch (error) {
      setOrderLoadError(error instanceof Error ? error.message : 'Could not load purchase orders.');
    } finally {
      setIsLoadingOrders(false);
    }
  }, []);

  useEffect(() => {
    void reloadOrders();
  }, [reloadOrders]);

  // P1.6: join every order's negotiation room so the retailer's rate lock streams
  // in live; a lock event atomically refreshes the pipeline from the backend.
  const orderRoomKey = orders.map((o) => o.id).join(',');
  useEffect(() => {
    if (!orderRoomKey) return;
    const ids = orderRoomKey.split(',');
    chatSocketService.connect();
    ids.forEach((id) => chatSocketService.joinOrder(id));
    const offPriceLocked = chatSocketService.onOrderPriceLocked(() => void reloadOrders());
    const offRateLocked = chatSocketService.onRateLocked(() => void reloadOrders());
    return () => {
      offPriceLocked();
      offRateLocked();
      ids.forEach((id) => chatSocketService.leaveOrder(id));
    };
  }, [orderRoomKey, reloadOrders]);

  const notify = (msg: string) => {
    setActionError(null);
    setActionSuccessMessage(msg);
    setTimeout(() => setActionSuccessMessage(null), 4000);
  };

  const notifyError = (msg: string) => {
    setActionSuccessMessage(null);
    setActionError(msg);
    setTimeout(() => setActionError(null), 5000);
  };

  const handleDemandPayment = async (orderId: string) => {
    try {
      await LedgerService.demandPayment(orderId, 'Formal payment demand issued: Settle overdue invoices before dispatch.');
      notify(`🛑 Formal payment demand issued for order. Bargaining and dispatch frozen until settlement.`);
    } catch (e: any) {
      alert(e.message || 'Failed to issue payment demand');
    }
  };

  const handleOverrideSuccess = (reason: string) => {
    if (!overridingOrder) return;
    setOrders((prev) =>
      prev.map((o) =>
        o.id === overridingOrder.id
          ? {
              ...o,
              creditOverridden: true,
              creditOverrideReason: reason,
              hasCreditRisk: false,
            }
          : o
      )
    );
    notify(`✅ Credit Limit Overridden by Seth! Order ${overridingOrder.orderNumber} authorized for packing & dispatch.`);
    setOverridingOrder(null);
  };

  // Open counter offer modal
  const handleOpenCounterModal = (order: WholesalerOrder) => {
    setCounterModalOrder(order);
    const initialRates: Record<string, number> = {};
    order.items.forEach((item) => {
      initialRates[item.itemId] = item.currentOfferedPrice;
    });
    setCounterRates(initialRates);
    setCounterNote('');
  };

  // Submit counter offer -> POST /api/v1/orders/:id/propose-rate (live backend + socket)
  const handleSubmitCounterOffer = async () => {
    if (!counterModalOrder) return;
    const order = counterModalOrder;

    // Client-side margin guard mirrors the server rule for instant feedback.
    for (const item of order.items) {
      const rate = counterRates[item.itemId];
      if (rate < item.marginFloor) {
        notifyError(`Cannot propose ₹${rate} for ${item.productName}. It breaches the margin floor of ₹${item.marginFloor}.`);
        return;
      }
    }

    setPendingActionId(order.id);
    try {
      const items = order.items.map((item) => ({
        orderItemId: item.itemId,
        proposedUnitPrice: counterRates[item.itemId] ?? item.currentOfferedPrice,
      }));
      const result = await OrderService.submitCounterOffer(order.id, {
        items,
        notes: counterNote || undefined,
      });

      // Reflect the authoritative proposal snapshot directly (GET /orders only
      // surfaces negotiated prices once the deal locks, so we avoid a revert).
      setOrders((prev) =>
        prev.map((ord) => {
          if (ord.id !== order.id) return ord;
          const rateById = new Map(result.items.map((ri) => [ri.orderItemId, ri.proposedUnitPrice]));
          const updatedItems = ord.items.map((it) =>
            rateById.has(it.itemId) ? { ...it, currentOfferedPrice: rateById.get(it.itemId)! } : it
          );
          return {
            ...ord,
            status: 'bargaining',
            items: updatedItems,
            currentOfferValue: updatedItems.reduce((s, i) => s + i.requestedQty * i.currentOfferedPrice, 0),
            notes: counterNote || `Counter-offer sent to ${ord.retailerName}`,
          };
        })
      );
      notify(`✅ Counter-offer sent to ${order.retailerName}. Retailer notified live.`);
      setCounterModalOrder(null);
    } catch (e: any) {
      notifyError(e?.message || 'Failed to send counter-offer.');
    } finally {
      setPendingActionId(null);
    }
  };

  // 1-Click Accept & Lock Rate -> POST /api/v1/orders/:id/confirm-rate (live backend + socket)
  const handleAcceptAndLock = async (orderId: string) => {
    const order = orders.find((o) => o.id === orderId);
    if (!order) return;

    setPendingActionId(orderId);
    try {
      const result = await OrderService.acceptAndLockOrder(orderId);
      if (result.isDealLocked) {
        // Sealed: reflect the immutable locked snapshot from the response.
        setOrders((prev) =>
          prev.map((ord) => {
            if (ord.id !== orderId) return ord;
            const priceById = new Map((result.lockedItems || []).map((li) => [li.orderItemId, li.finalUnitPrice]));
            const updatedItems = ord.items.map((it) =>
              priceById.has(it.itemId) ? { ...it, currentOfferedPrice: priceById.get(it.itemId)! } : it
            );
            return {
              ...ord,
              status: 'locked',
              items: updatedItems,
              currentOfferValue: result.finalPrice,
              notes: 'Price locked & stock reserved in warehouse.',
            };
          })
        );
        notify(`🔒 Price locked at ₹${result.finalPrice.toLocaleString('en-IN')}! Order is ready for dispatch.`);
      } else {
        setOrders((prev) =>
          prev.map((ord) =>
            ord.id === orderId ? { ...ord, notes: 'Rate accepted. Awaiting retailer confirmation.' } : ord
          )
        );
        notify('✍️ Acceptance recorded. Awaiting retailer confirmation to seal the deal.');
      }
    } catch (e: any) {
      notifyError(e?.message || 'Failed to accept & lock rate.');
    } finally {
      setPendingActionId(null);
    }
  };

  // Reject -> PATCH /api/v1/orders/:id/lifecycle (toStatus 'rejected')
  const handleRejectOrder = async (orderId: string) => {
    const order = orders.find((o) => o.id === orderId);
    if (!order) return;
    const reason = window.prompt(
      `Reject purchase order ${order.orderNumber}?\nEnter a short reason for ${order.retailerName}:`,
      'Not able to fulfil at the requested rate right now.',
    );
    if (reason === null) return; // operator cancelled the prompt
    if (reason.trim().length < 3) {
      notifyError('A reason (minimum 3 characters) is required to reject an order.');
      return;
    }

    setPendingActionId(orderId);
    try {
      await OrderService.rejectOrder(orderId, { code: 'wholesaler_rejected', message: reason.trim() });
      setOrders((prev) => prev.filter((o) => o.id !== orderId));
      notify(`🚫 Rejected ${order.orderNumber}. ${order.retailerName} has been notified.`);
    } catch (e: any) {
      notifyError(e?.message || 'Failed to reject the order.');
    } finally {
      setPendingActionId(null);
    }
  };

  const filteredOrders = orders.filter((ord) => {
    if (filterStatus !== 'all' && ord.status !== filterStatus) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        ord.orderNumber.toLowerCase().includes(q) ||
        ord.retailerName.toLowerCase().includes(q) ||
        ord.items.some((i) => i.productName.toLowerCase().includes(q))
      );
    }
    return true;
  });

  // Calculate metrics
  const totalQueueValue = orders.reduce((sum, o) => sum + o.currentOfferValue, 0);
  const pendingReviewCount = orders.filter((o) => o.status === 'quoted' || o.status === 'bargaining').length;
  const lockedReadyCount = orders.filter((o) => o.status === 'locked').length;

  return (
    <div className="space-y-6 max-w-full overflow-x-hidden animate-in fade-in duration-300">
      {/* Action Notification Toast */}
      {actionSuccessMessage && (
        <div className="fixed bottom-6 right-6 z-50 px-4 py-3 rounded-xl bg-emerald-600 text-white font-bold text-xs shadow-xl flex items-center gap-2 animate-in slide-in-from-bottom-3">
          <CheckCircle2 className="w-4 h-4" />
          <span>{actionSuccessMessage}</span>
        </div>
      )}

      {/* Action Error Toast (P1.6) */}
      {actionError && (
        <div role="alert" className="fixed bottom-6 right-6 z-50 px-4 py-3 rounded-xl bg-rose-600 text-white font-bold text-xs shadow-xl flex items-center gap-2 animate-in slide-in-from-bottom-3">
          <AlertTriangle className="w-4 h-4" />
          <span>{actionError}</span>
        </div>
      )}


      {/* Top Banner Navigation & Summary */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200/90 pb-5">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-blue-600 uppercase tracking-wider mb-1">
            <span>Wholesaler Command Center</span> &bull; <span>{profile.businessName}</span>
          </div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-3">
            <Layers className="w-6 h-6 text-blue-600" />
            Incoming Purchase Orders &amp; Stock Reservation
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Review incoming B2B purchase drafts, verify godown stock availability, and manage bilateral rate bargaining.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            id="btn-ca-gstr1-export"
            onClick={() => setShowGstr1Modal(true)}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white border border-slate-200 hover:border-slate-300 text-slate-700 hover:text-slate-900 text-xs font-semibold transition shadow-xs"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-blue-600" />
            CA GSTR-1 Export
          </button>
          <button
            id="btn-credit-terms-settings"
            onClick={() => setShowCreditTermsModal(true)}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white border border-slate-200 hover:border-slate-300 text-slate-700 hover:text-slate-900 text-xs font-semibold transition shadow-xs"
          >
            <SlidersHorizontal className="w-3.5 h-3.5 text-amber-600" />
            Credit &amp; Terms
          </button>
          <button
            onClick={() => navigate('/orders')}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white border border-slate-200 hover:border-slate-300 text-slate-700 hover:text-slate-900 text-xs font-semibold transition shadow-xs"
          >
            <MessageSquare className="w-3.5 h-3.5 text-emerald-600" />
            Negotiation Kanban
          </button>
          <button
            onClick={() => navigate('/deliveries')}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition shadow-sm shadow-blue-600/20"
          >
            <Truck className="w-3.5 h-3.5" />
            Dispatch Queue
          </button>
        </div>
      </div>

      {/* 4 Top Metric Cards - Crisp White with Soft Shadows & Friendly Rounded Corners */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {/* Card 1: Active Pipeline */}
        <div className="p-4.5 rounded-xl bg-white border border-slate-200/80 shadow-sm hover:shadow transition flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 border border-blue-100 flex items-center justify-center shrink-0">
            <Layers className="w-6 h-6" />
          </div>
          <div>
            <span className="text-[11px] uppercase font-bold text-slate-500 tracking-wider">Active Pipeline</span>
            <div className="text-xl font-extrabold text-slate-900">{orders.length} Purchase Orders</div>
            <span className="text-[11px] text-blue-600 font-semibold">₹{totalQueueValue.toLocaleString('en-IN')} total</span>
          </div>
        </div>

        {/* Card 2: Awaiting Decision */}
        <div className="p-4.5 rounded-xl bg-white border border-slate-200/80 shadow-sm hover:shadow transition flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-amber-50 text-amber-600 border border-amber-100 flex items-center justify-center shrink-0">
            <Clock className="w-6 h-6" />
          </div>
          <div>
            <span className="text-[11px] uppercase font-bold text-slate-500 tracking-wider">Awaiting Decision</span>
            <div className="text-xl font-extrabold text-amber-700">{pendingReviewCount} In Negotiation</div>
            <span className="text-[11px] text-slate-500">Rate counter-offers open</span>
          </div>
        </div>

        {/* Card 3: Price Locked */}
        <div className="p-4.5 rounded-xl bg-white border border-slate-200/80 shadow-sm hover:shadow transition flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-100 flex items-center justify-center shrink-0">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <div>
            <span className="text-[11px] uppercase font-bold text-slate-500 tracking-wider">Price Locked</span>
            <div className="text-xl font-extrabold text-emerald-700">{lockedReadyCount} Ready to Pack</div>
            <span className="text-[11px] text-emerald-700 font-medium">Stock reserved</span>
          </div>
        </div>

        {/* Card 4: Godown Space */}
        <div className="p-4.5 rounded-xl bg-white border border-slate-200/80 shadow-sm hover:shadow transition flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-sky-50 text-sky-600 border border-sky-100 flex items-center justify-center shrink-0">
            <Building2 className="w-6 h-6" />
          </div>
          <div>
            <span className="text-[11px] uppercase font-bold text-slate-500 tracking-wider">Godown Space</span>
            <div className="text-xl font-extrabold text-slate-900">Naya Bazar 4B</div>
            <span className="text-[11px] text-slate-500">92% Stock healthy</span>
          </div>
        </div>
      </div>

      {/* Filters and Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white p-3 rounded-xl border border-slate-200/80 shadow-xs">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by PO number, retailer name, or product SKU..."
            className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 placeholder-slate-400 text-xs focus:bg-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-slate-500 font-medium pl-1">Status:</span>
          {(['all', 'quoted', 'bargaining', 'locked', 'delivered'] as const).map((st) => (
            <button
              key={st}
              onClick={() => setFilterStatus(st)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize transition ${
                filterStatus === st
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'bg-slate-50 text-slate-600 hover:text-slate-900 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              {st}
            </button>
          ))}
        </div>
      </div>

      {/* Mobile-first order summary: details and secondary actions are progressively disclosed. */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {isLoadingOrders && (
          <div className="rounded-2xl bg-white p-8 text-center text-sm text-slate-500 shadow-sm ring-1 ring-slate-200 sm:col-span-2 xl:col-span-3">
            Loading incoming purchase orders…
          </div>
        )}
        {!isLoadingOrders && orderLoadError && (
          <div role="alert" className="rounded-2xl bg-rose-50 p-6 text-center text-sm text-rose-700 ring-1 ring-rose-200 sm:col-span-2 xl:col-span-3">
            {orderLoadError}
          </div>
        )}
        {!isLoadingOrders && !orderLoadError && filteredOrders.length === 0 && (
          <div className="rounded-2xl bg-white p-10 text-center shadow-sm ring-1 ring-slate-200 sm:col-span-2 xl:col-span-3">
            <Layers className="mx-auto mb-3 h-9 w-9 text-slate-400" />
            <p className="text-sm font-bold text-slate-900">No purchase orders found</p>
            <p className="mt-1 text-xs text-slate-500">New retailer orders will appear here.</p>
          </div>
        )}
        {!isLoadingOrders && !orderLoadError && filteredOrders.map((order) => {
          const primaryLabel = order.status === 'locked'
            ? 'Dispatch'
            : order.status === 'delivered'
              ? 'View Invoice'
              : order.status === 'dispatched'
                ? 'Track Delivery'
                : 'Review Offer';

          return (
            <article
              key={`summary-${order.id}`}
              role="button"
              tabIndex={0}
              onClick={() => setActionSheetOrder(order)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  setActionSheetOrder(order);
                }
              }}
              className="cursor-pointer rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200 transition active:scale-[0.99]"
            >
              <div className="flex items-start justify-between gap-3">
                <h3 className="min-w-0 truncate text-base font-bold text-slate-900">{order.retailerName}</h3>
                <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold capitalize ${statusTone(order.status)}`}>
                  {order.status === 'bargaining' || order.status === 'quoted' ? 'Negotiating' : order.status.replace('_', ' ')}
                </span>
              </div>
              <p className="mt-5 text-2xl font-black tracking-tight text-slate-950">₹{order.currentOfferValue.toLocaleString('en-IN')}</p>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  if (order.status === 'locked' || order.status === 'dispatched') navigate(`/deliveries?orderId=${order.id}`);
                  else if (order.status === 'delivered') setSelectedInvoiceOrder(order);
                  else setActionSheetOrder(order);
                }}
                className="mt-4 min-h-12 w-full rounded-xl bg-blue-600 px-4 text-sm font-bold text-white transition hover:bg-blue-700"
              >
                {primaryLabel}
              </button>
            </article>
          );
        })}
      </div>

      {/* Order Cards & Data Table */}
      <div className="hidden" aria-hidden="true">
        {isLoadingOrders ? (
          <div className="p-12 text-center rounded-xl bg-white border border-slate-200 shadow-xs text-sm text-slate-500">Loading incoming purchase orders…</div>
        ) : orderLoadError ? (
          <div role="alert" className="p-8 text-center rounded-xl bg-white border border-rose-200 text-sm text-rose-700">{orderLoadError}</div>
        ) : filteredOrders.length === 0 ? (
          <div className="p-12 text-center rounded-xl bg-white border border-slate-200 shadow-xs">
            <Layers className="w-10 h-10 text-slate-400 mx-auto mb-3" />
            <p className="text-sm font-semibold text-slate-800">No purchase orders found</p>
            <p className="text-xs text-slate-500 mt-1">Try resetting the filter or search query.</p>
          </div>
        ) : (
          filteredOrders.map((order) => {
            const hasStockDeficit = order.items.some(
              (i) => i.godownAvailableStock < i.requestedQty
            );

            return (
              <div
                key={order.id}
                className="bg-white border border-slate-200/80 rounded-xl p-5 hover:border-slate-300 transition shadow-sm space-y-4"
              >
                {/* Header Row */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-xs font-bold text-blue-700 bg-blue-50 px-2.5 py-1 rounded-md border border-blue-100">
                      {order.orderNumber}
                    </span>
                    <div>
                      <div className="flex items-center gap-2">
                        <Store className="w-3.5 h-3.5 text-amber-600" />
                        <h3 className="font-bold text-slate-900 text-sm">{order.retailerName}</h3>
                        {order.retailerLocation && (
                          <span className="text-xs text-slate-500">({order.retailerLocation})</span>
                        )}
                      </div>
                      <span className="text-[11px] text-slate-400">{order.createdAt}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {order.status === 'locked' && (
                      <span className="px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-bold flex items-center gap-1.5">
                        <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" /> Price Locked
                      </span>
                    )}
                    {order.status === 'bargaining' && (
                      <span className="px-3 py-1 rounded-full bg-amber-50 border border-amber-200 text-amber-700 text-xs font-bold flex items-center gap-1.5 animate-pulse">
                        <MessageSquare className="w-3.5 h-3.5 text-amber-600" /> In Bargaining
                      </span>
                    )}
                    {order.status === 'quoted' && (
                      <span className="px-3 py-1 rounded-full bg-blue-50 border border-blue-200 text-blue-700 text-xs font-bold flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-blue-600" /> Quoted
                      </span>
                    )}

                    {hasStockDeficit && (
                      <span className="px-2.5 py-1 rounded-full bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold flex items-center gap-1">
                        <AlertTriangle className="w-3.5 h-3.5 text-rose-600" /> Stock Deficit
                      </span>
                    )}
                  </div>
                </div>

                {/* Bold Credit Risk Alert Banner (Phase 3 Task 6) */}
                {order.hasCreditRisk && !order.creditOverridden && (
                  <div className="p-4 rounded-2xl bg-rose-50 border-2 border-rose-400 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 animate-in fade-in duration-200">
                    <div className="flex items-start gap-3">
                      <div className="w-8 h-8 rounded-xl bg-rose-500 text-white flex items-center justify-center shrink-0 font-bold shadow-md shadow-rose-500/20">
                        <AlertTriangle className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="text-xs font-black text-rose-950 uppercase tracking-wider flex items-center gap-1.5">
                          🛑 BILATERAL CREDIT RISK DETECTED
                          <span className="px-2 py-0.5 rounded-full bg-rose-200 text-rose-900 text-[10px] font-bold">
                            {order.creditRiskReason}
                          </span>
                        </div>
                        <p className="text-xs text-rose-800 mt-1 leading-relaxed">
                          Retailer has exceeded credit limit or has overdue invoices. Dispatch is frozen by default unless overridden by Owner.
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0 w-full md:w-auto">
                      <button
                        id={`btn-demand-payment-${order.id}`}
                        onClick={() => handleDemandPayment(order.id)}
                        className="flex-1 md:flex-none px-3.5 py-2 rounded-xl bg-white hover:bg-slate-100 border border-rose-300 text-rose-700 font-bold text-xs shadow-xs transition"
                      >
                        🛑 Demand Payment First
                      </button>
                      <button
                        id={`btn-override-dispatch-${order.id}`}
                        onClick={() => setOverridingOrder(order)}
                        className="flex-1 md:flex-none px-4 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-black text-xs shadow-md transition flex items-center gap-1.5"
                      >
                        <ShieldCheck className="w-4 h-4" />
                        Override &amp; Allow Dispatch
                      </button>
                    </div>
                  </div>
                )}

                {/* Overridden Badge */}
                {order.creditOverridden && (
                  <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-300 flex items-center justify-between text-xs text-emerald-950">
                    <div className="flex items-center gap-2 font-bold">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span>Credit Limit Overridden by Seth: <strong className="font-normal italic">"{order.creditOverrideReason}"</strong></span>
                    </div>
                    <span className="text-[10px] font-mono text-emerald-700 font-bold uppercase">Dispatch Authorized</span>
                  </div>
                )}

                {/* Items & Stock Reservation Table - Highly Contrasted for High Merchant Legibility */}
                <div className="overflow-x-auto rounded-lg border border-slate-100">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="text-slate-600 border-b border-slate-200 bg-slate-50/70 text-[11px] font-semibold">
                        <th className="py-2.5 px-3">SKU / Item</th>
                        <th className="py-2.5 px-2 text-center">Requested Qty</th>
                        <th className="py-2.5 px-2 text-center">Godown Available</th>
                        <th className="py-2.5 px-2 text-center">Reservation Status</th>
                        <th className="py-2.5 px-2 text-right">Quoted Rate</th>
                        <th className="py-2.5 px-2 text-right">Offered Rate</th>
                        <th className="py-2.5 px-2 text-right">Margin Floor</th>
                        <th className="py-2.5 px-3 text-right">Line Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {order.items.map((item) => {
                        const isStockSufficient = item.godownAvailableStock >= item.requestedQty;
                        const reservationPercent = Math.min(
                          100,
                          Math.round((item.godownAvailableStock / item.requestedQty) * 100)
                        );
                        const isMarginSafe = item.currentOfferedPrice >= item.marginFloor;

                        return (
                          <tr key={item.itemId} className="hover:bg-slate-50/70 transition">
                            <td className="py-2.5 px-3">
                              <div className="font-semibold text-slate-900">{item.productName}</div>
                              <span className="text-[10px] font-mono text-slate-400">{item.sku}</span>
                            </td>
                            <td className="py-2.5 px-2 text-center font-bold text-slate-800">
                              {item.requestedQty} {item.unit}
                            </td>
                            <td className="py-2.5 px-2 text-center font-mono">
                              <span
                                className={`font-semibold ${
                                  isStockSufficient ? 'text-emerald-700' : 'text-rose-700'
                                }`}
                              >
                                {item.godownAvailableStock} {item.unit}
                              </span>
                            </td>
                            <td className="py-2.5 px-2 text-center">
                              <div className="inline-flex items-center gap-2">
                                <div className="w-16 bg-slate-100 rounded-full h-2 overflow-hidden border border-slate-200/60">
                                  <div
                                    className={`h-full rounded-full ${
                                      isStockSufficient ? 'bg-emerald-500' : 'bg-rose-500'
                                    }`}
                                    style={{ width: `${reservationPercent}%` }}
                                  />
                                </div>
                                <span
                                  className={`text-[10px] font-bold ${
                                    isStockSufficient ? 'text-emerald-700' : 'text-rose-700'
                                  }`}
                                >
                                  {isStockSufficient ? '100% Reserved' : 'Partial'}
                                </span>
                              </div>
                            </td>
                            <td className="py-2.5 px-2 text-right font-mono text-slate-500">
                              ₹{item.quotedPrice.toFixed(2)}
                            </td>
                            <td className="py-2.5 px-2 text-right font-mono font-bold text-slate-900">
                              ₹{item.currentOfferedPrice.toFixed(2)}
                            </td>
                            <td className="py-2.5 px-2 text-right font-mono">
                              <span
                                className={`px-1.5 py-0.5 rounded text-[10px] font-semibold border ${
                                  isMarginSafe
                                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                    : 'bg-rose-50 text-rose-700 border-rose-200'
                                }`}
                              >
                                ₹{item.marginFloor.toFixed(2)}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono font-bold text-blue-700">
                              ₹{(item.requestedQty * item.currentOfferedPrice).toLocaleString('en-IN')}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Footer Action Row */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t border-slate-100">
                  <div className="text-xs text-slate-500">
                    {order.notes && <span className="italic">Note: "{order.notes}"</span>}
                  </div>

                  <div className="flex items-center gap-2 justify-end">
                    <div className="text-right mr-3">
                      <span className="text-[10px] text-slate-400 uppercase font-semibold">Total PO Value</span>
                      <div className="text-base font-black text-slate-900 font-mono">
                        ₹{order.currentOfferValue.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </div>
                    </div>

                    <button
                      onClick={() => navigate('/orders')}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-xs font-semibold shadow-xs transition"
                    >
                      <MessageSquare className="w-3.5 h-3.5 text-emerald-600" />
                      Live Chat
                    </button>

                    {(order.status === 'locked' || order.status === 'delivered') && (
                      <button
                        id={`btn-gst-invoice-${order.id}`}
                        onClick={() => setSelectedInvoiceOrder({ id: order.id, orderNumber: order.orderNumber })}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-blue-50 hover:bg-blue-100/80 border border-blue-200 text-blue-800 text-xs font-bold shadow-xs transition"
                      >
                        <FileText className="w-3.5 h-3.5 text-blue-600" />
                        GST Tax Invoice
                      </button>
                    )}

                    {order.status === 'locked' ? (
                      <button
                        onClick={() => navigate('/deliveries')}
                        className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition shadow-sm shadow-blue-600/20"
                      >
                        <Truck className="w-3.5 h-3.5" />
                        Dispatch &amp; Generate OTP
                      </button>
                    ) : order.status === 'delivered' ? (
                      <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-bold">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                        Delivered
                      </span>
                    ) : (
                      <>
                        <button
                          id={`btn-reject-${order.id}`}
                          onClick={() => handleRejectOrder(order.id)}
                          disabled={pendingActionId === order.id}
                          className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white hover:bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold shadow-xs transition disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                          <X className="w-3.5 h-3.5" />
                          Reject
                        </button>
                        <button
                          onClick={() => handleOpenCounterModal(order)}
                          disabled={pendingActionId === order.id}
                          className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-amber-50 hover:bg-amber-100/80 border border-amber-200 text-amber-800 text-xs font-bold shadow-xs transition disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                          <SlidersHorizontal className="w-3.5 h-3.5" />
                          Counter-Offer
                        </button>
                        <button
                          id={`btn-accept-lock-${order.id}`}
                          onClick={() => handleAcceptAndLock(order.id)}
                          disabled={pendingActionId === order.id}
                          className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition shadow-sm shadow-emerald-600/20 disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                          {pendingActionId === order.id ? (
                            <LoaderCircle className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <ShieldCheck className="w-3.5 h-3.5" />
                          )}
                          {pendingActionId === order.id ? 'Working…' : 'Accept & Lock Rate'}
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {actionSheetOrder && (
        <ModalBackdrop onClose={() => setActionSheetOrder(null)} className="z-50 items-end">
          <section
            role="dialog"
            aria-modal="true"
            aria-label={`Actions for ${actionSheetOrder.retailerName}`}
            className="w-full rounded-t-3xl bg-white px-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-3 shadow-2xl sm:mx-auto sm:max-w-lg"
          >
            <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-slate-300" />
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <h2 className="truncate text-lg font-black text-slate-950">{actionSheetOrder.retailerName}</h2>
                <p className="mt-1 text-xs text-slate-500">{actionSheetOrder.orderNumber}</p>
              </div>
              <span className={`rounded-full px-3 py-1 text-xs font-bold capitalize ${statusTone(actionSheetOrder.status)}`}>
                {actionSheetOrder.status === 'bargaining' || actionSheetOrder.status === 'quoted' ? 'Negotiating' : actionSheetOrder.status.replace('_', ' ')}
              </span>
            </div>
            <p className="mt-5 text-3xl font-black tracking-tight text-slate-950">₹{actionSheetOrder.currentOfferValue.toLocaleString('en-IN')}</p>

            <div className="mt-6 grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => navigate(`/orders?orderId=${actionSheetOrder.id}`)}
                className="min-h-12 rounded-xl bg-blue-600 px-4 text-sm font-bold text-white hover:bg-blue-700"
              >
                Open Negotiation
              </button>
              <button
                type="button"
                onClick={() => navigate('/ledger')}
                className="min-h-12 rounded-xl bg-slate-100 px-4 text-sm font-bold text-slate-800 hover:bg-slate-200"
              >
                View Khata
              </button>
              {(actionSheetOrder.status === 'locked' || actionSheetOrder.status === 'dispatched') && (
                <button
                  type="button"
                  onClick={() => navigate(`/deliveries?orderId=${actionSheetOrder.id}`)}
                  className="col-span-2 min-h-12 rounded-xl bg-emerald-600 px-4 text-sm font-bold text-white hover:bg-emerald-700"
                >
                  {actionSheetOrder.status === 'locked' ? 'Dispatch Order' : 'Track Delivery'}
                </button>
              )}
              {actionSheetOrder.status === 'delivered' && (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedInvoiceOrder(actionSheetOrder);
                    setActionSheetOrder(null);
                  }}
                  className="col-span-2 min-h-12 rounded-xl bg-emerald-600 px-4 text-sm font-bold text-white hover:bg-emerald-700"
                >
                  View GST Invoice
                </button>
              )}
              {(actionSheetOrder.status === 'quoted' || actionSheetOrder.status === 'bargaining') && (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      handleOpenCounterModal(actionSheetOrder);
                      setActionSheetOrder(null);
                    }}
                    className="min-h-12 rounded-xl bg-amber-50 px-4 text-sm font-bold text-amber-800 ring-1 ring-amber-200"
                  >
                    Counter Offer
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      void handleAcceptAndLock(actionSheetOrder.id);
                      setActionSheetOrder(null);
                    }}
                    className="min-h-12 rounded-xl bg-emerald-600 px-4 text-sm font-bold text-white hover:bg-emerald-700"
                  >
                    Accept & Lock
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      void handleRejectOrder(actionSheetOrder.id);
                      setActionSheetOrder(null);
                    }}
                    className="col-span-2 min-h-12 rounded-xl bg-rose-50 px-4 text-sm font-bold text-rose-700 ring-1 ring-rose-200"
                  >
                    Reject Order
                  </button>
                </>
              )}
            </div>
          </section>
        </ModalBackdrop>
      )}

      {/* Counter Offer Modal - High Trust Light Mode Dialog */}
      {counterModalOrder && (
        <ModalBackdrop onClose={() => setCounterModalOrder(null)} className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white border border-slate-200 rounded-2xl p-6 max-w-xl w-full shadow-2xl space-y-5 animate-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div>
                <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                  <SlidersHorizontal className="w-5 h-5 text-amber-600" />
                  Propose Counter-Offer Rate
                </h3>
                <p className="text-xs text-slate-500">
                  {counterModalOrder.orderNumber} &bull; {counterModalOrder.retailerName}
                </p>
              </div>
              <button
                onClick={() => setCounterModalOrder(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              {counterModalOrder.items.map((item) => {
                const currentRate = counterRates[item.itemId] ?? item.currentOfferedPrice;
                const isUnderFloor = currentRate < item.marginFloor;

                return (
                  <div key={item.itemId} className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 space-y-2">
                    <div className="flex justify-between items-start">
                      <div>
                        <span className="font-semibold text-slate-900 text-xs">{item.productName}</span>
                        <div className="text-[11px] text-slate-500">
                          Qty: {item.requestedQty} {item.unit} | Quoted: ₹{item.quotedPrice}
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="text-[10px] text-slate-500 uppercase font-semibold">Min Margin Floor</span>
                        <div className="text-xs font-mono text-amber-700 font-bold">₹{item.marginFloor.toFixed(2)}</div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="flex-1 relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs font-mono">₹</span>
                        <input
                          type="number"
                          step="0.5"
                          value={currentRate}
                          onChange={(e) =>
                            setCounterRates({
                              ...counterRates,
                              [item.itemId]: parseFloat(e.target.value) || 0,
                            })
                          }
                          className="w-full pl-7 pr-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-900 text-xs font-mono font-bold focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                        />
                      </div>
                      <div className="text-xs font-mono text-blue-700 font-semibold">
                        Total: ₹{(item.requestedQty * currentRate).toLocaleString('en-IN')}
                      </div>
                    </div>

                    {isUnderFloor && (
                      <p className="text-[11px] text-rose-600 font-medium flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" />
                        Warning: Proposed rate is below wholesaler margin floor (₹{item.marginFloor})!
                      </p>
                    )}
                  </div>
                );
              })}

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Message / Rationale to Retailer (Optional)
                </label>
                <input
                  type="text"
                  value={counterNote}
                  onChange={(e) => setCounterNote(e.target.value)}
                  placeholder="e.g. Best price based on mandi freight charges this week."
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
              <button
                onClick={() => setCounterModalOrder(null)}
                className="px-4 py-2 rounded-lg text-slate-600 hover:text-slate-900 text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmitCounterOffer}
                disabled={pendingActionId === counterModalOrder.id}
                className="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition shadow-sm shadow-blue-600/20 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {pendingActionId === counterModalOrder.id ? 'Sending…' : 'Send Counter-Offer'}
              </button>
            </div>
          </div>
        </ModalBackdrop>
      )}

      {/* CA GSTR-1 Excel / CSV Export Modal */}
      {showGstr1Modal && (
        <CaGstr1ExportModal onClose={() => setShowGstr1Modal(false)} />
      )}

      {/* Immutable B2B GST Tax Invoice Modal */}
      {selectedInvoiceOrder && (
        <GstInvoiceModal
          orderId={selectedInvoiceOrder.id}
          orderNumber={selectedInvoiceOrder.orderNumber}
          onClose={() => setSelectedInvoiceOrder(null)}
        />
      )}

      {/* Wholesaler Credit Terms Modal (Phase 3 Task 6) */}
      {showCreditTermsModal && (
        <WholesalerCreditTermsModal
          onClose={() => setShowCreditTermsModal(false)}
          onTermsUpdated={(partnerId, limit, days) => {
            notify(`Updated terms for ${partnerId}: Limit ₹${limit.toLocaleString('en-IN')}, ${days} days.`);
          }}
        />
      )}

      {/* Wholesaler Credit Override Modal (Phase 3 Task 6) */}
      {overridingOrder && (
        <WholesalerCreditOverrideModal
          orderId={overridingOrder.id}
          orderNumber={overridingOrder.orderNumber}
          retailerName={overridingOrder.retailerName}
          currentBalance={overridingOrder.retailerDebt || 56400}
          creditLimit={overridingOrder.retailerLimit || 40000}
          overdueAmount={overridingOrder.retailerDebt && overridingOrder.retailerDebt > (overridingOrder.retailerLimit || 40000) ? overridingOrder.retailerDebt - (overridingOrder.retailerLimit || 40000) : 12400}
          onClose={() => setOverridingOrder(null)}
          onSuccess={handleOverrideSuccess}
        />
      )}
    </div>
  );
};


