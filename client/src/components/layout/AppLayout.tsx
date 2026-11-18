import React, { useEffect, useMemo, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  Bell,
  BookOpen,
  Boxes,
  ChevronRight,
  ClipboardList,
  Columns3,
  FileSpreadsheet,
  Home,
  LogOut,
  Menu,
  Package,
  Settings,
  ShoppingCart,
  Store,
  Truck,
  Users,
  X,
  Zap,
} from 'lucide-react';
import { useRole } from '../../context/RoleContext';
import { OwnerPinModal } from '../auth/OwnerPinModal';
import { ModalBackdrop } from '../ui/DismissOnOutsideClick';
import { CaGstr1ExportModal } from '../../modules/invoice/CaGstr1ExportModal';
import { ShiftCloseModal } from '../../modules/pos/ShiftCloseModal';
import logoText from '../../assets/logo_text.png';
import {
  ActivityItem,
  BadgeCounts,
  badgeCountForPath,
  emptyBadges,
  fetchActivityAndBadges,
  formatActivityTime,
} from '../../modules/notifications/notificationService';

interface NavigationItem {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  permission: string;
}

const retailerTabs: NavigationItem[] = [
  { to: '/pos', label: 'Home', icon: Store, permission: 'pos.sell' },
  { to: '/network', label: 'Catalog', icon: Boxes, permission: 'orders.read' },
  { to: '/orders', label: 'Orders', icon: ClipboardList, permission: 'orders.read' },
  { to: '/ledger', label: 'Khata', icon: BookOpen, permission: 'ledger.read' },
];

const wholesalerTabs: NavigationItem[] = [
  { to: '/wholesaler/orders', label: 'Home', icon: Home, permission: 'orders.read' },
  { to: '/wholesaler/catalog', label: 'Inventory', icon: Package, permission: 'catalog.read' },
  { to: '/orders', label: 'Kanban', icon: Columns3, permission: 'orders.read' },
  { to: '/ledger', label: 'Khata', icon: BookOpen, permission: 'ledger.read' },
];

const activityColor: Record<ActivityItem['category'], string> = {
  notification: 'bg-blue-500',
  stock_alert: 'bg-rose-500',
  order: 'bg-violet-500',
  rate: 'bg-amber-500',
  delivery: 'bg-emerald-500',
};

export const AppLayout: React.FC = () => {
  const { role, profile, user, logout, hasPermission } = useRole();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [gstrOpen, setGstrOpen] = useState(false);
  const [shiftCloseOpen, setShiftCloseOpen] = useState(false);
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [badges, setBadges] = useState<BadgeCounts>(emptyBadges);
  const location = useLocation();
  const navigate = useNavigate();

  const tabs = useMemo(
    () => (role === 'retailer' ? retailerTabs : wholesalerTabs).filter((item) => hasPermission(item.permission)),
    [role, hasPermission],
  );

  useEffect(() => {
    let active = true;
    const load = async () => {
      const result = await fetchActivityAndBadges();
      if (!active || !result) return;
      setActivities(result.activities);
      setBadges(result.badges);
    };
    void load();
    const interval = window.setInterval(load, 30_000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [role, location.pathname]);

  useEffect(() => setDrawerOpen(false), [location.pathname]);

  const go = (path: string) => {
    setDrawerOpen(false);
    navigate(path);
  };

  const handleLogoutRequest = () => {
    const roleName = String(user?.roleName || '').trim().toUpperCase();
    if (roleName.includes('OWNER')) {
      logout();
      return;
    }
    if (roleName === 'COUNTER_STAFF') {
      setDrawerOpen(false);
      setShiftCloseOpen(true);
      return;
    }
    logout();
  };

  const handleShiftClose = (expectedCash: number) => {
    console.log('[EOD Galla] Shift close discrepancy', {
      expectedCash,
      recordedCash: null,
      discrepancy: null,
      note: 'Recorded cash total will be connected in the backend phase.',
    });
    setShiftCloseOpen(false);
    logout();
  };

  const initials = (profile.ownerName || user?.fullName || 'SV')
    .split(' ')
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  const secondaryItems: NavigationItem[] = role === 'retailer'
    ? [
        { to: '/inventory', label: 'Stock & Alerts', icon: Zap, permission: 'inventory.read' },
        { to: '/cart', label: 'Restock Cart', icon: ShoppingCart, permission: 'orders.manage' },
        { to: '/deliveries', label: 'Deliveries', icon: Truck, permission: 'delivery.read' },
        { to: '/settings/business', label: 'Business Settings', icon: Settings, permission: '*' },
      ]
    : [
        { to: '/deliveries', label: 'Driver Dispatch', icon: Truck, permission: 'delivery.read' },
        { to: '/wholesaler/requests', label: 'Connection Requests', icon: Users, permission: 'orders.read' },
        { to: '/settings/business', label: 'Business Settings', icon: Settings, permission: '*' },
      ];

  return (
    <div className="min-h-screen overflow-x-hidden bg-slate-50 text-slate-900">
      <header className="sticky top-0 z-40 h-14 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-full max-w-6xl items-center justify-between px-3 sm:px-5">
          <button type="button" onClick={() => setDrawerOpen(true)} className="grid h-10 w-10 place-items-center rounded-full text-slate-700 active:bg-slate-100" aria-label="Open profile and settings">
            <Menu className="h-6 w-6" />
          </button>

          <button type="button" onClick={() => go(role === 'retailer' ? '/pos' : '/wholesaler/orders')} className="flex min-w-0 flex-1 items-center gap-2 px-2 text-left">
            <span className="block shrink-0 overflow-hidden rounded-lg bg-slate-900">
              <img src={logoText} alt="SharVin" className="h-10 w-28 object-cover object-center sm:w-32" />
            </span>
            <span className="hidden min-w-0 sm:block">
              <span className="block truncate text-[10px] font-medium text-slate-500">{role === 'retailer' ? 'Retail shop' : 'Wholesale business'}</span>
              <span className="block truncate text-sm font-bold leading-tight text-slate-900">{profile.businessName}</span>
            </span>
          </button>

          <button type="button" onClick={() => setDrawerOpen(true)} className="relative grid h-10 w-10 place-items-center rounded-full bg-blue-600 text-sm font-bold text-white" aria-label="Open account menu">
            {initials}
            {badges.unreadNotifications > 0 && <span className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full border-2 border-white bg-rose-500" />}
          </button>
        </div>
      </header>

      <main className="mx-auto min-h-[calc(100vh-3.5rem)] w-full max-w-6xl px-3 pb-24 pt-3 sm:px-5 sm:pt-5">
        <Outlet />
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/98 pb-[env(safe-area-inset-bottom)] shadow-[0_-2px_12px_rgba(15,23,42,0.06)]" aria-label="Primary navigation">
        <div className="mx-auto grid h-16 max-w-xl grid-cols-4">
          {tabs.map((item) => {
            const Icon = item.icon;
            const count = badgeCountForPath(item.to, role, badges);
            return (
              <NavLink key={item.to} to={item.to} end className={({ isActive }) => `relative flex min-w-0 flex-col items-center justify-center gap-0.5 px-1 transition-colors ${isActive ? 'text-blue-600' : 'text-slate-500 active:bg-slate-50'}`}>
                {({ isActive }) => (
                  <>
                    <span className={`relative grid h-8 min-w-11 place-items-center rounded-full px-3 ${isActive ? 'bg-blue-50' : ''}`}>
                      <Icon className={`h-6 w-6 ${isActive ? 'stroke-[2.4]' : 'stroke-2'}`} />
                      {count > 0 && <span className="absolute right-0 top-0 min-w-4 rounded-full bg-rose-500 px-1 text-center text-[9px] font-bold leading-4 text-white">{count > 99 ? '99+' : count}</span>}
                    </span>
                    <span className={`truncate text-[10px] ${isActive ? 'font-bold' : 'font-medium'}`}>{item.label}</span>
                  </>
                )}
              </NavLink>
            );
          })}
        </div>
      </nav>

      {drawerOpen && (
        <ModalBackdrop onClose={() => setDrawerOpen(false)} className="fixed inset-0 z-50 flex justify-start bg-slate-950/35">
          <section className="flex h-full w-[88%] max-w-sm flex-col bg-white shadow-2xl" role="dialog" aria-modal="true" aria-label="Profile and settings">
            <div className="border-b border-slate-100 p-4">
              <div className="flex items-center justify-between">
                <div className="grid h-12 w-12 place-items-center rounded-full bg-blue-600 text-base font-bold text-white">{initials}</div>
                <button type="button" onClick={() => setDrawerOpen(false)} className="grid h-10 w-10 place-items-center rounded-full text-slate-500 active:bg-slate-100" aria-label="Close menu"><X className="h-6 w-6" /></button>
              </div>
              <h2 className="mt-3 truncate text-lg font-bold">{profile.businessName}</h2>
              <p className="truncate text-sm text-slate-500">{user?.fullName} · {user?.roleName?.replaceAll('_', ' ') || role}</p>
            </div>

            <div className="flex-1 overflow-y-auto p-3">
              <p className="px-3 pb-2 pt-1 text-[11px] font-bold uppercase tracking-wider text-slate-400">More</p>
              <div className="space-y-1">
                {secondaryItems.filter((item) => hasPermission(item.permission)).map((item) => {
                  const Icon = item.icon;
                  return (
                    <button key={item.to} type="button" onClick={() => go(item.to)} className="flex min-h-12 w-full items-center gap-3 rounded-xl px-3 text-left text-sm font-semibold text-slate-700 active:bg-slate-100">
                      <span className="grid h-9 w-9 place-items-center rounded-full bg-slate-100 text-slate-600"><Icon className="h-5 w-5" /></span>
                      <span className="flex-1">{item.label}</span>
                      <ChevronRight className="h-4 w-4 text-slate-400" />
                    </button>
                  );
                })}

                {role === 'wholesaler' && hasPermission('ledger.manage') && (
                  <button type="button" onClick={() => { setDrawerOpen(false); setGstrOpen(true); }} className="flex min-h-12 w-full items-center gap-3 rounded-xl px-3 text-left text-sm font-semibold text-slate-700 active:bg-slate-100">
                    <span className="grid h-9 w-9 place-items-center rounded-full bg-slate-100 text-slate-600"><FileSpreadsheet className="h-5 w-5" /></span>
                    <span className="flex-1">Export GSTR-1</span>
                    <ChevronRight className="h-4 w-4 text-slate-400" />
                  </button>
                )}
              </div>

              <div className="mt-5 border-t border-slate-100 pt-4">
                <div className="flex items-center gap-2 px-3 pb-2">
                  <Bell className="h-4 w-4 text-slate-500" />
                  <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Recent activity</p>
                </div>
                <div className="space-y-1">
                  {activities.length === 0 ? <p className="px-3 py-4 text-sm text-slate-400">No recent activity</p> : activities.slice(0, 4).map((activity) => (
                    <div key={activity.id} className="flex gap-3 rounded-xl px-3 py-2.5">
                      <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${activityColor[activity.category]}`} />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-800">{activity.title}</p>
                        <p className="line-clamp-2 text-xs text-slate-500">{activity.message}</p>
                        <p className="mt-0.5 text-[10px] text-slate-400">{formatActivityTime(activity.createdAt)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="border-t border-slate-100 p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
              <button type="button" onClick={handleLogoutRequest} className="flex min-h-12 w-full items-center gap-3 rounded-xl px-3 text-left text-sm font-bold text-rose-600 active:bg-rose-50">
                <span className="grid h-9 w-9 place-items-center rounded-full bg-rose-50"><LogOut className="h-5 w-5" /></span>
                Sign out
              </button>
            </div>
          </section>
        </ModalBackdrop>
      )}

      {gstrOpen && <CaGstr1ExportModal onClose={() => setGstrOpen(false)} />}
      {shiftCloseOpen && (
        <ShiftCloseModal
          onCancel={() => setShiftCloseOpen(false)}
          onSubmit={handleShiftClose}
        />
      )}
      <OwnerPinModal />
    </div>
  );
};
