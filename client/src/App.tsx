import React from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { RoleProvider, useRole } from './context/RoleContext';
import { AppLayout } from './components/layout/AppLayout';
import { RequireAuth, ProtectedViewGuard } from './components/auth/ProtectedViewGuard';
import { LoginView } from './modules/auth/LoginView';
import { SignupView } from './modules/auth/SignupView';
import { BusinessSettingsView } from './modules/auth/BusinessSettingsView';
import { PosBillingView } from './modules/pos/PosBillingView';
import { LowStockAlertsView } from './modules/inventory/LowStockAlertsView';
import { WholesaleCartView } from './modules/cart/WholesaleCartView';
import { OrdersKanbanView } from './modules/orders/OrdersKanbanView';
import { DeliveryHandoverView } from './modules/delivery/DeliveryHandoverView';
import { B2BLedgerView } from './modules/ledger/B2BLedgerView';
import { WholesalerWorkspaceView } from './modules/wholesaler/WholesalerWorkspaceView';
import { WarehouseCatalogView } from './modules/wholesaler/WarehouseCatalogView';
import NetworkDiscoveryView from './modules/wholesaler/NetworkDiscoveryView';
import ConnectionRequestsView from './modules/wholesaler/ConnectionRequestsView';
import { E2EWorkflowTourView } from './modules/e2e/E2EWorkflowTourView';
import { PublicInvoiceVerifyView } from './modules/invoice/PublicInvoiceVerifyView';
import { DriverMobileDispatchView } from './modules/delivery/DriverMobileDispatchView';
import { LandingPageView } from './modules/public/LandingPageView';

const PublicHomeRoute: React.FC = () => {
  const { ready, isAuthenticated, role } = useRole();
  if (!ready) {
    return <div className="grid min-h-screen place-items-center bg-white text-sm font-semibold text-slate-500">Loading SharVin…</div>;
  }
  if (isAuthenticated) {
    return <Navigate to={role === 'wholesaler' ? '/wholesaler/orders' : role === 'retailer' ? '/pos' : '/forbidden'} replace />;
  }
  return <LandingPageView />;
};

const ForbiddenView: React.FC = () => {
  const { role, user } = useRole();
  const location = useLocation();
  return (
    <main className="min-h-screen grid place-items-center bg-slate-50 p-6">
      <section className="max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <h1 className="text-xl font-bold text-slate-900">Access not granted</h1>
        <p className="mt-2 text-sm text-slate-600">Your {user?.roleName || role} account does not have permission to open this page.</p>
        <p className="mt-1 break-all text-xs text-slate-400">{location.state?.from || ''}</p>
        <a href="/" className="mt-5 inline-flex rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white">Return to your workspace</a>
      </section>
    </main>
  );
};

export default function App() {
  return (
    <BrowserRouter>
      <RoleProvider>
        <>
        <Routes>
          <Route path="/" element={<PublicHomeRoute />} />
          <Route path="/login" element={<LoginView />} />
          <Route path="/signup" element={<SignupView />} />
          <Route path="/verify/invoice/:invoiceId" element={<PublicInvoiceVerifyView />} />
          <Route path="/driver/dispatch/:token" element={<DriverMobileDispatchView />} />
          <Route element={<RequireAuth />}>
            <Route path="/forbidden" element={<ForbiddenView />} />
            <Route element={<AppLayout />}>
              <Route path="settings/business" element={<ProtectedViewGuard permission="*"><BusinessSettingsView /></ProtectedViewGuard>} />
              <Route path="pos" element={<ProtectedViewGuard permission="pos.sell" allowedRoles={['retailer']}><PosBillingView /></ProtectedViewGuard>} />
              <Route path="inventory" element={<ProtectedViewGuard permission="inventory.read" allowedRoles={['retailer']}><LowStockAlertsView /></ProtectedViewGuard>} />
              <Route path="cart" element={<ProtectedViewGuard permission="orders.manage" allowedRoles={['retailer']}><WholesaleCartView /></ProtectedViewGuard>} />
              <Route path="orders" element={<ProtectedViewGuard permission="orders.read"><OrdersKanbanView /></ProtectedViewGuard>} />
              <Route path="deliveries" element={<ProtectedViewGuard permission="delivery.read"><DeliveryHandoverView /></ProtectedViewGuard>} />
              <Route path="ledger" element={<ProtectedViewGuard permission="ledger.read"><B2BLedgerView /></ProtectedViewGuard>} />
              <Route path="wholesaler/orders" element={<ProtectedViewGuard permission="orders.read" allowedRoles={['wholesaler']}><WholesalerWorkspaceView /></ProtectedViewGuard>} />
              <Route path="wholesaler/catalog" element={<ProtectedViewGuard permission="catalog.read" allowedRoles={['wholesaler']}><WarehouseCatalogView /></ProtectedViewGuard>} />
              <Route path="network" element={<ProtectedViewGuard permission="orders.read" allowedRoles={['retailer']}><NetworkDiscoveryView /></ProtectedViewGuard>} />
              <Route path="wholesaler/requests" element={<ProtectedViewGuard permission="orders.read" allowedRoles={['wholesaler']}><ConnectionRequestsView /></ProtectedViewGuard>} />
            </Route>
            <Route path="/dev/smoke" element={<ProtectedViewGuard permission="*"><E2EWorkflowTourView onFinishTour={() => { window.location.href = '/'; }} /></ProtectedViewGuard>} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        </>
      </RoleProvider>
    </BrowserRouter>
  );
}
