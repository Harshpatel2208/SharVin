import { PosProduct, SaleReceipt } from './types';

const authHeaders = () => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${sessionStorage.getItem('sharvin_token') || ''}`,
});

async function readResponse<T>(response: Response): Promise<T> {
  const body = await response.json();
  if (!response.ok || !body.success) {
    throw new Error(body.error || 'The request could not be completed.');
  }
  return body.data as T;
}

export interface CreateRetailProductInput {
  productName: string;
  brandName?: string;
  barcode?: string;
  unitOfMeasure: string;
  costPrice: number;
  sellingPrice: number;
  initialStock: number;
  lowStockThreshold: number;
}

export class PosService {
  static async listProducts(): Promise<PosProduct[]> {
    const response = await fetch('/api/v1/pos/products', { headers: authHeaders() });
    return readResponse<PosProduct[]>(response);
  }

  static async createProduct(input: CreateRetailProductInput): Promise<PosProduct> {
    const response = await fetch('/api/v1/pos/products', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(input),
    });
    return readResponse<PosProduct>(response);
  }

  static async recordSale(input: {
    customerName?: string;
    customerPhone?: string;
    paymentMethod: SaleReceipt['paymentMethod'];
    discountAmount: number;
    taxAmount: number;
    items: Array<{ productId: string; quantity: number; unitPrice: number; discount: number }>;
  }): Promise<SaleReceipt> {
    const response = await fetch('/api/v1/pos/sales', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(input),
    });
    return readResponse<SaleReceipt>(response);
  }
}
