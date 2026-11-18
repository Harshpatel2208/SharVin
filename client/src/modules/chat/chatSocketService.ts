import { io, Socket } from 'socket.io-client';
import { 
  ChatMessage, 
  UserPresence, 
  TypingStatus, 
  OrderNegotiationContext, 
  ProposeRatePayload, 
  RateProposalResult,
  ConfirmRatePayload,
  RateLockResult,
  LineRateProposed,
  LineRateLocked
} from './types';

class ChatSocketService {
  private socket: Socket | null = null;
  private currentOrderId: string | null = null;
  private hasConnectedBefore = false;

  /**
   * Initialize or reuse the socket connection.
   */
  connect(token?: string): Socket {
    if (this.socket) {
      return this.socket;
    }

    const serverUrl = window.location.origin; // Vite proxy routes to server or same host
    this.socket = io(serverUrl, {
      auth: {
        token: token || sessionStorage.getItem('sharvin_token') || '',
      },
      transports: ['websocket', 'polling'],
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    this.socket.on('connect', () => {
      console.log('[SocketClient] Connected to gateway with id:', this.socket?.id);
      if (this.hasConnectedBefore) {
        window.dispatchEvent(new Event('socket:reconnected'));
      }
      this.hasConnectedBefore = true;
      if (this.currentOrderId) {
        this.joinOrder(this.currentOrderId);
      }
    });

    this.socket.on('disconnect', (reason) => {
      console.log('[SocketClient] Disconnected from gateway:', reason);
    });

    this.socket.on('connect_error', (error) => {
      console.warn('[SocketClient] Connection error:', error.message);
    });

    return this.socket;
  }

  /**
   * Join an order-specific negotiation room.
   */
  joinOrder(
    orderId: string, 
    callback?: (res: { success: boolean; error?: string; orderDetails?: OrderNegotiationContext }) => void
  ): void {
    if (!this.socket) {
      this.connect();
    }
    this.currentOrderId = orderId;

    this.socket?.emit('join_order', { orderId }, (res: any) => {
      if (callback) callback(res);
    });
  }

  /**
   * Leave an order-specific negotiation room.
   */
  leaveOrder(orderId: string): void {
    if (this.socket) {
      this.socket.emit('leave_order', { orderId });
    }
    if (this.currentOrderId === orderId) {
      this.currentOrderId = null;
    }
  }

  /**
   * Send a chat message over the WebSocket channel.
   */
  sendMessage(
    orderId: string,
    messageText: string,
    callback?: (res: { success: boolean; data?: ChatMessage; error?: string }) => void
  ): void {
    if (!this.socket) {
      this.connect();
    }

    this.socket?.emit('send_message', { orderId, messageText, messageType: 'text' }, (res: any) => {
      if (callback) callback(res);
    });
  }

  /**
   * Submit a rate proposal / counter-offer over WebSocket channel.
   */
  proposeRate(
    payload: ProposeRatePayload,
    callback?: (res: { success: boolean; data?: RateProposalResult; error?: string }) => void
  ): void {
    if (!this.socket) {
      this.connect();
    }

    this.socket?.emit('propose_rate', payload, (res: any) => {
      if (callback) callback(res);
    });
  }

  /**
   * Confirm agreed rate / bilateral deal lock over WebSocket channel.
   */
  confirmRate(
    payload: ConfirmRatePayload,
    callback?: (res: { success: boolean; data?: RateLockResult; error?: string }) => void
  ): void {
    if (!this.socket) {
      this.connect();
    }

    this.socket?.emit('confirm_rate', payload, (res: any) => {
      if (callback) callback(res);
    });
  }

  /**
   * Emit typing status indicator.
   */
  setTyping(orderId: string, isTyping: boolean): void {
    if (!this.socket) return;
    if (isTyping) {
      this.socket.emit('typing_start', { orderId });
    } else {
      this.socket.emit('typing_stop', { orderId });
    }
  }

  /**
   * Register listener for incoming new messages.
   */
  onNewMessage(listener: (message: ChatMessage) => void): () => void {
    if (!this.socket) this.connect();
    this.socket?.on('new_message', listener);
    return () => {
      this.socket?.off('new_message', listener);
    };
  }

  /**
   * Register listener for incoming rate proposals / counter-offers.
   */
  onRateProposed(listener: (proposal: RateProposalResult) => void): () => void {
    if (!this.socket) this.connect();
    this.socket?.on('rate_proposed', listener);
    return () => {
      this.socket?.off('rate_proposed', listener);
    };
  }

  /**
   * Register listener for mutual deal locked events.
   */
  onRateLocked(listener: (lockResult: RateLockResult) => void): () => void {
    if (!this.socket) this.connect();
    this.socket?.on('rate_locked', listener);
    return () => {
      this.socket?.off('rate_locked', listener);
    };
  }

  /**
   * P1.2: Register listener for a single contested line's rate proposal.
   */
  onLineRateProposed(listener: (payload: LineRateProposed) => void): () => void {
    if (!this.socket) this.connect();
    this.socket?.on('line_rate_proposed', listener);
    return () => {
      this.socket?.off('line_rate_proposed', listener);
    };
  }

  /**
   * P1.2: Register listener for a single line becoming locked/frozen.
   */
  onLineRateLocked(listener: (payload: LineRateLocked) => void): () => void {
    if (!this.socket) this.connect();
    this.socket?.on('line_rate_locked', listener);
    return () => {
      this.socket?.off('line_rate_locked', listener);
    };
  }

  /**
   * P1.2: Register listener for the whole-order price lock (alias of rate_locked).
   */
  onOrderPriceLocked(listener: (lockResult: RateLockResult) => void): () => void {
    if (!this.socket) this.connect();
    this.socket?.on('order_price_locked', listener);
    return () => {
      this.socket?.off('order_price_locked', listener);
    };
  }

  /**
   * Register listener for pending rate confirmation events.
   */
  onRateConfirmationPending(listener: (pendingResult: RateLockResult) => void): () => void {
    if (!this.socket) this.connect();
    this.socket?.on('rate_confirmation_pending', listener);
    return () => {
      this.socket?.off('rate_confirmation_pending', listener);
    };
  }

  /**
   * Register listener for participant presence events.
   */
  onUserJoined(listener: (presence: UserPresence) => void): () => void {
    if (!this.socket) this.connect();
    this.socket?.on('user_joined', listener);
    return () => {
      this.socket?.off('user_joined', listener);
    };
  }

  /**
   * Register listener for typing indicator events.
   */
  onUserTyping(listener: (status: TypingStatus) => void): () => void {
    if (!this.socket) this.connect();
    this.socket?.on('user_typing', listener);
    return () => {
      this.socket?.off('user_typing', listener);
    };
  }

  /**
   * Disconnect socket cleanly.
   */
  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.hasConnectedBefore = false;
    }
  }
}

export const chatSocketService = new ChatSocketService();
