const WHOLESALER_PROFILE_FIELDS = [
  'gstNumber',
  'businessCategory',
  'description',
  'hasInventoryTracking',
  'defaultDeliveryRangeKm',
] as const;

const RETAILER_PROFILE_FIELDS = [
  'gstNumber',
  'businessCategory',
  'storeSize',
  'reorderPrefPrice',
  'reorderPrefRelationship',
  'reorderPrefDistance',
  'reorderPrefSpeed',
  'reorderBufferDays',
  'stockAlertTime1',
  'stockAlertTime2',
] as const;

/** Auth endpoints expose operational profile metadata, never credential or banking fields. */
export function toSafeTenantProfile(
  userType: string,
  profile: Record<string, unknown> | null | undefined,
): Record<string, unknown> | null {
  if (!profile) return null;
  const fields = userType === 'wholesaler'
    ? WHOLESALER_PROFILE_FIELDS
    : userType === 'retailer'
      ? RETAILER_PROFILE_FIELDS
      : [];
  return Object.fromEntries(fields.flatMap((field) => field in profile ? [[field, profile[field]]] : []));
}
