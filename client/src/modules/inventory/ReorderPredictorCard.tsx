import React, { useState, useEffect } from 'react';
import { 
  AlertTriangle, 
  Zap, 
  Clock, 
  TrendingUp, 
  CheckCircle2, 
  RefreshCw, 
  ChevronRight, 
  Flame 
} from 'lucide-react';
import { ReorderPrediction } from './types';
import { InventoryService } from './inventoryService';

type SmartReorderPrediction = ReorderPrediction & {
  recommendedOrderQty: number;
};

interface ReorderPredictorCardProps {
  onNavigateToCart?: () => void;
  refreshTrigger?: any;
}

export const ReorderPredictorCard: React.FC<ReorderPredictorCardProps> = ({
  onNavigateToCart,
  refreshTrigger,
}) => {
  const [predictions, setPredictions] = useState<SmartReorderPrediction[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [restockingId, setRestockingId] = useState<string | null>(null);
  const [restockedMap, setRestockedMap] = useState<Record<string, { orderNumber: string; qty: number }>>({});
  const [isSimulating, setIsSimulating] = useState(false);
  const [isSimulatedActive, setIsSimulatedActive] = useState(false);

  const loadPredictions = async (signal?: AbortSignal) => {
    setIsLoading(true);
    try {
      const data = await InventoryService.getReorderPredictions(signal);
      const visiblePredictions = data.urgentPredictions.length > 0
        ? data.urgentPredictions
        : data.predictions.slice(0, 3);
      setPredictions(visiblePredictions.map((item) => ({
        ...item,
        recommendedOrderQty: Number(
          (item as ReorderPrediction & { recommendedOrderQty?: number }).recommendedOrderQty
          ?? item.recommendedBufferQty,
        ),
      })));
      setIsSimulatedActive(data.simulated);
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        console.error('Failed to load velocity predictions:', err);
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const controller = new AbortController();
    loadPredictions(controller.signal);

    const handleRefreshEvent = () => {
      loadPredictions();
    };

    window.addEventListener('sharvin:inventory-refresh', handleRefreshEvent);

    return () => {
      controller.abort();
      window.removeEventListener('sharvin:inventory-refresh', handleRefreshEvent);
    };
  }, [refreshTrigger]);

  const handleSimulate14Sold3Stock = async () => {
    setIsSimulating(true);
    try {
      await InventoryService.simulateVelocity({
        productId: predictions[0]?.productId,
        unitsSoldLast7Days: 14,
        currentStock: 3,
      });
      await loadPredictions();
    } catch (err) {
      console.error('Failed to trigger simulation:', err);
    } finally {
      setIsSimulating(false);
    }
  };

  const handleResetSimulation = async () => {
    setIsSimulating(true);
    try {
      await InventoryService.simulateVelocity({ reset: true });
      await loadPredictions();
    } catch (err) {
      console.error('Failed to reset simulation:', err);
    } finally {
      setIsSimulating(false);
    }
  };

  const handle1ClickRestock = async (item: SmartReorderPrediction) => {
    if (!item.suggestedWholesaler) return;
    setRestockingId(item.productId);
    try {
      const res = await InventoryService.quickRestock(
        item.productId,
        item.recommendedOrderQty,
        item.suggestedWholesaler.wholesalerId
      );
      setRestockedMap((prev) => ({
        ...prev,
        [item.productId]: {
          orderNumber: res.orderNumber,
          qty: item.recommendedOrderQty,
        },
      }));
    } catch (err) {
      console.error('1-Click Restock failed:', err);
    } finally {
      setRestockingId(null);
    }
  };

  if (predictions.length === 0 && !isLoading) {
    return null;
  }

  return (
    <div className="bg-gradient-to-r from-amber-50/90 via-orange-50/40 to-white border border-amber-200/90 rounded-2xl p-4 sm:p-5 shadow-sm space-y-4">
      {/* Header with Title and Simulation Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-amber-200/60 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600 shadow-xs">
            <Flame className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm sm:text-base font-bold text-slate-900 tracking-tight flex items-center gap-1.5">
                7-Day Velocity AI Reorder Predictor
              </h3>
              <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200 shadow-xs">
                AI Stockout Alert
              </span>
            </div>
            <p className="text-xs text-slate-500">
              Rolling counter consumption analyzed in real time. Predicts stockouts and recommends buffer restocking before store runs dry.
            </p>
          </div>
        </div>

        {/* Quick Simulation Bar */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={handleSimulate14Sold3Stock}
            disabled={isSimulating}
            className={`text-xs px-3 py-1.5 rounded-lg font-bold border transition flex items-center gap-1.5 shadow-xs ${
              isSimulatedActive 
                ? 'bg-blue-600 text-white border-blue-600 hover:bg-blue-700' 
                : 'bg-white text-amber-700 border-amber-300 hover:bg-amber-50'
            }`}
            title="Simulate 14 units sold over 7 days with 3 units stock remaining"
          >
            <TrendingUp className="w-3.5 h-3.5" />
            <span>{isSimulatedActive ? 'Simulated: 14 Sold / 3 Stock' : '🧪 Simulate 14 Sold / 3 Stock'}</span>
          </button>

          {isSimulatedActive && (
            <button
              onClick={handleResetSimulation}
              disabled={isSimulating}
              className="text-xs px-2.5 py-1.5 rounded-lg font-medium text-slate-600 bg-white border border-slate-200 hover:bg-slate-100 transition flex items-center gap-1"
              title="Reset simulation to default inventory"
            >
              <RefreshCw className="w-3 h-3" />
              <span>Reset</span>
            </button>
          )}
        </div>
      </div>

      {/* Predictions Cards Grid */}
      <div className="space-y-3">
        {predictions.map((item) => {
          const isRestocked = !!restockedMap[item.productId];
          const restockInfo = restockedMap[item.productId];
          const isCurrentlyRestocking = restockingId === item.productId;

          return (
            <div 
              key={item.productId}
              className={`bg-white border rounded-xl p-4 transition shadow-xs ${
                item.urgencyLevel === 'CRITICAL'
                  ? 'border-rose-300 hover:border-rose-400 bg-rose-50/20'
                  : 'border-amber-200 hover:border-amber-300'
              }`}
            >
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                {/* Left: The 3 Exact Required Explainable Lines */}
                <div className="space-y-1.5 flex-1">
                  {/* Line 1 */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-xs font-bold px-2.5 py-0.5 rounded-md flex items-center gap-1 ${
                      item.urgencyLevel === 'CRITICAL' 
                        ? 'bg-rose-100 text-rose-700 border border-rose-300' 
                        : 'bg-amber-100 text-amber-800 border border-amber-300'
                    }`}>
                      <AlertTriangle className="w-3.5 h-3.5" />
                      {item.line1}
                    </span>
                    <span className="text-xs text-slate-400 font-mono">
                      Barcode: {item.barcode}
                    </span>
                  </div>

                  {/* Line 2 */}
                  <div className="text-xs text-slate-700 font-medium flex items-center gap-2">
                    <TrendingUp className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                    <span>{item.line2}</span>
                  </div>

                  {/* Line 3 */}
                  <div className="text-xs text-slate-600 flex items-center gap-2">
                    <Clock className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                    <span className="font-semibold text-slate-800">{item.line3}</span>
                    <span className="text-slate-400">•</span>
                    <span className="text-slate-500">
                      Preferred Supplier: <strong className="text-slate-700">{item.suggestedWholesaler?.businessName || 'No connected supplier'}</strong>
                    </span>
                  </div>

                  <div className="inline-flex items-center gap-2 rounded-xl bg-blue-50 px-3 py-2 text-sm font-bold text-blue-800 ring-1 ring-blue-200">
                    <span aria-hidden="true">✨</span>
                    <span>AI Suggests: Order {item.recommendedOrderQty} units for a 15-day supply</span>
                  </div>
                </div>

                {/* Right: 1-Click Restock via Wholesaler Action */}
                <div className="flex items-center gap-3 shrink-0">
                  {isRestocked ? (
                    <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-300 px-3 py-2 rounded-xl text-emerald-800 text-xs font-semibold">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                      <div>
                        <div>Added {restockInfo.qty} units to Cart</div>
                        <div className="text-[10px] text-emerald-700 font-mono">Draft: {restockInfo.orderNumber}</div>
                      </div>
                      {onNavigateToCart && (
                        <button
                          onClick={onNavigateToCart}
                          className="ml-2 text-xs font-bold underline hover:text-emerald-900 flex items-center gap-0.5"
                        >
                          View Cart <ChevronRight className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  ) : (
                    <button
                      onClick={() => handle1ClickRestock(item)}
                      disabled={isCurrentlyRestocking}
                      className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-medium text-xs shadow-sm transition flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                      {isCurrentlyRestocking ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          <span>Pre-filling Cart...</span>
                        </>
                      ) : (
                        <>
                          <Zap className="w-3.5 h-3.5 fill-current" />
                          <span>⚡ Restock {item.recommendedOrderQty} units</span>
                        </>
                      )}
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
