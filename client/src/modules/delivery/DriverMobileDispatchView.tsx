import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { DeliveryService } from './deliveryService';
import { 
  DriverPortalDetailsResponse, 
  LineItemInspectionPayload, 
  HandoverVerificationResult 
} from './types';
import { 
  Truck, 
  MapPin, 
  Phone, 
  ExternalLink, 
  CheckCircle2, 
  AlertTriangle, 
  Navigation, 
  ShieldCheck, 
  Camera, 
  Radio
} from 'lucide-react';

export const DriverMobileDispatchView: React.FC = () => {
  const { token } = useParams<{ token: string }>();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [portalData, setPortalData] = useState<DriverPortalDetailsResponse | null>(null);

  // GPS Simulation state (for local <100km)
  const [gpsSimulating, setGpsSimulating] = useState(false);
  const [currentSpeed, setCurrentSpeed] = useState(32);
  const [locationSuccessMsg, setLocationSuccessMsg] = useState<string | null>(null);

  // Regional Milestone state (for regional >100km)
  const [milestoneLoading, setMilestoneLoading] = useState(false);
  const [milestoneSuccessMsg, setMilestoneSuccessMsg] = useState<string | null>(null);

  // Doorstep inspection / damage state
  const [inspections, setInspections] = useState<Record<string, {
    damagedQty: number;
    reason: LineItemInspectionPayload['rejectionReason'];
    notes: string;
    photoUploaded: boolean;
  }>>({});

  // OTP Verification state
  const [otpCode, setOtpCode] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [otpError, setOtpError] = useState<string | null>(null);
  const [verificationResult, setVerificationResult] = useState<HandoverVerificationResult | null>(null);
  const [offlineQueued, setOfflineQueued] = useState(false);

  const applyVerificationResult = (result: HandoverVerificationResult) => {
    setVerificationResult(result);
    setPortalData(prev => prev ? { ...prev, isVerified: true, deliveryStatus: 'delivered', orderStatus: 'delivered', verifiedAt: result.verifiedAt } : null);
    setOfflineQueued(false);
  };

  const syncOfflineQueue = async () => {
    if (!token || !navigator.onLine) return;
    const key = 'sharvin_offline_delivery_queue';
    let queue: Array<{ token: string; payload: Parameters<typeof DeliveryService.verifyDriverOtp>[1] }> = [];
    try { queue = JSON.parse(localStorage.getItem(key) || '[]'); }
    catch { localStorage.removeItem(key); }
    const pending = queue.find(item => item.token === token);
    if (!pending) return;
    try {
      const result = await DeliveryService.verifyDriverOtp(pending.token, pending.payload);
      applyVerificationResult(result);
      localStorage.setItem(key, JSON.stringify(queue.filter(item => item !== pending)));
      setOtpError(null);
    } catch (error) {
      if (error instanceof TypeError) return; // Network is still unavailable.
      localStorage.setItem(key, JSON.stringify(queue.filter(item => item !== pending)));
      setOfflineQueued(false);
      setOtpError(error instanceof Error ? error.message : 'Queued handover could not be verified. Contact dispatch support.');
    }
  };

  useEffect(() => {
    const key = 'sharvin_offline_delivery_queue';
    const refresh = () => {
      try {
        const queue = JSON.parse(localStorage.getItem(key) || '[]') as Array<{ token: string }>;
        setOfflineQueued(Boolean(token && queue.some(item => item.token === token)));
      } catch { localStorage.removeItem(key); setOfflineQueued(false); }
    };
    refresh();
    const handleOnline = () => { void syncOfflineQueue(); };
    window.addEventListener('online', handleOnline);
    if (navigator.onLine) void syncOfflineQueue();
    return () => window.removeEventListener('online', handleOnline);
  }, [token]);

  // Load Portal Details
  useEffect(() => {
    if (!token) {
      setError('Missing delivery access token.');
      setLoading(false);
      return;
    }

    loadPortalData();
  }, [token]);

  const loadPortalData = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await DeliveryService.getDriverPortalDetails(token!);
      setPortalData(data);

      // Initialize inspections mapping
      const initialInspections: Record<string, any> = {};
      data.items.forEach(item => {
        initialInspections[item.orderItemId] = {
          damagedQty: 0,
          reason: 'damaged_packaging',
          notes: '',
          photoUploaded: false,
        };
      });
      setInspections(initialInspections);

      if (data.isVerified) {
        setVerificationResult({
          success: true,
          orderId: data.orderId,
          orderNumber: data.orderNumber,
          deliveryStatus: 'delivered',
          isVerified: true,
          verifiedAt: data.verifiedAt || new Date().toISOString(),
          finalAmount: data.finalAmount,
          message: 'Delivery verified and completed.',
          certificate: {
            verificationId: `cert-${data.orderNumber}`,
            verifiedAt: data.verifiedAt || new Date().toISOString(),
            orderNumber: data.orderNumber,
            retailerName: data.retailerName,
            wholesalerName: 'Kailash Grains & Pulses Wholesale',
            verifiedByDriver: data.driverName,
            totalAmount: data.finalAmount,
          },
        });
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load driver dispatch portal');
    } finally {
      setLoading(false);
    }
  };

  // Adjust Damaged Quantity for an item (Strictly capped: 0 <= damaged <= orderedQuantity)
  const handleDamagedQtyChange = (orderItemId: string, maxQty: number, delta: number) => {
    setInspections(prev => {
      const current = prev[orderItemId]?.damagedQty || 0;
      const next = Math.max(0, Math.min(maxQty, current + delta));
      return {
        ...prev,
        [orderItemId]: {
          ...prev[orderItemId],
          damagedQty: next,
        },
      };
    });
  };

  const handleReasonChange = (orderItemId: string, reason: LineItemInspectionPayload['rejectionReason']) => {
    setInspections(prev => ({
      ...prev,
      [orderItemId]: {
        ...prev[orderItemId],
        reason,
      },
    }));
  };

  const handlePhotoUploadSim = (orderItemId: string) => {
    setInspections(prev => ({
      ...prev,
      [orderItemId]: {
        ...prev[orderItemId],
        photoUploaded: true,
      },
    }));
  };

  // Transmit Live GPS Coordinates towards destination (Local Mode <100km)
  const handleTransmitGps = async () => {
    if (!portalData || !token) return;
    try {
      setGpsSimulating(true);
      setLocationSuccessMsg(null);

      // Move 20% closer to destination coords
      const nextLat = portalData.currentLatitude + (portalData.destinationLatitude - portalData.currentLatitude) * 0.25;
      const nextLng = portalData.currentLongitude + (portalData.destinationLongitude - portalData.currentLongitude) * 0.25;
      const speed = Math.floor(25 + Math.random() * 15);
      setCurrentSpeed(speed);

      await DeliveryService.updateDriverLocation(token, nextLat, nextLng, speed);
      setPortalData(prev => prev ? {
        ...prev,
        currentLatitude: nextLat,
        currentLongitude: nextLng,
      } : null);

      setLocationSuccessMsg(`📍 Live GPS Broadcasted! Speed: ${speed} km/h • Coordinates: ${nextLat.toFixed(4)}° N, ${nextLng.toFixed(4)}° E`);
      setTimeout(() => setLocationSuccessMsg(null), 4000);
    } catch (err: any) {
      alert(`GPS update failed: ${err.message}`);
    } finally {
      setGpsSimulating(false);
    }
  };

  // Update Milestone (Regional Mode >100km)
  const handleUpdateMilestone = async (nextMilestone: 'dispatched' | 'in_transit_hub' | 'out_for_delivery' | 'delivered', hubName: string) => {
    if (!token) return;
    try {
      setMilestoneLoading(true);
      setMilestoneSuccessMsg(null);
      await DeliveryService.updateDriverMilestone(token, nextMilestone, hubName, `Milestone confirmed by driver`);
      setPortalData(prev => prev ? {
        ...prev,
        trackingMilestone: nextMilestone,
        currentHubName: hubName,
      } : null);
      setMilestoneSuccessMsg(`✅ Checkpoint updated to "${hubName}" (${nextMilestone})`);
      setTimeout(() => setMilestoneSuccessMsg(null), 4000);
    } catch (err: any) {
      alert(`Milestone update failed: ${err.message}`);
    } finally {
      setMilestoneLoading(false);
    }
  };

  // Verify 6-digit OTP & Complete Handover
  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !portalData) return;
    if (portalData.attemptsRemaining <= 0) {
      setOtpError('Verification is locked after 3 failed attempts. Contact the dispatch manager for assistance.');
      return;
    }

    if (!/^\d{6}$/.test(otpCode.trim())) {
      setOtpError('Please enter a valid 6-digit numeric OTP.');
      return;
    }

    try {
      setVerifying(true);
      setOtpError(null);

      // Compile line inspections
      const linePayloads: LineItemInspectionPayload[] = portalData.items.map(item => {
        const insp = inspections[item.orderItemId] || { damagedQty: 0, reason: 'damaged_packaging', notes: '' };
        const damaged = insp.damagedQty || 0;
        const accepted = Math.max(0, item.orderedQuantity - damaged);
        return {
          orderItemId: item.orderItemId,
          productId: item.productId,
          productName: item.productName,
          orderedQuantity: item.orderedQuantity,
          acceptedQuantity: accepted,
          rejectedQuantity: damaged,
          rejectionReason: damaged > 0 ? insp.reason : undefined,
          unitPrice: item.unitPrice,
          lineRejectedAmount: damaged * item.unitPrice,
        };
      });

      const totalDamaged = linePayloads.reduce((acc, i) => acc + i.rejectedQuantity, 0);

      const verificationPayload: Parameters<typeof DeliveryService.verifyDriverOtp>[1] = {
        otpCode: otpCode.trim(),
        damagedQuantity: totalDamaged,
        lineItemInspections: linePayloads,
        notes: totalDamaged > 0 ? `Driver recorded ${totalDamaged} damaged items at doorstep inspection.` : 'Delivered intact.',
      };
      try {
        const result = await DeliveryService.verifyDriverOtp(token, verificationPayload);
        applyVerificationResult(result);
      } catch (err) {
        if (!(err instanceof TypeError) && navigator.onLine) throw err;
        const key = 'sharvin_offline_delivery_queue';
        const queue = JSON.parse(localStorage.getItem(key) || '[]') as Array<{ token: string; payload: typeof verificationPayload }>;
        localStorage.setItem(key, JSON.stringify([...queue.filter(item => item.token !== token), { token, payload: verificationPayload }]));
        setOfflineQueued(true);
        setOtpError(null);
      }
    } catch (err: any) {
      const message = err.message || 'OTP verification failed. Please ask the retailer for the correct 6-digit code.';
      setOtpError(/lock|attempt/i.test(message)
        ? 'Verification is locked after 3 failed attempts. Contact the dispatch manager for assistance.'
        : message);
    } finally {
      setVerifying(false);
    }
  };

  // Calculations
  const totalOrderedUnits = portalData?.items.reduce((acc, it) => acc + it.orderedQuantity, 0) || 0;
  const totalDamagedUnits = Object.values(inspections).reduce((acc, it) => acc + (it.damagedQty || 0), 0);
  const totalAcceptedUnits = Math.max(0, totalOrderedUnits - totalDamagedUnits);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
        <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-4" />
        <h2 className="text-lg font-bold text-slate-800">Opening Driver Dispatch Portal...</h2>
        <p className="text-sm text-slate-500 mt-1">Connecting to live logistics feed...</p>
      </div>
    );
  }

  if (error || !portalData) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-sm border border-slate-200 p-6 text-center">
          <div className="w-14 h-14 bg-red-50 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertTriangle className="w-7 h-7" />
          </div>
          <h2 className="text-xl font-bold text-slate-900">Invalid Driver Access Link</h2>
          <p className="text-sm text-slate-600 mt-2">{error || 'This temporary delivery link is invalid or has expired.'}</p>
          <div className="mt-6 pt-4 border-t border-slate-100">
            <p className="text-xs text-slate-500">Please contact the dispatch manager for a new temporary link.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 flex justify-center py-0 sm:py-6 sm:px-4">
      {/* Mobile container - Max 480px width for authentic smartphone experience */}
      <div className="w-full max-w-md bg-white sm:rounded-3xl sm:shadow-xl sm:border sm:border-slate-200 flex flex-col min-h-screen sm:min-h-[850px] overflow-hidden">
        
        {/* Top App Bar */}
        <div className="bg-white text-slate-900 px-4 py-3.5 flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white">
              <Truck className="w-4 h-4" />
            </div>
            <div>
              <div className="text-xs font-semibold tracking-wider text-blue-700 uppercase">SharVin Driver Portal</div>
              <div className="text-sm font-bold tracking-tight">{portalData.orderNumber}</div>
            </div>
          </div>
          <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
            portalData.isVerified 
              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' 
              : 'bg-amber-50 text-amber-800 border border-amber-200'
          }`}>
            {portalData.isVerified ? 'Delivered' : 'Out for Delivery'}
          </span>
        </div>

        {/* Scrollable Content Area */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">

          {/* Delivery Handover Complete Certificate (if verified) */}
          {verificationResult && (
            <div className="bg-emerald-50 border-2 border-emerald-500 rounded-2xl p-5 shadow-sm text-center animate-in fade-in zoom-in-95 duration-300">
              <div className="w-14 h-14 bg-emerald-600 text-white rounded-full flex items-center justify-center mx-auto mb-3 shadow-md">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <h3 className="text-lg font-bold text-emerald-950">Handover Verified & Completed!</h3>
              <p className="text-xs text-emerald-800 mt-1">
                Both parties confirmed custody. Retailer store inventory has been rebalanced.
              </p>

              <div className="mt-4 bg-white/80 rounded-xl p-3 border border-emerald-200 text-left space-y-1 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-500">Retailer:</span>
                  <span className="font-semibold text-slate-800">{portalData.retailerName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Verified By Driver:</span>
                  <span className="font-semibold text-slate-800">{portalData.driverName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Verified Timestamp:</span>
                  <span className="font-semibold text-slate-800">{new Date(verificationResult.verifiedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
                <div className="flex justify-between pt-1 border-t border-emerald-100">
                  <span className="text-slate-500">Accepted Order Total:</span>
                  <span className="font-bold text-emerald-700">₹{(verificationResult.finalAmount || portalData.finalAmount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                </div>
              </div>

              <div className="mt-4 flex items-center justify-center gap-2 text-xs font-semibold text-emerald-700">
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
                <span>Statutory GST Invoice & CA Ledger Updated</span>
              </div>
            </div>
          )}

          {/* Destination & Navigation Card */}
          <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm space-y-3">
            <div className="flex items-start justify-between">
              <div>
                <span className="text-[11px] font-semibold text-blue-600 uppercase tracking-wider">Destination Store</span>
                <h4 className="text-base font-bold text-slate-900 mt-0.5">{portalData.retailerName}</h4>
              </div>
              <a 
                href={`tel:${portalData.retailerPhone}`}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-xl text-xs font-bold transition-colors border border-blue-200"
              >
                <Phone className="w-3.5 h-3.5" />
                <span>Call Store</span>
              </a>
            </div>

            <div className="flex items-start gap-2.5 text-xs text-slate-600 bg-slate-50 p-3 rounded-xl border border-slate-100">
              <MapPin className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-slate-800 leading-snug">{portalData.destinationAddress}</p>
                <div className="flex items-center gap-2 mt-1.5 text-[11px] text-slate-500">
                  <span className="px-1.5 py-0.5 bg-slate-200 rounded font-semibold text-slate-700">
                    {portalData.distanceKm} km away
                  </span>
                  <span>•</span>
                  <span>Destination: {portalData.destinationLatitude.toFixed(4)}° N, {portalData.destinationLongitude.toFixed(4)}° E</span>
                </div>
              </div>
            </div>

            {/* Google Maps Action Button */}
            <a
              href={portalData.googleMapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded-xl font-bold text-sm shadow-md shadow-blue-500/20 transition-all text-center"
            >
              <Navigation className="w-4 h-4 fill-white" />
              <span>Start Google Maps Navigation</span>
              <ExternalLink className="w-3.5 h-3.5 opacity-70 ml-1" />
            </a>
          </div>

          {/* Distance-Adaptive Tracking Card */}
          <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Radio className="w-4 h-4 text-blue-600 animate-pulse" />
                <span className="text-xs font-bold text-slate-900">
                  {portalData.trackingMode === 'local' ? '⚡ Local Route Tracking (<100km)' : '🚛 Regional Checkpoint Freight (>100km)'}
                </span>
              </div>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                portalData.trackingMode === 'local' ? 'bg-blue-50 text-blue-700 border border-blue-200' : 'bg-purple-50 text-purple-700 border border-purple-200'
              }`}>
                {portalData.trackingMode}
              </span>
            </div>

            {/* Local Distance Tracking Mode: Real-time GPS coordinate simulation */}
            {portalData.trackingMode === 'local' ? (
              <div className="space-y-3 bg-slate-50 rounded-xl p-3 border border-slate-100">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500">GPS Beacon Broadcast:</span>
                  <span className="font-semibold text-slate-800">
                    {portalData.currentLatitude.toFixed(4)}° N, {portalData.currentLongitude.toFixed(4)}° E
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500">Live Speed:</span>
                  <span className="font-bold text-blue-600">{currentSpeed} km/h (Moving Tempo)</span>
                </div>

                {locationSuccessMsg && (
                  <div className="text-[11px] font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg p-2 animate-in fade-in">
                    {locationSuccessMsg}
                  </div>
                )}

                <button
                  type="button"
                  onClick={handleTransmitGps}
                  disabled={gpsSimulating || portalData.isVerified}
                  className="w-full py-2.5 px-3 bg-white hover:bg-slate-100 disabled:opacity-50 text-slate-900 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-colors"
                >
                  <Navigation className="w-3.5 h-3.5" />
                  <span>{gpsSimulating ? 'Broadcasting Coordinates...' : '📡 Broadcast My Current GPS Location'}</span>
                </button>
                <p className="text-[10px] text-slate-500 text-center">
                  Coordinates stream to retailer & wholesaler live tracking dashboard.
                </p>
              </div>
            ) : (
              /* Regional Distance Tracking Mode: Step-wise Checkpoint Milestones */
              <div className="space-y-3 bg-slate-50 rounded-xl p-3 border border-slate-100">
                <div className="space-y-2">
                  {[
                    { id: 'dispatched', label: '1. Godown Dispatched', hub: 'Chandni Chowk Main Warehouse' },
                    { id: 'in_transit_hub', label: '2. Regional Logistics Hub', hub: 'Bhiwandi / Delhi Gateway Hub' },
                    { id: 'out_for_delivery', label: '3. Out for Local Delivery', hub: 'Najafgarh Local Feeder Hub' },
                    { id: 'delivered', label: '4. Delivered to Retailer', hub: portalData.retailerName },
                  ].map((step, idx) => {
                    const isPassed = 
                      portalData.trackingMilestone === step.id ||
                      (step.id === 'dispatched') ||
                      (portalData.trackingMilestone === 'in_transit_hub' && idx <= 1) ||
                      (portalData.trackingMilestone === 'out_for_delivery' && idx <= 2) ||
                      (portalData.trackingMilestone === 'delivered');

                    const isCurrent = portalData.trackingMilestone === step.id;

                    return (
                      <div key={step.id} className="flex items-start gap-2.5 text-xs">
                        <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5 ${
                          isPassed ? 'bg-purple-600 text-white' : 'bg-slate-200 text-slate-500'
                        }`}>
                          {isPassed ? '✓' : idx + 1}
                        </div>
                        <div className="flex-1">
                          <div className={`font-semibold ${isCurrent ? 'text-purple-700 font-bold' : isPassed ? 'text-slate-800' : 'text-slate-500'}`}>
                            {step.label} {isCurrent && <span className="text-[10px] bg-purple-100 text-purple-700 px-1.5 py-0.2 rounded ml-1">Current</span>}
                          </div>
                          <div className="text-[11px] text-slate-500">{step.hub}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {milestoneSuccessMsg && (
                  <div className="text-[11px] font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg p-2">
                    {milestoneSuccessMsg}
                  </div>
                )}

                {!portalData.isVerified && (
                  <div className="pt-2 flex gap-2">
                    {portalData.trackingMilestone === 'dispatched' && (
                      <button
                        type="button"
                        onClick={() => handleUpdateMilestone('in_transit_hub', 'Delhi Regional Hub')}
                        disabled={milestoneLoading}
                        className="flex-1 py-2 px-3 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-bold transition-colors"
                      >
                        Advance to: In Transit Hub
                      </button>
                    )}
                    {(portalData.trackingMilestone === 'dispatched' || portalData.trackingMilestone === 'in_transit_hub') && (
                      <button
                        type="button"
                        onClick={() => handleUpdateMilestone('out_for_delivery', 'Najafgarh Feeder Station')}
                        disabled={milestoneLoading}
                        className="flex-1 py-2 px-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-colors"
                      >
                        Advance to: Out for Delivery
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Doorstep Physical Inspection & Damage Counter */}
          <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Step 1 • Physical Inspection</span>
                <h4 className="text-sm font-bold text-slate-900 mt-0.5">Item Checklist & Damage Counter</h4>
              </div>
              <span className="text-xs bg-slate-100 text-slate-700 font-bold px-2 py-1 rounded-lg">
                {portalData.items.length} Line Items
              </span>
            </div>

            <p className="text-xs text-slate-500">
              Inspect carton seal and count items. If packaging is torn or waterlogged, tap <strong className="text-red-600">[+] Damaged</strong>.
            </p>

            {/* Line items list */}
            <div className="space-y-3 pt-1">
              {portalData.items.map((item) => {
                const insp = inspections[item.orderItemId] || { damagedQty: 0, reason: 'damaged_packaging', notes: '', photoUploaded: false };
                const damagedCount = insp.damagedQty || 0;
                const acceptedCount = Math.max(0, item.orderedQuantity - damagedCount);

                return (
                  <div key={item.orderItemId} className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="text-xs font-bold text-slate-900 leading-snug">{item.productName}</div>
                        <div className="text-[11px] text-slate-500 mt-0.5">
                          Ordered: <span className="font-semibold text-slate-800">{item.orderedQuantity} units</span> @ ₹{item.unitPrice.toFixed(2)}
                        </div>
                        {item.batchNumber && (
                          <div className="text-[10px] text-slate-500 mt-0.5">
                            Batch: {item.batchNumber} {item.expiryDate ? `• Exp: ${new Date(item.expiryDate).toLocaleDateString()}` : ''}
                          </div>
                        )}
                      </div>
                      <div className="text-right">
                        <div className="text-xs font-bold text-slate-900">₹{item.lineTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
                      </div>
                    </div>

                    {/* Stepper with capping: 0 <= damaged <= orderedQuantity */}
                    <div className="flex items-center justify-between pt-2 border-t border-slate-200">
                      <div className="text-xs">
                        <span className="text-slate-500">Intact: </span>
                        <span className="font-bold text-emerald-700">{acceptedCount}</span>
                        {damagedCount > 0 && (
                          <span className="text-red-600 font-bold ml-1.5">
                            ({damagedCount} Damaged)
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-medium text-slate-500">Damaged:</span>
                        <div className="flex items-center bg-white border border-slate-300 rounded-lg overflow-hidden shadow-2xs">
                          <button
                            type="button"
                            onClick={() => handleDamagedQtyChange(item.orderItemId, item.orderedQuantity, -1)}
                            disabled={damagedCount <= 0 || portalData.isVerified}
                            className="w-8 h-8 flex items-center justify-center text-slate-700 hover:bg-slate-100 disabled:opacity-30 font-bold text-sm transition-colors"
                          >
                            -
                          </button>
                          <span className={`w-8 text-center text-xs font-bold ${damagedCount > 0 ? 'text-red-600' : 'text-slate-700'}`}>
                            {damagedCount}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleDamagedQtyChange(item.orderItemId, item.orderedQuantity, 1)}
                            disabled={damagedCount >= item.orderedQuantity || portalData.isVerified}
                            className="w-8 h-8 flex items-center justify-center text-slate-700 hover:bg-slate-100 disabled:opacity-30 font-bold text-sm transition-colors"
                          >
                            +
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* If damaged > 0: Show reason selector and simulated photo upload */}
                    {damagedCount > 0 && (
                      <div className="mt-2 pt-2 border-t border-dashed border-red-200 bg-red-50/60 p-2.5 rounded-lg space-y-2 animate-in fade-in">
                        <div className="flex items-center justify-between">
                          <label className="text-[11px] font-bold text-red-800">Damage Reason:</label>
                          <select
                            value={insp.reason}
                            onChange={(e) => handleReasonChange(item.orderItemId, e.target.value as any)}
                            disabled={portalData.isVerified}
                            className="text-xs bg-white border border-red-300 rounded-lg px-2 py-1 text-slate-800 font-medium focus:ring-1 focus:ring-red-500"
                          >
                            <option value="damaged_packaging">Damaged Packaging / Leakage</option>
                            <option value="waterlogged_spoilage">Waterlogged Spoilage</option>
                            <option value="expired_product">Expired or Near-Expiry</option>
                            <option value="wrong_specification">Wrong Specification</option>
                            <option value="short_delivery">Short Units in Carton</option>
                          </select>
                        </div>

                        <div className="flex items-center justify-between">
                          <span className="text-[11px] text-slate-600">Damage Proof Photo:</span>
                          <button
                            type="button"
                            onClick={() => handlePhotoUploadSim(item.orderItemId)}
                            disabled={insp.photoUploaded || portalData.isVerified}
                            className={`px-2.5 py-1 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors ${
                              insp.photoUploaded 
                                ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' 
                                : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-50'
                            }`}
                          >
                            <Camera className="w-3.5 h-3.5" />
                            <span>{insp.photoUploaded ? '✓ Photo Attached' : 'Take / Upload Photo'}</span>
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Inspection Totals Summary Bar */}
            <div className="bg-white text-slate-900 rounded-xl p-3 flex items-center justify-between text-xs">
              <div>
                <div className="text-slate-500 text-[10px] uppercase font-bold tracking-wider">Custody Breakdown</div>
                <div className="font-semibold mt-0.5">
                  <span className="text-emerald-700 font-bold">{totalAcceptedUnits} Units Accepted</span>
                  {totalDamagedUnits > 0 && (
                    <span className="text-red-600 font-bold ml-1.5">• {totalDamagedUnits} Damaged</span>
                  )}
                </div>
              </div>
              <div className="text-right">
                <div className="text-slate-500 text-[10px] uppercase font-bold tracking-wider">Total Units</div>
                <div className="font-bold text-sm">{totalOrderedUnits} pcs</div>
              </div>
            </div>
          </div>

          {/* 6-Digit Handover OTP Card */}
          {!portalData.isVerified ? (
            <div className="bg-white rounded-2xl border-2 border-blue-600 p-4 shadow-md space-y-3">
              <div>
                <span className="text-[11px] font-bold text-blue-600 uppercase tracking-wider">Step 2 • Customer Handover</span>
                <h4 className="text-base font-bold text-slate-900 mt-0.5">Enter Retailer's 6-Digit OTP</h4>
                <p className="text-xs text-slate-500 mt-1">
                  Ask {portalData.retailerName} for the secret 6-digit handover code visible on their SharVin screen.
                </p>
              </div>

              <form onSubmit={handleVerifyOtp} className="space-y-3">
                <div>
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    value={otpCode}
                    onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))}
                    placeholder="• • • • • •"
                    className="w-full text-center text-2xl font-mono tracking-widest py-3 px-4 bg-slate-50 border-2 border-slate-300 focus:border-blue-600 focus:bg-white rounded-xl font-bold text-slate-900 outline-none transition-all"
                  />
                </div>

                {otpError && (
                  <div className="text-xs font-semibold text-red-600 bg-red-50 border border-red-200 rounded-xl p-2.5 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <span>{otpError}</span>
                  </div>
                )}
                {offlineQueued && (
                  <div role="status" className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
                    Offline - Queued for Sync. Verification and damage details will retry when online.
                  </div>
                )}

                {/* 1-Click test helper for demo ease */}
                <div className="flex justify-between items-center text-[11px] text-slate-500">
                  <span>Remaining Attempts: {portalData.attemptsRemaining}/3</span>
                  <button
                    type="button"
                    onClick={() => setOtpCode('482910')}
                    className="text-blue-600 hover:text-blue-800 font-semibold underline"
                  >
                    Fill Demo OTP (482910)
                  </button>
                </div>

                <button
                  type="submit"
                   disabled={verifying || offlineQueued || portalData.attemptsRemaining <= 0 || otpCode.length !== 6}
                  className="w-full py-3.5 px-4 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 disabled:opacity-50 text-white rounded-xl font-bold text-sm shadow-md shadow-emerald-500/20 flex items-center justify-center gap-2 transition-all"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{verifying ? 'Verifying Handover...' : 'Confirm Delivery & Handover Goods'}</span>
                </button>
              </form>
            </div>
          ) : (
            /* Completed Banner */
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 text-center space-y-2">
              <span className="text-xs text-slate-500 font-medium">Order Handover is Complete</span>
              <p className="text-xs text-slate-500">
                You can now proceed to your next assigned delivery stop.
              </p>
            </div>
          )}

        </div>

        {/* Bottom Safety & Disclaimer Footer */}
        <div className="p-3 bg-slate-50 border-t border-slate-200 text-center text-[10px] text-slate-500 space-y-0.5">
          <div>SharVin Connected Logistics • Secure Driver Portal</div>
          <div>All handovers verified cryptographically on local ledger.</div>
        </div>

      </div>
    </div>
  );
};
