import { LowStockItem, ReorderPredictionsResponse } from './types';

export class InventoryService {
  private static getHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${sessionStorage.getItem('sharvin_token') || ''}`,
    };
  }

  private static async read<T>(response: Response): Promise<T> {
    const body = await response.json();
    if (!response.ok || !body.success) {
      throw new Error(body.error || 'The inventory request could not be completed.');
    }
    return body.data as T;
  }

  static async getLowStock(): Promise<{ count: number; items: LowStockItem[]; hasActiveWholesalers: boolean; activeWholesalersCount: number }> {
    const response = await fetch('/api/v1/inventory/low-stock', { headers: this.getHeaders() });
    return this.read(response);
  }

  static async getReorderPredictions(signal?: AbortSignal): Promise<ReorderPredictionsResponse> {
    const response = await fetch('/api/v1/inventory/reorder-predictions', {
      headers: this.getHeaders(),
      signal,
    });
    return this.read(response);
  }

  static async simulateVelocity(payload: { productId?: string; unitsSoldLast7Days?: number; currentStock?: number; reset?: boolean }) {
    const response = await fetch('/api/v1/inventory/simulate-velocity', {
      method: 'POST', headers: this.getHeaders(), body: JSON.stringify(payload),
    });
    return this.read(response);
  }

  static async quickRestock(productId: string, quantity?: number, wholesalerId?: string) {
    const response = await fetch('/api/v1/inventory/restock/quick-add', {
      method: 'POST', headers: this.getHeaders(), body: JSON.stringify({ productId, quantity, wholesalerId }),
    });
    return this.read<{ orderNumber: string; quantityAdded: number; wholesalerName: string }>(response);
  }

  static async updateThreshold(productId: string, lowStockThreshold: number, reorderQuantity?: number) {
    const response = await fetch('/api/v1/inventory/threshold', {
      method: 'PATCH', headers: this.getHeaders(), body: JSON.stringify({ productId, lowStockThreshold, reorderQuantity }),
    });
    return this.read(response);
  }
}
