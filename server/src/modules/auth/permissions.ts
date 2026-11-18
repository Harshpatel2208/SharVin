export const PERMISSIONS = [
  'pos.read', 'pos.sell',
  'inventory.read', 'inventory.manage',
  'orders.read', 'orders.manage', 'orders.accept', 'orders.fulfill',
  'catalog.read', 'catalog.manage',
  'delivery.read', 'delivery.manage',
  'ledger.read', 'ledger.manage', 'credit.manage',
  'staff.manage',
] as const;

export type Permission = typeof PERMISSIONS[number];
export type PrincipalKind = 'owner' | 'retailer_staff' | 'wholesaler_staff';

const ROLE_PERMISSIONS: Record<string, Permission[]> = {
  cashier: ['pos.read', 'pos.sell'],
  retailer_manager: [
    'pos.read', 'pos.sell', 'inventory.read', 'inventory.manage', 'orders.read', 'orders.manage',
    'catalog.read', 'delivery.read', 'delivery.manage',
  ],
  wholesaler_manager: [
    'orders.read', 'orders.manage', 'orders.accept', 'orders.fulfill', 'catalog.read', 'catalog.manage',
    'inventory.read', 'inventory.manage', 'delivery.read', 'delivery.manage', 'ledger.read',
  ],
  godown_manager: [
    'orders.read', 'orders.fulfill', 'catalog.read', 'catalog.manage', 'inventory.read',
    'inventory.manage', 'delivery.read', 'delivery.manage',
  ],
  field_agent: ['orders.read', 'delivery.read', 'delivery.manage'],
};

export function defaultPermissionsForRole(roleName: string): Permission[] {
  return [...(ROLE_PERMISSIONS[roleName] ?? [])];
}

export function isPermission(value: string): value is Permission {
  return (PERMISSIONS as readonly string[]).includes(value);
}

export function resolvePermissions(roleName: string, overrides: Array<{ permissionKey: string; isEnabled: boolean }>): Permission[] {
  let permissions = defaultPermissionsForRole(roleName);
  for (const row of overrides) {
    if (!isPermission(row.permissionKey)) continue;
    permissions = row.isEnabled
      ? [...new Set([...permissions, row.permissionKey])]
      : permissions.filter((permission) => permission !== row.permissionKey);
  }
  return permissions;
}

export function rolesForTenant(userType: 'retailer' | 'wholesaler' | 'driver'): string[] {
  if (userType === 'retailer') return ['cashier', 'retailer_manager'];
  if (userType === 'wholesaler') return ['wholesaler_manager', 'godown_manager', 'field_agent'];
  return [];
}
