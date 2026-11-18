export interface SuggestedWholesaler {
  wholesalerId: string;
  businessName: string;
  phoneNumber?: string;
  gstNumber?: string | null;
}

export interface LowStockItem {
  inventoryId: string;
  productId: string;
  productName: string;
  brandName?: string | null;
  barcode: string;
  unitOfMeasure: string;
  currentStock: number;
  lowStockThreshold: number;
  reorderQuantity?: number | null;
  recommendedRestockQuantity: number;
  stockDeficit: number;
  costPrice: number;
  sellingPrice: number;
  predictedStockoutDate?: string | null;
  wholesalerStock?: number;
  isOutOfStockAtWholesaler?: boolean;
  batchNumber?: string;
  expiryDate?: string;
  daysUntilExpiry?: number;
  isNearExpiryWarning?: boolean; // <= 45 days
  isNearExpiryClearance?: boolean; // <= 60 days
  suggestedWholesaler: SuggestedWholesaler | null;
  availableWholesalers: SuggestedWholesaler[];
}

export interface RestockOrderDraft {
  orderId: string;
  orderNumber: string;
  wholesalerId: string;
  wholesalerName: string;
  items: {
    productId: string;
    productName: string;
    quantity: number;
    unitPrice: number;
    subtotal: number;
  }[];
  totalQuantity: number;
  estimatedTotal: number;
  lastUpdatedAt: string;
}

export interface RestockNotification {
  id: string;
  productName: string;
  wholesalerName: string;
  quantityAdded: number;
  orderNumber: string;
  timestamp: string;
}

export interface ReorderPrediction {
  inventoryId: string;
  productId: string;
  productName: string;
  brandName: string | null;
  barcode: string;
  unitOfMeasure: string;
  currentStock: number;
  lowStockThreshold: number;
  unitsSoldLast7Days: number;
  dailyVelocity: number;
  daysRemaining: number;
  isUrgent: boolean;
  urgencyLevel: 'CRITICAL' | 'HIGH' | 'MODERATE' | 'HEALTHY';
  supplierLeadTimeHours: number;
  recommendedBufferQty: number;
  reorderQuantity: number;
  costPrice: number;
  sellingPrice: number;
  estimatedRestockCost: number;
  line1: string;
  line2: string;
  line3: string;
  suggestedWholesaler: {
    wholesalerId: string;
    businessName: string;
    phoneNumber?: string;
  } | null;
}

export interface ReorderPredictionsResponse {
  predictions: ReorderPrediction[];
  urgentPredictions: ReorderPrediction[];
  totalUrgentCount: number;
  highestUrgency: 'CRITICAL' | 'HIGH' | 'MODERATE' | 'HEALTHY';
  simulated: boolean;
  activeSimulation?: {
    productId?: string;
    unitsSoldLast7Days: number;
    currentStock: number;
  } | null;
}
