import type { UserRole } from '../../context/RoleContext';

const TOKEN_KEY = 'sharvin_token';

export interface ActivityItem {
  id: string;
  category: 'notification' | 'stock_alert' | 'order' | 'rate' | 'delivery';
  title: string;
  message: string;
  createdAt: string;
}

export interface BadgeCounts {
  activeAlerts: number;
  openPos: number;
  activeOrders: number;
  pendingDeliveries: number;
  newOrders: number;
  unreadNotifications: number;
}

export interface ActivityResponse {
  activities: ActivityItem[];
  badges: BadgeCounts;
}

/** Relative "x ago" formatter for the recent-activity feed. */
export const formatActivityTime = (iso: string): string => {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
};

/**
 * Fetches the tenant's real activities and sidebar badge counters from the API.
 * Returns null when the request fails so callers can keep their previous state.
 */
export const fetchActivityAndBadges = async (): Promise<ActivityResponse | null> => {
  const token = sessionStorage.getItem(TOKEN_KEY);
  if (!token) return null;
  try {
    const response = await fetch('/api/v1/notifications/activity', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) return null;
    const body = await response.json();
    if (!body.success || !body.data) return null;
    return body.data as ActivityResponse;
  } catch {
    return null;
  }
};

export const emptyBadges: BadgeCounts = {
  activeAlerts: 0,
  openPos: 0,
  activeOrders: 0,
  pendingDeliveries: 0,
  newOrders: 0,
  unreadNotifications: 0,
};

export const badgeCountForPath = (path: string, role: UserRole, badges: BadgeCounts): number => {
  if (role === 'retailer') {
    if (path === '/inventory') return badges.activeAlerts;
    if (path === '/cart') return badges.openPos;
    if (path === '/orders') return badges.activeOrders;
    if (path === '/deliveries') return badges.pendingDeliveries;
    return 0;
  }
  if (role === 'wholesaler') {
    if (path === '/wholesaler/orders') return badges.newOrders;
    if (path === '/orders') return badges.activeOrders;
    if (path === '/deliveries') return badges.pendingDeliveries;
  }
  return 0;
};
