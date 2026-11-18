import React, { useState, useEffect } from 'react';
import {
  Truck,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Copy,
  Check,
  Store,
  RefreshCw,
  FileCheck,
  Phone,
  ChevronRight,
  Sparkles,
  Boxes,
  ArrowRight,
  PackageCheck,
  FileText,
  ExternalLink,
  Radio,
  Share2
} from 'lucide-react';
import { DeliveryService } from './deliveryService';
import { 
  DeliveryStatusResponse, 
  ActiveDispatchOrder,
  HandoverVerificationResult,
  RebalanceSummaryResult,
  LineItemInspectionPayload,
  CreditNoteDto,
  DriverAccessLinkResponse
} from './types';
import { chatSocketService } from '../chat/chatSocketService';
import { GstInvoiceModal } from '../invoice/GstInvoiceModal';
import { CreditNoteModal } from './CreditNoteModal';

interface DeliveryHandoverViewProps {
  orderId?: string;
  orderNumber?: string;
  onBackToNegotiation?: () => void;
  onBackToOverview?: () => void;
  onProceedToLedger?: (orderId: string) => void;
  onOpenPos?: () => void;
}

type DeliveryViewData = DeliveryStatusResponse & Partial<DriverAccessLinkResponse>;

export const DeliveryHandoverView: React.FC<DeliveryHandoverViewProps> = ({
  orderId: requestedOrderId,
  orderNumber: requestedOrderNumber,
  onBackToNegotiation,
  onBackToOverview,
  onProceedToLedger,
  onOpenPos,
}) => {
  // Delivery Status State
  const [activeOrders, setActiveOrders] = useState<ActiveDispatchOrder[]>([]);
  const [activePersona] = useState<'retailer' | 'driver'>('retailer');
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(requestedOrderId || null);
  const [isLoadingOrders, setIsLoadingOrders] = useState(true);
  const [deliveryError, setDeliveryError] = useState<string | null>(null);
  const orderId = requestedOrderId || selectedOrderId || '';
  const activeOrder = activeOrders.find((order) => order.orderId === orderId) || null;
  const orderNumber = activeOrder?.orderNumber || requestedOrderNumber || '';
  const [deliveryData, setDeliveryData] = useState<DeliveryViewData | null>(null);
  const [handoverCode, setHandoverCode] = useState<string>('');
  const [copiedOtp, setCopiedOtp] = useState<boolean>(false);
  const [copiedDriverLink, setCopiedDriverLink] = useState<boolean>(false);

  // Driver Verification Form State
  const [enteredOtp, setEnteredOtp] = useState<string>('');
  const [cashCollected, setCashCollected] = useState<number>(0);
  const [splitSettlementResult, setSplitSettlementResult] = useState<any>(null);
  const [verifyNotes, setVerifyNotes] = useState<string>('');
  const [isVerifying, setIsVerifying] = useState<boolean>(false);
  const [verificationError, setVerificationError] = useState<string | null>(null);
  const [verificationResult, setVerificationResult] = useState<HandoverVerificationResult | null>(null);
  const [rebalanceSummary, setRebalanceSummary] = useState<RebalanceSummaryResult | null>(null);
  const [showGstInvoiceModal, setShowGstInvoiceModal] = useState<boolean>(false);
  const [showCreditNoteModal, setShowCreditNoteModal] = useState<boolean>(false);
  const [activeCreditNote, setActiveCreditNote] = useState<CreditNoteDto | null>(null);

  // Multi-Item Inspection Line Items (Atta 25 @ ₹410, Rice 15 @ ₹450, Oil 30 @ ₹128)
  const [inspectionItems, setInspectionItems] = useState<LineItemInspectionPayload[]>([]);

  useEffect(() => {
    let mounted = true;
    setIsLoadingOrders(true);
    DeliveryService.getActiveOrders().then((orders) => {
      if (!mounted) return;
      setActiveOrders(orders);
      const selected = requestedOrderId ? orders.find((order) => order.orderId === requestedOrderId) : orders[0];
      if (!requestedOrderId && selected) setSelectedOrderId(selected.orderId);
      if (selected) {
        setInspectionItems(selected.items.map((item) => ({
          ...item,
          acceptedQuantity: item.orderedQuantity,
          rejectionReason: undefined,
        })));
      }
    }).catch((error) => {
      if (mounted) setDeliveryError(error instanceof Error ? error.message : 'Could not load active dispatches.');
    }).finally(() => { if (mounted) setIsLoadingOrders(false); });
    return () => { mounted = false; };
  }, [requestedOrderId]);

  const totalDeliveredUnits = inspectionItems.reduce((acc, it) => acc + it.orderedQuantity, 0);
  const acceptedUnits = inspectionItems.reduce((acc, it) => acc + it.acceptedQuantity, 0);
  const totalRejectedUnits = inspectionItems.reduce((acc, it) => acc + it.rejectedQuantity, 0);

  const acceptedGoodsValue = inspectionItems.reduce((acc, it) => acc + (it.acceptedQuantity * it.unitPrice), 0);
  const rejectedTaxable = inspectionItems.reduce((acc, it) => acc + (it.rejectedQuantity * it.unitPrice), 0);
  const rejectedGst = Number(((rejectedTaxable * 0.05)).toFixed(2));
  const creditNoteDisputeValue = Number((rejectedTaxable + rejectedGst).toFixed(2));

  const effectiveInvoiceTotal = acceptedGoodsValue;
  const creditRemaining = Math.max(0, effectiveInvoiceTotal - cashCollected);

  // Load initial delivery status and handover OTP
  const fetchDeliveryData = async () => {
    if (!orderId) return;
    try {
      const data = await DeliveryService.getDeliveryStatus(orderId);
      setDeliveryData(data);

      try {
        const driverLink = await DeliveryService.getDriverAccessLink(orderId);
        setDeliveryData((current) => current ? { ...current, ...driverLink } : { ...data, ...driverLink });
      } catch {
        // Retailers and read-only staff intentionally cannot retrieve the driver capability.
      }

      // Fetch the confidential code only through the retailer-only endpoint.
      try {
        const codeRes = await DeliveryService.getHandoverCode(orderId);
        setHandoverCode(codeRes.handoverCode);
      } catch (e) {
        setHandoverCode('');
        // Wholesaler and read-only views are expected to be denied this retailer-only secret.
      }

      if (data.isVerified) {
        setVerificationResult({
          success: true,
          orderId: data.orderId,
          orderNumber: data.orderNumber,
          deliveryStatus: 'delivered',
          isVerified: true,
          verifiedAt: data.verifiedAt || new Date().toISOString(),
          finalAmount: data.finalOrderAmount,
          message: 'Delivery verified successfully with two-way cryptographic OTP.',
          certificate: {
            verificationId: `CERT-${data.orderNumber}-${Date.now()}`,
            verifiedAt: data.verifiedAt || new Date().toISOString(),
            orderNumber: data.orderNumber,
            retailerName: data.retailerBusinessName,
            wholesalerName: data.wholesalerBusinessName,
            verifiedByDriver: data.driverName,
            totalAmount: data.finalOrderAmount,
          },
        });

        // Load inventory rebalance report
        DeliveryService.getRebalanceSummary(orderId)
          .then(setRebalanceSummary)
          .catch((e) => console.warn('Could not load rebalance summary:', e.message));

        // Load active dispute / credit note if partial delivery occurred
        DeliveryService.getDispute(orderId)
          .then((disp) => {
            if (disp && disp.creditNote) {
              setActiveCreditNote(disp.creditNote);
              setVerificationResult((prev) => prev ? {
                ...prev,
                isPartialDelivery: true,
                creditNote: disp.creditNote,
                escrowHoldAmount: disp.escrowHoldAmount,
                damagedUnits: totalRejectedUnits,
                acceptedUnits,
              } : null);
            }
          })
          .catch((e) => console.warn('Could not load dispute info:', e.message));
      }
    } catch (err: any) {
      setDeliveryData(null);
      setHandoverCode('');
      setDeliveryError(err instanceof Error ? err.message : 'Could not load this dispatch.');
    }
  };

  useEffect(() => {
    if (!orderId) return;
    fetchDeliveryData();
    // Keep the handover panel current even when socket delivery is interrupted.
    const statusPoll = window.setInterval(() => { void fetchDeliveryData(); }, 30_000);

    // Listen to realtime socket events for live sync
    const socket = chatSocketService.connect();
    const handleStatusChanged = (payload: any) => {
      if (payload.isVerified || payload.deliveryStatus === 'delivered') {
        fetchDeliveryData();
      }
    };

    const handleLocationUpdated = (payload: any) => {
      setDeliveryData(prev => prev ? {
        ...prev,
        currentLatitude: payload.latitude,
        currentLongitude: payload.longitude,
        lastLocationUpdatedAt: payload.timestamp,
      } : null);
    };

    const handleMilestoneUpdated = (payload: any) => {
      setDeliveryData(prev => prev ? {
        ...prev,
        trackingMilestone: payload.milestone,
        currentHubName: payload.hubName,
      } : null);
    };

    socket.on('delivery_status_changed', handleStatusChanged);
    socket.on('driver_location_updated', handleLocationUpdated);
    socket.on('delivery_milestone_updated', handleMilestoneUpdated);

    return () => {
      window.clearInterval(statusPoll);
      socket.off('delivery_status_changed', handleStatusChanged);
      socket.off('driver_location_updated', handleLocationUpdated);
      socket.off('delivery_milestone_updated', handleMilestoneUpdated);
    };
  }, [orderId]);

  // Copy OTP code to clipboard
  const handleCopyOtp = () => {
    navigator.clipboard.writeText(handoverCode);
    setCopiedOtp(true);
    setTimeout(() => setCopiedOtp(false), 2500);
  };

  // Copy Driver Mobile Portal link to clipboard
  const handleCopyDriverLink = () => {
    const token = deliveryData?.driverAccessToken;
    if (!token) return;
    const link = `${window.location.origin}/driver/dispatch/${token}`;
    navigator.clipboard.writeText(link);
    setCopiedDriverLink(true);
    setTimeout(() => setCopiedDriverLink(false), 2500);
  };

  const handleItemAcceptedChange = (index: number, newAccepted: number) => {
    setInspectionItems((prev) => {
      const copy = [...prev];
      const item = { ...copy[index] };
      const safeAccepted = Math.max(0, Math.min(item.orderedQuantity, newAccepted));
      item.acceptedQuantity = safeAccepted;
      item.rejectedQuantity = item.orderedQuantity - safeAccepted;
      copy[index] = item;
      return copy;
    });
  };

  const handleItemReasonChange = (index: number, reason: any) => {
    setInspectionItems((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], rejectionReason: reason };
      return copy;
    });
  };

  // Driver on-site OTP verification submit
  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isVerifying) return;

    if (!enteredOtp || enteredOtp.trim().length !== 6) {
      setVerificationError('Please enter a valid 6-digit numeric OTP code');
      return;
    }

    if (totalRejectedUnits < 0) {
      setVerificationError('Damaged units cannot be negative.');
      return;
    }

    if (totalRejectedUnits > totalDeliveredUnits) {
      setVerificationError(`Damage logging overflow: Damaged quantity (${totalRejectedUnits}) cannot exceed total delivered quantity (${totalDeliveredUnits}).`);
      return;
    }

    if (cashCollected < 0 || cashCollected > effectiveInvoiceTotal) {
      setVerificationError(`Invalid cash amount: Cash collected (₹${cashCollected}) must be between ₹0 and ₹${effectiveInvoiceTotal}.`);
      return;
    }

    setIsVerifying(true);
    setVerificationError(null);

    try {
      const res = await DeliveryService.verifyHandover(
        orderId, 
        enteredOtp.trim(), 
        verifyNotes, 
        totalRejectedUnits,
        inspectionItems,
        verifyNotes
      );
      setVerificationResult(res);
      if (res.creditNote) {
        setActiveCreditNote(res.creditNote);
      }
      setDeliveryData((prev) => prev ? { ...prev, isVerified: true, deliveryStatus: 'delivered', verifiedAt: res.verifiedAt } : null);
      
      // Execute Split Payment Settlement at Counter
      try {
        const token = sessionStorage.getItem('sharvin_token') || '';
        const splitRes = await fetch(`/api/v1/ledger/orders/${orderId}/settle-split`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            totalOrderAmount: effectiveInvoiceTotal,
            cashPaid: cashCollected,
            idempotencyKey: `delivery-settlement:${orderId}`,
            partnerId: activeOrder?.retailerId || '',
            driverId: deliveryData?.driverName,
            notes: `Counter delivery handover: ${acceptedUnits} units good, ${totalRejectedUnits} units damaged, ₹${cashCollected.toLocaleString('en-IN')} cash collected.`,
          }),
        });
        const splitJson = await splitRes.json();
        if (splitJson.success) {
          setSplitSettlementResult(splitJson.data);
        }
      } catch (splitErr) {
        console.warn('Split settlement fallback:', splitErr);
        setVerificationError('Delivery was verified, but ledger settlement could not be recorded. Retry settlement from the ledger before closing this order.');
      }

      // Fetch or assemble real-time rebalance summary
      if (res.inventoryRebalanced && res.inventoryRebalanced.length > 0) {
        setRebalanceSummary({
          orderId: res.orderId,
          orderNumber: res.orderNumber,
          retailerName: res.certificate.retailerName,
          wholesalerName: res.certificate.wholesalerName,
          isDelivered: true,
          deliveredAt: res.verifiedAt,
          totalUnitsTransferred: res.inventoryRebalanced.reduce((acc, i) => acc + i.quantityAdded, 0),
          totalAlertsResolved: res.inventoryRebalanced.reduce((acc, i) => acc + i.alertsResolved, 0),
          items: res.inventoryRebalanced,
        });
      } else {
        DeliveryService.getRebalanceSummary(orderId)
          .then(setRebalanceSummary)
          .catch((e) => console.warn('Could not load rebalance summary:', e.message));
      }
    } catch (err: any) {
      setVerificationError(err.message || 'OTP verification failed');
      // Decrement attempts locally for immediate feedback
      setDeliveryData((prev) => prev ? { 
        ...prev, 
        attemptsRemaining: Math.max(0, prev.attemptsRemaining - 1),
        isLocked: prev.attemptsRemaining <= 1,
      } : null);
    } finally {
      setIsVerifying(false);
    }
  };

  const isVerified = verificationResult?.isVerified || deliveryData?.isVerified;

  if (isLoadingOrders) return <div className="p-10 text-center text-slate-500">Loading active dispatches…</div>;
  if (deliveryError && activeOrders.length === 0) return <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-8 text-center"><p className="font-medium text-rose-800">Active dispatches could not be loaded.</p><p className="mt-1 text-sm text-rose-700">{deliveryError}</p></div>;
  if (!orderId || !activeOrder) return <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center shadow-sm"><Truck className="mx-auto mb-3 h-8 w-8 text-slate-400"/><h2 className="text-lg font-semibold text-slate-900">No active dispatches. Outbound orders will appear here.</h2>{deliveryError && <p role="alert" className="mt-2 text-sm text-rose-700">{deliveryError}</p>}</div>;
  return (
    <div className="space-y-6 animate-in fade-in duration-300 bg-slate-50">
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
            {onBackToNegotiation && (
              <>
                <button onClick={onBackToNegotiation} className="hover:text-slate-700 transition">
                  Live Bargaining
                </button>
                <span>/</span>
              </>
            )}
            <span className="text-emerald-700 font-medium">Delivery Handover &amp; OTP</span>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2.5">
              <Truck className="w-6 h-6 text-emerald-700" />
              Two-Way Delivery Handover Verification
            </h1>
            <span className="px-2.5 py-0.5 rounded-full bg-slate-100 border border-slate-200 text-xs font-mono font-bold text-emerald-700">
              {deliveryData?.orderNumber || orderNumber}
            </span>

            {isVerified ? (
              <span className="px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-black flex items-center gap-1.5 shadow-sm">
                <CheckCircle2 className="w-3.5 h-3.5" /> DELIVERED &amp; VERIFIED
              </span>
            ) : (
              <span className="px-3 py-1 rounded-full bg-amber-50 border border-amber-200 text-amber-800 text-xs font-bold flex items-center gap-1.5 animate-pulse">
                <ShieldCheck className="w-3.5 h-3.5" /> AWAITING OTP HANDOVER
              </span>
            )}
          </div>
        </div>

        <div className="text-xs text-slate-500">Delivery details for {deliveryData?.retailerBusinessName || activeOrder.retailerName}</div>
      </div>

      {/* Distance-Adaptive Live Route Tracking Banner */}
      <div className="p-5 rounded-3xl bg-white border border-slate-200 shadow-xl space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
          <div className="flex items-center gap-2">
            <Radio className="w-5 h-5 text-blue-700 animate-pulse" />
            <div>
              <h3 className="font-extrabold text-sm text-slate-900">
                {deliveryData?.trackingMode === 'regional' ? 'Regional Freight Tracking (> 100km)' : 'Real-Time Delivery Route Tracking (< 100km)'}
              </h3>
              <p className="text-xs text-slate-500">
                {deliveryData?.trackingMode === 'regional' 
                  ? 'Milestone checkpoint tracking to conserve mobile bandwidth' 
                  : 'Live GPS coordinate telemetry with dynamic tempo movement'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className={`text-xs px-2.5 py-1 rounded-full font-bold uppercase tracking-wider ${
              deliveryData?.trackingMode === 'regional' ? 'bg-purple-50 text-purple-700 border border-purple-200' : 'bg-blue-50 text-blue-700 border border-blue-200'
            }`}>
              {deliveryData?.trackingMode === 'regional' ? 'Regional Freight' : 'Local Tempo'}
            </span>
            <span className="text-xs px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 font-semibold">
              {deliveryData?.distanceKm || 18.5} km distance
            </span>
          </div>
        </div>

        {/* Local Mode: Moving Tempo Visualization */}
        {(!deliveryData?.trackingMode || deliveryData?.trackingMode === 'local') ? (
          <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-4">
            <div className="relative pt-6 pb-2">
              {/* Progress Line */}
              <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-gradient-to-r from-blue-500 via-indigo-500 to-emerald-400 transition-all duration-700 rounded-full"
                  style={{ width: isVerified ? '100%' : '65%' }}
                />
              </div>

              {/* Moving Tempo Icon */}
              <div 
                className="absolute top-0 transition-all duration-700 flex flex-col items-center"
                style={{ left: isVerified ? 'calc(100% - 24px)' : 'calc(65% - 24px)' }}
              >
                <div className="px-2 py-0.5 bg-blue-600 text-white rounded text-[10px] font-bold shadow-md whitespace-nowrap mb-1 animate-bounce">
                  {isVerified ? 'Delivered' : '🚚 Tempo Moving (~12m)'}
                </div>
                <div className="w-8 h-8 rounded-full bg-blue-500 border-2 border-white flex items-center justify-center text-slate-900 shadow-lg">
                  <Truck className="w-4 h-4" />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between text-xs text-slate-500 pt-2 border-t border-slate-200">
              <div className="flex items-center gap-1.5">
                <Store className="w-3.5 h-3.5 text-blue-700" />
                <span>Origin: Chandni Chowk Central Godown</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-emerald-700 font-bold flex items-center gap-1">
                  <Radio className="w-3 h-3 text-emerald-700" />
                  Live GPS Beacon
                </span>
                <span>•</span>
                <span>Destination: {deliveryData?.destinationAddress || 'Address unavailable'}</span>
              </div>
            </div>
          </div>
        ) : (
          /* Regional Mode: 4-stage Checkpoint Stepper */
          <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-3">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { id: 'dispatched', label: '1. Godown Dispatched', sub: 'Chandni Chowk Main' },
                { id: 'in_transit_hub', label: '2. Regional Hub', sub: deliveryData?.currentHubName || 'Bhiwandi / Gateway' },
                { id: 'out_for_delivery', label: '3. Local Outpost', sub: 'Najafgarh Feeder' },
                { id: 'delivered', label: '4. Delivered', sub: 'Store Received' },
              ].map((step, idx) => {
                const isPassed = 
                  deliveryData?.trackingMilestone === step.id ||
                  (step.id === 'dispatched') ||
                  (deliveryData?.trackingMilestone === 'in_transit_hub' && idx <= 1) ||
                  (deliveryData?.trackingMilestone === 'out_for_delivery' && idx <= 2) ||
                  isVerified;

                return (
                  <div key={step.id} className={`p-3 rounded-xl border text-xs ${
                    isPassed ? 'bg-purple-50 border-purple-200 text-purple-800' : 'bg-white border-slate-200 text-slate-500'
                  }`}>
                    <div className="flex items-center gap-1.5 font-bold">
                      <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] ${
                        isPassed ? 'bg-purple-600 text-white' : 'bg-slate-100 text-slate-500'
                      }`}>
                        {isPassed ? '✓' : idx + 1}
                      </span>
                      <span>{step.label}</span>
                    </div>
                    <div className="text-[11px] text-slate-500 mt-1 pl-5">{step.sub}</div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Tokenized Driver Web Link Strip */}
          <div className="p-3.5 rounded-2xl bg-blue-50 border border-blue-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center text-white shrink-0">
              <Share2 className="w-3.5 h-3.5" />
            </div>
            <div>
              <span className="font-bold text-slate-900">Temporary Driver Mobile Web Link (No App Needed):</span>
              <div className="text-slate-700 font-mono text-[11px] truncate max-w-sm sm:max-w-md">
                {deliveryData?.driverAccessToken ? `${window.location.origin}/driver/dispatch/${deliveryData.driverAccessToken}` : 'Driver link unavailable'}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handleCopyDriverLink}
              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold flex items-center gap-1.5 transition shadow-sm"
            >
              {copiedDriverLink ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedDriverLink ? 'Copied!' : 'Copy Link'}</span>
            </button>
            <a
              href={deliveryData?.driverAccessToken ? `/driver/dispatch/${deliveryData.driverAccessToken}` : undefined}
              aria-disabled={!deliveryData?.driverAccessToken}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold flex items-center gap-1.5 transition border border-slate-200"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>Open Driver View</span>
            </a>
          </div>
        </div>
      </div>

      {/* Main Grid: 2 Columns */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* LEFT COLUMN: Order Details, Driver Card & Physical Inspection Checklist (5 cols) */}
        <div className="lg:col-span-5 space-y-6">
          {/* Driver Contact & Dispatch Information */}
          <div className="p-5 rounded-3xl bg-white border border-slate-200 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div className="flex items-center gap-2">
                <Truck className="w-5 h-5 text-emerald-700" />
                <h3 className="font-extrabold text-sm text-slate-900">Logistics &amp; Driver Details</h3>
              </div>
              <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 font-mono">
                Local Dispatch
              </span>
            </div>

            <div className="flex items-center gap-3.5 p-3.5 rounded-2xl bg-slate-50 border border-slate-200">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-emerald-500 to-teal-600 flex items-center justify-center text-slate-950 font-black text-lg shadow-md shadow-emerald-500/20">
                RK
              </div>
              <div className="space-y-0.5">
                <div className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  {deliveryData?.driverName || 'Not assigned'}
                  {deliveryData?.driverName && <span className="w-2 h-2 rounded-full bg-emerald-400"></span>}
                </div>
                <div className="flex items-center gap-1.5 text-xs text-slate-500">
                  <Phone className="w-3.5 h-3.5 text-emerald-700" />
                  <span>{deliveryData?.driverPhone || 'Phone unavailable'}</span>
                </div>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 text-xs space-y-2">
              <div className="flex justify-between text-slate-500">
                <span>Wholesaler Supplier:</span>
                <span className="font-bold text-slate-900">{deliveryData?.wholesalerBusinessName || activeOrder.wholesalerName || '—'}</span>
              </div>
              <div className="flex justify-between text-slate-500">
                <span>Receiving Retailer:</span>
                <span className="font-bold text-slate-900">{deliveryData?.retailerBusinessName || activeOrder.retailerName || '—'}</span>
              </div>
              <div className="flex justify-between text-slate-500 border-t border-slate-200 pt-2">
                <span>Locked Order Total:</span>
                <span className="font-extrabold text-emerald-700 text-sm font-mono">
                  ₹{(deliveryData?.finalOrderAmount ?? activeOrder.finalOrderAmount).toLocaleString('en-IN')}
                </span>
              </div>
            </div>
          </div>

          {/* Physical Custody Inspection Checklist */}
          <div className="p-5 rounded-3xl bg-white border border-slate-200 shadow-xl space-y-3">
            <h4 className="font-extrabold text-sm text-slate-900 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-amber-800" />
              On-Site Physical Inspection Guard
            </h4>
            <p className="text-xs text-slate-500 leading-relaxed">
              Before exchanging the OTP, retailer must inspect goods on the vehicle:
            </p>

            <div className="space-y-2 text-xs">
              <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 flex items-center gap-2.5 text-slate-700">
                <Check className="w-4 h-4 text-emerald-700 shrink-0" />
                <span>Verify bag/box count against invoice (25 Atta + 15 Rice).</span>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 flex items-center gap-2.5 text-slate-700">
                <Check className="w-4 h-4 text-emerald-700 shrink-0" />
                <span>Check seal integrity and ensure no torn packaging or water damage.</span>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 flex items-center gap-2.5 text-slate-700">
                <Check className="w-4 h-4 text-emerald-700 shrink-0" />
                <span>Confirm agreed rate lock price before sharing the secret code.</span>
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: Perspective-Specific Handover Interface (7 cols) */}
        <div className="lg:col-span-7 space-y-6">
          {/* Certificate View if already verified */}
          {isVerified ? (
            <div className="p-8 rounded-3xl bg-white border border-emerald-200 shadow-sm text-center space-y-6 animate-in zoom-in-95 duration-200">
              <div className="w-20 h-20 rounded-3xl bg-emerald-50 border border-emerald-200 text-emerald-700 flex items-center justify-center mx-auto shadow-lg shadow-emerald-500/20">
                <FileCheck className="w-10 h-10" />
              </div>

              <div className="space-y-2">
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-black">
                  <Sparkles className="w-3.5 h-3.5" /> CRYPTOGRAPHIC HANDOVER COMPLETE
                </div>
                <h3 className="text-2xl font-black text-slate-900">
                  Delivery Handover Verified!
                </h3>
                <p className="text-xs text-slate-500 max-w-md mx-auto leading-relaxed">
                  The retailer's 6-digit OTP code was verified on-site. Physical custody and delivery status have been frozen in the audit ledger.
                </p>
              </div>

              {/* Certificate Snapshot Card */}
              <div className="p-5 rounded-2xl bg-slate-50 border border-emerald-200 text-left text-xs space-y-3 font-mono">
                <div className="flex justify-between border-b border-slate-200 pb-2">
                  <span className="text-slate-500">Certificate ID:</span>
                  <span className="text-emerald-700 font-bold">{verificationResult?.certificate.verificationId}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Verified Timestamp:</span>
                  <span className="text-slate-700">{verificationResult?.certificate.verifiedAt}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Delivered Total:</span>
                  <span className="text-emerald-700 font-bold text-sm">
                    ₹{(verificationResult?.certificate.totalAmount ?? 0).toLocaleString('en-IN')}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Delivery Driver:</span>
                  <span className="text-slate-700">{verificationResult?.certificate.verifiedByDriver}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Recipient Kirana:</span>
                  <span className="text-slate-700">{verificationResult?.certificate.retailerName}</span>
                </div>
              </div>

              {/* Dispute Resolution Escrow & Credit Note Banner */}
              {(totalRejectedUnits > 0 || verificationResult?.isPartialDelivery || verificationResult?.creditNote) && (
                <div className="p-5 rounded-2xl bg-blue-50 border border-blue-200 text-left text-xs space-y-3 font-mono shadow-sm">
                  <div className="flex items-center justify-between border-b border-blue-200 pb-2">
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="w-4 h-4 text-blue-700" />
                      <span className="font-bold text-blue-700">🛡️ Escrow Dispute Hold Active</span>
                    </div>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-white text-blue-700 border border-blue-200 font-bold">
                      {verificationResult?.creditNote?.creditNoteNumber || 'STATUTORY CREDIT NOTE'}
                    </span>
                  </div>
                  <div className="space-y-1.5 text-slate-700">
                    <p className="text-[11px] leading-relaxed">
                      Doorstep rejection logged for <strong className="text-rose-700">{totalRejectedUnits || verificationResult?.damagedUnits || 5} damaged units</strong>. 
                      Disputed credit value of <strong className="text-blue-700">₹{(verificationResult?.escrowHoldAmount || creditNoteDisputeValue || 2152.50).toFixed(2)}</strong> is locked in <strong>Khata Escrow Hold</strong>.
                    </p>
                    <div className="flex justify-between text-slate-500 text-[10px] pt-1">
                      <span>POS Store Stock Credited:</span>
                      <span className="text-emerald-700 font-bold">+{verificationResult?.acceptedUnits || acceptedUnits || 65} Intact units</span>
                    </div>
                    <div className="flex justify-between text-slate-500 text-[10px]">
                      <span>Damaged Goods Action:</span>
                      <span className="text-rose-700 font-bold">Returned / Excluded from Inventory</span>
                    </div>
                  </div>
                  <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-2 border-t border-blue-200">
                    <button
                      type="button"
                      id="btn-view-credit-note-cert"
                      onClick={() => setShowCreditNoteModal(true)}
                      className="w-full sm:w-auto px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-medium text-xs flex items-center justify-center gap-2 shadow-sm transition"
                    >
                      <FileText className="w-3.5 h-3.5" /> View Statutory Credit Note (CN)
                    </button>
                    <span className="text-[10px] text-slate-500 italic">
                      CA Journal &amp; SHA-256 Sealed
                    </span>
                  </div>
                </div>
              )}

              {/* Doorstep Split Settlement Breakdown Card (Edge Case 3) */}
              <div className="p-5 rounded-2xl bg-slate-50 border border-amber-200 text-left text-xs space-y-3 font-mono">
                <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                  <span className="font-bold text-amber-800">💵 Doorstep Settlement Breakdown</span>
                  <span className="text-[10px] text-slate-500">Receipt: {splitSettlementResult?.receiptNumber || `REC-${Date.now().toString().slice(-6)}`}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Intact Units Accepted:</span>
                  <span className="text-emerald-700 font-bold">{acceptedUnits} / {totalDeliveredUnits} units</span>
                </div>
                {totalRejectedUnits > 0 && (
                  <div className="flex justify-between">
                    <span className="text-slate-500">Damaged Units Rejected:</span>
                    <span className="text-rose-700 font-bold">-{totalRejectedUnits} units</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-slate-500">Final Order Billed:</span>
                  <span className="text-slate-900 font-bold">₹{effectiveInvoiceTotal.toLocaleString('en-IN')}</span>
                </div>
                <div className="flex justify-between text-emerald-700">
                  <span>Counter Cash Received:</span>
                  <span className="font-bold">₹{cashCollected.toLocaleString('en-IN')}</span>
                </div>
                <div className="flex justify-between text-amber-800">
                  <span>Khata Credit Balance Posted:</span>
                  <span className="font-bold">+₹{creditRemaining.toLocaleString('en-IN')}</span>
                </div>
                <div className="flex justify-between border-t border-slate-200 pt-2 text-slate-700">
                  <span>New Khata Running Balance:</span>
                  <span className="text-slate-900 font-extrabold font-mono">
                    ₹{Number(splitSettlementResult?.newBalance ?? 0).toLocaleString('en-IN')}
                  </span>
                </div>
              </div>

              {/* LIVE INVENTORY REBALANCE IMPACT SECTION */}
              <div className="p-6 rounded-3xl bg-slate-50 border border-slate-200 text-left space-y-5 shadow-2xl">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200 pb-4">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200">
                      <Boxes className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="font-extrabold text-sm text-slate-900 flex items-center gap-2">
                        Live Inventory Rebalance Impact
                      </h4>
                      <p className="text-[11px] text-slate-500">
                        Atomic stock credit executed across Kirana POS counter &amp; Wholesaler depot
                      </p>
                    </div>
                  </div>
                  <span className="self-start sm:self-auto px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-[11px] font-bold text-emerald-700 flex items-center gap-1.5">
                    <PackageCheck className="w-3.5 h-3.5" />
                    {rebalanceSummary ? `${rebalanceSummary.totalAlertsResolved} Alerts Auto-Resolved` : '2 Alerts Auto-Resolved'}
                  </span>
                </div>

                {/* Metric Strip */}
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div className="p-3 rounded-2xl bg-white border border-slate-200">
                    <div className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Total Inflow</div>
                    <div className="text-lg font-black text-emerald-700 font-mono mt-0.5">
                      +{rebalanceSummary ? rebalanceSummary.totalUnitsTransferred : 40} Units
                    </div>
                    <div className="text-[10px] text-slate-500">Added to POS Counter</div>
                  </div>
                  <div className="p-3 rounded-2xl bg-white border border-slate-200">
                    <div className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Alerts Cleared</div>
                    <div className="text-lg font-black text-teal-600 font-mono mt-0.5">
                      {rebalanceSummary ? rebalanceSummary.totalAlertsResolved : 2} Resolved
                    </div>
                    <div className="text-[10px] text-slate-500">Stock above threshold</div>
                  </div>
                  <div className="p-3 rounded-2xl bg-white border border-slate-200">
                    <div className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Cost Basis</div>
                    <div className="text-lg font-black text-amber-800 font-mono mt-0.5">
                      Locked Rate
                    </div>
                    <div className="text-[10px] text-slate-500">Refreshed FIFO margin</div>
                  </div>
                </div>

                {/* Items Breakdown Cards */}
                <div className="space-y-3">
                  {(rebalanceSummary?.items || [
                    {
                      productId: 'prod-atta-10kg',
                      productName: 'Aashirvaad Shudh Chakki Atta (10kg)',
                      quantityAdded: 25,
                      previousRetailerStock: 3,
                      newRetailerStock: 28,
                      updatedCostPrice: 400.00,
                      alertsResolved: 1,
                      wholesalerStockDeducted: 25,
                      remainingWholesalerStock: 175,
                    },
                    {
                      productId: 'prod-rice-5kg',
                      productName: 'India Gate Basmati Rice (Classic 5kg)',
                      quantityAdded: 15,
                      previousRetailerStock: 2,
                      newRetailerStock: 17,
                      updatedCostPrice: 520.00,
                      alertsResolved: 1,
                      wholesalerStockDeducted: 15,
                      remainingWholesalerStock: 85,
                    },
                  ]).map((item) => (
                    <div
                      key={item.productId}
                      className="p-4 rounded-2xl bg-white border border-slate-200 space-y-2.5 hover:border-slate-200 transition"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                        <span className="font-bold text-xs text-slate-900">
                          {item.productName}
                        </span>
                        {item.alertsResolved > 0 && (
                          <span className="self-start sm:self-auto text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full flex items-center gap-1">
                            <Check className="w-3 h-3" /> Low-Stock Alert Auto-Resolved
                          </span>
                        )}
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1 text-xs">
                        {/* Retailer Stock Transition */}
                        <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
                          <span className="text-[10px] text-slate-500 block font-semibold">Store Counter Stock</span>
                          <div className="flex items-center gap-2 font-mono">
                            <span className="text-slate-500">{item.previousRetailerStock}</span>
                            <ArrowRight className="w-3 h-3 text-emerald-700" />
                            <span className="text-emerald-700 font-extrabold text-sm">{item.newRetailerStock} bags</span>
                            <span className="text-[10px] text-emerald-500 font-semibold">(+{item.quantityAdded})</span>
                          </div>
                        </div>

                        {/* Updated Cost Price Basis */}
                        <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
                          <span className="text-[10px] text-slate-500 block font-semibold">Updated Cost Basis</span>
                          <div className="font-mono text-slate-900 font-bold">
                            ₹{item.updatedCostPrice.toFixed(2)} <span className="text-[10px] text-slate-500">/ bag</span>
                          </div>
                        </div>

                        {/* Wholesaler Depot Deduction */}
                        <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
                          <span className="text-[10px] text-slate-500 block font-semibold">Wholesaler Depot</span>
                          <div className="font-mono text-slate-700 text-xs flex items-center gap-1.5">
                            <span className="text-rose-700 font-bold">-{item.wholesalerStockDeducted}</span>
                            {item.remainingWholesalerStock !== null && item.remainingWholesalerStock !== undefined && (
                              <span className="text-slate-500 text-[10px]">({item.remainingWholesalerStock} left)</span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* 1-Click Bridge to POS Counter */}
                <div className="pt-2">
                  <button
                    onClick={() => onOpenPos && onOpenPos()}
                    className="w-full py-3 px-4 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-slate-950 font-black text-xs shadow-lg shadow-amber-500/20 flex items-center justify-center gap-2 transition transform active:scale-[0.99]"
                  >
                    <Store className="w-4 h-4" /> Verify Refreshed Stock in Retailer POS Counter <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Bridge to Milestone 5: Ledger & GST Tax Invoice */}
              <div className="pt-2 flex flex-col sm:flex-row gap-3 justify-center items-center">
                <button
                  id="btn-delivered-gst-invoice"
                  onClick={() => setShowGstInvoiceModal(true)}
                  className="px-5 py-3 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white font-medium text-xs shadow-sm flex items-center justify-center gap-2 transition"
                >
                  <FileText className="w-4 h-4" /> View Signed GST Tax Invoice
                </button>
                {(totalRejectedUnits > 0 || verificationResult?.creditNote || activeCreditNote) && (
                  <button
                    id="btn-delivered-credit-note"
                    onClick={() => setShowCreditNoteModal(true)}
                    className="px-5 py-3 rounded-2xl bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-500 hover:to-amber-600 text-slate-900 font-black text-xs shadow-lg shadow-amber-600/25 flex items-center justify-center gap-2 transition"
                  >
                    <FileText className="w-4 h-4" /> View Statutory Credit Note
                  </button>
                )}
                <button
                  onClick={() => onProceedToLedger && onProceedToLedger(orderId)}
                  className="px-5 py-3 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-slate-950 font-black text-xs shadow-lg shadow-emerald-500/25 flex items-center justify-center gap-2 transition"
                >
                  Proceed to B2B Ledger <ChevronRight className="w-4 h-4" />
                </button>
                <button
                  onClick={onBackToNegotiation}
                  className="px-4 py-3 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs transition"
                >
                  Return to Live Chat
                </button>
              </div>
            </div>
          ) : activePersona === 'retailer' ? (
            /* ======================================================== */
            /* RETAILER PERSPECTIVE: CONFIDENTIAL 6-DIGIT OTP DISPLAY   */
            /* ======================================================== */
            <div className="p-6 sm:p-8 rounded-3xl bg-white border border-slate-200 shadow-2xl space-y-6">
              <div className="flex items-center justify-between border-b border-slate-200 pb-4">
                <div className="flex items-center gap-2">
                  <Store className="w-5 h-5 text-amber-800" />
                  <h3 className="font-extrabold text-base text-slate-900">Your Confidential Handover OTP</h3>
                </div>
                <span className="text-xs px-2.5 py-1 rounded-full bg-amber-50 border border-amber-200 text-amber-800 font-semibold">
                  Retailer Protected
                </span>
              </div>

              <div className="text-center space-y-4 py-4">
                <p className="text-xs text-slate-500 max-w-md mx-auto">
                  When <strong className="text-slate-700">{deliveryData?.driverName}</strong> arrives with your goods, verify the physical bags first. Then provide this confidential 6-digit code:
                </p>

                {/* Big OTP Display Card */}
                <div className="p-6 rounded-3xl bg-slate-50 border-2 border-emerald-200 max-w-sm mx-auto shadow-2xl relative group">
                  <div className="text-xs uppercase font-extrabold tracking-widest text-emerald-700 mb-2">
                    Delivery Handover OTP
                  </div>
                  <div className="text-4xl sm:text-5xl font-black font-mono tracking-widest text-slate-900 py-2 select-all">
                    {handoverCode}
                  </div>
                  <p className="text-[11px] text-slate-500 mt-2">
                    Valid for Order #{deliveryData?.orderNumber || orderNumber}
                  </p>

                  <button
                    onClick={handleCopyOtp}
                    className="mt-4 inline-flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-xs font-bold text-slate-700 transition"
                  >
                    {copiedOtp ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-700" /> Copied!
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" /> Copy Code
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Warning advisory */}
              <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-start gap-3">
                <AlertCircle className="w-4 h-4 text-amber-800 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="font-bold">Security Notice:</p>
                  <p className="text-slate-700 leading-relaxed text-[11px]">
                    Do not share this code over the phone or before physical vehicle inspection. Entering this OTP creates an immutable digital record transferring delivery liability to your store.
                  </p>
                </div>
              </div>

            </div>
          ) : (
            /* ======================================================== */
            /* DRIVER PERSPECTIVE: ON-SITE OTP VERIFICATION TERMINAL    */
            /* ======================================================== */
            <div className="p-6 sm:p-8 rounded-3xl bg-white border border-slate-200 shadow-2xl space-y-6">
              <div className="flex items-center justify-between border-b border-slate-200 pb-4">
                <div className="flex items-center gap-2">
                  <Truck className="w-5 h-5 text-emerald-700" />
                  <h3 className="font-extrabold text-base text-slate-900">Driver Handover Terminal</h3>
                </div>
                <span className="text-xs px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 font-semibold">
                  On-Site Verification
                </span>
              </div>

              {deliveryData?.isLocked && (
                <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-3">
                  <AlertCircle className="w-5 h-5 text-rose-700 shrink-0" />
                  <div>
                    <span className="font-bold block">🔒 Security Lockout Active (Brute-Force Protection)</span>
                    <span className="text-[11px] text-rose-700">
                      Driver handover entry is locked for 10 minutes after 3 failed OTP attempts. Please wait {deliveryData.lockoutMinutesRemaining || 10} minute(s).
                    </span>
                  </div>
                </div>
              )}

              {verificationError && !deliveryData?.isLocked && (
                <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-3">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span className="font-semibold">{verificationError}</span>
                </div>
              )}

              <form onSubmit={handleVerifyOtp} className="space-y-5">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-700 block">
                    Enter Retailer 6-Digit Handover OTP
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      maxLength={6}
                      disabled={deliveryData?.isLocked}
                      value={enteredOtp}
                      onChange={(e) => {
                        const val = e.target.value.replace(/\D/g, '');
                        setEnteredOtp(val);
                      }}
                      placeholder="• • • • • •"
                      className="w-full text-center text-3xl font-mono font-black tracking-widest py-3.5 rounded-2xl bg-slate-50 border-2 border-slate-200 text-emerald-700 placeholder-slate-600 focus:outline-none focus:border-emerald-500 transition shadow-inner disabled:opacity-40"
                    />
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-slate-500 px-1 pt-1">
                    <span>Ask store owner for their on-screen code</span>
                    <span className="font-semibold text-amber-800">
                      Attempts remaining: {deliveryData?.attemptsRemaining ?? 3} / 3
                    </span>
                  </div>
                </div>

                {/* Multi-Item Line Partial Delivery Inspection & Damage Allowance */}
                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200 pb-2.5">
                    <div>
                      <label className="text-xs font-bold text-slate-900 block">
                        Multi-Item Doorstep Inspection &amp; Acceptance
                      </label>
                      <p className="text-[11px] text-slate-500">
                        Inspect items on doorstep. Intact units credit POS; damaged units trigger B2B Credit Note &amp; Escrow hold.
                      </p>
                    </div>
                  </div>

                  {/* Line Item Cards */}
                  <div className="space-y-2.5">
                    {inspectionItems.map((item, idx) => (
                      <div key={item.orderItemId} className="p-3 rounded-xl bg-white border border-slate-200 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-xs text-slate-800">{item.productName}</span>
                          <span className="text-[11px] font-mono text-slate-500">
                            Ordered: <strong className="text-slate-700">{item.orderedQuantity}</strong> @ ₹{item.unitPrice}
                          </span>
                        </div>

                        <div className="flex items-center justify-between gap-3 pt-1">
                          {/* Accepted stepper */}
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] text-slate-500 font-semibold">Accepted:</span>
                            <div className="flex items-center border border-slate-200 rounded-lg overflow-hidden bg-slate-50 font-mono text-xs">
                              <button
                                type="button"
                                onClick={() => handleItemAcceptedChange(idx, item.acceptedQuantity - 1)}
                                disabled={deliveryData?.isLocked || item.acceptedQuantity <= 0}
                                className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 disabled:opacity-30"
                              >
                                -
                              </button>
                              <span className="px-3 py-1 text-emerald-700 font-bold min-w-[32px] text-center">
                                {item.acceptedQuantity}
                              </span>
                              <button
                                type="button"
                                onClick={() => handleItemAcceptedChange(idx, item.acceptedQuantity + 1)}
                                disabled={deliveryData?.isLocked || item.acceptedQuantity >= item.orderedQuantity}
                                className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 disabled:opacity-30"
                              >
                                +
                              </button>
                            </div>
                          </div>

                          {/* Rejected units badge */}
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] text-slate-500 font-semibold">Rejected:</span>
                            <span className={`px-2.5 py-0.5 rounded-lg text-xs font-mono font-bold ${
                              item.rejectedQuantity > 0 
                                ? 'bg-rose-50 text-rose-700 border border-rose-200' 
                                : 'bg-slate-50 text-slate-500 border border-slate-200'
                            }`}>
                              {item.rejectedQuantity} units
                            </span>
                          </div>
                        </div>

                        {/* Rejection Reason selector if rejected > 0 */}
                        {item.rejectedQuantity > 0 && (
                          <div className="p-2 rounded-xl bg-rose-50 border border-rose-200 space-y-1 text-xs mt-1.5">
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] text-rose-700 font-semibold">Rejection Reason:</span>
                              <span className="text-[10px] text-amber-800 font-mono font-bold">
                                Credit: ₹{(item.rejectedQuantity * item.unitPrice * 1.05).toFixed(2)} (incl. 5% GST)
                              </span>
                            </div>
                            <select
                              value={item.rejectionReason || 'damaged_packaging'}
                              onChange={(e) => handleItemReasonChange(idx, e.target.value)}
                              className="w-full px-2.5 py-1.5 rounded-lg bg-slate-50 border border-rose-200 text-rose-700 text-xs focus:outline-none focus:border-rose-400"
                            >
                              <option value="damaged_packaging">📦 Damaged / Torn Packaging</option>
                              <option value="waterlogged_spoilage">💧 Waterlogged / Moisture Spoilage</option>
                              <option value="expired_product">⌛ Expired or Near Expiry Date</option>
                              <option value="wrong_specification">⚠️ Wrong Specification / Mismatch</option>
                              <option value="short_delivery">📉 Short Delivery / Count Mismatch</option>
                              <option value="other">❓ Other Doorstep Quality Anomaly</option>
                            </select>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Real-time Partial Inspection Summary */}
                  <div className="p-3 rounded-xl bg-white border border-slate-200 text-xs space-y-1.5 font-mono">
                    <div className="flex justify-between text-slate-500">
                      <span>Total Inflow (POS Stock Credit):</span>
                      <span className="text-emerald-700 font-bold">{acceptedUnits} / {totalDeliveredUnits} units</span>
                    </div>
                    {totalRejectedUnits > 0 && (
                      <div className="flex justify-between text-rose-700">
                        <span>Damaged Units (Excluded from POS):</span>
                        <span className="font-bold">{totalRejectedUnits} units</span>
                      </div>
                    )}
                    {totalRejectedUnits > 0 && (
                      <div className="flex justify-between text-blue-700 pt-1 border-t border-slate-200">
                        <span>Disputed Escrow Hold (Credit Note Value):</span>
                        <span className="font-bold">₹{creditNoteDisputeValue.toFixed(2)}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-slate-900 font-bold pt-1 border-t border-slate-200">
                      <span>Undisputed Net Accepted Total:</span>
                      <span className="text-emerald-700">₹{effectiveInvoiceTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                    </div>
                  </div>
                </div>

                {/* Edge Case 3: Partial Cash Payment on Delivery with Khata Split Balance */}
                <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-700">
                      Doorstep Settlement (Cash + Khata Split)
                    </label>
                    <span className="text-[10px] text-slate-500">
                      Payable: <strong className="text-emerald-700 font-mono">₹{effectiveInvoiceTotal.toLocaleString('en-IN')}</strong>
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                    <div>
                      <span className="text-[10px] text-slate-500 block mb-1">Cash Collected:</span>
                      <div className="relative">
                        <span className="absolute left-3 top-2 text-xs text-slate-500 font-bold">₹</span>
                        <input
                          type="number"
                          min={0}
                          max={effectiveInvoiceTotal}
                          disabled={deliveryData?.isLocked || isVerifying}
                          value={cashCollected}
                          onChange={(e) => setCashCollected(Math.min(effectiveInvoiceTotal, Math.max(0, Number(e.target.value))))}
                          className="w-full pl-6 pr-3 py-1.5 rounded-xl bg-white border border-slate-200 font-mono text-emerald-700 font-bold text-xs focus:outline-none focus:border-emerald-500"
                          placeholder="0"
                        />
                      </div>
                    </div>
                    <div className="p-2 rounded-xl bg-white border border-slate-200 flex flex-col justify-center">
                      <span className="text-[10px] text-slate-500">Khata Split Balance:</span>
                      <span className="text-sm font-black text-amber-800 font-mono">
                        +₹{creditRemaining.toLocaleString('en-IN')}
                      </span>
                      <span className="text-[9px] text-slate-500">Added to running Kirana debt</span>
                    </div>
                  </div>
                  {/* Quick Shortcuts */}
                  <div className="flex items-center gap-1.5 pt-0.5">
                    <button
                      type="button"
                      onClick={() => setCashCollected(0)}
                      disabled={isVerifying}
                      className="px-2 py-0.5 rounded-lg bg-white hover:bg-slate-100 text-[10px] text-slate-500 border border-slate-200"
                    >
                      Full Khata (₹0 Cash)
                    </button>
                    <button
                      type="button"
                      onClick={() => setCashCollected(Math.min(5000, effectiveInvoiceTotal))}
                      disabled={isVerifying}
                      className="px-2 py-0.5 rounded-lg bg-white hover:bg-slate-100 text-[10px] text-amber-800 border border-slate-200"
                    >
                      ₹5,000 Cash
                    </button>
                    <button
                      type="button"
                      onClick={() => setCashCollected(effectiveInvoiceTotal)}
                      disabled={isVerifying}
                      className="px-2 py-0.5 rounded-lg bg-white hover:bg-slate-100 text-[10px] text-emerald-700 border border-slate-200"
                    >
                      Full Cash
                    </button>
                  </div>
                </div>

                {/* Handover notes */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700 block">
                    Handover Notes (Optional)
                  </label>
                  <input
                    type="text"
                    disabled={deliveryData?.isLocked}
                    value={verifyNotes}
                    onChange={(e) => setVerifyNotes(e.target.value)}
                    placeholder="e.g. Unloaded into ground floor godown, physical inspection complete"
                    className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-emerald-500 disabled:opacity-40"
                  />
                </div>

                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={isVerifying || enteredOtp.length !== 6 || deliveryData?.isLocked || totalRejectedUnits > totalDeliveredUnits}
                    className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-slate-950 font-black text-sm shadow-lg shadow-emerald-500/25 flex items-center justify-center gap-2 transition disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {isVerifying ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" /> Verifying Cryptographic OTP...
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="w-4 h-4" /> Verify &amp; Complete Handover
                      </>
                    )}
                  </button>
                </div>
              </form>

            </div>
          )}
        </div>
      </div>

      {/* Immutable B2B GST Tax Invoice Modal */}
      {showGstInvoiceModal && (
        <GstInvoiceModal
          orderId={orderId}
          orderNumber={deliveryData?.orderNumber || orderNumber}
          onClose={() => setShowGstInvoiceModal(false)}
        />
      )}

      {/* Statutory B2B Credit Note Modal */}
      {showCreditNoteModal && (verificationResult?.creditNote || activeCreditNote) && (
        <CreditNoteModal
          creditNote={verificationResult?.creditNote || activeCreditNote!}
          userRole="retailer"
          onClose={() => setShowCreditNoteModal(false)}
          onDisputeResolved={() => {
            fetchDeliveryData();
          }}
        />
      )}
    </div>
  );
};
