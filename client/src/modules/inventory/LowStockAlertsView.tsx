import React, { useState, useMemo, useEffect } from 'react';
import { 
  AlertTriangle, 
  ArrowLeft, 
  Zap,
  ShoppingCart,
  CheckCircle2,
  Search,
  SlidersHorizontal,
  Building2,
  Package,
  TrendingDown,
  ChevronRight,
  ShieldCheck,
  X,
  Plus,
  Minus,
  Sparkles
} from 'lucide-react';
import { LowStockItem, ReorderPrediction, RestockOrderDraft, RestockNotification } from './types';
import { InventoryService } from './inventoryService';
import { ReorderPredictorCard } from './ReorderPredictorCard';
import { ModalBackdrop } from '../../components/ui/DismissOnOutsideClick';

interface LowStockAlertsViewProps {
  onBackToPos?: () => void;
  onBackToOverview?: () => void;
  onOpenWholesaleCart?: () => void;
}

type SmartLowStockItem = LowStockItem & {
  recommendedOrderQty: number;
};

export const LowStockAlertsView: React.FC<LowStockAlertsViewProps> = ({
  onBackToPos,
  onBackToOverview,
  onOpenWholesaleCart,
}) => {
  const [items, setItems] = useState<SmartLowStockItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [filterSeverity, setFilterSeverity] = useState<'all' | 'critical' | 'high_deficit'>('all');
  const [draftCarts] = useState<Record<string, RestockOrderDraft>>({});
  
  // Notification toast
  const [latestNotification, setLatestNotification] = useState<RestockNotification | null>(null);

  // Edit threshold modal state
  const [editingItem, setEditingItem] = useState<LowStockItem | null>(null);
  const [tempThreshold, setTempThreshold] = useState<number>(10);
  const [tempReorderQty, setTempReorderQty] = useState<number>(25);

  // Restocking in-progress set
  const [restockedItemIds, setRestockedItemIds] = useState<Set<string>>(new Set());

  const loadItems = async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const [result, predictionResult] = await Promise.all([
        InventoryService.getLowStock(),
        InventoryService.getReorderPredictions().catch(() => null),
      ]);
      const quantitiesByProduct = new Map(
        (predictionResult?.predictions || []).map((prediction) => [
          prediction.productId,
          Number(
            (prediction as ReorderPrediction & { recommendedOrderQty?: number }).recommendedOrderQty
            ?? prediction.recommendedBufferQty,
          ),
        ]),
      );
      setItems((result.items || []).map((item) => ({
        ...item,
        recommendedOrderQty: quantitiesByProduct.get(item.productId) ?? item.recommendedRestockQuantity,
      })));
    } catch (error) {
      setItems([]);
      setLoadError(error instanceof Error ? error.message : 'Could not load inventory alerts.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { void loadItems(); }, []);

  // Filtered list
  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      const matchesSearch = 
        !searchQuery.trim() ||
        item.productName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.barcode.includes(searchQuery) ||
        (item.brandName && item.brandName.toLowerCase().includes(searchQuery.toLowerCase()));

      if (!matchesSearch) return false;

      if (filterSeverity === 'critical') {
        return item.currentStock <= 3;
      }
      if (filterSeverity === 'high_deficit') {
        return item.stockDeficit >= 10;
      }
      return true;
    });
  }, [items, searchQuery, filterSeverity]);

  // Aggregate stats
  const totalDepletedCount = items.length;
  const criticalCount = items.filter((i) => i.currentStock <= 3).length;
  const highDeficitCount = items.filter((i) => i.stockDeficit >= 10).length;
  const estimatedInvestment = useMemo(() => {
    return items.reduce((sum, i) => sum + (i.recommendedRestockQuantity * i.costPrice), 0);
  }, [items]);

  const totalDraftItems = 0;

  // 1-Click Restock Single Item
  const handleQuickRestock = async (item: SmartLowStockItem) => {
    const wholesaler = item.suggestedWholesaler;
    if (!wholesaler) return;
    const restockQty = item.recommendedOrderQty;
    try {
      const response = await fetch('/api/v1/cart/items', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${sessionStorage.getItem('sharvin_token') || ''}`,
        },
        body: JSON.stringify({ productId: item.productId, wholesalerId: wholesaler.wholesalerId, quantity: restockQty }),
      });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.error || 'Could not add this product to the wholesale cart.');
      const order = result.data || {};
      setLatestNotification({
        id: item.productId,
        productName: item.productName,
        wholesalerName: order.wholesalerName || wholesaler.businessName,
        quantityAdded: Number(order.quantityAdded ?? restockQty),
        orderNumber: order.orderNumber || '',
        timestamp: new Date().toLocaleTimeString(),
      });
      setRestockedItemIds((prev) => new Set(prev).add(item.productId));
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Could not create the restock order.');
    }
  };

  // 1-Click Restock All Depleted
  const handleRestockAll = async () => {
    await Promise.all(items.map((item) => handleQuickRestock(item)));
  };

  // Change suggested wholesaler for an item
  const handleWholesalerChange = (productId: string, newWholesalerId: string) => {
    const selectedWholesaler = items.find((item) => item.productId === productId)?.availableWholesalers.find((w) => w.wholesalerId === newWholesalerId);
    if (!selectedWholesaler) return;

    setItems((prev) =>
      prev.map((item) =>
        item.productId === productId
          ? { ...item, suggestedWholesaler: selectedWholesaler }
          : item
      )
    );
  };

  // Open threshold editor
  const openThresholdEditor = (item: SmartLowStockItem) => {
    setEditingItem(item);
    setTempThreshold(item.lowStockThreshold);
    setTempReorderQty(item.reorderQuantity || item.recommendedRestockQuantity);
  };

  // Save updated threshold
  const saveThreshold = async () => {
    if (!editingItem) return;

    try {
      await InventoryService.updateThreshold(editingItem.productId, tempThreshold, tempReorderQty);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Could not update this threshold.');
      return;
    }

    setItems((prev) =>
      prev.map((item) =>
        item.productId === editingItem.productId
          ? {
              ...item,
              lowStockThreshold: tempThreshold,
              reorderQuantity: tempReorderQty,
              recommendedRestockQuantity: tempReorderQty,
              stockDeficit: Math.max(0, tempThreshold - item.currentStock),
            }
          : item
      )
    );

    setEditingItem(null);
  };

  return (
    <div className="space-y-8 animate-fadeIn bg-slate-50">
      {/* Top Banner Navigation */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div className="flex items-center gap-3">
          {onBackToPos && (
            <button
              onClick={onBackToPos}
              className="p-2 rounded-xl bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 transition"
              title="Return to POS Counter"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
          )}
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
                Low-Stock &amp; 1-Click Restock Hub
              </h1>
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-rose-50 border border-rose-200 text-rose-700 font-bold flex items-center gap-1">
                <AlertTriangle className="w-3.5 h-3.5" /> {totalDepletedCount} Depleted
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Automated depletion alerts generated by counter billing sales. Bridge directly to wholesale restock carts.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto">
          {onBackToOverview && (
            <button
              onClick={onBackToOverview}
              className="px-3 py-2 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-xs font-semibold text-slate-700 transition"
            >
              Overview
            </button>
          )}

          <button
            onClick={handleRestockAll}
            disabled={items.length === 0 || isLoading || !!loadError}
            className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-medium text-xs shadow-sm transition-all transform active:scale-95"
          >
            <Zap className="w-4 h-4 fill-current" />
            Restock All Depleted (1-Click)
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white rounded-2xl border border-slate-200 p-2 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="relative flex-1 w-full max-w-md">
          <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Filter depleted items by name, brand, barcode..."
            className="pl-9 pr-4 py-2 w-full border border-slate-200 rounded-xl text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-slate-900 placeholder-slate-400"
          />
        </div>

        <div className="flex items-center gap-2 flex-wrap w-full md:w-auto justify-end">
          <span className="text-sm text-slate-500 font-medium">Severity:</span>
          {([
            { key: 'all', label: 'All Depleted', count: totalDepletedCount },
            { key: 'critical', label: 'Critical ≤ 3', count: criticalCount },
            { key: 'high_deficit', label: 'High Deficit ≥ 10', count: highDeficitCount },
          ] as const).map((chip) => (
            <button
              key={chip.key}
              type="button"
              onClick={() => setFilterSeverity(chip.key)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                filterSeverity === chip.key
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'border border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              {chip.label} ({chip.count})
            </button>
          ))}
        </div>
      </div>

      {/* KPI Stats Overview */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs font-medium text-slate-500">Total Depleted SKUs</span>
            <div className="text-2xl font-extrabold text-slate-900 mt-1">{totalDepletedCount}</div>
            <span className="text-[11px] text-slate-500 font-medium">Needs immediate supplier refill</span>
          </div>
          <div className="w-12 h-12 rounded-xl bg-amber-50 border border-amber-200 text-amber-600 flex items-center justify-center">
            <Package className="w-6 h-6" />
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs font-medium text-slate-500">Critical Stockouts (&le; 3 units)</span>
            <div className="text-2xl font-extrabold text-rose-700 mt-1">{criticalCount}</div>
            <span className="text-[11px] text-slate-500 font-medium">Risk of customer churn</span>
          </div>
          <div className="w-12 h-12 rounded-xl bg-rose-50 border border-rose-200 text-rose-600 flex items-center justify-center">
            <TrendingDown className="w-6 h-6" />
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs font-medium text-slate-500">Estimated Reorder Capital</span>
            <div className="text-2xl font-extrabold text-slate-900 mt-1">₹{estimatedInvestment.toLocaleString('en-IN')}</div>
            <span className="text-[11px] text-slate-400 font-medium">Wholesale cost at standard packs</span>
          </div>
          <div className="w-12 h-12 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-600 flex items-center justify-center">
            <ShieldCheck className="w-6 h-6" />
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs font-medium text-slate-500">Items Drafted in Carts</span>
            <div className="text-2xl font-extrabold text-slate-900 mt-1">{totalDraftItems} units</div>
            <span className="text-[11px] text-slate-500 font-medium">{Object.keys(draftCarts).length} active wholesaler orders</span>
          </div>
          <div className="w-12 h-12 rounded-xl bg-blue-50 border border-blue-200 text-blue-600 flex items-center justify-center">
            <ShoppingCart className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Phase 3 Task 7: 7-Day Velocity AI Reorder Predictor Card */}
      <ReorderPredictorCard onNavigateToCart={onOpenWholesaleCart} />

      {isLoading && (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
          Loading your inventory alerts…
        </div>
      )}
      {!isLoading && loadError && (
        <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-center">
          <p className="text-sm font-medium text-rose-800">Inventory alerts could not be loaded.</p>
          <p className="mt-1 text-xs text-rose-700">{loadError}</p>
          <button type="button" onClick={() => void loadItems()} className="mt-3 rounded-lg bg-blue-600 px-3 py-2 text-xs font-medium text-white hover:bg-blue-700">Try again</button>
        </div>
      )}
      {!isLoading && !loadError && items.length === 0 && (
        <div className="rounded-2xl border border-emerald-200 bg-white p-8 text-center shadow-sm">
          <CheckCircle2 className="mx-auto mb-3 h-8 w-8 text-emerald-700" />
          <h2 className="text-base font-semibold text-slate-900">Stock levels are healthy. No replenishment needed.</h2>
          <p className="mt-1 text-sm text-slate-500">Depleted SKU count, critical stockouts, reorder capital, and drafted units are all 0.</p>
        </div>
      )}

      {/* Floating Notification Toast */}
      {latestNotification && (
        <div className="rounded-2xl bg-emerald-50 border border-emerald-200 p-4 flex items-center justify-between text-emerald-800 animate-slideDown shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <div>
              <div className="text-sm font-bold text-slate-900">
                1-Click Restock Queued: +{latestNotification.quantityAdded} units of {latestNotification.productName}
              </div>
              <div className="text-xs text-emerald-800">
                Drafted into <span className="font-semibold text-emerald-900">{latestNotification.wholesalerName}</span> restock cart &bull; Order #{latestNotification.orderNumber}
              </div>
            </div>
          </div>
          <button
            onClick={() => setLatestNotification(null)}
            className="p-1 rounded-lg hover:bg-emerald-100 text-emerald-700"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Main Grid: Depleted Products */}
      {isLoading ? (
        <div className="rounded-2xl bg-white border border-slate-200 p-8 text-center text-sm text-slate-500">Loading stock alerts…</div>
      ) : filteredItems.length === 0 ? items.length > 0 ? (
        <div className="rounded-2xl bg-white border border-slate-200 p-8 text-center text-sm text-slate-500">No depleted products match this filter.</div>
      ) : null : (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {filteredItems.map((item) => {
          const percentRemaining = Math.min(100, Math.round((item.currentStock / item.lowStockThreshold) * 100));
          const isCritical = item.currentStock <= 3;
          const isRestocked = restockedItemIds.has(item.productId);

          return (
            <div
              key={item.productId}
              className={`rounded-2xl border p-5 flex flex-col justify-between transition-all relative overflow-hidden ${
                isCritical 
                  ? 'bg-white border-rose-200 hover:border-rose-300 shadow-sm' 
                  : 'bg-white border-slate-200 hover:border-slate-300 shadow-sm'
              }`}
            >
              {/* Card Header */}
              <div>
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-600 bg-slate-50 px-2 py-0.5 rounded-full border border-slate-200">
                      {item.brandName || 'Kirana Essential'}
                    </span>
                    <h3 className="text-base font-bold text-slate-900 mt-1.5 leading-snug">
                      {item.productName}
                    </h3>
                  </div>

                  <span className={`text-xs px-2 py-0.5 rounded-lg font-bold shrink-0 ${
                    isCritical 
                      ? 'bg-rose-50 text-rose-700 border border-rose-200' 
                      : 'bg-amber-50 text-amber-800 border border-amber-200'
                  }`}>
                    {item.currentStock} {item.unitOfMeasure} left
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-1.5 mb-2">
                  <div className="text-[11px] font-mono text-slate-400">
                    Barcode: {item.barcode} &bull; Selling: ₹{item.sellingPrice}
                  </div>

                  {/* Yellow Near-Expiry Warning Badge (<= 45 days) */}
                  {item.isNearExpiryWarning && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md bg-amber-50 text-amber-800 border border-amber-200 shadow-xs">
                      <AlertTriangle className="w-3 h-3 text-amber-600" />
                      ⚠️ Batch Expiring in {item.daysUntilExpiry}d {item.batchNumber ? `(${item.batchNumber})` : ''}
                    </span>
                  )}

                  {/* Near-Expiry Clearance Tag (<= 60 days) */}
                  {item.isNearExpiryClearance && !item.isNearExpiryWarning && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md bg-amber-50 text-amber-800 border border-amber-200">
                      <Sparkles className="w-3 h-3 text-orange-600" />
                      Near-Expiry Clearance
                    </span>
                  )}

                  {/* Wholesaler Godown Out of Stock */}
                  {(item.isOutOfStockAtWholesaler || item.wholesalerStock === 0) && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md bg-rose-50 text-rose-700 border border-rose-200">
                      <AlertTriangle className="w-3 h-3 text-rose-600" />
                      Wholesaler Out of Stock
                    </span>
                  )}
                </div>

                {/* Stock Gauge Progress Bar */}
                <div className="space-y-1.5 mb-5 bg-slate-50 p-3 rounded-xl border border-slate-200">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-500">Threshold: <strong className="text-slate-900">{item.lowStockThreshold} {item.unitOfMeasure}</strong></span>
                    <span className={isCritical ? 'text-rose-700 font-bold' : 'text-amber-800 font-semibold'}>
                      Deficit: -{item.stockDeficit} {item.unitOfMeasure}
                    </span>
                  </div>

                  <div className="w-full h-2 rounded-full bg-slate-200 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        isCritical ? 'bg-rose-500' : 'bg-amber-500'
                      }`}
                      style={{ width: `${Math.max(8, percentRemaining)}%` }}
                    />
                  </div>

                  <div className="flex items-center justify-between text-[10px] text-slate-500 pt-1">
                    <span>Stock Level: {percentRemaining}%</span>
                    <button
                      onClick={() => openThresholdEditor(item)}
                      className="text-blue-700 hover:text-blue-800 font-semibold flex items-center gap-1"
                    >
                      <SlidersHorizontal className="w-3 h-3" /> Adjust Threshold
                    </button>
                  </div>
                </div>

                <div className="mb-5 flex items-start gap-2 rounded-xl bg-blue-50 px-3 py-2.5 text-sm font-bold text-blue-800 ring-1 ring-blue-200">
                  <span aria-hidden="true">✨</span>
                  <span>AI Suggests: Order {item.recommendedOrderQty} units for a 15-day supply</span>
                </div>

                {/* Wholesale Supplier Selection */}
                <div className="space-y-1 mb-5">
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] font-medium text-slate-600 flex items-center gap-1.5">
                      <Building2 className="w-3.5 h-3.5 text-amber-600" /> Linked Wholesaler:
                    </label>
                    {item.wholesalerStock !== undefined && (
                    <span className={`text-[10px] font-semibold ${item.wholesalerStock === 0 ? 'text-rose-700' : 'text-slate-500'}`}>
                        Godown Stock: {item.wholesalerStock} {item.unitOfMeasure}
                      </span>
                    )}
                  </div>
                  <select
                    value={item.suggestedWholesaler?.wholesalerId || ''}
                    onChange={(e) => handleWholesalerChange(item.productId, e.target.value)}
                    className="w-full bg-white border border-slate-300 rounded-xl px-3 py-1.5 text-xs text-slate-900 focus:outline-none focus:border-blue-500"
                  >
                    {item.availableWholesalers.map((w) => (
                      <option key={w.wholesalerId} value={w.wholesalerId}>
                        {w.businessName}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Action Footer */}
              <div className="border-t border-slate-200 pt-4 flex items-center justify-between gap-3">
                <div className="text-left">
                  <span className="text-[10px] text-slate-500 uppercase tracking-wider block">Reorder Cost</span>
                  <span className="text-xs font-bold text-slate-900">
                    ₹{(item.recommendedOrderQty * item.costPrice).toLocaleString('en-IN')}
                  </span>
                </div>

                <button
                  disabled={!item.suggestedWholesaler || item.isOutOfStockAtWholesaler || item.wholesalerStock === 0}
                  onClick={() => handleQuickRestock(item)}
                  title={!item.suggestedWholesaler ? 'Connect a wholesaler before creating a restock order' : item.isOutOfStockAtWholesaler || item.wholesalerStock === 0 ? 'Item currently out of stock at wholesaler' : 'Queue restock order'}
                  className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-all transform active:scale-95 shadow-md disabled:opacity-40 disabled:cursor-not-allowed ${
                    isRestocked
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100'
                      : (!item.suggestedWholesaler || item.isOutOfStockAtWholesaler || item.wholesalerStock === 0)
                        ? 'bg-slate-100 text-slate-500 border border-slate-200'
                        : 'bg-blue-600 hover:bg-blue-700 text-white shadow-blue-600/20'
                  }`}
                >
                  {isRestocked ? (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700" /> Added to Cart (+{item.recommendedOrderQty})
                    </>
                  ) : (item.isOutOfStockAtWholesaler || item.wholesalerStock === 0) ? (
                    <>
                      <AlertTriangle className="w-3.5 h-3.5 text-rose-700" /> Out of Stock in Godown
                    </>
                  ) : (
                    <>
                      <Zap className="w-3.5 h-3.5 fill-current" /> 1-Click Restock (+{item.recommendedOrderQty})
                    </>
                  )}
                </button>
              </div>
            </div>
          );
        })}
      </div>
      )}

      {/* Active Wholesale Draft Carts Drawer / Breakdown */}
      {Object.keys(draftCarts).length > 0 && (
        <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 space-y-6 shadow-sm">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-200 text-amber-600 flex items-center justify-center">
                <ShoppingCart className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900">
                  Wholesaler Restock Draft Carts ({Object.keys(draftCarts).length} Suppliers)
                </h3>
                <p className="text-xs text-slate-400">
                  Ready for Wholesale Restock confirmation and live rate bargaining (Milestone 3 &amp; 4).
                </p>
              </div>
            </div>

            <div className="text-right">
              <span className="text-xs text-slate-400 block">Total Restock Estimate</span>
              <span className="text-xl font-extrabold text-amber-600">
                ₹{Object.values(draftCarts).reduce((s, c) => s + c.estimatedTotal, 0).toLocaleString('en-IN')}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Object.values(draftCarts).map((cart) => (
              <div 
                key={cart.wholesalerId}
                className="bg-white border border-slate-200 rounded-2xl p-4 flex flex-col justify-between space-y-3 shadow-sm"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-amber-600">{cart.orderNumber}</span>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-blue-50 text-blue-600 border border-blue-200 font-semibold">
                      Draft Cart
                    </span>
                  </div>
                  <h4 className="font-bold text-slate-900 text-sm mt-1">{cart.wholesalerName}</h4>
                  
                  <div className="mt-3 space-y-1.5 border-t border-slate-200 pt-2 text-xs">
                    {cart.items.map((it) => (
                      <div key={it.productId} className="flex justify-between text-slate-700">
                        <span className="truncate max-w-[180px]">{it.productName}</span>
                        <span className="font-mono text-slate-400">{it.quantity} &times; ₹{it.unitPrice}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="border-t border-slate-200 pt-3 flex items-center justify-between text-xs">
                  <div>
                    <span className="text-slate-500 block text-[10px]">Supplier Subtotal</span>
                    <span className="font-extrabold text-slate-900">₹{cart.estimatedTotal.toLocaleString('en-IN')}</span>
                  </div>

                  {onOpenWholesaleCart ? (
                    <button
                      onClick={onOpenWholesaleCart}
                      className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-700 hover:text-blue-800 transition"
                    >
                      Open Cart <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-700">
                      Wholesale Cart <ChevronRight className="w-3.5 h-3.5" />
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Adjust Threshold Modal */}
      {editingItem && (
        <ModalBackdrop onClose={() => setEditingItem(null)} className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
              <div className="bg-white border border-slate-200 rounded-3xl max-w-md w-full p-6 space-y-5 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div>
                <h3 className="font-bold text-slate-900 text-base">Adjust Threshold &amp; Batch</h3>
                <p className="text-xs text-slate-400 truncate max-w-xs">{editingItem.productName}</p>
              </div>
              <button 
                onClick={() => setEditingItem(null)}
                className="p-1 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <div>
                <label className="text-slate-700 font-semibold block mb-1">
                  Low-Stock Trigger Threshold ({editingItem.unitOfMeasure}):
                </label>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setTempThreshold((v) => Math.max(1, v - 1))}
                    className="p-2 rounded-xl bg-white hover:bg-slate-50 border border-slate-200 text-slate-700"
                  >
                    <Minus className="w-4 h-4" />
                  </button>
                  <input
                    type="number"
                    value={tempThreshold}
                    onChange={(e) => setTempThreshold(Number(e.target.value))}
                    className="flex-1 bg-white border border-slate-300 rounded-xl px-3 py-2 text-center text-slate-900 font-bold"
                  />
                  <button
                    onClick={() => setTempThreshold((v) => v + 1)}
                    className="p-2 rounded-xl bg-white hover:bg-slate-50 border border-slate-200 text-slate-700"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
                <p className="text-[10px] text-slate-500 mt-1">
                  When current stock falls below this quantity, restock alerts trigger automatically.
                </p>
              </div>

              <div>
                <label className="text-slate-700 font-semibold block mb-1">
                  Default 1-Click Restock Quantity ({editingItem.unitOfMeasure}):
                </label>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setTempReorderQty((v) => Math.max(1, v - 5))}
                    className="p-2 rounded-xl bg-white hover:bg-slate-50 border border-slate-200 text-slate-700"
                  >
                    <Minus className="w-4 h-4" />
                  </button>
                  <input
                    type="number"
                    value={tempReorderQty}
                    onChange={(e) => setTempReorderQty(Number(e.target.value))}
                    className="flex-1 bg-white border border-slate-300 rounded-xl px-3 py-2 text-center text-slate-900 font-bold"
                  />
                  <button
                    onClick={() => setTempReorderQty((v) => v + 5)}
                    className="p-2 rounded-xl bg-white hover:bg-slate-50 border border-slate-200 text-slate-700"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
                <p className="text-[10px] text-slate-500 mt-1">
                  Standard reorder batch size packed into supplier cart during 1-click restock.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200">
              <button
                onClick={() => setEditingItem(null)}
                className="px-4 py-2 rounded-xl bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                onClick={saveThreshold}
                className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium shadow-sm"
              >
                Save Changes
              </button>
            </div>
          </div>
        </ModalBackdrop>
      )}
    </div>
  );
};
