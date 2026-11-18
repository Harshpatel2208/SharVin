import React, { useState, useEffect, useRef } from 'react';
import {
  MessageSquare,
  Lock,
  CheckCircle2,
  AlertCircle,
  Send,
  Store,
} from 'lucide-react';
import { chatSocketService } from './chatSocketService';
import { useRole } from '../../context/RoleContext';
import {
  ChatMessage,
  SenderUserType,
  RateProposalResult,
  RateLockResult,
  NegotiationStatusResult,
  TypingStatus,
  LineRateProposed,
  LineRateLocked
} from './types';

interface LiveNegotiationViewProps {
  orderId?: string;
  orderNumber?: string;
  onBackToCart?: () => void;
  onBackToOverview?: () => void;
  onProceedToDelivery?: (orderId: string) => void;
}

interface DemoOrderItem {
  id: string;
  productId: string;
  productName: string;
  quantity: number;
  quotedUnitPrice: number;
  activeUnitPrice: number;
  gstRate?: number;
  locked?: boolean;
}

export const LiveNegotiationView: React.FC<LiveNegotiationViewProps> = ({
  orderId = 'ord-po-demo-01',
  orderNumber = 'PO-2026-0042',
  onBackToCart,
  onBackToOverview,
  onProceedToDelivery,
}) => {
  const { user, role } = useRole();
  const currentUserRole = role as SenderUserType;
  const userName = user?.businessName || user?.fullName || 'SharVin user';

  // Live Chat & Negotiation State
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState<string>('');
  const [typingUser, setTypingUser] = useState<string | null>(null);
  const [isSocketConnected, setIsSocketConnected] = useState<boolean>(false);

  // Negotiation Status
  const [negotiationStatus, setNegotiationStatus] = useState<NegotiationStatusResult | null>(null);
  const [dealLockedSnapshot, setDealLockedSnapshot] = useState<RateLockResult | null>(null);

  const [proposalError, setProposalError] = useState<string | null>(null);
  const [isSubmittingProposal, setIsSubmittingProposal] = useState<boolean>(false);
  const [isConfirmingRate, setIsConfirmingRate] = useState<boolean>(false);
  const [actionSuccessBanner, setActionSuccessBanner] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<any>(null);

  // Default Mock Items (if backend has not initialized order yet)
  const [orderItems, setOrderItems] = useState<DemoOrderItem[]>([
    {
      id: 'item-01',
      productId: 'p-001',
      productName: 'Aashirvaad Shudh Chakki Atta 10kg',
      quantity: 25,
      quotedUnitPrice: 420.00,
      activeUnitPrice: 420.00,
      gstRate: 5,
    },
    {
      id: 'item-02',
      productId: 'p-004',
      productName: 'India Gate Basmati Rice Feast Rozzana 5kg',
      quantity: 15,
      quotedUnitPrice: 460.00,
      activeUnitPrice: 460.00,
      gstRate: 5,
    },
  ]);

  // 1. Initial Load: Fetch status and messages from REST API
  useEffect(() => {
    let isMounted = true;

    const loadNegotiationData = async () => {
      try {
        // Fetch status
        const statusRes = await fetch(`/api/v1/orders/${orderId}/negotiation-status`, {
          headers: {
            Authorization: `Bearer ${sessionStorage.getItem('sharvin_token') || ''}`,
          },
        });
        if (statusRes.ok) {
          const statusJson = await statusRes.json();
          if (statusJson.success && isMounted) {
            setNegotiationStatus(statusJson.data);
            if (statusJson.data.items && statusJson.data.items.length > 0) {
              setOrderItems(
                statusJson.data.items.map((i: any) => ({
                  id: i.orderItemId,
                  productId: i.orderItemId,
                  productName: i.productName,
                  quantity: i.quantity,
                  quotedUnitPrice: i.quotedUnitPrice,
                  activeUnitPrice: i.activeProposedPrice,
                  gstRate: i.gstRate ?? 5,
                }))
              );
            }
          }
        }

        // Fetch messages
        const msgRes = await fetch(`/api/v1/orders/${orderId}/messages`, {
          headers: {
            Authorization: `Bearer ${sessionStorage.getItem('sharvin_token') || ''}`,
          },
        });
        if (msgRes.ok) {
          const msgJson = await msgRes.json();
          if (msgJson.success && msgJson.data.messages && isMounted) {
            setMessages(msgJson.data.messages);
          }
        }
      } catch (err) {
        console.warn('Using offline mock state for negotiation view:', err);
      }
    };

    loadNegotiationData();

    // 2. Connect to Socket.io Gateway
    const socket = chatSocketService.connect();
    setIsSocketConnected(socket.connected);

    socket.on('connect', () => {
      setIsSocketConnected(true);
      chatSocketService.joinOrder(orderId);
    });

    socket.on('disconnect', () => {
      setIsSocketConnected(false);
    });

    chatSocketService.joinOrder(orderId);

    // 3. Register Socket.io Event Listeners
    const unsubscribeNewMsg = chatSocketService.onNewMessage((msg: ChatMessage) => {
      setMessages((prev) => {
        if (prev.some((m) => m.id === msg.id)) return prev;
        return [...prev, msg];
      });
      // Check for rate proposal payload
      if (msg.fileAttachments?.type === 'rate_proposal') {
        const payload = msg.fileAttachments;
        if (payload.items) {
          setOrderItems((prev) =>
            prev.map((item) => {
              const matched = payload.items.find((pi: any) => pi.orderItemId === item.id);
              if (matched) {
                return { ...item, activeUnitPrice: matched.proposedUnitPrice };
              }
              return item;
            })
          );
        }
      }
    });

    const unsubscribeRateProposed = chatSocketService.onRateProposed((proposal: RateProposalResult) => {
      setOrderItems((prev) =>
        prev.map((item) => {
          const matched = proposal.items.find((pi) => pi.orderItemId === item.id);
          if (matched) {
            return { ...item, activeUnitPrice: matched.proposedUnitPrice };
          }
          return item;
        })
      );

      setNegotiationStatus((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          retailerConfirmed: proposal.proposerRole === 'retailer',
          wholesalerConfirmed: proposal.proposerRole === 'wholesaler',
          isDealLocked: false,
          currentSubtotal: proposal.proposedSubtotal,
        };
      });

      setActionSuccessBanner(`New price proposal received from ${proposal.proposerName}!`);
      setTimeout(() => setActionSuccessBanner(null), 5000);
    });

    const unsubscribeRateLocked = chatSocketService.onRateLocked((lockResult: RateLockResult) => {
      setDealLockedSnapshot(lockResult);
      setNegotiationStatus((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          orderStatus: 'deal_locked',
          isDealLocked: true,
          retailerConfirmed: true,
          wholesalerConfirmed: true,
          finalPrice: lockResult.finalPrice,
          lockedAt: lockResult.lockedAt,
        };
      });

      if (lockResult.lockedItems) {
        setOrderItems((prev) =>
          prev.map((item) => {
            const matched = lockResult.lockedItems.find((li) => li.orderItemId === item.id);
            if (matched) {
              return { ...item, activeUnitPrice: matched.finalUnitPrice };
            }
            return item;
          })
        );
      }

      setActionSuccessBanner('🤝 MUTUAL BILATERAL RATE LOCKED! Purchase Order price is frozen.');
    });

    // P1.2: atomic per-line socket updates (coexist with the whole-order events above)
    const unsubscribeLineProposed = chatSocketService.onLineRateProposed((line: LineRateProposed) => {
      setOrderItems((prev) =>
        prev.map((item) =>
          item.id === line.orderItemId
            ? { ...item, activeUnitPrice: line.proposedUnitPrice, gstRate: line.gstRate, locked: false }
            : item
        )
      );
    });

    const unsubscribeLineLocked = chatSocketService.onLineRateLocked((line: LineRateLocked) => {
      setOrderItems((prev) =>
        prev.map((item) =>
          item.id === line.orderItemId
            ? { ...item, activeUnitPrice: line.finalUnitPrice, gstRate: line.gstRate, locked: true }
            : item
        )
      );
    });

    const unsubscribeOrderLocked = chatSocketService.onOrderPriceLocked((res: RateLockResult) => {
      // Whole-order seal alias: freeze every line at its final rate (no second banner).
      if (res.lockedItems) {
        setOrderItems((prev) =>
          prev.map((item) => {
            const matched = res.lockedItems.find((li) => li.orderItemId === item.id);
            return matched ? { ...item, activeUnitPrice: matched.finalUnitPrice, locked: true } : item;
          })
        );
      }
    });

    const unsubscribePending = chatSocketService.onRateConfirmationPending((pendingResult: RateLockResult) => {
      setNegotiationStatus((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          retailerConfirmed: pendingResult.retailerConfirmed,
          wholesalerConfirmed: pendingResult.wholesalerConfirmed,
          finalPrice: pendingResult.finalPrice,
        };
      });
      setActionSuccessBanner(`${pendingResult.confirmedBy.name} has confirmed! Awaiting your match to lock the rate.`);
      setTimeout(() => setActionSuccessBanner(null), 5000);
    });

    const unsubscribeTyping = chatSocketService.onUserTyping((status: TypingStatus) => {
      if (status.isTyping) {
        setTypingUser(status.name);
      } else {
        setTypingUser(null);
      }
    });

    return () => {
      isMounted = false;
      unsubscribeNewMsg();
      unsubscribeRateProposed();
      unsubscribeRateLocked();
      unsubscribeLineProposed();
      unsubscribeLineLocked();
      unsubscribeOrderLocked();
      unsubscribePending();
      unsubscribeTyping();
      chatSocketService.leaveOrder(orderId);
    };
  }, [orderId]);

  // Socket broadcasts can be missed while disconnected; refresh the canonical order state after reconnect.
  useEffect(() => {
    const refreshAuthoritativeOrder = async () => {
      try {
        const response = await fetch(`/api/v1/orders/${orderId}/negotiation-status`, {
          headers: { Authorization: `Bearer ${sessionStorage.getItem('sharvin_token') || ''}` },
        });
        if (!response.ok) return;
        const body = await response.json();
        if (!body.success || !body.data) return;

        setNegotiationStatus(body.data);
        if (Array.isArray(body.data.items)) {
          setOrderItems(body.data.items.map((item: any) => ({
            id: item.orderItemId,
            productId: item.orderItemId,
            productName: item.productName,
            quantity: item.quantity,
            quotedUnitPrice: item.quotedUnitPrice,
            activeUnitPrice: item.activeProposedPrice,
            gstRate: item.gstRate ?? 5,
          })));
        }
        if (!body.data.isDealLocked) setDealLockedSnapshot(null);
      } catch (error) {
        console.warn('Could not refresh negotiation state after socket reconnect:', error);
      }
    };

    window.addEventListener('socket:reconnected', refreshAuthoritativeOrder);
    return () => window.removeEventListener('socket:reconnected', refreshAuthoritativeOrder);
  }, [orderId]);

  // Auto-scroll chat feed on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, typingUser]);

  // Calculations
  const activeNegotiatedTotal = orderItems.reduce((acc, item) => acc + item.activeUnitPrice * item.quantity, 0);

  // P1.2: live GST + landed cost, recomputed whenever a per-line socket event lands
  const orderGstAmount = orderItems.reduce(
    (acc, item) => acc + (item.activeUnitPrice * item.quantity) * ((item.gstRate ?? 0) / 100),
    0,
  );
  const landedCost = activeNegotiatedTotal + orderGstAmount;
  const money2 = (n: number) => n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const isDealLocked = negotiationStatus?.isDealLocked || dealLockedSnapshot?.isDealLocked;

  // Handle typing input
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputText(e.target.value);
    chatSocketService.setTyping(orderId, true);

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      chatSocketService.setTyping(orderId, false);
    }, 1500);
  };

  // Confirm Rate / Lock Deal
  const handleConfirmRate = () => {
    setIsConfirmingRate(true);
    chatSocketService.confirmRate(
      {
        orderId,
        notes: `Confirmed by ${userName} (${currentUserRole})`,
      },
      (res) => {
        setIsConfirmingRate(false);
        if (res.success && res.data) {
          if (res.data.isDealLocked) {
            setDealLockedSnapshot(res.data);
            setActionSuccessBanner('🤝 MUTUAL RATE LOCKED! Both parties confirmed.');
          } else {
            setActionSuccessBanner('Your confirmation has been stamped! Awaiting other party.');
            setTimeout(() => setActionSuccessBanner(null), 5000);
          }
        }
      }
    );
  };

  // Mobile composer submits a whole-order counter total and preserves each line's price ratio.
  const handleSendCounterOffer = (event: React.FormEvent) => {
    event.preventDefault();
    const proposedTotal = Number(inputText);
    if (!Number.isFinite(proposedTotal) || proposedTotal <= 0 || activeNegotiatedTotal <= 0) {
      setProposalError('Enter a valid counter price.');
      return;
    }

    const ratio = proposedTotal / activeNegotiatedTotal;
    const items = orderItems.map((item) => ({
      orderItemId: item.id,
      proposedUnitPrice: Math.round(item.activeUnitPrice * ratio * 100) / 100,
    }));
    const belowFloor = items.find((item) => {
      const original = orderItems.find((orderItem) => orderItem.id === item.orderItemId)?.quotedUnitPrice ?? 0;
      return item.proposedUnitPrice < original * 0.65;
    });

    if (belowFloor) {
      setProposalError('This counter price is below the permitted margin floor.');
      return;
    }

    setProposalError(null);
    setIsSubmittingProposal(true);
    chatSocketService.setTyping(orderId, false);
    chatSocketService.proposeRate(
      {
        orderId,
        items,
        notes: `Whole-order counter offer: ₹${proposedTotal.toLocaleString('en-IN')}`,
      },
      (response) => {
        setIsSubmittingProposal(false);
        if (response.success) {
          setInputText('');
          setActionSuccessBanner('Counter-offer sent');
          setTimeout(() => setActionSuccessBanner(null), 3000);
          return;
        }
        setProposalError(response.error || 'Could not send the counter-offer. Please try again.');
      },
    );
  };

  return (
    <div className="mx-auto flex h-[calc(100dvh-8.5rem)] min-h-[560px] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-[#efeae2] shadow-sm ring-1 ring-slate-200">
      <header className="z-10 flex shrink-0 items-center gap-3 bg-white px-4 py-3 shadow-sm">
        <button
          type="button"
          onClick={onBackToOverview || onBackToCart}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white"
          aria-label="Back to orders"
        >
          <Store className="h-5 w-5" />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-base font-bold text-slate-950">Order negotiation</h1>
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span>{orderNumber}</span>
            <span aria-hidden="true">•</span>
            <span className={isSocketConnected ? 'text-emerald-700' : 'text-rose-600'}>
              {isSocketConnected ? 'online' : 'offline'}
            </span>
          </div>
        </div>
        <span
          className={
            'rounded-full px-3 py-1 text-[11px] font-bold ' +
            (isDealLocked ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-800')
          }
        >
          {isDealLocked ? 'Price locked' : 'Negotiating'}
        </span>
      </header>

      <main
        className="flex-1 space-y-3 overflow-y-auto px-3 py-4 sm:px-6"
        aria-live="polite"
        aria-label="Negotiation messages"
      >
        <div className="flex justify-center">
          <span className="rounded-lg bg-white/80 px-3 py-1.5 text-center text-[11px] font-medium text-slate-500 shadow-sm">
            Prices and confirmations in this chat are recorded against {orderNumber}
          </span>
        </div>

        <div className="flex justify-center">
          <div className="rounded-xl bg-[#fff5c4] px-4 py-2 text-center shadow-sm">
            <p className="text-[11px] font-semibold text-slate-700">Current order value</p>
            <p className="text-lg font-black text-slate-950">₹{money2(activeNegotiatedTotal)}</p>
            <p className="text-[10px] text-slate-500">₹{money2(landedCost)} including estimated GST</p>
          </div>
        </div>

        {messages.length === 0 && (
          <div className="flex min-h-48 flex-col items-center justify-center px-8 text-center">
            <MessageSquare className="mb-3 h-9 w-9 text-slate-400" />
            <p className="text-sm font-bold text-slate-700">No offers yet</p>
            <p className="mt-1 text-xs leading-5 text-slate-500">
              Enter a total counter-price below to start the conversation.
            </p>
          </div>
        )}

        {messages.map((message) => {
          const attachmentType = message.fileAttachments?.type;
          const isProposal = attachmentType === 'rate_proposal';
          const isStateChange = message.messageType === 'system' && !isProposal;
          const isMine = message.senderUserType === currentUserRole;
          const timestamp = new Date(message.createdAt).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
          });

          if (isStateChange) {
            const isLockedMessage = attachmentType === 'deal_locked' ||
              message.messageText.toLowerCase().includes('lock');
            const isRejectedMessage = message.messageText.toLowerCase().includes('reject');
            return (
              <div key={message.id} className="flex justify-center py-1">
                <span
                  className={
                    'max-w-[90%] rounded-lg px-3 py-1.5 text-center text-[11px] font-semibold shadow-sm ' +
                    (isRejectedMessage
                      ? 'bg-rose-50 text-rose-700'
                      : isLockedMessage
                        ? 'bg-slate-200 text-slate-700'
                        : 'bg-slate-100 text-slate-600')
                  }
                >
                  {isLockedMessage && <Lock className="mr-1 inline h-3 w-3" />}
                  {message.messageText}
                  <span className="ml-2 font-normal text-slate-400">{timestamp}</span>
                </span>
              </div>
            );
          }

          return (
            <div key={message.id} className={'flex ' + (isMine ? 'justify-end' : 'justify-start')}>
              <div
                className={
                  'max-w-[84%] rounded-2xl px-3.5 py-2.5 shadow-sm sm:max-w-[70%] ' +
                  (isMine
                    ? 'rounded-br-sm bg-[#d9fdd3] text-slate-900'
                    : 'rounded-bl-sm bg-white text-slate-900')
                }
              >
                {!isMine && (
                  <p className="mb-1 text-[11px] font-bold text-emerald-700">{message.senderName}</p>
                )}
                {isProposal ? (
                  <div className="space-y-2">
                    <p className="text-xs font-bold text-slate-600">Counter-offer</p>
                    <p className="text-2xl font-black tracking-tight text-slate-950">
                      ₹{money2(Number(message.fileAttachments?.proposedSubtotal ?? activeNegotiatedTotal))}
                    </p>
                    {message.fileAttachments?.notes && (
                      <p className="text-sm leading-5 text-slate-700">{message.fileAttachments.notes}</p>
                    )}
                    {!isDealLocked && !isMine && (
                      <button
                        type="button"
                        onClick={handleConfirmRate}
                        disabled={isConfirmingRate}
                        className="mt-1 min-h-10 w-full rounded-xl bg-emerald-600 px-4 text-xs font-bold text-white disabled:opacity-50"
                      >
                        {isConfirmingRate ? 'Confirming…' : 'Accept & lock price'}
                      </button>
                    )}
                  </div>
                ) : (
                  <p className="whitespace-pre-wrap text-sm leading-5">{message.messageText}</p>
                )}
                <p className="mt-1 text-right text-[10px] text-slate-400">{timestamp}</p>
              </div>
            </div>
          );
        })}

        {isDealLocked && (
          <div className="flex justify-center py-1">
            <span className="rounded-lg bg-slate-200 px-3 py-1.5 text-[11px] font-semibold text-slate-700 shadow-sm">
              <Lock className="mr-1 inline h-3 w-3" />
              Price locked for both businesses
            </span>
          </div>
        )}

        {typingUser && (
          <div className="flex justify-start">
            <div className="rounded-2xl rounded-bl-sm bg-white px-4 py-2 text-xs text-slate-500 shadow-sm">
              {typingUser} is typing…
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </main>

      {actionSuccessBanner && (
        <div className="mx-3 mb-2 flex items-center justify-center gap-2 rounded-xl bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 shadow-sm">
          <CheckCircle2 className="h-4 w-4" />
          {actionSuccessBanner}
        </div>
      )}

      {proposalError && (
        <div role="alert" className="mx-3 mb-2 flex items-center gap-2 rounded-xl bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 shadow-sm">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {proposalError}
        </div>
      )}

      {isDealLocked ? (
        <div className="shrink-0 bg-white px-3 py-3 shadow-[0_-2px_8px_rgba(15,23,42,0.08)]">
          <button
            type="button"
            onClick={() => onProceedToDelivery?.(orderId)}
            className="min-h-12 w-full rounded-xl bg-emerald-600 px-4 text-sm font-bold text-white"
          >
            Continue to delivery
          </button>
        </div>
      ) : (
        <form
          onSubmit={handleSendCounterOffer}
          className="sticky bottom-0 flex shrink-0 items-center gap-2 bg-white px-3 py-3 shadow-[0_-2px_8px_rgba(15,23,42,0.08)]"
        >
          <label htmlFor="counter-price" className="sr-only">Counter price</label>
          <div className="flex min-h-12 flex-1 items-center rounded-full bg-slate-100 px-4 ring-1 ring-slate-200 focus-within:ring-2 focus-within:ring-emerald-500">
            <span className="mr-2 text-lg font-bold text-slate-500">₹</span>
            <input
              id="counter-price"
              type="number"
              inputMode="decimal"
              min="0.01"
              step="0.01"
              value={inputText}
              onChange={handleInputChange}
              placeholder="Enter total counter-price"
              className="min-w-0 flex-1 bg-transparent text-base font-semibold text-slate-950 outline-none placeholder:text-sm placeholder:font-normal placeholder:text-slate-400"
            />
          </div>
          <button
            type="submit"
            disabled={!inputText || isSubmittingProposal}
            aria-label="Send counter-offer"
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white shadow-sm transition active:scale-95 disabled:bg-slate-300"
          >
            <Send className="h-5 w-5" />
          </button>
        </form>
      )}
    </div>
  );
};
