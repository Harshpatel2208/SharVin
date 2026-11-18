import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

export type UserRole = 'retailer' | 'wholesaler' | 'driver';
export type RetailerSubRole = 'owner' | 'cashier' | 'retailer_manager';
export type WholesalerSubRole = 'owner' | 'wholesaler_manager' | 'godown_manager' | 'field_agent';

export interface AuthenticatedUser {
  id: string;
  principalId: string;
  principalKind: 'owner' | 'retailer_staff' | 'wholesaler_staff';
  fullName: string;
  userType: UserRole;
  roleName: string;
  permissions: string[];
  businessName: string | null;
  phoneNumber?: string | null;
  email?: string | null;
  profile?: {
    gstNumber?: string | null;
    businessCategory?: string | null;
    storeSize?: string | null;
  } | null;
}

export interface SignUpInput {
  fullName: string;
  businessName: string;
  userType: 'retailer' | 'wholesaler';
  email: string;
  password: string;
  phoneNumber: string;
}

export interface BusinessProfile {
  userId: string;
  role: UserRole;
  businessName: string;
  ownerName: string;
  phoneNumber: string;
  email: string;
  gstNumber: string;
  category: string;
  address: string;
}

interface RoleContextType {
  ready: boolean;
  user: AuthenticatedUser | null;
  isAuthenticated: boolean;
  role: UserRole;
  profile: BusinessProfile;
  permissions: string[];
  hasPermission: (permission: string) => boolean;
  login: (identifier: string, password: string) => Promise<void>;
  /** Adopts an already-issued session (token must be stored by the caller). Used by dev quick-login. */
  setSession: (user: AuthenticatedUser) => void;
  signup: (input: SignUpInput) => Promise<void>;
  verifyEmail: (email: string, otp: string) => Promise<void>;
  resendVerificationOtp: (email: string) => Promise<void>;
  logout: () => void;
  setRole: (role: UserRole) => void;
  toggleRole: () => void;
  retailerSubRole: RetailerSubRole;
  setRetailerSubRole: (subRole: RetailerSubRole) => void;
  wholesalerSubRole: WholesalerSubRole;
  setWholesalerSubRole: (subRole: WholesalerSubRole) => void;
  isPinUnlocked: boolean;
  pinModalOpen: boolean;
  setPinModalOpen: (open: boolean) => void;
  pendingProtectedAction: string | null;
  promptOwnerPin: (actionName?: string) => void;
  verifyPin: (pin: string) => Promise<boolean>;
  lockPin: () => void;
}

const RoleContext = createContext<RoleContextType | undefined>(undefined);
const responseError = (body: any, fallback: string): string =>
  typeof body?.error === 'string' ? body.error : body?.error?.message || body?.message || fallback;

export const RoleProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AuthenticatedUser | null>(null);
  const [ready, setReady] = useState(false);
  const [pinUnlockedUntil, setPinUnlockedUntil] = useState(0);
  const [pinModalOpen, setPinModalOpen] = useState(false);
  const [pendingProtectedAction, setPendingProtectedAction] = useState<string | null>(null);

  useEffect(() => {
    // Remove JWTs issued by older builds; authentication now relies exclusively on the HttpOnly cookie.
    sessionStorage.removeItem('sharvin_token');
    fetch('/api/v1/auth/me', { credentials: 'include' })
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok || !body.success) throw new Error('Session expired');
        setUser(body.data as AuthenticatedUser);
      })
      .catch(() => {
        setUser(null);
      })
      .finally(() => setReady(true));
  }, []);

  const login = async (identifier: string, password: string) => {
    const res = await fetch('/api/v1/auth/login', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier, password }),
    });
    const body = await res.json();
    if (!res.ok || !body.success || !body.data?.user) throw new Error(responseError(body, 'Sign in failed'));
    setUser(body.data.user as AuthenticatedUser);
    setPinUnlockedUntil(0);
  };

  const setSession = (nextUser: AuthenticatedUser) => {
    setUser(nextUser);
    setPinUnlockedUntil(0);
  };

  const signup = async (input: SignUpInput) => {
    const res = await fetch('/api/v1/auth/signup', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    const body = await res.json();
    if (!res.ok || !body.success || body.data?.status !== 'PENDING_VERIFICATION' || !body.data?.email) {
      throw new Error(responseError(body, 'Sign-up failed'));
    }
    sessionStorage.setItem('sharvin_pending_verification_email', body.data.email as string);
  };

  const verifyEmail = async (email: string, otp: string) => {
    const res = await fetch('/api/v1/auth/verify-email', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, otp }),
    });
    const body = await res.json();
    if (!res.ok || !body.success || !body.data?.user) {
      throw new Error(responseError(body, 'Email verification failed'));
    }
    sessionStorage.removeItem('sharvin_pending_verification_email');
    setUser(body.data.user as AuthenticatedUser);
    setPinUnlockedUntil(0);
  };

  const resendVerificationOtp = async (email: string) => {
    const res = await fetch('/api/v1/auth/resend-otp', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    const body = await res.json();
    if (!res.ok || !body.success) throw new Error(responseError(body, 'Unable to resend verification code'));
  };

  const logout = () => {
    sessionStorage.removeItem('sharvin_token');
    sessionStorage.removeItem('sharvin_pending_verification_email');
    setUser(null);
    setPinUnlockedUntil(0);
    setPinModalOpen(false);
  };

  const role = user?.userType ?? 'retailer';
  const permissions = user?.permissions ?? [];
  const hasPermission = (permission: string) => permissions.includes('*') || permissions.includes(permission);
  const profile = useMemo<BusinessProfile>(() => ({
    userId: user?.id ?? '',
    role,
    businessName: user?.businessName || 'Business account',
    ownerName: user?.fullName || '',
    phoneNumber: user?.phoneNumber || '',
    email: user?.email || '',
    gstNumber: user?.profile?.gstNumber || '',
    category: user?.profile?.businessCategory || '',
    address: '',
  }), [user, role]);

  const retailerSubRole: RetailerSubRole = user?.principalKind === 'owner'
    ? 'owner'
    : user?.roleName === 'retailer_manager' ? 'retailer_manager' : 'cashier';
  const wholesalerSubRole: WholesalerSubRole = user?.principalKind === 'owner'
    ? 'owner'
    : user?.roleName === 'wholesaler_manager' ? 'wholesaler_manager'
      : user?.roleName === 'godown_manager' ? 'godown_manager' : 'field_agent';
  const isPinUnlocked = retailerSubRole !== 'cashier' || pinUnlockedUntil > Date.now();

  const promptOwnerPin = (actionName?: string) => {
    setPendingProtectedAction(actionName || 'perform this action');
    setPinModalOpen(true);
  };
  const verifyPin = async (pin: string): Promise<boolean> => {
    try {
      const res = await fetch('/api/v1/auth/verify-owner-pin', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin }),
      });
      const body = await res.json();
      if (!res.ok || !body.success || !body.data?.verified) return false;
      setPinUnlockedUntil(body.data.unlockedUntil);
      setPinModalOpen(false);
      setPendingProtectedAction(null);
      return true;
    } catch {
      return false;
    }
  };

  const value: RoleContextType = {
    ready,
    user,
    isAuthenticated: Boolean(user),
    role,
    profile,
    permissions,
    hasPermission,
    login,
    setSession,
    signup,
    verifyEmail,
    resendVerificationOtp,
    logout,
    // Identity is established by login and cannot be changed by UI controls.
    setRole: () => undefined,
    toggleRole: () => undefined,
    retailerSubRole,
    setRetailerSubRole: () => undefined,
    wholesalerSubRole,
    setWholesalerSubRole: () => undefined,
    isPinUnlocked,
    pinModalOpen,
    setPinModalOpen,
    pendingProtectedAction,
    promptOwnerPin,
    verifyPin,
    lockPin: () => setPinUnlockedUntil(0),
  };

  return <RoleContext.Provider value={value}>{children}</RoleContext.Provider>;
};

export const useRole = () => {
  const context = useContext(RoleContext);
  if (!context) throw new Error('useRole must be used within a RoleProvider');
  return context;
};
