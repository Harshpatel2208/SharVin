import { 
  DeliveryStatusResponse, 
  HandoverCodeResponse, 
  HandoverVerificationResult,
  RebalanceSummaryResult,
  LineItemInspectionPayload,
  CreditNoteDto,
  DeliveryDisputeDto,
  DriverPortalDetailsResponse,
  ActiveDispatchOrder,
  DriverAccessLinkResponse
} from './types';

export class DeliveryService {
  private static getHeaders(): Record<string, string> {
    const token = sessionStorage.getItem('sharvin_token') || '';
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    };
  }

  static async getActiveOrders(): Promise<ActiveDispatchOrder[]> {
    const res = await fetch('/api/v1/delivery/active-orders', { headers: this.getHeaders() });
    const json = await res.json();
    if (!res.ok || !json.success) throw new Error(json.error || 'Failed to fetch active dispatches');
    return json.data || [];
  }

  /**
   * Fetch live delivery and OTP verification status for an order.
   */
  static async getDeliveryStatus(orderId: string): Promise<DeliveryStatusResponse> {
    const res = await fetch(`/api/v1/orders/${orderId}/delivery-status`, {
      headers: this.getHeaders(),
    });
    const json = await res.json();
    if (!res.ok || !json.success) {
      throw new Error(json.error || 'Failed to fetch delivery status');
    }
    return json.data;
  }

  /**
   * Retailer requests confidential 6-digit delivery handover OTP.
   */
  static async getHandoverCode(orderId: string): Promise<HandoverCodeResponse> {
    const res = await fetch(`/api/v1/orders/${orderId}/handover-code`, {
      headers: this.getHeaders(),
    });
    const json = await res.json();
    if (!res.ok || !json.success) {
      throw new Error(json.error || 'Failed to retrieve handover code');
    }
    return json.data;
  }

  static async getDriverAccessLink(orderId: string): Promise<DriverAccessLinkResponse> {
    const res = await fetch(`/api/v1/orders/${orderId}/driver-link`, { headers: this.getHeaders() });
    const json = await res.json();
    if (!res.ok || !json.success) throw new Error(json.error || 'Failed to retrieve driver link');
    return json.data;
  }

  /**
   * Dispatch an order with driver assignment and distance mode.
   */
  static async dispatchOrder(
    orderId: string, 
    driverName?: string, 
    driverPhone?: string,
    distanceKm?: number,
    trackingMode?: 'local' | 'regional',
    destinationAddress?: string
  ): Promise<any> {
    const res = await fetch(`/api/v1/orders/${orderId}/dispatch`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({
        driverName,
        driverPhone,
        distanceKm,
        trackingMode,
        destinationAddress,
      }),
    });
    const json = await res.json();
    if (!res.ok || !json.success) {
      throw new Error(json.error || 'Failed to dispatch order');
    }
    return json.data;
  }

  /**
   * Driver verifies the retailer's 6-digit OTP on-site with optional multi-item inspection.
   */
  static async verifyHandover(
    orderId: string, 
    otpCode: string, 
    notes?: string,
    damagedQuantity?: number,
    lineItemInspections?: LineItemInspectionPayload[],
    disputeNotes?: string
  ): Promise<HandoverVerificationResult> {
    const res = await fetch(`/api/v1/orders/${orderId}/verify-handover`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({
        otpCode,
        notes,
        damagedQuantity,
        lineItemInspections,
        disputeNotes,
      }),
    });
    const json = await res.json();
    if (!res.ok || !json.success) {
      throw new Error(json.error || 'Handover OTP verification failed');
    }
    return json.data;
  }

  /**
   * Fetch live inventory stock rebalance report for an order.
   */
  static async getRebalanceSummary(orderId: string): Promise<RebalanceSummaryResult> {
    const res = await fetch(`/api/v1/orders/${orderId}/rebalance-summary`, {
      headers: this.getHeaders(),
    });
    const json = await res.json();
    if (!res.ok || !json.success) {
      throw new Error(json.error || 'Failed to retrieve inventory rebalance summary');
    }
    return json.data;
  }

  /**
   * Fetch active dispute details for an order.
   */
  static async getDispute(orderId: string): Promise<DeliveryDisputeDto | null> {
    const res = await fetch(`/api/v1/orders/${orderId}/dispute`, {
      headers: this.getHeaders(),
    });
    if (res.status === 404) return null;
    const json = await res.json();
    if (!res.ok || !json.success) {
      throw new Error(json.error || 'Failed to fetch dispute');
    }
    return json.data;
  }

  /**
   * Resolve an active dispute (Wholesaler action).
   */
  static async resolveDispute(
    orderId: string,
    payload: { action: 'approve_credit_note' | 'reject_claim' | 'negotiate_allowance'; resolutionNotes?: string; allowanceAmount?: number }
  ): Promise<DeliveryDisputeDto> {
    const res = await fetch(`/api/v1/orders/${orderId}/dispute/resolve`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(payload),
    });
    const json = await res.json();
    if (!res.ok || !json.success) {
      throw new Error(json.error || 'Failed to resolve dispute');
    }
    return json.data;
  }

  /**
   * Retrieve a credit note by ID or number.
   */
  static async getCreditNote(idOrNumber: string): Promise<CreditNoteDto> {
    const res = await fetch(`/api/v1/delivery/credit-notes/${idOrNumber}`, {
      headers: this.getHeaders(),
    });
    const json = await res.json();
    if (!res.ok || !json.success) {
      throw new Error(json.error || 'Failed to retrieve credit note');
    }
    return json.data;
  }

  /**
   * Download RFC-4180 CSV export for CA audit of the Credit Note.
   */
  static async downloadCreditNoteCsv(idOrNumber: string): Promise<void> {
    const token = sessionStorage.getItem('sharvin_token') || '';
    const res = await fetch(`/api/v1/delivery/credit-notes/${idOrNumber}/csv`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!res.ok) {
      throw new Error('Failed to download Credit Note CSV');
    }

    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `credit-note-${idOrNumber}.csv`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  }

  /**
   * Fetch Driver Web Portal Details via temporary token (No auth token needed).
   */
  static async getDriverPortalDetails(token: string): Promise<DriverPortalDetailsResponse> {
    const res = await fetch(`/api/v1/deliveries/driver-portal/${token}`);
    const json = await res.json();
    if (!res.ok || !json.success) {
      throw new Error(json.error || 'Invalid or expired driver access link');
    }
    return json.data;
  }

  /**
   * Driver updates live GPS coordinates (for Local distance mode <100km).
   */
  static async updateDriverLocation(
    token: string, 
    latitude: number, 
    longitude: number, 
    speed?: number
  ): Promise<any> {
    const res = await fetch(`/api/v1/deliveries/driver-portal/${token}/location`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ latitude, longitude, speed }),
    });
    const json = await res.json();
    if (!res.ok || !json.success) {
      throw new Error(json.error || 'Failed to update GPS location');
    }
    return json.data;
  }

  /**
   * Driver updates milestone checkpoint (for Regional freight >100km).
   */
  static async updateDriverMilestone(
    token: string, 
    milestone: string, 
    hubName?: string, 
    notes?: string
  ): Promise<any> {
    const res = await fetch(`/api/v1/deliveries/driver-portal/${token}/milestone`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ milestone, hubName, notes }),
    });
    const json = await res.json();
    if (!res.ok || !json.success) {
      throw new Error(json.error || 'Failed to update milestone checkpoint');
    }
    return json.data;
  }

  /**
   * Driver verifies handover OTP on doorstep to complete delivery.
   */
  static async verifyDriverOtp(
    token: string,
    payload: {
      otpCode: string;
      damagedQuantity?: number;
      lineItemInspections?: LineItemInspectionPayload[];
      notes?: string;
      deliveryProofImageUrl?: string;
    }
  ): Promise<HandoverVerificationResult> {
    const res = await fetch(`/api/v1/deliveries/driver-portal/${token}/verify-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const json = await res.json();
    if (!res.ok || !json.success) {
      throw new Error(json.error || 'Handover verification failed');
    }
    return json.data;
  }
}
