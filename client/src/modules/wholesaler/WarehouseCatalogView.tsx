import React, { useState, useMemo, useEffect, useRef } from 'react';
import { 
  Package, 
  Search, 
  AlertTriangle, 
  CheckCircle2, 
  Clock, 
  Sparkles, 
  Save, 
  Check, 
  Filter, 
  Calendar,
  Layers,
  Warehouse,
  Plus,
  Mic,
  MicOff,
  ShoppingCart
} from 'lucide-react';
import { ModalBackdrop } from '../../components/ui/DismissOnOutsideClick';

export interface GodownItem {
  id: string;
  sku: string;
  name: string;
  category: string;
  unit: string;
  godownStock: number;
  lowStockAlert: number;
  costPrice: number;
  baseWholesaleRate: number;
  marginFloor: number;
  moq: number;
  batchNumber: string;
  expiryDate: string; // YYYY-MM-DD
  isClearance: boolean;
  clearanceDiscountPercent: number;
  isSaved?: boolean;
}

interface NativeSpeechRecognitionEvent {
  results: ArrayLike<ArrayLike<{ transcript: string }>>;
}

interface NativeSpeechRecognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((event: NativeSpeechRecognitionEvent) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
}

type NativeSpeechRecognitionConstructor = new () => NativeSpeechRecognition;
type SpeechEnabledWindow = Window & {
  SpeechRecognition?: NativeSpeechRecognitionConstructor;
  webkitSpeechRecognition?: NativeSpeechRecognitionConstructor;
};

export function calculateDaysRemaining(expiryDateStr: string): number {
  if (!expiryDateStr) return 999;
  const expiry = new Date(expiryDateStr);
  const now = new Date();
  const diffTime = expiry.getTime() - now.getTime();
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

export const WarehouseCatalogView: React.FC = () => {
  const [catalog, setCatalog] = useState<GodownItem[]>([]);
  const [showAddProduct, setShowAddProduct] = useState(false);
  const [productName, setProductName] = useState("");
  const [productPrice, setProductPrice] = useState("");
  const [productStock, setProductStock] = useState("");
  const [productError, setProductError] = useState<string | null>(null);
  const [isLoadingCatalog, setIsLoadingCatalog] = useState(true);
  const [savingProductIds, setSavingProductIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [filterType, setFilterType] = useState<'all' | 'near_expiry' | 'out_of_stock' | 'clearance'>('all');
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const [isListening, setIsListening] = useState(false);
  const [voiceCart, setVoiceCart] = useState<Record<string, number>>({});
  const [voiceToast, setVoiceToast] = useState<string | null>(null);
  const recognitionRef = useRef<NativeSpeechRecognition | null>(null);

  const mapCatalog = (rows: any[]): GodownItem[] => rows.map((row) => ({
    id: row.wholesalerProductId,
    sku: row.barcode || "",
    name: row.productName,
    category: row.category || "Uncategorized",
    unit: row.unitOfMeasure || "piece",
    godownStock: Number(row.availableQty ?? row.stockQuantity ?? 0),
    lowStockAlert: Number(row.lowStockThreshold || 0),
    costPrice: 0,
    baseWholesaleRate: Number(row.basePrice || 0),
    marginFloor: Number(row.marginFloorPrice || 0),
    moq: Number(row.minimumOrderQuantity || 1),
    batchNumber: row.batchNumber || "",
    expiryDate: row.expiryDate ? String(row.expiryDate).slice(0, 10) : "",
    isClearance: Boolean(row.isClearance),
    clearanceDiscountPercent: Number(row.clearanceDiscountPct ?? row.clearanceDiscountPercent ?? 0),
    isSaved: true,
  }));

  const catalogRequest = async (path: string, init: RequestInit = {}) => {
    const response = await fetch(path, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${sessionStorage.getItem('sharvin_token') || ''}`,
        ...init.headers,
      },
    });
    const body = await response.json();
    if (!response.ok || !body.success) throw new Error(body.error || 'Catalog request failed.');
    return body.data;
  };

  const loadCatalog = async () => {
    setIsLoadingCatalog(true);
    setProductError(null);
    try {
      const result = await catalogRequest('/api/v1/wholesaler/catalog');
      setCatalog(mapCatalog(result.items || []));
    } catch (error) {
      setProductError(error instanceof Error ? error.message : 'Could not load catalog.');
      setCatalog([]);
    } finally {
      setIsLoadingCatalog(false);
    }
  };

  useEffect(() => { void loadCatalog(); }, []);

  useEffect(() => () => recognitionRef.current?.stop(), []);

  const parseVoiceOrder = (transcript: string) => {
    const normalized = transcript.toLowerCase().replace(/[^a-z0-9.\s-]/g, ' ');
    const understood: Array<{ item: GodownItem; quantity: number }> = [];
    const usedAliases = new Set<string>();
    const ignoredWords = new Set(['pack', 'packs', 'piece', 'pieces', 'unit', 'units', 'item', 'items']);

    for (const item of catalog) {
      const fullName = item.name.toLowerCase().trim();
      const aliases = [
        fullName,
        ...fullName.split(/\s+/).filter((word) => word.length >= 3 && !ignoredWords.has(word)),
      ].sort((a, b) => b.length - a.length);

      for (const alias of aliases) {
        const escapedAlias = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const match = normalized.match(new RegExp(`(?:^|\\s)(\\d+(?:\\.\\d+)?)\\s*(?:x|units?|pieces?|packs?)?\\s+${escapedAlias}(?:\\s|$)`, 'i'));
        if (!match || usedAliases.has(alias)) continue;
        const quantity = Math.max(1, Math.round(Number(match[1])));
        understood.push({ item, quantity });
        usedAliases.add(alias);
        break;
      }
    }

    if (understood.length === 0) {
      setVoiceToast(`Could not match “${transcript}”. Try saying “10 Maggi”.`);
      return;
    }

    setVoiceCart((current) => {
      const next = { ...current };
      understood.forEach(({ item, quantity }) => {
        next[item.id] = (next[item.id] || 0) + quantity;
      });
      return next;
    });
    setVoiceToast(`Understood: ${understood.map(({ item, quantity }) => `${quantity} × ${item.name}`).join(', ')}`);
  };

  const toggleVoiceOrder = () => {
    if (isListening) {
      recognitionRef.current?.stop();
      return;
    }

    const speechWindow = window as SpeechEnabledWindow;
    const SpeechRecognition = speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setVoiceToast('Voice ordering is not supported in this browser. Use Chrome on Android or desktop.');
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'en-IN';
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.onresult = (event) => {
      const latestResult = event.results[event.results.length - 1];
      const transcript = latestResult?.[0]?.transcript?.trim();
      if (transcript) parseVoiceOrder(transcript);
    };
    recognition.onerror = () => {
      setVoiceToast('Voice input was not clear. Tap the microphone and try again.');
      setIsListening(false);
    };
    recognition.onend = () => setIsListening(false);
    recognitionRef.current = recognition;
    setVoiceToast('Listening… say a quantity and product name.');
    setIsListening(true);
    recognition.start();
  };

  const voiceCartUnits = Object.values(voiceCart).reduce((sum, quantity) => sum + quantity, 0);

  const createFirstProduct = async (event: React.FormEvent) => {
    event.preventDefault();
    setProductError(null);
    try {
      await catalogRequest("/api/v1/wholesaler/catalog", { method: "POST", body: JSON.stringify({ productName, basePrice: Number(productPrice), stockQuantity: Number(productStock), unitOfMeasure: "piece", minimumOrderQuantity: 1 }) });
      setProductName(""); setProductPrice(""); setProductStock(""); setShowAddProduct(false);
      await loadCatalog();
    } catch (error: any) { setProductError(error.message || "Could not create product"); }
  };

  // Compute metrics
  const stats = useMemo(() => {
    let nearExpiryCount = 0;
    let criticalExpiryCount = 0;
    let outOfStockCount = 0;
    let totalStockUnits = 0;

    catalog.forEach((item) => {
      totalStockUnits += item.godownStock;
      if (item.godownStock === 0) outOfStockCount++;
      const days = calculateDaysRemaining(item.expiryDate);
      if (days <= 45 && days > 0) criticalExpiryCount++;
      if (days <= 60 && days > 0) nearExpiryCount++;
    });

    return {
      totalSkus: catalog.length,
      nearExpiryCount,
      criticalExpiryCount,
      outOfStockCount,
      totalStockUnits,
    };
  }, [catalog]);

  // Filter catalog
  const filtered = useMemo(() => {
    return catalog.filter((item) => {
      const matchesSearch = 
        !searchQuery.trim() ||
        item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.sku.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.category.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.batchNumber.toLowerCase().includes(searchQuery.toLowerCase());

      if (!matchesSearch) return false;

      const days = calculateDaysRemaining(item.expiryDate);
      if (filterType === 'near_expiry') {
        return days <= 60 && days > 0;
      }
      if (filterType === 'out_of_stock') {
        return item.godownStock === 0;
      }
      if (filterType === 'clearance') {
        return item.isClearance || (days <= 60 && days > 0);
      }
      return true;
    });
  }, [catalog, searchQuery, filterType]);

  // Inline update handler
  const handleUpdateItem = (id: string, updates: Partial<GodownItem>) => {
    setCatalog((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;
        const updated = { ...item, ...updates, isSaved: false };
        
        // Auto-check clearance flag if expiry <= 60 days
        if (updates.expiryDate) {
          const days = calculateDaysRemaining(updates.expiryDate);
          if (days <= 60 && days > 0 && !item.isClearance) {
            updated.isClearance = true;
            if (!updated.clearanceDiscountPercent) {
              updated.clearanceDiscountPercent = 10;
            }
          }
        }
        return updated;
      })
    );
  };

  // Save single item
  const handleSaveItem = async (id: string) => {
    const item = catalog.find((i) => i.id === id);
    if (!item) return;
    try {
      setSavingProductIds((current) => new Set(current).add(id));
      await catalogRequest(`/api/v1/wholesaler/catalog/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: JSON.stringify({
          availableQty: item.godownStock,
          basePrice: item.baseWholesaleRate,
          marginFloorPrice: item.marginFloor,
          batchNumber: item.batchNumber || null,
          expiryDate: item.expiryDate || null,
          clearanceDiscountPct: item.clearanceDiscountPercent,
          isClearance: item.isClearance,
        }),
      });
      setCatalog((prev) =>
        prev.map((i) => (i.id === id ? { ...i, isSaved: true } : i))
      );
      setSaveStatus(`Saved "${item.name}" (Stock: ${item.godownStock}, Batch: ${item.batchNumber})`);
      setTimeout(() => setSaveStatus(null), 3000);
    } catch (err: any) {
      setProductError(err instanceof Error ? err.message : 'Failed to save catalog item.');
    } finally {
      setSavingProductIds((current) => { const next = new Set(current); next.delete(id); return next; });
    }
  };

  // Bulk save all
  const handleSaveAll = async () => {
    await Promise.all(catalog.filter((item) => !item.isSaved).map((item) => handleSaveItem(item.id)));
  };

  // Quick preset: Zero stock
  const handlePresetZeroStock = async (id: string) => {
    handleUpdateItem(id, { godownStock: 0 });
    try {
      setSavingProductIds((current) => new Set(current).add(id));
      await catalogRequest(`/api/v1/wholesaler/catalog/${encodeURIComponent(id)}`, {
        method: 'PATCH', body: JSON.stringify({ availableQty: 0 }),
      });
      setCatalog((current) => current.map((item) => item.id === id ? { ...item, godownStock: 0, isSaved: true } : item));
      setSaveStatus('Stock set to 0. Retailer ordering is disabled for this item.');
    } catch (error) {
      setProductError(error instanceof Error ? error.message : 'Could not update stock.');
      void loadCatalog();
    } finally {
      setSavingProductIds((current) => { const next = new Set(current); next.delete(id); return next; });
    }
  };

  return (
      <div className="space-y-6 pb-12 animate-in fade-in duration-300">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold text-blue-600 uppercase tracking-wider mb-1">
            <Warehouse className="w-3.5 h-3.5" />
            <span>Wholesaler Godown Control</span> &bull; <span>Catalog &amp; Batch Master</span>
          </div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-3">
            <Package className="w-6 h-6 text-blue-600" />
            Godown Catalog Stock &amp; Expiry / Batch Tracking
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Fast inventory table to adjust godown stock counts, base rates, margin floor limits, batch codes, and near-expiry clearance tags.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => { setProductError(null); setShowAddProduct(true); }}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white border border-slate-200 text-slate-600 hover:text-slate-900 text-xs font-semibold shadow-xs hover:border-slate-300 transition"
          >
            <Plus className="w-3.5 h-3.5" /> Add Product
          </button>
          <button
            onClick={handleSaveAll}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-sm transition"
          >
            <Save className="w-4 h-4" /> Save All Godown Stock
          </button>
        </div>
      </div>

      {/* Save Notification Toast */}
      {saveStatus && (
        <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold flex items-center justify-between shadow-xs animate-in slide-in-from-top-2">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            <span>{saveStatus}</span>
          </div>
          <span className="text-[10px] font-mono text-emerald-600">Synced to Retailer Restock Hub</span>
        </div>
      )}

      {/* Metric Cards Banner (High-Trust Light Mode) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total SKUs */}
        <div className="p-4 rounded-2xl bg-white border border-slate-200/80 shadow-xs flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 border border-blue-100 flex items-center justify-center">
            <Package className="w-6 h-6" />
          </div>
          <div>
            <span className="text-[11px] uppercase font-bold text-slate-400 tracking-wider">Godown Active SKUs</span>
            <div className="text-xl font-black text-slate-900">{stats.totalSkus} Products</div>
            <span className="text-[11px] text-slate-500 font-medium">{stats.totalStockUnits.toLocaleString('en-IN')} units on floor</span>
          </div>
        </div>

        {/* Critical Expiry Warning (<= 45 days) */}
        <div className="p-4 rounded-2xl bg-white border border-amber-200 shadow-xs flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-amber-50 text-amber-600 border border-amber-200 flex items-center justify-center">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <div>
            <span className="text-[11px] uppercase font-bold text-amber-700 tracking-wider">Warning (≤ 45 Days)</span>
            <div className="text-xl font-black text-amber-900">{stats.criticalExpiryCount} Batches</div>
            <span className="text-[11px] text-amber-600 font-medium">Yellow badge on order line</span>
          </div>
        </div>

        {/* Near-Expiry Clearance (<= 60 days) */}
        <div className="p-4 rounded-2xl bg-white border border-orange-200 shadow-xs flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-orange-50 text-orange-600 border border-orange-200 flex items-center justify-center">
            <Sparkles className="w-6 h-6" />
          </div>
          <div>
            <span className="text-[11px] uppercase font-bold text-orange-700 tracking-wider">Near-Expiry Clearance</span>
            <div className="text-xl font-black text-orange-900">{stats.nearExpiryCount} Batches</div>
            <span className="text-[11px] text-orange-600 font-medium">Eligible for clearance discount</span>
          </div>
        </div>

        {/* Out of Stock (Stock = 0) */}
        <div className="p-4 rounded-2xl bg-white border border-rose-200 shadow-xs flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-rose-50 text-rose-600 border border-rose-200 flex items-center justify-center">
            <Layers className="w-6 h-6" />
          </div>
          <div>
            <span className="text-[11px] uppercase font-bold text-rose-700 tracking-wider">Out of Stock (Stock = 0)</span>
            <div className="text-xl font-black text-rose-900">{stats.outOfStockCount} SKUs</div>
            <span className="text-[11px] text-rose-600 font-medium">Blocked on Retailer Cart</span>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white p-3 rounded-2xl border border-slate-200/80 shadow-xs">
        <div className="relative flex-1 w-full">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by product name, SKU, category, or batch number (e.g. BATCH-2026-B05)..."
            className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder-slate-400 text-xs focus:outline-none focus:border-blue-500 focus:bg-white transition"
          />
        </div>

        <button
          type="button"
          onClick={toggleVoiceOrder}
          className={`flex min-h-11 w-full shrink-0 items-center justify-center gap-2 rounded-xl px-4 text-xs font-bold text-white shadow-sm transition sm:w-auto ${
            isListening ? 'bg-rose-600 hover:bg-rose-700' : 'bg-emerald-600 hover:bg-emerald-700'
          }`}
          aria-pressed={isListening}
        >
          {isListening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
          {isListening ? 'Listening…' : 'Voice Order'}
          {voiceCartUnits > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-white/20 px-2 py-0.5">
              <ShoppingCart className="h-3 w-3" /> {voiceCartUnits}
            </span>
          )}
        </button>

        <div className="flex items-center gap-1.5 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0 text-xs font-semibold">
          <button
            onClick={() => setFilterType('all')}
            className={`px-3 py-1.5 rounded-xl transition ${
              filterType === 'all'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            All ({catalog.length})
          </button>
          <button
            onClick={() => setFilterType('near_expiry')}
            className={`px-3 py-1.5 rounded-xl transition flex items-center gap-1 ${
              filterType === 'near_expiry'
                ? 'bg-amber-600 text-white shadow-xs'
                : 'bg-amber-50 text-amber-700 hover:bg-amber-100'
            }`}
          >
            <Clock className="w-3.5 h-3.5" /> Near Expiry ({stats.nearExpiryCount})
          </button>
          <button
            onClick={() => setFilterType('out_of_stock')}
            className={`px-3 py-1.5 rounded-xl transition flex items-center gap-1 ${
              filterType === 'out_of_stock'
                ? 'bg-rose-600 text-white shadow-xs'
                : 'bg-rose-50 text-rose-700 hover:bg-rose-100'
            }`}
          >
            <AlertTriangle className="w-3.5 h-3.5" /> Out of Stock ({stats.outOfStockCount})
          </button>
        </div>
      </div>

      {voiceToast && (
        <div className="flex items-start justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800 shadow-sm" role="status">
          <span>{voiceToast}</span>
          <button type="button" onClick={() => setVoiceToast(null)} className="text-xs font-bold text-emerald-700 underline">Dismiss</button>
        </div>
      )}

      {/* Fast Inventory Editable Table */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-700">
            <Filter className="w-3.5 h-3.5 text-blue-600" />
            <span>Fast Godown Stock Editor</span>
            <span className="text-[11px] font-normal text-slate-400">({filtered.length} items listed)</span>
          </div>
          <span className="text-[11px] text-slate-400 italic">
            Inline edits persist instantly. Setting stock to 0 disables retailer ordering.
          </span>
        </div>

        {productError && <div role="alert" className="m-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{productError}<button onClick={() => void loadCatalog()} className="ml-3 font-semibold underline">Retry</button></div>}
        {isLoadingCatalog ? <div className="p-12 text-center text-sm text-slate-500">Loading your godown catalog…</div> : catalog.length === 0 ? <div className="p-12 text-center"><Package className="mx-auto mb-3 h-8 w-8 text-slate-400"/><p className="font-semibold text-slate-900">Your catalog is empty. Add your first product to begin selling.</p><button onClick={() => setShowAddProduct(true)} className="mt-4 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white">+ Add Product</button></div> : filtered.length === 0 ? <p className="p-10 text-center text-sm text-slate-500">No catalog items match this filter.</p> : <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-slate-50/80 text-slate-500 border-b border-slate-200 text-[11px] uppercase tracking-wider">
                <th className="py-3 px-4 font-bold">SKU / Item Details</th>
                <th className="py-3 px-3 font-bold text-center">Batch Number</th>
                <th className="py-3 px-3 font-bold text-center">Expiry &amp; Status</th>
                <th className="py-3 px-3 font-bold text-center">Godown Stock</th>
                <th className="py-3 px-3 font-bold text-right">Wholesale Rate</th>
                <th className="py-3 px-3 font-bold text-right">Margin Floor</th>
                <th className="py-3 px-3 font-bold text-center">Clearance Discount</th>
                <th className="py-3 px-4 font-bold text-center">Quick Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((item) => {
                const daysRemaining = calculateDaysRemaining(item.expiryDate);
                const isOutOfStock = item.godownStock === 0;
                const isExpired = daysRemaining <= 0;
                const isNearExpiryWarning = !isExpired && daysRemaining <= 45; // <= 45 days (yellow badge)
                const isNearExpiryClearance = !isExpired && daysRemaining <= 60; // <= 60 days (clearance tag)

                return (
                  <tr 
                    key={item.id} 
                    className={`transition-colors ${
                      isOutOfStock 
                        ? 'bg-rose-50/20 hover:bg-rose-50/40' 
                        : isNearExpiryWarning
                          ? 'bg-amber-50/20 hover:bg-amber-50/40'
                          : 'hover:bg-slate-50/80'
                    }`}
                  >
                    {/* Item SKU & Name */}
                    <td className="py-3 px-4">
                      <div className="font-bold text-slate-900">{item.name}</div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[10px] font-mono text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-100">
                          {item.sku}
                        </span>
                        <span className="text-[10px] text-slate-500">{item.category}</span>
                        <span className="text-[10px] text-slate-400">&bull; MOQ: {item.moq} {item.unit}</span>
                      </div>
                    </td>

                    {/* Batch Number (Editable) */}
                    <td className="py-3 px-3 text-center">
                      <input
                        type="text"
                        value={item.batchNumber}
                        onChange={(e) => handleUpdateItem(item.id, { batchNumber: e.target.value })}
                        onBlur={() => void handleSaveItem(item.id)}
                        placeholder="e.g. BATCH-2026-A10"
                        className="w-32 px-2 py-1 bg-white border border-slate-200 rounded-lg text-slate-800 text-center font-mono text-xs focus:outline-none focus:border-blue-500 font-semibold"
                      />
                    </td>

                    {/* Expiry Date & Dynamic Near-Expiry Tag */}
                    <td className="py-3 px-3 text-center">
                      <div className="flex flex-col items-center gap-1">
                        <div className="flex items-center gap-1.5">
                          <Calendar className="w-3.5 h-3.5 text-slate-400" />
                          <input
                            type="date"
                            value={item.expiryDate}
                            onChange={(e) => handleUpdateItem(item.id, { expiryDate: e.target.value })}
                            onBlur={() => void handleSaveItem(item.id)}
                            className="px-2 py-1 bg-white border border-slate-200 rounded-lg text-slate-800 text-xs focus:outline-none focus:border-blue-500 font-mono"
                          />
                        </div>

                        {/* Status Tags */}
                        {isExpired ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md bg-rose-100 text-rose-800 border border-rose-200">
                            <AlertTriangle className="w-3 h-3 text-rose-600" /> Expired ({Math.abs(daysRemaining)}d ago)
                          </span>
                        ) : isNearExpiryWarning ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md bg-amber-100 text-amber-900 border border-amber-300">
                            <AlertTriangle className="w-3 h-3 text-amber-700" /> ⚠️ Expiring in {daysRemaining} days
                          </span>
                        ) : isNearExpiryClearance ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md bg-orange-100 text-orange-900 border border-orange-300">
                            <Sparkles className="w-3 h-3 text-orange-700" /> Near-Expiry Clearance ({daysRemaining}d)
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <Check className="w-3 h-3 text-emerald-600" /> Fresh Stock ({daysRemaining}d)
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Godown Stock Count (Editable) */}
                    <td className="py-3 px-3 text-center">
                      <div className="flex flex-col items-center gap-1">
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            min="0"
                            value={item.godownStock}
                            onChange={(e) => handleUpdateItem(item.id, { godownStock: Math.max(0, parseInt(e.target.value) || 0) })}
                            onBlur={() => void handleSaveItem(item.id)}
                            className={`w-20 px-2 py-1 border rounded-lg text-center font-mono font-bold text-xs focus:outline-none focus:ring-1 ${
                              isOutOfStock
                                ? 'bg-rose-50 border-rose-300 text-rose-700 focus:border-rose-500'
                                : 'bg-white border-slate-200 text-slate-900 focus:border-blue-500'
                            }`}
                          />
                          <span className="text-[11px] text-slate-500 font-medium">{item.unit}</span>
                        </div>

                        {/* Stock Tag */}
                        {isOutOfStock ? (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-rose-600 text-white">
                            OUT OF STOCK
                          </span>
                        ) : item.godownStock <= item.lowStockAlert ? (
                          <span className="text-[10px] font-semibold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded">
                            Low Godown ({item.godownStock})
                          </span>
                        ) : (
                          <span className="text-[10px] text-emerald-700 font-medium">
                            Healthy Reserve
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Base Wholesale Rate (Editable) */}
                    <td className="py-3 px-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <span className="text-slate-400 font-mono text-xs">₹</span>
                        <input
                          type="number"
                          step="0.5"
                          min="1"
                          value={item.baseWholesaleRate}
                          onChange={(e) => handleUpdateItem(item.id, { baseWholesaleRate: parseFloat(e.target.value) || 0 })}
                          onBlur={() => void handleSaveItem(item.id)}
                          className="w-20 px-2 py-1 bg-white border border-slate-200 rounded-lg text-right font-mono font-bold text-xs text-slate-900 focus:outline-none focus:border-blue-500"
                        />
                      </div>
                      <div className="text-[10px] text-slate-400 mt-0.5">
                        Cost: ₹{item.costPrice.toFixed(2)}
                      </div>
                    </td>

                    {/* Margin Floor Price (Editable) */}
                    <td className="py-3 px-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <span className="text-slate-400 font-mono text-xs">₹</span>
                        <input
                          type="number"
                          step="0.5"
                          min="1"
                          value={item.marginFloor}
                          onChange={(e) => handleUpdateItem(item.id, { marginFloor: parseFloat(e.target.value) || 0 })}
                          onBlur={() => void handleSaveItem(item.id)}
                          className="w-20 px-2 py-1 bg-emerald-50 border border-emerald-200 rounded-lg text-right font-mono font-bold text-xs text-emerald-800 focus:outline-none focus:border-emerald-500"
                        />
                      </div>
                      <div className="text-[10px] text-emerald-600 font-medium mt-0.5">
                        Min. Floor Rate
                      </div>
                    </td>

                    {/* Clearance Discount (% & Toggle) */}
                    <td className="py-3 px-3 text-center">
                      <div className="flex flex-col items-center gap-1">
                        <label className="flex items-center gap-1.5 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={item.isClearance}
                            onChange={(e) => handleUpdateItem(item.id, { 
                              isClearance: e.target.checked,
                              clearanceDiscountPercent: e.target.checked ? (item.clearanceDiscountPercent || 10) : 0
                            })}
                            onBlur={() => void handleSaveItem(item.id)}
                            className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                          />
                          <span className="text-[11px] font-semibold text-slate-700">Clearance</span>
                        </label>

                        {item.isClearance && (
                          <div className="flex items-center gap-1 mt-0.5">
                            <input
                              type="number"
                              min="1"
                              max="90"
                              value={item.clearanceDiscountPercent}
                              onChange={(e) => handleUpdateItem(item.id, { clearanceDiscountPercent: parseInt(e.target.value) || 0 })}
                              onBlur={() => void handleSaveItem(item.id)}
                              className="w-14 px-1.5 py-0.5 bg-orange-50 border border-orange-200 rounded text-center font-mono font-bold text-xs text-orange-800"
                            />
                            <span className="text-[11px] font-bold text-orange-700">% off</span>
                          </div>
                        )}
                      </div>
                    </td>

                    {/* Quick Row Actions */}
                    <td className="py-3 px-4 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          onClick={() => handleSaveItem(item.id)}
                          disabled={savingProductIds.has(item.id)}
                          title="Save this row"
                          className={`p-1.5 rounded-lg border transition disabled:opacity-50 ${
                          item.isSaved || savingProductIds.has(item.id)
                              ? 'bg-slate-50 border-slate-200 text-slate-400 hover:text-slate-600'
                              : 'bg-blue-600 border-blue-600 text-white hover:bg-blue-700 shadow-xs'
                          }`}
                        >
                          <Save className="w-3.5 h-3.5" />
                        </button>

                        <button
                          onClick={() => handlePresetZeroStock(item.id)}
                          title="Persist stock as zero"
                          className="px-1.5 py-1 text-[10px] font-bold rounded-md bg-rose-50 border border-rose-200 text-rose-700 hover:bg-rose-100 transition"
                        >
                          Mark Out of Stock (0)
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>}
      </div>
      {showAddProduct && (
        <ModalBackdrop onClose={() => setShowAddProduct(false)} className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <form onSubmit={createFirstProduct} className="w-full max-w-md space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
            <div className="flex items-start justify-between">
              <div><h2 className="text-lg font-semibold text-slate-900">Add your first product</h2><p className="mt-1 text-sm text-slate-500">Create a real catalog item for your business.</p></div>
              <button type="button" onClick={() => setShowAddProduct(false)} className="text-sm text-slate-500 hover:text-slate-900">Close</button>
            </div>
            {productError && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{productError}</p>}
            <label className="block text-sm font-medium text-slate-700">Product name<input required minLength={2} value={productName} onChange={(event) => setProductName(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" /></label>
            <label className="block text-sm font-medium text-slate-700">Wholesale price<input required type="number" min="0.01" step="0.01" value={productPrice} onChange={(event) => setProductPrice(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" /></label>
            <label className="block text-sm font-medium text-slate-700">Opening stock<input required type="number" min="0" step="1" value={productStock} onChange={(event) => setProductStock(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" /></label>
            <button type="submit" className="w-full rounded-lg bg-blue-600 px-4 py-2.5 font-medium text-white hover:bg-blue-700">Save product</button>
          </form>
        </ModalBackdrop>
      )}
    </div>
  );
};
