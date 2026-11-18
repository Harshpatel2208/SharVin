export interface PosProduct {
  inventoryId: string;
  productId: string;
  productName: string;
  brandName: string | null;
  barcode: string;
  unitOfMeasure: string;
  currentStock: number;
  sellingPrice: number;
  costPrice: number;
  lowStockThreshold: number;
  isLowStock: boolean;
  hasWarranty: boolean;
  warrantyDurationMonths: number | null;
}

export interface CartItem {
  product: PosProduct;
  quantity: number;
  discount: number;
}

export interface SaleReceipt {
  saleId: string;
  billNumber: string;
  saleDate: string;
  totalAmount: number;
  discountAmount: number;
  taxAmount: number;
  netAmount: number;
  paymentMethod: 'cash' | 'upi' | 'card' | 'credit';
  customerName?: string;
  customerPhone?: string;
  items: Array<{
    id: string;
    productName: string;
    quantity: number;
    unitPrice: number;
    subtotal: number;
    remainingStock: number;
  }>;
  lowStockAlerts: Array<{
    productId: string;
    productName: string;
    remainingStock: number;
    threshold: number;
  }>;
}
