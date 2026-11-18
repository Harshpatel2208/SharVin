import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  Banknote,
  Barcode,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  CreditCard,
  Minus,
  Package,
  Plus,
  Printer,
  QrCode,
  Search,
  Settings2,
  Trash2,
  X,
} from 'lucide-react';
import { useRole } from '../../context/RoleContext';
import { GlobalBarcodeScanner } from '../../components/scanner/GlobalBarcodeScanner';
import { ModalBackdrop } from '../../components/ui/DismissOnOutsideClick';
import { CartItem, PosProduct, SaleReceipt } from './types';
import { CreateRetailProductInput, PosService } from './posService';

interface PosBillingViewProps {
  onBackToOverview?: () => void;
  onOpenRestockHub?: () => void;
}

type PaymentMethod = 'cash' | 'upi' | 'card' | 'credit';

const freshProduct = (): CreateRetailProductInput => ({
  productName: '',
  brandName: '',
  barcode: '',
  unitOfMeasure: 'piece',
  costPrice: 0,
  sellingPrice: 0,
  initialStock: 0,
  lowStockThreshold: 10,
});

export const PosBillingView: React.FC<PosBillingViewProps> = ({ onBackToOverview, onOpenRestockHub }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { retailerSubRole, isPinUnlocked, promptOwnerPin } = useRole();
  const [products, setProducts] = useState<PosProduct[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [scanNotice, setScanNotice] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const [isLoadingProducts, setIsLoadingProducts] = useState(true);
  const [productLoadError, setProductLoadError] = useState<string | null>(null);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [checkingOut, setCheckingOut] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [isAddProductOpen, setIsAddProductOpen] = useState(false);
  const [isCreatingProduct, setIsCreatingProduct] = useState(false);
  const [productFormError, setProductFormError] = useState<string | null>(null);
  const [newProduct, setNewProduct] = useState<CreateRetailProductInput>(freshProduct);
  const [discountPercent, setDiscountPercent] = useState(0);
  const [taxPercent, setTaxPercent] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [activeReceipt, setActiveReceipt] = useState<SaleReceipt | null>(null);
  const [scanReturnTo, setScanReturnTo] = useState<string | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const scanNoticeTimer = useRef<number | null>(null);
  const processedLaunchScan = useRef<unknown>(null);

  const loadProducts = async () => {
    setIsLoadingProducts(true);
    setProductLoadError(null);
    try {
      setProducts(await PosService.listProducts());
    } catch (error) {
      setProducts([]);
      setProductLoadError(error instanceof Error ? error.message : 'Could not load inventory.');
    } finally {
      setIsLoadingProducts(false);
    }
  };

  useEffect(() => { void loadProducts(); }, []);
  useEffect(() => () => {
    if (scanNoticeTimer.current !== null) window.clearTimeout(scanNoticeTimer.current);
  }, []);

  const showNotice = (tone: 'success' | 'error', text: string) => {
    setScanNotice({ tone, text });
    if (scanNoticeTimer.current !== null) window.clearTimeout(scanNoticeTimer.current);
    scanNoticeTimer.current = window.setTimeout(() => setScanNotice(null), 3000);
  };

  const addToCart = (product: PosProduct) => {
    if (product.currentStock <= 0) {
      showNotice('error', `${product.productName} is out of stock.`);
      return false;
    }
    const existing = cart.find((item) => item.product.productId === product.productId);
    if (existing && existing.quantity >= product.currentStock) {
      showNotice('error', `Only ${product.currentStock} units available.`);
      return false;
    }
    setCart((current) => {
      const found = current.find((item) => item.product.productId === product.productId);
      return found
        ? current.map((item) => item.product.productId === product.productId ? { ...item, quantity: item.quantity + 1 } : item)
        : [...current, { product, quantity: 1, discount: 0 }];
    });
    setSearchQuery('');
    showNotice('success', `${product.productName} added.`);
    return true;
  };

  const addBarcode = (rawCode: string) => {
    if (activeReceipt) return;
    const code = rawCode.trim().toLowerCase();
    const product = products.find((item) => item.barcode.trim().toLowerCase() === code);
    if (!product) {
      showNotice('error', `Barcode ${rawCode.trim()} not found.`);
      return;
    }
    addToCart(product);
  };

  useEffect(() => {
    const handler = (event: Event) => {
      const barcode = (event as CustomEvent<{ barcode?: string }>).detail?.barcode;
      if (barcode) addBarcode(barcode);
    };
    window.addEventListener('sharvin:barcode-scanned', handler);
    return () => window.removeEventListener('sharvin:barcode-scanned', handler);
  }, [products, cart, activeReceipt]);

  useEffect(() => {
    const state = location.state as { scannedBarcode?: string; returnTo?: string } | null;
    if (!state?.scannedBarcode || processedLaunchScan.current === location.state) return;
    processedLaunchScan.current = location.state;
    if (state.returnTo && !state.returnTo.startsWith('/pos')) setScanReturnTo(state.returnTo);
    addBarcode(state.scannedBarcode);
    navigate('/pos', { replace: true, state: null });
  }, [location.state, products]);

  useEffect(() => {
    if (activeReceipt) return;
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.matches('input, textarea, select') || target?.isContentEditable) return;
      if (event.ctrlKey || event.metaKey || event.altKey || event.key.length !== 1) return;
      searchInputRef.current?.focus();
      setSearchQuery((value) => value + event.key);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [activeReceipt]);

  const filteredProducts = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return [];
    return products.filter((product) =>
      product.productName.toLowerCase().includes(query) ||
      product.barcode.toLowerCase().includes(query) ||
      product.brandName?.toLowerCase().includes(query),
    ).slice(0, 8);
  }, [products, searchQuery]);

  const updateQuantity = (productId: string, delta: number) => {
    setCart((current) => current.flatMap((item) => {
      if (item.product.productId !== productId) return [item];
      const quantity = item.quantity + delta;
      if (quantity <= 0) return [];
      if (quantity > item.product.currentStock) {
        showNotice('error', `Only ${item.product.currentStock} units available.`);
        return [item];
      }
      return [{ ...item, quantity }];
    }));
  };

  const subtotal = useMemo(() => cart.reduce((sum, item) => sum + item.product.sellingPrice * item.quantity, 0), [cart]);
  const discountAmount = subtotal * discountPercent / 100;
  const taxAmount = (subtotal - discountAmount) * taxPercent / 100;
  const grandTotal = Math.max(0, subtotal - discountAmount + taxAmount);
  const itemCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  const selectPayment = (method: PaymentMethod) => {
    if (method === 'credit' && retailerSubRole === 'cashier' && !isPinUnlocked) {
      promptOwnerPin('authorize customer Udhaar credit line');
      return;
    }
    setPaymentMethod(method);
  };

  const changeDiscount = (value: number) => {
    if (value > 0 && retailerSubRole === 'cashier' && !isPinUnlocked) {
      promptOwnerPin('authorize customer price discount');
      return;
    }
    setDiscountPercent(Math.min(100, Math.max(0, value)));
  };

  const clearCart = () => {
    setCart([]);
    setCustomerName('');
    setCustomerPhone('');
    setDiscountPercent(0);
    setTaxPercent(0);
  };

  const checkout = async () => {
    if (!cart.length || checkingOut) return;
    if (paymentMethod === 'credit' && !customerPhone.trim()) {
      setCheckoutError('Add the customer phone number in Advanced Entry for Udhaar.');
      setAdvancedOpen(true);
      return;
    }
    setCheckingOut(true);
    setCheckoutError(null);
    try {
      const receipt = await PosService.recordSale({
        customerName: customerName.trim() || undefined,
        customerPhone: customerPhone.trim() || undefined,
        paymentMethod,
        discountAmount,
        taxAmount,
        items: cart.map(({ product, quantity, discount }) => ({
          productId: product.productId,
          quantity,
          unitPrice: product.sellingPrice,
          discount,
        })),
      });
      setActiveReceipt(receipt);
      clearCart();
      window.dispatchEvent(new CustomEvent('sharvin:inventory-refresh'));
      await loadProducts();
    } catch (error) {
      setCheckoutError(error instanceof Error ? error.message : 'Could not complete the sale.');
    } finally {
      setCheckingOut(false);
    }
  };

  const createProduct = async (event: React.FormEvent) => {
    event.preventDefault();
    setProductFormError(null);
    if (!newProduct.productName.trim() || newProduct.sellingPrice <= 0 || newProduct.initialStock < 0) {
      setProductFormError('Enter a product name, valid selling price, and opening stock.');
      return;
    }
    setIsCreatingProduct(true);
    try {
      const created = await PosService.createProduct({
        ...newProduct,
        productName: newProduct.productName.trim(),
        brandName: newProduct.brandName?.trim() || undefined,
        barcode: newProduct.barcode?.trim() || undefined,
      });
      setProducts((current) => [created, ...current.filter((item) => item.productId !== created.productId)]);
      setNewProduct(freshProduct());
      setIsAddProductOpen(false);
      showNotice('success', `${created.productName} added to inventory.`);
    } catch (error) {
      setProductFormError(error instanceof Error ? error.message : 'Could not create this product.');
    } finally {
      setIsCreatingProduct(false);
    }
  };

  const closeReceipt = () => {
    const returnTo = scanReturnTo;
    setActiveReceipt(null);
    setScanReturnTo(null);
    if (returnTo) navigate(returnTo, { replace: true });
  };

  return (
    <div className="mx-auto max-w-3xl space-y-8 pb-28">
      <section className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-slate-500">New sale</p>
            <h1 className="text-3xl font-black tracking-tight text-slate-950">Scan &amp; Bill</h1>
          </div>
          <button type="button" onClick={() => setAdvancedOpen(true)} className="flex min-h-11 items-center gap-2 rounded-full bg-white px-4 text-sm font-bold text-slate-700 shadow-sm active:bg-slate-100">
            <Settings2 className="h-5 w-5" /> Advanced
          </button>
        </div>

        {scanReturnTo && (
          <button type="button" onClick={() => { navigate(scanReturnTo, { replace: true }); setScanReturnTo(null); }} className="w-full rounded-2xl bg-blue-50 px-4 py-3 text-left text-sm font-semibold text-blue-700">
            Scan-to-bill active · Tap to return without checkout
          </button>
        )}

        <GlobalBarcodeScanner variant="hero" showFloatingButton={false} />

        <form onSubmit={(event) => { event.preventDefault(); if (filteredProducts[0]) addToCart(filteredProducts[0]); else if (searchQuery.trim()) addBarcode(searchQuery); }} className="relative">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
          <input
            ref={searchInputRef}
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Type product name or barcode"
            autoComplete="off"
            className="h-14 w-full rounded-2xl bg-white pl-12 pr-4 text-base font-medium text-slate-900 shadow-sm outline-none ring-blue-500 focus:ring-2"
          />
        </form>

        {scanNotice && (
          <div role="status" className={`rounded-2xl px-4 py-3 text-sm font-semibold ${scanNotice.tone === 'success' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
            {scanNotice.text}
          </div>
        )}

        {!!searchQuery.trim() && (
          <div className="overflow-hidden rounded-2xl bg-white shadow-sm">
            {filteredProducts.length ? filteredProducts.map((product) => (
              <button key={product.productId} type="button" disabled={product.currentStock <= 0} onClick={() => addToCart(product)} className="flex min-h-16 w-full items-center gap-3 px-4 text-left active:bg-slate-50 disabled:opacity-40">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-blue-50 text-blue-600"><Package className="h-5 w-5" /></span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold text-slate-900">{product.productName}</span>
                  <span className="text-xs text-slate-500">{product.currentStock} in stock</span>
                </span>
                <span className="text-lg font-black text-slate-950">₹{product.sellingPrice.toFixed(2)}</span>
              </button>
            )) : <p className="px-4 py-5 text-center text-sm text-slate-500">No product found</p>}
          </div>
        )}

        {isLoadingProducts && <p className="py-4 text-center text-sm text-slate-500">Loading inventory…</p>}
        {productLoadError && <button type="button" onClick={() => void loadProducts()} className="w-full rounded-2xl bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{productLoadError} · Tap to retry</button>}
        {!isLoadingProducts && !productLoadError && products.length === 0 && (
          <button type="button" onClick={() => setIsAddProductOpen(true)} className="w-full rounded-3xl bg-white px-6 py-8 text-center shadow-sm">
            <Package className="mx-auto h-10 w-10 text-slate-300" />
            <span className="mt-3 block text-lg font-bold text-slate-900">Your inventory is empty</span>
            <span className="mt-1 block text-sm text-slate-500">Tap to add your first product</span>
          </button>
        )}
      </section>

      <section className="space-y-4">
        <div className="flex items-end justify-between">
          <div>
            <p className="text-sm font-medium text-slate-500">Current bill</p>
            <h2 className="text-2xl font-black text-slate-950">{itemCount} {itemCount === 1 ? 'item' : 'items'}</h2>
          </div>
          {cart.length > 0 && <button type="button" onClick={clearCart} className="flex min-h-11 items-center gap-1.5 px-2 text-sm font-bold text-rose-600"><Trash2 className="h-4 w-4" /> Clear</button>}
        </div>

        {cart.length === 0 ? (
          <div className="py-14 text-center">
            <Barcode className="mx-auto h-12 w-12 text-slate-200" />
            <p className="mt-3 text-base font-semibold text-slate-400">Scanned items will appear here</p>
          </div>
        ) : (
          <div className="space-y-3">
            {cart.map((item) => (
              <article key={item.product.productId} className="rounded-3xl bg-white p-4 shadow-sm">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate text-base font-bold text-slate-900">{item.product.productName}</h3>
                    <p className="mt-1 text-sm text-slate-500">₹{item.product.sellingPrice.toFixed(2)} each</p>
                  </div>
                  <p className="text-2xl font-black tracking-tight text-slate-950">₹{(item.product.sellingPrice * item.quantity).toFixed(2)}</p>
                </div>
                <div className="mt-4 flex items-center justify-between">
                  <button type="button" onClick={() => setCart((current) => current.filter((entry) => entry.product.productId !== item.product.productId))} className="min-h-11 px-2 text-sm font-semibold text-slate-400">Remove</button>
                  <div className="flex items-center gap-4">
                    <button type="button" onClick={() => updateQuantity(item.product.productId, -1)} className="grid h-12 w-12 place-items-center rounded-full bg-slate-100 text-slate-800 active:bg-slate-200" aria-label={`Reduce ${item.product.productName}`}><Minus className="h-6 w-6" /></button>
                    <span className="min-w-7 text-center text-xl font-black">{item.quantity}</span>
                    <button type="button" onClick={() => updateQuantity(item.product.productId, 1)} className="grid h-12 w-12 place-items-center rounded-full bg-blue-600 text-white active:bg-blue-700" aria-label={`Add ${item.product.productName}`}><Plus className="h-6 w-6" /></button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}

        <div className="grid grid-cols-4 gap-2">
          {([
            ['cash', 'Cash', Banknote],
            ['upi', 'UPI', QrCode],
            ['card', 'Card', CreditCard],
            ['credit', 'Udhaar', BookOpen],
          ] as const).map(([method, label, Icon]) => (
            <button key={method} type="button" onClick={() => selectPayment(method)} className={`flex min-h-16 flex-col items-center justify-center gap-1 rounded-2xl text-xs font-bold ${paymentMethod === method ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20' : 'bg-white text-slate-600 shadow-sm'}`}>
              <Icon className="h-5 w-5" /> {label}
            </button>
          ))}
        </div>

        {(discountAmount > 0 || taxAmount > 0) && (
          <div className="flex justify-between rounded-2xl bg-white px-4 py-3 text-sm text-slate-500 shadow-sm">
            <span>Discount −₹{discountAmount.toFixed(2)}</span><span>Tax +₹{taxAmount.toFixed(2)}</span>
          </div>
        )}
      </section>

      <div className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-30 bg-white/95 px-3 py-3 backdrop-blur sm:px-5">
        <div className="mx-auto max-w-3xl">
          {checkoutError && <p role="alert" className="mb-2 rounded-xl bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">{checkoutError}</p>}
          <button type="button" disabled={!cart.length || checkingOut} onClick={() => void checkout()} className="flex min-h-16 w-full items-center justify-between rounded-2xl bg-emerald-600 px-5 text-white shadow-lg shadow-emerald-600/20 transition active:scale-[0.99] disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none">
            <span className="text-base font-black">{checkingOut ? 'Processing…' : 'Pay & Checkout'}</span>
            <span className="text-2xl font-black tracking-tight">₹{grandTotal.toFixed(2)}</span>
          </button>
        </div>
      </div>

      {advancedOpen && (
        <ModalBackdrop onClose={() => setAdvancedOpen(false)} className="fixed inset-0 z-50 flex items-end bg-slate-950/35">
          <section className="max-h-[85vh] w-full overflow-y-auto rounded-t-[2rem] bg-white p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-2xl" role="dialog" aria-modal="true" aria-label="Advanced sale entry">
            <div className="mx-auto max-w-3xl space-y-6">
              <div className="flex items-center justify-between">
                <div><p className="text-sm font-medium text-slate-500">Optional</p><h2 className="text-2xl font-black">Advanced Entry</h2></div>
                <button type="button" onClick={() => setAdvancedOpen(false)} className="grid h-11 w-11 place-items-center rounded-full bg-slate-100"><ChevronDown className="h-6 w-6" /></button>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="text-sm font-bold text-slate-700">Customer name<input value={customerName} onChange={(event) => setCustomerName(event.target.value)} className="mt-2 h-13 w-full rounded-2xl bg-slate-100 px-4 text-base font-medium outline-none focus:ring-2 focus:ring-blue-500" placeholder="Optional" /></label>
                <label className="text-sm font-bold text-slate-700">Phone number<input value={customerPhone} onChange={(event) => setCustomerPhone(event.target.value)} className="mt-2 h-13 w-full rounded-2xl bg-slate-100 px-4 text-base font-medium outline-none focus:ring-2 focus:ring-blue-500" placeholder="Required for Udhaar" inputMode="tel" /></label>
                <label className="text-sm font-bold text-slate-700">Discount %<input type="number" min="0" max="100" value={discountPercent || ''} onChange={(event) => changeDiscount(Number(event.target.value))} className="mt-2 h-13 w-full rounded-2xl bg-slate-100 px-4 text-base font-medium outline-none focus:ring-2 focus:ring-blue-500" placeholder="0" /></label>
                <div>
                  <p className="text-sm font-bold text-slate-700">GST rate</p>
                  <div className="mt-2 grid grid-cols-4 gap-2">{[0, 5, 12, 18].map((rate) => <button key={rate} type="button" onClick={() => setTaxPercent(rate)} className={`h-13 rounded-2xl text-sm font-bold ${taxPercent === rate ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'}`}>{rate}%</button>)}</div>
                </div>
              </div>

              {retailerSubRole === 'cashier' && !isPinUnlocked && <button type="button" onClick={() => promptOwnerPin('authorize discounts and customer Udhaar credit')} className="w-full rounded-2xl bg-amber-50 px-4 py-3 text-sm font-bold text-amber-800">Owner PIN required for discounts and Udhaar</button>}
              <button type="button" onClick={() => { setAdvancedOpen(false); setIsAddProductOpen(true); }} className="flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-slate-100 text-base font-bold text-slate-800"><Plus className="h-5 w-5" /> Add a new product</button>
              {onBackToOverview && <button type="button" onClick={onBackToOverview} className="w-full py-3 text-sm font-semibold text-slate-500">Back to overview</button>}
            </div>
          </section>
        </ModalBackdrop>
      )}

      {activeReceipt && (
        <ModalBackdrop onClose={closeReceipt} className="fixed inset-0 z-50 grid place-items-center bg-slate-950/40 p-4">
          <section className="w-full max-w-md rounded-[2rem] bg-white p-6 shadow-2xl" role="dialog" aria-modal="true" aria-label="Sale complete">
            <CheckCircle2 className="mx-auto h-14 w-14 text-emerald-600" />
            <h2 className="mt-3 text-center text-2xl font-black">Payment complete</h2>
            <p className="mt-1 text-center text-sm text-slate-500">Bill {activeReceipt.billNumber}</p>
            <p className="my-7 text-center text-5xl font-black tracking-tight text-slate-950">₹{activeReceipt.netAmount.toFixed(2)}</p>
            <div className="max-h-44 space-y-2 overflow-y-auto">{activeReceipt.items.map((item, index) => <div key={index} className="flex justify-between text-sm"><span className="truncate text-slate-600">{item.productName} × {item.quantity}</span><span className="font-bold">₹{item.subtotal.toFixed(2)}</span></div>)}</div>
            {activeReceipt.lowStockAlerts.length > 0 && <button type="button" onClick={() => { setActiveReceipt(null); onOpenRestockHub?.(); }} className="mt-5 w-full rounded-2xl bg-amber-50 px-4 py-3 text-sm font-bold text-amber-800"><AlertTriangle className="mr-2 inline h-4 w-4" />{activeReceipt.lowStockAlerts.length} items need restocking</button>}
            <div className="mt-6 grid grid-cols-2 gap-3">
              <button type="button" onClick={() => window.print()} className="min-h-12 rounded-2xl bg-slate-100 text-sm font-bold text-slate-700"><Printer className="mr-2 inline h-4 w-4" />Print</button>
              <button type="button" onClick={closeReceipt} className="min-h-12 rounded-2xl bg-blue-600 text-sm font-bold text-white">{scanReturnTo ? 'Done & Return' : 'Next sale'}</button>
            </div>
          </section>
        </ModalBackdrop>
      )}

      {isAddProductOpen && (
        <ModalBackdrop onClose={() => setIsAddProductOpen(false)} className="fixed inset-0 z-50 flex items-end bg-slate-950/40 sm:items-center sm:justify-center sm:p-4">
          <form onSubmit={createProduct} className="max-h-[90vh] w-full overflow-y-auto rounded-t-[2rem] bg-white p-5 shadow-2xl sm:max-w-lg sm:rounded-[2rem]" role="dialog" aria-modal="true" aria-label="Add product">
            <div className="flex items-center justify-between"><div><p className="text-sm text-slate-500">Inventory setup</p><h2 className="text-2xl font-black">Add Product</h2></div><button type="button" onClick={() => setIsAddProductOpen(false)} className="grid h-11 w-11 place-items-center rounded-full bg-slate-100"><X className="h-5 w-5" /></button></div>
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <label className="sm:col-span-2 text-sm font-bold text-slate-700">Product name<input required value={newProduct.productName} onChange={(event) => setNewProduct((value) => ({ ...value, productName: event.target.value }))} className="mt-2 h-13 w-full rounded-2xl bg-slate-100 px-4 text-base outline-none focus:ring-2 focus:ring-blue-500" /></label>
              <label className="text-sm font-bold text-slate-700">Barcode<input value={newProduct.barcode} onChange={(event) => setNewProduct((value) => ({ ...value, barcode: event.target.value }))} className="mt-2 h-13 w-full rounded-2xl bg-slate-100 px-4 text-base outline-none focus:ring-2 focus:ring-blue-500" /></label>
              <label className="text-sm font-bold text-slate-700">Brand<input value={newProduct.brandName} onChange={(event) => setNewProduct((value) => ({ ...value, brandName: event.target.value }))} className="mt-2 h-13 w-full rounded-2xl bg-slate-100 px-4 text-base outline-none focus:ring-2 focus:ring-blue-500" /></label>
              <label className="text-sm font-bold text-slate-700">Selling price<input required min="0.01" step="0.01" type="number" value={newProduct.sellingPrice || ''} onChange={(event) => setNewProduct((value) => ({ ...value, sellingPrice: Number(event.target.value) }))} className="mt-2 h-13 w-full rounded-2xl bg-slate-100 px-4 text-base outline-none focus:ring-2 focus:ring-blue-500" /></label>
              <label className="text-sm font-bold text-slate-700">Cost price<input min="0" step="0.01" type="number" value={newProduct.costPrice || ''} onChange={(event) => setNewProduct((value) => ({ ...value, costPrice: Number(event.target.value) }))} className="mt-2 h-13 w-full rounded-2xl bg-slate-100 px-4 text-base outline-none focus:ring-2 focus:ring-blue-500" /></label>
              <label className="text-sm font-bold text-slate-700">Opening stock<input required min="0" type="number" value={newProduct.initialStock || ''} onChange={(event) => setNewProduct((value) => ({ ...value, initialStock: Number(event.target.value) }))} className="mt-2 h-13 w-full rounded-2xl bg-slate-100 px-4 text-base outline-none focus:ring-2 focus:ring-blue-500" /></label>
              <label className="text-sm font-bold text-slate-700">Low stock alert<input required min="1" type="number" value={newProduct.lowStockThreshold} onChange={(event) => setNewProduct((value) => ({ ...value, lowStockThreshold: Number(event.target.value) }))} className="mt-2 h-13 w-full rounded-2xl bg-slate-100 px-4 text-base outline-none focus:ring-2 focus:ring-blue-500" /></label>
            </div>
            {productFormError && <p className="mt-4 rounded-xl bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">{productFormError}</p>}
            <button disabled={isCreatingProduct} type="submit" className="mt-6 min-h-14 w-full rounded-2xl bg-blue-600 text-base font-bold text-white disabled:opacity-50">{isCreatingProduct ? 'Saving…' : 'Save Product'}</button>
          </form>
        </ModalBackdrop>
      )}
    </div>
  );
};
