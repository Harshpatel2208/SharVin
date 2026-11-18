/**
 * SharVin production bootstrap seed.
 *
 * This script is intentionally idempotent and non-destructive. It creates only:
 *   1. The base product categories required by the catalog UI.
 *   2. One official founder/owner account configured through environment variables.
 *
 * It never truncates tables and contains no demo businesses, products, inventory,
 * connections, ledgers, orders, deliveries, or test credentials.
 *
 * The current identity schema has no platform-admin UserType. The founder is therefore
 * provisioned as an owner-level wholesaler tenant, which receives the existing owner
 * permission set and can authenticate through the normal production login flow.
 */
import { PrismaClient, UserType } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const BASE_CATEGORIES = [
  'Staples',
  'Snacks & Beverages',
  'Home Care',
  'Personal Care',
] as const;

function requireEnvironmentValue(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required to run the production seed.`);
  }
  return value;
}

function validateFounderConfiguration() {
  const email = requireEnvironmentValue('MASTER_ADMIN_EMAIL').toLowerCase();
  const password = requireEnvironmentValue('MASTER_ADMIN_PASSWORD');
  const ownerPin = requireEnvironmentValue('MASTER_ADMIN_OWNER_PIN');
  const fullName = requireEnvironmentValue('MASTER_ADMIN_NAME');
  const businessName = requireEnvironmentValue('MASTER_ADMIN_BUSINESS_NAME');
  const phoneNumber = process.env.MASTER_ADMIN_PHONE?.trim() || null;

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('MASTER_ADMIN_EMAIL must be a valid email address.');
  }
  if (password.length < 12) {
    throw new Error('MASTER_ADMIN_PASSWORD must contain at least 12 characters.');
  }
  if (!/^\d{4}$/.test(ownerPin)) {
    throw new Error('MASTER_ADMIN_OWNER_PIN must be exactly 4 digits.');
  }
  if (fullName.length < 2 || businessName.length < 2) {
    throw new Error('MASTER_ADMIN_NAME and MASTER_ADMIN_BUSINESS_NAME must contain at least 2 characters.');
  }

  return { email, password, ownerPin, fullName, businessName, phoneNumber };
}

async function main(): Promise<void> {
  const founder = validateFounderConfiguration();
  const [passwordHash, ownerPinHash] = await Promise.all([
    bcrypt.hash(founder.password, 12),
    bcrypt.hash(founder.ownerPin, 12),
  ]);

  await prisma.$transaction(async (tx) => {
    for (const categoryName of BASE_CATEGORIES) {
      const existingCategory = await tx.productCategory.findFirst({
        where: { categoryName },
        select: { id: true },
      });
      if (!existingCategory) {
        await tx.productCategory.create({ data: { categoryName, isActive: true } });
      }
    }

    const existingFounder = await tx.user.findUnique({
      where: { email: founder.email },
      select: { id: true, userType: true },
    });
    if (existingFounder && existingFounder.userType !== UserType.wholesaler) {
      throw new Error('MASTER_ADMIN_EMAIL already belongs to a non-wholesaler account. Refusing to change its tenant type.');
    }

    const user = existingFounder
      ? await tx.user.update({
          where: { id: existingFounder.id },
          data: {
            fullName: founder.fullName,
            businessName: founder.businessName,
            passwordHash,
            isActive: true,
            isVerified: true,
            isEmailVerified: true,
            ...(founder.phoneNumber ? { phoneNumber: founder.phoneNumber } : {}),
          },
        })
      : await tx.user.create({
          data: {
            email: founder.email,
            phoneNumber: founder.phoneNumber,
            passwordHash,
            userType: UserType.wholesaler,
            fullName: founder.fullName,
            businessName: founder.businessName,
            isActive: true,
            isVerified: true,
            isEmailVerified: true,
          },
        });

    await tx.wholesalerProfile.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        businessCategory: 'Platform Administration',
        ownerPinHash,
        failedPinAttempts: 0,
        pinLockedUntil: null,
      },
      update: {
        businessCategory: 'Platform Administration',
        ownerPinHash,
        failedPinAttempts: 0,
        pinLockedUntil: null,
      },
    });
  });

  console.log(`Production bootstrap complete: ${BASE_CATEGORIES.length} base categories and one founder owner account are ready.`);
}

main()
  .catch((error: unknown) => {
    console.error('Production seed failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
