const STATUS_SECRET_FIELDS = ['driverAccessToken', 'trackingUrl', 'handoverCode'] as const;

/** Defense-in-depth guard: general participant status must never contain bearer capabilities or OTPs. */
export function redactDeliveryStatusSecrets<T extends Record<string, unknown>>(
  status: T,
): Omit<T, (typeof STATUS_SECRET_FIELDS)[number]> {
  const safe = { ...status };
  for (const field of STATUS_SECRET_FIELDS) delete safe[field];
  return safe;
}
