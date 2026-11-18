import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  MessageSquare,
  Lock,
  Truck,
  ChevronUp,
  ChevronDown,
  X,
  Maximize2,
  Minimize2,
  Send,
  Building2,
  Store,
  FileText,
  AlertTriangle,
  ShieldCheck,
  CheckCircle2
} from 'lucide-react';
import { chatSocketService } from '../chat/chatSocketService';
import { ChatMessage, RateLockResult } from '../chat/types';
import { useRole } from '../../context/RoleContext';
import { GstInvoiceModal } from '../invoice/GstInvoiceModal';
import { WholesalerCreditOverrideModal } from '../ledger/WholesalerCreditOverrideModal';
import { LedgerService } from '../ledger/ledgerService';
import { ModalBackdrop } from '../../components/ui/DismissOnOutsideClick';

export interface KanbanOrder {
  id: string;
  connectionId: string;
  orderNumber: string;
  status: 'quoted' | 'bargaining' | 'locked' | 'in_transit' | 'delivered';
  retailerName: string;
  wholesalerName: string;
  itemsCount: number;
  itemsSummary: string;
  quotedAmount: number;
  currentAmount: number;
  activeRatePerUnit: number;
  marginFloor: number;
  unreadCount?: number;
  deliveryOtp?: string;
  driverName?: string;
  lastUpdated: string;
}

export interface NegotiationLineItem {
  id: string;
  productId: string;
  productName: string;
  quantity: number;
  unit: string;
  quotedUnitPrice: number;
  proposedUnitPrice: number;
  marginFloor: number;
  moq: number;
  godownStock: number;
  isContested: boolean;
}

const statusTone = (status: string): string => {
  if (status === 'locked' || status === 'delivered') return 'bg-emerald-50 text-emerald-700';
  if (status === 'quoted' || status === 'bargaining') return 'bg-amber-50 text-amber-800';
  if (status === 'cancelled' || status === 'rejected') return 'bg-rose-50 text-rose-700';
  return 'bg-slate-100 text-slate-600';
};

export const OrdersKanbanView: React.FC = () => {
  const { role, profile } = useRole();
  const senderUserType = role === 'wholesaler' ? 'wholesaler' : 'retailer';
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [orders, setOrders] = useState<KanbanOrder[]>([]);
  const [isLoadingOrders, setIsLoadingOrders] = useState(true);
  const [orderLoadError, setOrderLoadError] = useState<string | null>(null);

  const [activeChatOrder, setActiveChatOrder] = useState<KanbanOrder | null>(null);
  const [actionSheetOrder, setActionSheetOrder] = useState<KanbanOrder | null>(null);
  const [chatMinimized, setChatMinimized] = useState<boolean>(false);
  const [chatExpanded, setChatExpanded] = useState<boolean>(false);

  // Live Socket.io state for docked chat
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputMessage, setInputMessage] = useState<string>('');

  // Multi-Item Line Negotiation State
  const [lineItems, setLineItems] = useState<NegotiationLineItem[]>(() => {
    return [];
  });

  const [dealLocked, setDealLocked] = useState<boolean>(false);
  const [isLocking, setIsLocking] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [bargainingStatus, setBargainingStatus] = useState<
    'IDLE' | 'RATE_PROPOSED' | 'PRICE_LOCKED' | 'FINAL_OFFER_LOCKED'
  >('RATE_PROPOSED');
  const [isFinalOffer, setIsFinalOffer] = useState<boolean>(false);
  const [stockExhausted, setStockExhausted] = useState<boolean>(false);
  const [orderVersion, setOrderVersion] = useState<number>(1);
  const [selectedInvoiceOrder, setSelectedInvoiceOrder] = useState<{ id: string; orderNumber: string } | null>(null);
  const [creditRiskSimulated, setCreditRiskSimulated] = useState<boolean>(false);
  const [showOverrideModal, setShowOverrideModal] = useState<boolean>(false);
  const [orderCreditOverrides, setOrderCreditOverrides] = useState<Record<string, string>>({});

  useEffect(() => {
    const controller = new AbortController();
    const loadOrders = async () => {
      setIsLoadingOrders(true);
      setOrderLoadError(null);
      try {
        const response = await fetch('/api/v1/orders', {
          signal: controller.signal,
          headers: { Authorization: `Bearer ${sessionStorage.getItem('sharvin_token') || ''}` },
        });
        const body = await response.json();
        if (!response.ok || !body.success) throw new Error(body.error || 'Could not load orders.');

        const loadedOrders = (body.data || [])
          .filter((order: any) => !['rejected', 'cancelled'].includes(String(order.lifecycleStatus || '').toLowerCase()))
          .map((order: any): KanbanOrder => {
            const lifecycle = String(order.lifecycleStatus || '').toLowerCase();
            const legacyStatus = String(order.orderStatus || '').toLowerCase();
            const status: KanbanOrder['status'] = lifecycle === 'delivered' || lifecycle === 'partially_fulfilled' || legacyStatus === 'delivered'
              ? 'delivered'
              : lifecycle === 'dispatched' || legacyStatus === 'in_transit'
                ? 'in_transit'
                : lifecycle === 'accepted' || lifecycle === 'picking' || legacyStatus === 'price_locked'
                  ? 'locked'
                  : lifecycle === 'submitted' || legacyStatus === 'negotiating'
                    ? 'bargaining'
                    : 'quoted';
            const orderItems = Array.isArray(order.orderItems) ? order.orderItems : [];
            const quotedAmount = orderItems.reduce((sum: number, item: any) => sum + Number(item.lineTotal || Number(item.quotedUnitPrice || 0) * Number(item.quantity || 0)), 0);
            return {
              id: order.id,
              connectionId: order.connectionId,
              orderNumber: order.orderNumber,
              status,
              retailerName: order.retailer?.businessName || order.retailer?.fullName || 'Retailer',
              wholesalerName: order.wholesaler?.businessName || order.wholesaler?.fullName || 'Wholesaler',
              itemsCount: orderItems.length,
              itemsSummary: orderItems.map((item: any) => `${item.product?.productName || 'Product'} × ${item.quantity}`).join(', '),
              quotedAmount,
              currentAmount: Number(order.finalPrice ?? order.subtotal ?? quotedAmount),
              activeRatePerUnit: Number(orderItems[0]?.finalUnitPrice ?? orderItems[0]?.quotedUnitPrice ?? 0),
              marginFloor: Number(orderItems[0]?.wholesalerProduct?.marginFloorPrice ?? orderItems[0]?.wholesalerProduct?.basePrice ?? 0),
              lastUpdated: order.updatedAt ? new Date(order.updatedAt).toLocaleString() : '',
            };
          });
        setOrders(loadedOrders);
        const requestedOrder = searchParams.get('orderId');
        const selectedOrder = loadedOrders.find((order: KanbanOrder) => order.id === requestedOrder);
        if (selectedOrder) setActiveChatOrder(selectedOrder);
      } catch (error) {
        if (!controller.signal.aborted) {
          setOrders([]);
          setOrderLoadError(error instanceof Error ? error.message : 'Could not load orders.');
        }
      } finally {
        if (!controller.signal.aborted) setIsLoadingOrders(false);
      }
    };
    void loadOrders();
    return () => controller.abort();
  }, []);

  // Multi-line atomic subtotal and savings calculations
  const orderSubtotal = useMemo(() => {
    return lineItems.reduce((acc, item) => acc + item.proposedUnitPrice * item.quantity, 0);
  }, [lineItems]);

  const quotedSubtotal = useMemo(() => {
    return lineItems.reduce((acc, item) => acc + item.quotedUnitPrice * item.quantity, 0);
  }, [lineItems]);

  const totalSavings = quotedSubtotal - orderSubtotal;
  const contestedCount = lineItems.filter((i) => i.isContested).length;
  const uncontestedCount = lineItems.length - contestedCount;

  // Persist active order ID to query params & localStorage
  useEffect(() => {
    if (activeChatOrder) {
      localStorage.setItem('sharvin_active_order_id', activeChatOrder.id);
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (next.get('orderId') !== activeChatOrder.id) {
            next.set('orderId', activeChatOrder.id);
          }
          return next;
        },
        { replace: true }
      );

      const lines: NegotiationLineItem[] = [];
      setLineItems(lines);
      if (activeChatOrder.status === 'locked') {
        setDealLocked(true);
        setBargainingStatus('PRICE_LOCKED');
      } else {
        setDealLocked(false);
        setBargainingStatus('RATE_PROPOSED');
      }
    } else {
      localStorage.removeItem('sharvin_active_order_id');
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.delete('orderId');
          return next;
        },
        { replace: true }
      );
    }
  }, [activeChatOrder]);

  const handleUpdateLineRate = (itemId: string, newRate: number) => {
    if (dealLocked || isFinalOffer || isSubmitting || isLocking) return;
    setLineItems((prev) =>
      prev.map((item) => {
        if (item.id === itemId) {
          const bounded = Math.max(item.marginFloor, Number(newRate.toFixed(2)));
          const isNowContested = bounded !== item.quotedUnitPrice;
          return {
            ...item,
            proposedUnitPrice: bounded,
            isContested: isNowContested,
          };
        }
        return item;
      })
    );
  };

  // Connect socket when activeChatOrder changes
  useEffect(() => {
    if (!activeChatOrder) return;

    chatSocketService.connect();
    chatSocketService.joinOrder(activeChatOrder.id);

    setMessages([]);

    const handleNewMessage = (msg: ChatMessage) => {
      setMessages((prev) => [...prev, msg]);
    };

    const handleRateLocked = (res: RateLockResult) => {
      setDealLocked(true);
      setBargainingStatus('PRICE_LOCKED');
      setOrders((prev) =>
        prev.map((o) =>
          o.id === activeChatOrder.id ? { ...o, status: 'locked', currentAmount: res.finalPrice } : o
        )
      );
    };

    const handleRateProposed = (res: any) => {
      if (res.isFinalOffer) {
        setIsFinalOffer(true);
        setBargainingStatus('FINAL_OFFER_LOCKED');
      } else {
        setBargainingStatus('RATE_PROPOSED');
      }
      if (res.stockExhausted) {
        setStockExhausted(true);
      }
      if (res.version) {
        setOrderVersion(res.version);
      }
    };

    chatSocketService.onNewMessage(handleNewMessage);
    chatSocketService.onRateLocked(handleRateLocked);
    chatSocketService.onRateProposed(handleRateProposed);

    return () => {
      chatSocketService.leaveOrder(activeChatOrder.id);
    };
  }, [activeChatOrder]);

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputMessage.trim() || !activeChatOrder) return;

    const newMsg: ChatMessage = {
      id: `msg-${Date.now()}`,
      orderId: activeChatOrder.id,
      connectionId: activeChatOrder.connectionId,
      senderUserId: profile.userId,
      senderUserType,
      senderName: profile.businessName,
      messageType: 'text',
      messageText: inputMessage.trim(),
      fileAttachments: null,
      isDelivered: true,
      createdAt: new Date().toISOString(),
    };

    chatSocketService.sendMessage(activeChatOrder.id, inputMessage.trim());

    setMessages((prev) => [...prev, newMsg]);
    setInputMessage('');
  };

  // Bilateral Multi-Item Line Rate Proposal (Strict UI Double-Click Protection)
  const handleProposeRate = (finalOffer: boolean = false) => {
    if (!activeChatOrder || isFinalOffer || isSubmitting || isLocking) return;
    setIsSubmitting(true);

    const nextVersion = orderVersion + 1;
    setOrderVersion(nextVersion);

    if (finalOffer) {
      setIsFinalOffer(true);
      setBargainingStatus('FINAL_OFFER_LOCKED');
    } else {
      setBargainingStatus('RATE_PROPOSED');
    }

    const contestedLines = lineItems.filter((i) => i.isContested);
    const itemsToSubmit = (contestedLines.length > 0 ? contestedLines : lineItems).map((i) => ({
      orderItemId: i.id,
      proposedUnitPrice: i.proposedUnitPrice,
      proposedQuantity: i.quantity,
      reason: i.isContested
        ? finalOffer
          ? 'Final take-it-or-leave-it offer'
          : 'Counter proposal submitted'
        : 'Locked at agreed rate',
    }));

    const contestedSummaryText = contestedLines
      .map((i) => `${i.productName.split(' ')[0]} @ ₹${i.proposedUnitPrice}/${i.unit}`)
      .join(', ');

    const rateMsg: ChatMessage = {
      id: `msg-${Date.now()}`,
      orderId: activeChatOrder.id,
      connectionId: activeChatOrder.connectionId,
      senderUserId: profile.userId,
      senderUserType,
      senderName: profile.businessName,
      messageType: 'system',
      messageText: `🏷️ ${finalOffer ? 'FINAL OFFER' : 'MULTI-LINE COUNTER'}: Proposed Order Subtotal ₹${orderSubtotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })} (Savings: ₹${totalSavings.toLocaleString('en-IN')}) across ${lineItems.length} lines (${contestedCount} contested: ${contestedSummaryText}).`,
      fileAttachments: {
        orderSubtotal,
        quotedSubtotal,
        totalSavings,
        items: lineItems.map((i) => ({
          id: i.id,
          name: i.productName,
          qty: i.quantity,
          rate: i.proposedUnitPrice,
          isContested: i.isContested,
        })),
        isFinalOffer: finalOffer,
      },
      isDelivered: true,
      createdAt: new Date().toISOString(),
    };

    chatSocketService.proposeRate({
      orderId: activeChatOrder.id,
      clientVersion: orderVersion,
      isFinalOffer: finalOffer,
      items: itemsToSubmit,
      notes: finalOffer ? 'Final multi-line offer locked' : 'Multi-line counter proposal submitted',
    });

    setOrders((prev) =>
      prev.map((o) =>
        o.id === activeChatOrder.id ? { ...o, currentAmount: orderSubtotal } : o
      )
    );

    setMessages((prev) => [...prev, rateMsg]);
    setTimeout(() => {
      setIsSubmitting(false);
    }, 600);
  };

  // Accept Offer: Atomically locks all lines and transitions order to PRICE_LOCKED
  const handleAcceptOffer = () => {
    if (!activeChatOrder || stockExhausted || isLocking || isSubmitting) return;

    // Credit Risk Gate (Phase 3 Task 6)
    if (creditRiskSimulated && !orderCreditOverrides[activeChatOrder.id]) {
      alert('🛑 Credit Limit / Overdue Freeze Active! You must click [ Override & Allow Dispatch ] to authorize this restock order.');
      return;
    }

    setIsLocking(true);

    setTimeout(() => {
      setDealLocked(true);
      setIsLocking(false);
      setBargainingStatus('PRICE_LOCKED');
      setOrders((prev) =>
        prev.map((o) =>
          o.id === activeChatOrder.id ? { ...o, status: 'locked', currentAmount: orderSubtotal } : o
        )
      );

      // Lock all lines
      setLineItems((prev) =>
        prev.map((i) => ({ ...i, isContested: false }))
      );

      chatSocketService.confirmRate({
        orderId: activeChatOrder.id,
        clientVersion: orderVersion,
        items: lineItems.map((i) => ({
          orderItemId: i.id,
          agreedUnitPrice: i.proposedUnitPrice,
          agreedQuantity: i.quantity,
        })),
      });

      const lockedMsg: ChatMessage = {
        id: `msg-locked-${Date.now()}`,
        orderId: activeChatOrder.id,
        connectionId: activeChatOrder.connectionId,
        senderUserId: profile.userId,
        senderUserType,
        senderName: 'SharVin Engine',
        messageType: 'system',
        messageText: `🎉 Bilateral Contract Sealed! Both parties confirmed terms across all ${lineItems.length} lines. Total Contract Value: ₹${orderSubtotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })} (Saved ₹${totalSavings.toLocaleString('en-IN')}). Order ${activeChatOrder.orderNumber} state transitioned to PRICE_LOCKED.`,
        fileAttachments: {
          totalContractValue: orderSubtotal,
          lockedAt: new Date().toISOString(),
          items: lineItems,
        },
        isDelivered: true,
        createdAt: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, lockedMsg]);
    }, 600);
  };

  const columns = [
    {
      id: 'quoted',
      title: 'Quoted / Draft',
      color: 'border-slate-200 text-slate-700',
      badgeColor: 'bg-slate-100 text-slate-700',
      filter: (o: KanbanOrder) => o.status === 'quoted',
    },
    {
      id: 'bargaining',
      title: 'In Bargaining',
      color: 'border-amber-200 text-amber-800',
      badgeColor: 'bg-amber-50 text-amber-800 border border-amber-200',
      filter: (o: KanbanOrder) => o.status === 'bargaining',
    },
    {
      id: 'locked',
      title: 'Price Locked',
      color: 'border-emerald-200 text-emerald-700',
      badgeColor: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
      filter: (o: KanbanOrder) => o.status === 'locked',
    },
    {
      id: 'in_transit',
      title: 'In Transit',
      color: 'border-blue-200 text-blue-800',
      badgeColor: 'bg-blue-50 text-blue-800 border border-blue-200',
      filter: (o: KanbanOrder) => o.status === 'in_transit',
    },
    {
      id: 'delivered',
      title: 'Delivered & Settled',
      color: 'border-slate-200 text-slate-400',
      badgeColor: 'bg-white text-slate-400',
      filter: (o: KanbanOrder) => o.status === 'delivered',
    },
  ];

  return (
    <div className="space-y-6 max-w-full overflow-x-hidden pb-28">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight flex items-center gap-3">
            Active Orders &amp; Bargaining Pipeline
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-200 font-semibold">
              Live Real-Time Gateway
            </span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Track wholesale orders across negotiation, mutual rate lock confirmation, and transit handovers.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate('/cart')}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs transition shadow-sm"
          >
            + Create New Restock PO
          </button>
        </div>
      </div>

      {isLoadingOrders && <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">Loading your orders…</div>}
      {!isLoadingOrders && orderLoadError && <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-800">{orderLoadError}</div>}
      {!isLoadingOrders && !orderLoadError && orders.length === 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center shadow-sm">
          <Truck className="mx-auto mb-3 h-8 w-8 text-slate-400" />
          <h2 className="text-lg font-semibold text-slate-900">No active dispatches. Outbound orders will appear here.</h2>
          <p className="mt-1 text-sm text-slate-500">Orders from your business will appear as soon as you submit or receive one.</p>
        </div>
      )}

      {/* Compact Kanban: one primary action per card, everything else lives in the action sheet. */}
      {orders.length > 0 && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3 xl:grid-cols-5">
          {columns.map((column) => {
            const columnOrders = orders.filter(column.filter);
            return (
              <section key={`compact-${column.id}`} className="rounded-2xl bg-slate-50 p-3">
                <div className="mb-3 flex items-center justify-between px-1">
                  <h2 className="text-xs font-bold text-slate-800">{column.title}</h2>
                  <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-bold text-slate-600 shadow-sm">
                    {columnOrders.length}
                  </span>
                </div>
                <div className="space-y-3">
                  {columnOrders.length === 0 ? (
                    <p className="rounded-xl bg-white p-4 text-center text-xs text-slate-400">No orders</p>
                  ) : columnOrders.map((order) => {
                    const partnerName = role === 'retailer' ? order.wholesalerName : order.retailerName;
                    const primaryLabel = order.status === 'locked'
                      ? 'Dispatch'
                      : order.status === 'in_transit'
                        ? 'Track Delivery'
                        : order.status === 'delivered'
                          ? 'View Invoice'
                          : 'Review Offer';

                    return (
                      <article
                        key={`compact-${order.id}`}
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
                        <div className="flex items-start justify-between gap-2">
                          <h3 className="min-w-0 truncate text-sm font-bold text-slate-900">{partnerName}</h3>
                          <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-bold capitalize ${statusTone(order.status)}`}>
                            {order.status === 'quoted' || order.status === 'bargaining' ? 'Negotiating' : order.status.replace('_', ' ')}
                          </span>
                        </div>
                        <p className="mt-4 text-xl font-black tracking-tight text-slate-950">
                          ₹{order.currentAmount.toLocaleString('en-IN')}
                        </p>
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            if (order.status === 'quoted' || order.status === 'bargaining') {
                              setActiveChatOrder(order);
                              setChatMinimized(false);
                            } else if (order.status === 'delivered') {
                              setSelectedInvoiceOrder({ id: order.id, orderNumber: order.orderNumber });
                            } else {
                              navigate('/deliveries');
                            }
                          }}
                          className={`mt-4 min-h-11 w-full rounded-xl px-3 text-xs font-bold text-white transition ${
                            order.status === 'locked' || order.status === 'delivered'
                              ? 'bg-emerald-600 hover:bg-emerald-700'
                              : 'bg-amber-500 hover:bg-amber-600'
                          }`}
                        >
                          {primaryLabel}
                        </button>
                      </article>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      )}

      {/* Kanban Board Columns Grid */}
      {orders.length > 0 && <div className="hidden">
        {columns.map((col) => {
          const colOrders = orders.filter(col.filter);
          return (
            <div
              key={col.id}
              className="bg-white border border-slate-200 rounded-2xl p-3 space-y-3 flex flex-col min-h-[500px]"
            >
              {/* Column Title Bar */}
              <div className="flex items-center justify-between px-1 pb-2 border-b border-slate-200">
                <span className="text-xs font-bold text-slate-800">{col.title}</span>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${col.badgeColor}`}>
                  {colOrders.length}
                </span>
              </div>

              {/* Order Cards */}
              <div className="space-y-2.5 flex-1">
                {colOrders.length === 0 ? (
                  <div className="p-4 text-center text-xs text-slate-500 border border-dashed border-slate-200 rounded-xl">
                    No orders in this stage
                  </div>
                ) : (
                  colOrders.map((order) => {
                    const isSelected = activeChatOrder?.id === order.id;
                    return (
                      <div
                        key={order.id}
                        onClick={() => {
                          setActiveChatOrder(order);
                          setChatMinimized(false);
                        }}
                        className={`p-3.5 rounded-xl border text-xs cursor-pointer transition select-none relative group ${
                          isSelected
                            ? 'bg-slate-100 border-amber-500 shadow-md shadow-amber-500/10'
                            : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-100'
                        }`}
                      >
                        {/* Order Header */}
                        <div className="flex items-center justify-between">
                          <span className="font-mono font-bold text-amber-600 text-[11px]">
                            {order.orderNumber}
                          </span>
                          <span className="text-[10px] text-slate-400">{order.lastUpdated}</span>
                        </div>

                        {/* Partner Name */}
                        <div className="flex items-center gap-1.5 mt-2 font-semibold text-slate-800">
                          {role === 'retailer' ? (
                            <>
                              <Building2 className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                              <span className="truncate">{order.wholesalerName}</span>
                            </>
                          ) : (
                            <>
                              <Store className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                              <span className="truncate">{order.retailerName}</span>
                            </>
                          )}
                        </div>

                        {/* Summary */}
                        <p className="text-[11px] text-slate-400 mt-1 line-clamp-2">
                          {order.itemsSummary}
                        </p>

                        {/* Pricing & Footer Actions */}
                        <div className="mt-3 pt-2.5 border-t border-slate-200 flex items-center justify-between">
                          <div>
                            <span className="text-[10px] text-slate-500 block">Total Amount</span>
                            <span className="font-bold text-slate-900 text-xs">
                              ₹{order.currentAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                            </span>
                          </div>

                          {order.status === 'bargaining' && (
                            <span className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 font-bold border border-amber-200 animate-pulse">
                              <MessageSquare className="w-3 h-3" /> Live Chat
                            </span>
                          )}

                          {order.status === 'locked' && (
                            <span className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-bold border border-emerald-200">
                              <Lock className="w-3 h-3" /> Rate Locked
                            </span>
                          )}

                          {order.status === 'in_transit' && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                navigate('/deliveries');
                              }}
                              className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-blue-50 text-blue-800 font-bold border border-blue-200 hover:bg-blue-50"
                            >
                              <Truck className="w-3 h-3" /> OTP Ready
                            </button>
                          )}

                          {order.status === 'delivered' && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedInvoiceOrder({ id: order.id, orderNumber: order.orderNumber });
                              }}
                              className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-bold border border-emerald-200 hover:bg-emerald-50"
                              id={`btn-kanban-invoice-${order.id}`}
                            >
                              <FileText className="w-3 h-3" /> GST Invoice
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>}

      {actionSheetOrder && (
        <ModalBackdrop onClose={() => setActionSheetOrder(null)} className="z-50 items-end">
          <section
            role="dialog"
            aria-modal="true"
            aria-label={`Actions for ${role === 'retailer' ? actionSheetOrder.wholesalerName : actionSheetOrder.retailerName}`}
            className="w-full rounded-t-3xl bg-white px-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-3 shadow-2xl sm:mx-auto sm:max-w-lg"
          >
            <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-slate-300" />
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="truncate text-lg font-black text-slate-950">
                  {role === 'retailer' ? actionSheetOrder.wholesalerName : actionSheetOrder.retailerName}
                </h2>
                <p className="mt-1 text-xs text-slate-500">{actionSheetOrder.orderNumber}</p>
              </div>
              <span className={`rounded-full px-3 py-1 text-xs font-bold capitalize ${statusTone(actionSheetOrder.status)}`}>
                {actionSheetOrder.status === 'quoted' || actionSheetOrder.status === 'bargaining'
                  ? 'Negotiating'
                  : actionSheetOrder.status.replace('_', ' ')}
              </span>
            </div>
            <p className="mt-5 text-3xl font-black tracking-tight text-slate-950">
              ₹{actionSheetOrder.currentAmount.toLocaleString('en-IN')}
            </p>
            <p className="mt-2 text-sm text-slate-500">{actionSheetOrder.itemsSummary}</p>

            <div className="mt-6 grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => {
                  setActiveChatOrder(actionSheetOrder);
                  setChatMinimized(false);
                  setActionSheetOrder(null);
                }}
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
              {(actionSheetOrder.status === 'locked' || actionSheetOrder.status === 'in_transit') && (
                <button
                  type="button"
                  onClick={() => navigate('/deliveries')}
                  className="col-span-2 min-h-12 rounded-xl bg-emerald-600 px-4 text-sm font-bold text-white hover:bg-emerald-700"
                >
                  {actionSheetOrder.status === 'locked' ? 'Dispatch Order' : 'Track Delivery'}
                </button>
              )}
              {actionSheetOrder.status === 'delivered' && (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedInvoiceOrder({ id: actionSheetOrder.id, orderNumber: actionSheetOrder.orderNumber });
                    setActionSheetOrder(null);
                  }}
                  className="col-span-2 min-h-12 rounded-xl bg-emerald-600 px-4 text-sm font-bold text-white hover:bg-emerald-700"
                >
                  View GST Invoice
                </button>
              )}
              {role === 'wholesaler' && (actionSheetOrder.status === 'quoted' || actionSheetOrder.status === 'bargaining') && (
                <button
                  type="button"
                  onClick={() => {
                    setActiveChatOrder(actionSheetOrder);
                    setShowOverrideModal(true);
                    setActionSheetOrder(null);
                  }}
                  className="col-span-2 min-h-12 rounded-xl bg-amber-50 px-4 text-sm font-bold text-amber-800 ring-1 ring-amber-200"
                >
                  Credit Override Options
                </button>
              )}
            </div>
          </section>
        </ModalBackdrop>
      )}

      {/* ========================================================================= */}
      {/* BOTTOM-DOCKED INTERACTIVE NEGOTIATION CHAT DRAWER */}
      {/* ========================================================================= */}
      {activeChatOrder && (
        <div
          className={`fixed bottom-0 right-4 sm:right-8 z-50 bg-white border border-slate-300/80 rounded-t-2xl shadow-2xl transition-all duration-200 flex flex-col ${
            chatMinimized
              ? 'h-14 w-80 sm:w-96'
              : chatExpanded
              ? 'h-[85vh] w-[95vw] sm:w-[700px]'
              : 'h-[500px] w-[95vw] sm:w-[540px]'
          }`}
        >
          {/* Drawer Header Bar */}
          <div className="h-14 px-4 bg-slate-100 rounded-t-2xl border-b border-slate-200 flex items-center justify-between select-none">
            <div
              onClick={() => setChatMinimized(!chatMinimized)}
              className="flex items-center gap-2.5 cursor-pointer flex-1"
            >
              <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse"></div>
              <div>
                <p className="text-xs font-bold text-slate-900 flex items-center gap-2">
                  <span>Chat: {activeChatOrder.orderNumber}</span>
                  <span className="text-[10px] font-normal text-amber-600 font-mono">
                    ({role === 'retailer' ? activeChatOrder.wholesalerName : activeChatOrder.retailerName})
                  </span>
                </p>
                <p className="text-[10px] text-slate-400">
                  {dealLocked ? '🔒 Bilateral Rate Locked' : '🤝 Live Negotiation Channel'}
                </p>
              </div>
            </div>

            {/* Window Controls */}
            <div className="flex items-center gap-1 text-slate-400">
              <button
                onClick={() => setChatMinimized(!chatMinimized)}
                className="p-1.5 rounded-lg hover:bg-slate-200 hover:text-slate-900"
                title={chatMinimized ? 'Expand' : 'Minimize'}
              >
                {chatMinimized ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>
              {!chatMinimized && (
                <button
                  onClick={() => setChatExpanded(!chatExpanded)}
                  className="p-1.5 rounded-lg hover:bg-slate-200 hover:text-slate-900"
                  title={chatExpanded ? 'Standard view' : 'Full view'}
                >
                  {chatExpanded ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
                </button>
              )}
              <button
                onClick={() => setActiveChatOrder(null)}
                className="p-1.5 rounded-lg hover:bg-slate-200 hover:text-slate-900"
                title="Close Chat"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Drawer Body (Visible only when not minimized) */}
          {!chatMinimized && (
            <div className="flex-1 flex flex-col overflow-hidden bg-slate-50">
              {/* TOP STRIP: Multi-Item Line Negotiation Engine */}
              <div className="bg-white border-b border-slate-200 p-3 space-y-2 text-xs">
                {/* Contract Summary Bar */}
                <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-200">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-900 text-sm">
                      ₹{orderSubtotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </span>
                    <span className="text-[10px] text-slate-400 line-through">
                      ₹{quotedSubtotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </span>
                    {totalSavings > 0 && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-bold border border-emerald-200">
                        Save ₹{totalSavings.toLocaleString('en-IN')}
                      </span>
                    )}
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded-full font-mono font-bold border ${
                        bargainingStatus === 'PRICE_LOCKED' || dealLocked
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : bargainingStatus === 'FINAL_OFFER_LOCKED'
                          ? 'bg-purple-50 text-purple-700 border-purple-200'
                          : 'bg-amber-50 text-amber-800 border-amber-200'
                      }`}
                    >
                      {dealLocked ? 'PRICE_LOCKED' : bargainingStatus}
                    </span>
                    <span className="text-[10px] text-slate-400 font-medium">
                      ({contestedCount} contested, {uncontestedCount} locked)
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    {/* Stock Simulation Toggle (Edge Case 2) */}
                    <button
                      type="button"
                      onClick={() => setStockExhausted(!stockExhausted)}
                      className={`px-2 py-1 rounded-xl text-[10px] font-bold border transition ${
                        stockExhausted
                          ? 'bg-rose-50 text-rose-700 border-rose-200'
                          : 'bg-slate-100 text-slate-700 border-slate-300'
                      }`}
                      title="Toggle simulated Godown inventory level"
                    >
                      {stockExhausted ? '⚠️ Depot Stock: Exhausted' : '📦 Depot Stock: Normal'}
                    </button>

                    {/* Credit Risk Simulation Toggle (Phase 3 Task 6) */}
                    <button
                      type="button"
                      id="btn-toggle-credit-risk"
                      onClick={() => setCreditRiskSimulated(!creditRiskSimulated)}
                      className={`px-2 py-1 rounded-xl text-[10px] font-bold border transition ${
                        creditRiskSimulated
                          ? 'bg-rose-50 text-rose-700 border-rose-200'
                          : 'bg-slate-100 text-slate-700 border-slate-300'
                      }`}
                      title="Toggle simulated Credit Limit Exhaustion / Overdue Bills"
                    >
                      {creditRiskSimulated ? '🛑 Credit Risk: Blocked' : '💳 Credit Risk: Normal'}
                    </button>
                  </div>
                </div>

                {/* Wholesaler Credit Risk Hazard Banner (Phase 3 Task 6) */}
                {activeChatOrder && creditRiskSimulated && !orderCreditOverrides[activeChatOrder.id] && (
                  <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 animate-in fade-in duration-200">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                      <span>
                        <strong>Bilateral Credit Alert:</strong> Retailer has exceeded credit limit (₹56,400 / ₹50,000) or has overdue bills. Deal lock is frozen.
                      </span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        id="btn-kanban-demand-payment"
                        onClick={async () => {
                          await LedgerService.demandPayment(activeChatOrder.id, 'Formal payment demand issued before dispatch.');
                          alert(`🛑 Formal payment demand issued to ${activeChatOrder.retailerName}. Bargaining frozen.`);
                        }}
                        className="px-2.5 py-1 rounded-lg bg-rose-50 hover:bg-rose-50 text-rose-700 border border-rose-200 text-[10px] font-bold transition"
                      >
                        🛑 Demand Payment
                      </button>
                      <button
                        id="btn-kanban-override-credit"
                        onClick={() => setShowOverrideModal(true)}
                        className="px-2.5 py-1 rounded-lg bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 text-[10px] font-black shadow transition flex items-center gap-1"
                      >
                        <ShieldCheck className="w-3 h-3" />
                        Override &amp; Allow Dispatch
                      </button>
                    </div>
                  </div>
                )}

                {/* Overridden Badge */}
                {activeChatOrder && orderCreditOverrides[activeChatOrder.id] && (
                  <div className="p-2 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs flex items-center justify-between">
                    <span className="flex items-center gap-1.5 font-bold">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                      Credit Override Authorized by Seth: "{orderCreditOverrides[activeChatOrder.id]}"
                    </span>
                    <span className="text-[10px] text-emerald-600 font-mono">Bilateral Lock Permitted</span>
                  </div>
                )}

                {/* Multi-Item Line Items Grid */}
                <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                  {lineItems.map((line) => {
                    const lineTotal = line.proposedUnitPrice * line.quantity;
                    return (
                      <div
                        key={line.id}
                        className={`p-2 rounded-xl border flex items-center justify-between gap-2 transition ${
                          line.isContested
                            ? 'bg-amber-50 border-amber-200'
                            : 'bg-slate-50/70 border-slate-200'
                        }`}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="font-semibold text-slate-800 text-[11px] truncate">
                              {line.productName}
                            </span>
                            <span
                              className={`text-[9px] px-1.5 py-0.2 rounded font-mono font-bold uppercase ${
                                line.isContested
                                  ? 'bg-amber-50 text-amber-800'
                                  : 'bg-emerald-50 text-emerald-700'
                              }`}
                            >
                              {line.isContested ? 'Contested' : 'Locked'}
                            </span>
                          </div>
                          <div className="text-[10px] text-slate-400">
                            {line.quantity} {line.unit} &bull; Quoted: ₹{line.quotedUnitPrice.toFixed(2)} &bull; Line Total: <strong className="text-slate-800 font-mono">₹{lineTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</strong>
                          </div>
                        </div>

                        {/* Rate Stepper */}
                        <div className="flex items-center bg-white px-2 py-1 rounded-lg border border-slate-200 shrink-0">
                          <span className="text-[10px] text-slate-400 mr-1.5 font-mono">₹/unit:</span>
                          <button
                            onClick={() => handleUpdateLineRate(line.id, line.proposedUnitPrice - 5)}
                            disabled={dealLocked || isFinalOffer || isSubmitting || isLocking}
                            className="px-1.5 py-0.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold disabled:opacity-40 disabled:cursor-not-allowed text-[11px]"
                            title={`Minimum margin floor: ₹${line.marginFloor}`}
                          >
                            -
                          </button>
                          <span className="mx-1.5 font-mono font-bold text-amber-800 text-[11px]">
                            ₹{line.proposedUnitPrice.toFixed(2)}
                          </span>
                          <button
                            onClick={() => handleUpdateLineRate(line.id, line.proposedUnitPrice + 5)}
                            disabled={dealLocked || isFinalOffer || isSubmitting || isLocking}
                            className="px-1.5 py-0.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold disabled:opacity-40 disabled:cursor-not-allowed text-[11px]"
                          >
                            +
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Stock Exhaustion Warning (Edge Case 2) */}
                {stockExhausted && (
                  <div className="p-2 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-[11px] flex items-center justify-between gap-2">
                    <span className="font-semibold flex items-center gap-1.5">
                      ⚠️ Godown Stock Depleted: Insufficient inventory across one or more line items.
                    </span>
                    <span className="text-[10px] px-2 py-0.5 rounded-md bg-white text-rose-800 border border-rose-200 font-bold">
                      Accept Disabled
                    </span>
                  </div>
                )}

                {/* Final Offer Advisory */}
                {isFinalOffer && !dealLocked && (
                  <div className="p-2 rounded-xl bg-purple-50 border border-purple-200 text-purple-800 text-[11px] font-semibold">
                    🔒 Final Take-It-Or-Leave-It Offer: Counter negotiations locked. Recipient must Accept or Reject.
                  </div>
                )}

                {/* The 3 Explicit Handshake Actions with Strict Double-Click Prevention */}
                <div className="flex items-center justify-end gap-2 pt-1 border-t border-slate-200/60">
                  {!dealLocked ? (
                    <>
                      {/* 1. Accept Offer */}
                      <button
                        data-testid="accept-offer-btn"
                        onClick={handleAcceptOffer}
                        disabled={isLocking || isSubmitting || stockExhausted}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[11px] transition shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
                        title={stockExhausted ? 'Stock exhausted in wholesaler godown' : 'Atomically lock all lines'}
                      >
                        <Lock className="w-3 h-3" />
                        {isLocking ? 'Locking...' : 'Accept All Lines'}
                      </button>

                      {/* 2. Counter Offer */}
                      <button
                        data-testid="counter-offer-btn"
                        onClick={() => handleProposeRate(false)}
                        disabled={isFinalOffer || isSubmitting || isLocking}
                        className="px-2.5 py-1.5 rounded-xl bg-amber-50 hover:bg-amber-50 text-amber-800 font-bold text-[11px] border border-amber-200 transition disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1"
                      >
                        {isSubmitting ? 'Proposing...' : 'Counter Offer'}
                      </button>

                      {/* 3. Final Offer */}
                      <button
                        data-testid="final-offer-btn"
                        onClick={() => handleProposeRate(true)}
                        disabled={isFinalOffer || isSubmitting || isLocking}
                        className="px-2.5 py-1.5 rounded-xl bg-purple-50 hover:bg-purple-50 text-purple-700 font-bold text-[11px] border border-purple-200 transition disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1"
                      >
                        {isSubmitting ? 'Locking Final...' : 'Final Offer'}
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => navigate('/deliveries')}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 text-slate-950 font-bold text-[11px] shadow-md transition"
                    >
                      <Truck className="w-3.5 h-3.5" /> Proceed to Two-Way Delivery Handover
                    </button>
                  )}
                </div>
              </div>

              {/* Messages Thread Container */}
              <div className="flex-1 p-3 overflow-y-auto space-y-2.5">
                {messages.map((msg) => {
                  const isMine = msg.senderUserId === profile.userId;
                  const isSystem = msg.messageType === 'system';

                  if (isSystem) {
                    return (
                      <div
                        key={msg.id}
                        className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-center text-xs font-medium"
                      >
                        {msg.messageText}
                      </div>
                    );
                  }

                  return (
                    <div
                      key={msg.id}
                      className={`flex flex-col ${isMine ? 'items-end' : 'items-start'}`}
                    >
                      <div
                        className={`max-w-[85%] p-2.5 rounded-2xl text-xs ${
                          isMine
                            ? 'bg-amber-500 text-slate-950 font-medium rounded-br-none shadow-sm'
                            : 'bg-white border border-slate-200 text-slate-800 rounded-bl-none'
                        }`}
                      >
                        <div className="text-[10px] font-bold opacity-75 mb-0.5">
                          {msg.senderName} ({msg.senderUserType})
                        </div>
                        <p>{msg.messageText}</p>
                      </div>
                      <span className="text-[9px] text-slate-500 px-1 mt-0.5">
                        {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* Bottom Message Input */}
              <form onSubmit={handleSendMessage} className="p-2.5 bg-white border-t border-slate-200 flex items-center gap-2">
                <input
                  type="text"
                  value={inputMessage}
                  onChange={(e) => setInputMessage(e.target.value)}
                  placeholder={dealLocked ? "Deal locked. Type any delivery or notes here..." : "Type bargaining message or counter terms..."}
                  className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-amber-500"
                />
                <button
                  type="submit"
                  disabled={!inputMessage.trim()}
                  className="p-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold transition disabled:opacity-40"
                >
                  <Send className="w-3.5 h-3.5" />
                </button>
              </form>
            </div>
          )}
        </div>
      )}

      {/* Immutable B2B GST Tax Invoice Modal */}
      {selectedInvoiceOrder && (
        <GstInvoiceModal
          orderId={selectedInvoiceOrder.id}
          orderNumber={selectedInvoiceOrder.orderNumber}
          onClose={() => setSelectedInvoiceOrder(null)}
        />
      )}

      {/* Wholesaler Credit Override Modal (Phase 3 Task 6) */}
      {showOverrideModal && activeChatOrder && (
        <WholesalerCreditOverrideModal
          orderId={activeChatOrder.id}
          orderNumber={activeChatOrder.orderNumber}
          retailerName={activeChatOrder.retailerName}
          currentBalance={56400.00}
          creditLimit={50000.00}
          overdueAmount={12400.00}
          onClose={() => setShowOverrideModal(false)}
          onSuccess={(reason) => {
            setOrderCreditOverrides((prev) => ({
              ...prev,
              [activeChatOrder.id]: reason,
            }));
            setShowOverrideModal(false);
          }}
        />
      )}
    </div>
  );
};
