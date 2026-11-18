import { 
  LedgerAccountSummary, 
  LedgerTransactionDto, 
  RecordPaymentPayload, 
  RecordPaymentResult,
  KhataSettlementVoucherDto,
  CreditProfileSummary
} from './types';

export class LedgerService {
  private static getHeaders(): Record<string, string> {
    const token = sessionStorage.getItem('sharvin_token') || '';
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    };
  }

  /**
   * Fetch active ledger account summary with a trade partner.
   */
  static async getLedgerAccount(partnerId: string): Promise<LedgerAccountSummary> {
    const res = await fetch(`/api/v1/ledger/accounts/${partnerId}`, {
      headers: this.getHeaders(),
    });
    const json = await res.json();
    if (!res.ok || !json.success) {
      throw new Error(json.error || 'Failed to fetch ledger account');
    }
    return json.data;
  }

  /**
   * Fetch chronological transactions for the ledger account.
   */
  static async getLedgerTransactions(partnerId: string, limit: number = 50): Promise<LedgerTransactionDto[]> {
    const res = await fetch(`/api/v1/ledger/transactions/${partnerId}?limit=${limit}`, {
      headers: this.getHeaders(),
    });
    const json = await res.json();
    if (!res.ok || !json.success) {
      throw new Error(json.error || 'Failed to fetch ledger transactions');
    }
    return json.data;
  }

  /**
   * Record a settlement payment (Cash, UPI, Bank Transfer, Cheque).
   */
  static async recordPayment(payload: RecordPaymentPayload): Promise<RecordPaymentResult> {
    const res = await fetch(`/api/v1/ledger/payments`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(payload),
    });
    const json = await res.json();
    if (!res.ok || !json.success) {
      throw new Error(json.error || 'Failed to record payment');
    }
    return json.data;
  }

  /**
   * Retrieve official B2B Khata Settlement Voucher with CA double-entry details.
   */
  static async getSettlementVoucher(voucherIdOrNumber: string): Promise<KhataSettlementVoucherDto> {
    const res = await fetch(`/api/v1/ledger/vouchers/${encodeURIComponent(voucherIdOrNumber)}`, {
      headers: this.getHeaders(),
    });
    const json = await res.json();
    if (!res.ok || !json.success) {
      throw new Error(json.error || 'Failed to fetch settlement voucher');
    }
    return json.data;
  }

  /**
   * Download official B2B Khata Settlement Voucher as CSV.
   */
  static async downloadVoucherCsv(voucherIdOrNumber: string): Promise<void> {
    const res = await fetch(`/api/v1/ledger/vouchers/${encodeURIComponent(voucherIdOrNumber)}/csv`, {
      headers: this.getHeaders(),
    });
    if (!res.ok) {
      throw new Error('Failed to download voucher CSV');
    }
    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Khata-Voucher-${voucherIdOrNumber}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  }

  /**
   * Fetch credit risk assessment, limits, and overdue freeze status.
   */
  static async getCreditProfile(
    partnerId: string,
    options?: {
      cartTotal?: number;
      orderId?: string;
      simulateOverdue?: boolean;
      simulateCreditExceeded?: boolean;
    }
  ): Promise<CreditProfileSummary> {
    const params = new URLSearchParams();
    if (options?.cartTotal !== undefined) params.append('cartTotal', String(options.cartTotal));
    if (options?.orderId) params.append('orderId', options.orderId);
    if (options?.simulateOverdue) params.append('simulateOverdue', 'true');
    if (options?.simulateCreditExceeded) params.append('simulateCreditExceeded', 'true');

    const qs = params.toString() ? `?${params.toString()}` : '';
    const res = await fetch(`/api/v1/ledger/credit-profile/${partnerId}${qs}`, {
      headers: this.getHeaders(),
    });
    const json = await res.json();
    if (!res.ok || !json.success) {
      throw new Error(json.error || 'Failed to fetch credit profile');
    }
    return json.data;
  }

  /**
   * Wholesaler sets credit limit and payment terms days for a retailer.
   */
  static async updateCreditTerms(
    partnerId: string,
    creditLimit: number,
    paymentTermDays: number
  ): Promise<{ success: boolean; creditLimit: number; paymentTermDays: number; message: string }> {
    const res = await fetch(`/api/v1/ledger/credit-terms/${partnerId}`, {
      method: 'PATCH',
      headers: this.getHeaders(),
      body: JSON.stringify({ creditLimit, paymentTermDays }),
    });
    const json = await res.json();
    if (!res.ok || !json.success) {
      throw new Error(json.error || 'Failed to update credit terms');
    }
    return json.data;
  }

  /**
   * Wholesaler overrides credit limit / overdue freeze for a specific order.
   */
  static async overrideOrderCredit(
    orderId: string,
    reason: string
  ): Promise<{ success: boolean; orderId: string; reason: string; message: string }> {
    const res = await fetch(`/api/v1/ledger/orders/${orderId}/credit-override`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ reason }),
    });
    const json = await res.json();
    if (!res.ok || !json.success) {
      throw new Error(json.error || 'Failed to override credit limit');
    }
    return json.data;
  }

  /**
   * Wholesaler freezes deal and demands payment before dispatch.
   */
  static async demandPayment(
    orderId: string,
    notes?: string
  ): Promise<{ success: boolean; orderId: string; message: string }> {
    const res = await fetch(`/api/v1/ledger/orders/${orderId}/demand-payment`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ notes }),
    });
    const json = await res.json();
    if (!res.ok || !json.success) {
      throw new Error(json.error || 'Failed to issue payment demand');
    }
    return json.data;
  }

  /**
   * Simulation helper for instant overdue testing.
   */
  static async simulateOverdue(
    partnerId: string,
    daysOverdue: number = 7,
    amount: number = 14500.00,
    clear: boolean = false
  ): Promise<void> {
    await fetch(`/api/v1/ledger/simulate-overdue`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ partnerId, daysOverdue, amount, clear }),
    });
  }
}

