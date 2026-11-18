import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { createHmac, randomBytes, randomInt, timingSafeEqual } from 'crypto';
import { prisma } from '../../db';
import { Logger } from '../../utils/logger';
import { RegisterInput, LoginInput } from './auth.validation';
import { JwtAuthPayload } from '../../types/auth.types';
import { getJwtSecret } from '../../config/security';
import { AppError, AppErrorCode } from '../../utils/app-error';
import { defaultPermissionsForRole, resolvePermissions, rolesForTenant } from './permissions';
import { BrevoRecipientRejectedError, EmailService } from '../../services/email.service';
import { toSafeTenantProfile } from './auth-response';
import { isDevAuthEnabled } from './auth-dev';

const JWT_EXPIRES_IN = '8h';
const EMAIL_OTP_TTL_MS = 10 * 60 * 1000;
const EMAIL_OTP_RESEND_COOLDOWN_MS = 60 * 1000;
const EMAIL_OTP_MAX_ATTEMPTS = 5;

function createEmailOtpHash(email: string, otp: string): string {
  return createHmac('sha256', getJwtSecret()).update(`${email.toLowerCase()}:${otp}`).digest('hex');
}

function hashesMatch(expected: string, actual: string): boolean {
  const expectedBytes = Buffer.from(expected, 'hex');
  const actualBytes = Buffer.from(actual, 'hex');
  return expectedBytes.length === actualBytes.length && timingSafeEqual(expectedBytes, actualBytes);
}

export class AuthService {
  static async getProfile(userId: string, role: string) {
    if (!['retailer', 'wholesaler'].includes(role)) {
      throw new AppError(AppErrorCode.FORBIDDEN, 'Business profile settings are only available to retailer and wholesaler owners', 403);
    }
    const user = await prisma.user.findFirst({
      where: { id: userId, userType: role as 'retailer' | 'wholesaler', isActive: true },
      include: { retailerProfile: true, wholesalerProfile: true, addresses: { orderBy: { isPrimary: 'desc' }, take: 1 } },
    });
    if (!user) throw new AppError(AppErrorCode.NOT_FOUND, 'Business profile not found', 404);
    const profile = role === 'retailer' ? user.retailerProfile : user.wholesalerProfile;
    return {
      tradeName: user.businessName || '',
      gstin: profile?.gstNumber || '',
      address: user.addresses[0] ? {
        addressLine1: user.addresses[0].addressLine1,
        addressLine2: user.addresses[0].addressLine2 || '',
        city: user.addresses[0].city,
        state: user.addresses[0].state,
        postalCode: user.addresses[0].postalCode,
      } : { addressLine1: '', addressLine2: '', city: '', state: '', postalCode: '' },
      deliveryRadiusKm: role === 'wholesaler' ? Number(user.wholesalerProfile?.defaultDeliveryRangeKm ?? 0) : null,
    };
  }

  static async updateProfile(userId: string, role: string, data: {
    tradeName: string;
    gstin: string;
    address: { addressLine1: string; addressLine2?: string; city: string; state: string; postalCode: string };
    deliveryRadiusKm: number | null;
  }) {
    if (!['retailer', 'wholesaler'].includes(role)) {
      throw new AppError(AppErrorCode.FORBIDDEN, 'Business profile settings are only available to retailer and wholesaler owners', 403);
    }
    const gstin = data.gstin.trim().toUpperCase();
    if (gstin && !/^[A-Z0-9]{15}$/.test(gstin)) {
      throw new AppError(AppErrorCode.BAD_REQUEST, 'GSTIN must contain exactly 15 alphanumeric characters', 400);
    }
    const radius = data.deliveryRadiusKm === null ? null : Number(data.deliveryRadiusKm);
    if (role === 'wholesaler' && (radius === null || !Number.isFinite(radius) || radius < 0 || radius > 500)) {
      throw new AppError(AppErrorCode.BAD_REQUEST, 'Delivery radius must be between 0 and 500 km', 400);
    }
    const businessAddress = data.address;
    if (![businessAddress.addressLine1, businessAddress.city, businessAddress.state, businessAddress.postalCode].every((part) => part?.trim())) {
      throw new AppError(AppErrorCode.BAD_REQUEST, 'Address line, city, state and postal code are required', 400);
    }

    await prisma.$transaction(async (tx) => {
      const user = await tx.user.findFirst({
        where: { id: userId, userType: role as 'retailer' | 'wholesaler', isActive: true },
        include: { retailerProfile: true, wholesalerProfile: true, addresses: { orderBy: { isPrimary: 'desc' }, take: 1 } },
      });
      if (!user) throw new AppError(AppErrorCode.NOT_FOUND, 'Business profile not found', 404);
      await tx.user.update({ where: { id: userId }, data: { businessName: data.tradeName.trim() } });
      if (role === 'retailer' && user.retailerProfile) {
        await tx.retailerProfile.update({ where: { userId }, data: { gstNumber: gstin || null } });
      } else if (role === 'wholesaler' && user.wholesalerProfile) {
        await tx.wholesalerProfile.update({ where: { userId }, data: { gstNumber: gstin || null, defaultDeliveryRangeKm: radius! } });
      } else {
        throw new AppError(AppErrorCode.NOT_FOUND, 'Business profile not found', 404);
      }
      const addressData = {
        addressLine1: businessAddress.addressLine1.trim(),
        addressLine2: businessAddress.addressLine2?.trim() || null,
        city: businessAddress.city.trim(),
        state: businessAddress.state.trim(),
        postalCode: businessAddress.postalCode.trim(),
      };
      const currentAddress = user.addresses[0];
      if (currentAddress) {
        await tx.address.update({ where: { id: currentAddress.id }, data: addressData });
      } else {
        await tx.address.create({ data: { ...addressData, userId, isPrimary: true } });
      }
    });
    return this.getProfile(userId, role);
  }

  static async updateOwnerPin(userId: string, role: string, newPin: string) {
    if (role !== 'retailer' && role !== 'wholesaler') {
      throw new AppError(AppErrorCode.FORBIDDEN, 'Only a business owner can update the Master PIN', 403);
    }
    if (!/^\d{4}$/.test(newPin)) throw new AppError(AppErrorCode.BAD_REQUEST, 'PIN must be exactly 4 digits', 400);
    const passwordHash = await bcrypt.hash(newPin, 12);
    const user = await prisma.user.findFirst({
      where: { id: userId, userType: role as 'retailer' | 'wholesaler', isActive: true },
      select: { id: true },
    });
    if (!user) throw new AppError(AppErrorCode.NOT_FOUND, 'Business owner not found', 404);
    if (role === 'retailer') {
      await prisma.retailerProfile.update({
        where: { userId },
        data: { ownerPinHash: passwordHash, failedPinAttempts: 0, pinLockedUntil: null },
      });
    } else {
      await prisma.wholesalerProfile.update({
        where: { userId },
        data: { ownerPinHash: passwordHash, failedPinAttempts: 0, pinLockedUntil: null },
      });
    }
    return { success: true, message: 'Master Owner PIN updated successfully' };
  }

  static generateToken(payload: JwtAuthPayload): string {
    return jwt.sign(payload, getJwtSecret(), { expiresIn: JWT_EXPIRES_IN, issuer: 'sharvin-api', audience: 'sharvin-clients' });
  }

  static async register(input: RegisterInput) {
    const email = input.email.trim().toLowerCase();
    await EmailService.assertEmailDomainHasMx(email);
    try {
      EmailService.assertConfigured();
    } catch {
      throw new AppError(AppErrorCode.INTERNAL_SERVER_ERROR, 'Email verification is temporarily unavailable. Please try again later.', 503);
    }
    const [ownerByPhone, retailerStaffByPhone, wholesalerStaffByPhone, ownerByEmail, retailerStaffByEmail, wholesalerStaffByEmail] = await Promise.all([
      prisma.user.findUnique({ where: { phoneNumber: input.phoneNumber } }),
      prisma.retailerSubUser.findFirst({ where: { phoneNumber: input.phoneNumber } }),
      prisma.wholesalerSubUser.findUnique({ where: { phoneNumber: input.phoneNumber } }),
      prisma.user.findUnique({ where: { email } }),
      prisma.retailerSubUser.findFirst({ where: { email } }),
      prisma.wholesalerSubUser.findUnique({ where: { email } }),
    ]);
    if (ownerByPhone || retailerStaffByPhone || wholesalerStaffByPhone || ownerByEmail || retailerStaffByEmail || wholesalerStaffByEmail) {
      throw new AppError(AppErrorCode.CONFLICT, 'An account with the provided details may already exist', 409);
    }

    // Hash password
    const saltRounds = 12;
    const passwordHash = await bcrypt.hash(input.password, saltRounds);
    const otp = randomInt(0, 1_000_000).toString().padStart(6, '0');
    const verificationOtp = createEmailOtpHash(email, otp);
    const now = new Date();

    // Create user and profile atomically
    const user = await prisma.$transaction(async (tx) => {
      const newUser = await tx.user.create({
        data: {
          fullName: input.fullName,
          phoneNumber: input.phoneNumber,
          email,
          passwordHash,
          userType: input.userType,
          businessName: input.businessName || null,
          isEmailVerified: false,
          verificationOtp,
          verificationOtpExpiresAt: new Date(now.getTime() + EMAIL_OTP_TTL_MS),
          verificationOtpAttempts: 0,
          verificationOtpLastSentAt: now,
        },
      });

      if (input.userType === 'wholesaler') {
        await tx.wholesalerProfile.create({
          data: {
            userId: newUser.id,
            gstNumber: input.gstNumber || null,
            businessCategory: input.businessCategory || null,
          },
        });
      } else if (input.userType === 'retailer') {
        await tx.retailerProfile.create({
          data: {
            userId: newUser.id,
            gstNumber: input.gstNumber || null,
            businessCategory: input.businessCategory || null,
            storeSize: input.storeSize || null,
          },
        });
      }

      return newUser;
    });

    try {
      await EmailService.sendVerificationOtpEmail(email, user.fullName, user.businessName || '', user.userType, otp);
    } catch (error) {
      if (error instanceof BrevoRecipientRejectedError) {
        await prisma.user.deleteMany({ where: { id: user.id, isEmailVerified: false, verificationOtp } });
        throw new AppError(AppErrorCode.BAD_REQUEST, 'We could not deliver to this email address. Please check it or use another address.', 400);
      }
      await prisma.user.updateMany({
        where: { id: user.id, verificationOtp },
        data: { verificationOtp: null, verificationOtpExpiresAt: null, verificationOtpLastSentAt: null, verificationOtpAttempts: 0 },
      });
      throw new AppError(AppErrorCode.INTERNAL_SERVER_ERROR, 'We could not send the verification email. Please try again shortly.', 503);
    }

    return {
      status: 'PENDING_VERIFICATION' as const,
      email,
      message: 'Verification code sent to your email',
    };
  }

  static async verifyEmail(emailInput: string, otp: string) {
    const email = emailInput.trim().toLowerCase();
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || user.isEmailVerified || !user.verificationOtp || !user.verificationOtpExpiresAt) {
      throw new AppError(AppErrorCode.BAD_REQUEST, 'Invalid or expired verification code', 400);
    }

    const now = new Date();
    if (user.verificationOtpExpiresAt <= now) {
      await prisma.user.updateMany({
        where: { id: user.id, isEmailVerified: false },
        data: { verificationOtp: null, verificationOtpExpiresAt: null, verificationOtpAttempts: 0 },
      });
      throw new AppError(AppErrorCode.BAD_REQUEST, 'Verification code expired. Request a new code.', 400);
    }
    if (user.verificationOtpAttempts >= EMAIL_OTP_MAX_ATTEMPTS) {
      throw new AppError(AppErrorCode.BAD_REQUEST, 'Too many incorrect codes. Request a new code.', 400);
    }

    const candidateHash = createEmailOtpHash(email, otp);
    if (!hashesMatch(user.verificationOtp, candidateHash)) {
      await prisma.user.updateMany({
        where: { id: user.id, isEmailVerified: false, verificationOtp: user.verificationOtp, verificationOtpAttempts: { lt: EMAIL_OTP_MAX_ATTEMPTS } },
        data: { verificationOtpAttempts: { increment: 1 } },
      });
      const latest = await prisma.user.findUnique({ where: { id: user.id }, select: { verificationOtpAttempts: true } });
      if ((latest?.verificationOtpAttempts ?? 0) >= EMAIL_OTP_MAX_ATTEMPTS) {
        await prisma.user.updateMany({
          where: { id: user.id, isEmailVerified: false, verificationOtp: user.verificationOtp },
          data: { verificationOtp: null, verificationOtpExpiresAt: null, verificationOtpAttempts: 0 },
        });
      }
      throw new AppError(AppErrorCode.BAD_REQUEST, 'Invalid verification code', 400);
    }

    const verified = await prisma.user.updateMany({
      where: {
        id: user.id,
        isEmailVerified: false,
        verificationOtp: user.verificationOtp,
        verificationOtpExpiresAt: { gt: now },
        verificationOtpAttempts: { lt: EMAIL_OTP_MAX_ATTEMPTS },
      },
      data: {
        isEmailVerified: true,
        verificationOtp: null,
        verificationOtpExpiresAt: null,
        verificationOtpAttempts: 0,
        verificationOtpLastSentAt: null,
      },
    });
    if (verified.count !== 1) throw new AppError(AppErrorCode.BAD_REQUEST, 'Invalid or expired verification code', 400);

    const token = this.generateToken({
      userId: user.id,
      tenantId: user.id,
      userType: user.userType,
      principalId: user.id,
      principalKind: 'owner',
      roleName: 'owner',
      permissions: user.userType === 'driver' ? [] : ['*'],
      phoneNumber: user.phoneNumber,
      email: user.email,
      businessName: user.businessName,
    });
    return {
      token,
      user: {
        id: user.id,
        principalId: user.id,
        principalKind: 'owner' as const,
        fullName: user.fullName,
        phoneNumber: user.phoneNumber,
        email: user.email,
        userType: user.userType,
        roleName: 'owner',
        permissions: user.userType === 'driver' ? [] : ['*'],
        businessName: user.businessName,
      },
    };
  }

  static async resendVerificationOtp(emailInput: string): Promise<{ message: string }> {
    const genericMessage = 'If an unverified account exists for this email, a verification code has been sent.';
    const email = emailInput.trim().toLowerCase();
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || user.isEmailVerified) return { message: genericMessage };
    await EmailService.assertEmailDomainHasMx(email);

    const now = new Date();
    const cooldownCutoff = new Date(now.getTime() - EMAIL_OTP_RESEND_COOLDOWN_MS);
    const otp = randomInt(0, 1_000_000).toString().padStart(6, '0');
    const verificationOtp = createEmailOtpHash(email, otp);
    const updated = await prisma.user.updateMany({
      where: {
        id: user.id,
        isEmailVerified: false,
        OR: [
          { verificationOtpLastSentAt: null },
          { verificationOtpLastSentAt: { lte: cooldownCutoff } },
        ],
      },
      data: {
        verificationOtp,
        verificationOtpExpiresAt: new Date(now.getTime() + EMAIL_OTP_TTL_MS),
        verificationOtpAttempts: 0,
        verificationOtpLastSentAt: now,
      },
    });
    if (updated.count !== 1) return { message: genericMessage };

    try {
      EmailService.assertConfigured();
      await EmailService.sendVerificationOtpEmail(email, user.fullName, user.businessName || '', user.userType, otp);
    } catch (error) {
      if (error instanceof BrevoRecipientRejectedError) {
        await prisma.user.deleteMany({ where: { id: user.id, isEmailVerified: false, verificationOtp } });
        throw new AppError(AppErrorCode.BAD_REQUEST, 'We could not deliver to this email address. Please check it or use another address.', 400);
      }
      await prisma.user.updateMany({
        where: { id: user.id, verificationOtp },
        data: { verificationOtp: null, verificationOtpExpiresAt: null, verificationOtpLastSentAt: null, verificationOtpAttempts: 0 },
      });
      throw new AppError(AppErrorCode.INTERNAL_SERVER_ERROR, 'We could not send the verification email. Please try again shortly.', 503);
    }
    return { message: genericMessage };
  }

  /** Only returns deliberately seeded demo identities; never enumerates customer accounts. */
  static async getDemoUsers() {
    const demoPassword = process.env.DEMO_PASSWORD;
    if (
      process.env.NODE_ENV !== 'development' ||
      process.env.ENABLE_DEMO_CREDENTIALS !== 'true' ||
      !demoPassword
    ) {
      throw new AppError(AppErrorCode.NOT_FOUND, 'Demo accounts are unavailable', 404);
    }

    const demoIds = ['ret-user-gupta-01', 'ws-user-kailash-01'];
    const demoUsers = await prisma.user.findMany({
      where: { id: { in: demoIds }, isActive: true },
      select: { id: true, fullName: true, businessName: true, userType: true, email: true },
    });
    return demoUsers.map((user) => ({
      id: user.id,
      fullName: user.fullName,
      businessName: user.businessName,
      userType: user.userType,
      roleName: 'owner',
      email: user.email,
      demoPassword,
    }));
  }

  /**
   * Development-only quick-login affordances. Active when NODE_ENV=development
   * (or any explicitly flagged dev environment) so local test accounts created
   * through /signup can be re-used without manual credential bookkeeping.
   * Never enabled for production deployments.
   */
  private static assertDevConvenienceEnabled(): void {
    if (!isDevAuthEnabled()) {
      throw new AppError(AppErrorCode.NOT_FOUND, 'Development endpoints are unavailable', 404);
    }
  }

  /** Lists every registered owner account for the dev quick-login bar. */
  static async getDevUsers() {
    this.assertDevConvenienceEnabled();
    const demoPassword = process.env.DEMO_PASSWORD;
    const users = await prisma.user.findMany({
      where: { isActive: true, userType: { in: ['retailer', 'wholesaler'] } },
      select: { id: true, fullName: true, email: true, userType: true, businessName: true, isEmailVerified: true, createdAt: true, passwordHash: true },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return Promise.all(
      users.map(async (user) => {
        // The plain password can only ever be offered when it matches the
        // explicitly configured DEMO_PASSWORD; hashes are never transmitted.
        const matchesDemoPassword = Boolean(demoPassword && user.passwordHash)
          ? await bcrypt.compare(demoPassword as string, user.passwordHash as string).catch(() => false)
          : false;
        const { passwordHash: _hash, ...rest } = user;
        return {
          ...rest,
          roleName: 'owner',
          canOneClickLogin: true,
          demoPassword: matchesDemoPassword ? demoPassword : undefined,
        };
      }),
    );
  }

  /** Issues an owner session for a known dev account without password entry. */
  static async issueDevSession(userId: string) {
    this.assertDevConvenienceEnabled();
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { retailerProfile: true, wholesalerProfile: true },
    });
    if (!user || !user.isActive || !['retailer', 'wholesaler'].includes(user.userType)) {
      throw new AppError(AppErrorCode.NOT_FOUND, 'Development account not found', 404);
    }
    if (!user.isEmailVerified) {
      throw new AppError(AppErrorCode.BAD_REQUEST, 'Account email is not verified yet', 400);
    }
    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    return this.buildOwnerSession(user);
  }

  /**
   * Dev-only shortcut that skips the emailed OTP and verifies the account the
   * same way the production verification flow does (which also issues the session).
   */
  static async devVerifyAccount(userId: string) {
    this.assertDevConvenienceEnabled();
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
    if (!user?.email) throw new AppError(AppErrorCode.NOT_FOUND, 'Development account not found', 404);
    const existing = await prisma.user.findUnique({ where: { id: userId }, select: { isEmailVerified: true, verificationOtp: true } });
    if (existing?.isEmailVerified) {
      const verifiedUser = await prisma.user.findUnique({ where: { id: userId }, include: { retailerProfile: true, wholesalerProfile: true } });
      if (!verifiedUser) throw new AppError(AppErrorCode.NOT_FOUND, 'Development account not found', 404);
      return this.buildOwnerSession(verifiedUser);
    }
    if (!existing?.verificationOtp) {
      throw new AppError(AppErrorCode.BAD_REQUEST, 'Start verification via signup or resend first', 400);
    }
    // Re-use the exact production verification steps with the stored hash by
    // marking the account verified through the same code path used by OTP entry.
    await prisma.user.update({
      where: { id: userId },
      data: { isEmailVerified: true, verificationOtp: null, verificationOtpExpiresAt: null, verificationOtpAttempts: 0, verificationOtpLastSentAt: null },
    });
    const verifiedUser = await prisma.user.findUnique({ where: { id: userId }, include: { retailerProfile: true, wholesalerProfile: true } });
    if (!verifiedUser) throw new AppError(AppErrorCode.NOT_FOUND, 'Development account not found', 404);
    return this.buildOwnerSession(verifiedUser);
  }

  static async login(input: LoginInput) {
    const rawIdentifier = input.identifier.trim();
    const identifier = rawIdentifier.includes('@') ? rawIdentifier.toLowerCase() : rawIdentifier;
    const matches = await Promise.all([
      prisma.user.findMany({ where: { OR: [{ phoneNumber: identifier }, { email: identifier }] }, include: { retailerProfile: true, wholesalerProfile: true }, take: 2 }),
      prisma.retailerSubUser.findMany({ where: { OR: [{ phoneNumber: identifier }, { email: identifier }] }, include: { permissions: true }, take: 2 }),
      prisma.wholesalerSubUser.findMany({ where: { OR: [{ phoneNumber: identifier }, { email: identifier }] }, include: { permissions: true }, take: 2 }),
    ]);
    const [owners, retailerStaff, wholesalerStaff] = matches;
    const matchCount = owners.length + retailerStaff.length + wholesalerStaff.length;
    if (matchCount !== 1) throw new AppError(AppErrorCode.UNAUTHORIZED, 'Invalid credentials', 401);

    const passwordHash = owners[0]?.passwordHash ?? retailerStaff[0]?.passwordHash ?? wholesalerStaff[0]?.passwordHash;
    if (!passwordHash || !(await bcrypt.compare(input.password, passwordHash))) {
      throw new AppError(AppErrorCode.UNAUTHORIZED, 'Invalid credentials', 401);
    }

    let tenantUser;
    let principalId: string;
    let principalKind: JwtAuthPayload['principalKind'];
    let roleName: string;
    let fullName: string;
    let phoneNumber: string | null;
    let email: string | null;
    let userType: 'retailer' | 'wholesaler' | 'driver';
    let permissions: string[];

    if (owners[0]) {
      tenantUser = owners[0];
      if (!tenantUser.isActive) throw new AppError(AppErrorCode.UNAUTHORIZED, 'Invalid credentials', 401);
      if (!tenantUser.isEmailVerified) throw new AppError(AppErrorCode.FORBIDDEN, 'Verify your email before signing in', 403);
      principalId = tenantUser.id;
      principalKind = 'owner';
      roleName = 'owner';
      fullName = tenantUser.fullName;
      phoneNumber = tenantUser.phoneNumber;
      email = tenantUser.email;
      userType = tenantUser.userType;
      permissions = tenantUser.userType === 'driver' ? [] : ['*'];
      await prisma.user.update({ where: { id: tenantUser.id }, data: { lastLoginAt: new Date() } });
    } else {
      const isRetailerStaff = retailerStaff.length === 1;
      const staff = isRetailerStaff ? retailerStaff[0] : wholesalerStaff[0];
      userType = isRetailerStaff ? 'retailer' : 'wholesaler';
      const tenantId = isRetailerStaff ? retailerStaff[0].retailerId : wholesalerStaff[0].wholesalerId;
      tenantUser = await prisma.user.findUnique({ where: { id: tenantId }, include: { retailerProfile: true, wholesalerProfile: true } });
      if (!tenantUser || !tenantUser.isActive || !tenantUser.isEmailVerified || tenantUser.userType !== userType || !staff.isActive) {
        throw new AppError(AppErrorCode.UNAUTHORIZED, 'Invalid credentials', 401);
      }
      const allowedRoles = rolesForTenant(userType);
      if (!allowedRoles.includes(staff.roleName)) throw new AppError(AppErrorCode.UNAUTHORIZED, 'Invalid credentials', 401);
      principalId = staff.id;
      principalKind = isRetailerStaff ? 'retailer_staff' : 'wholesaler_staff';
      roleName = staff.roleName;
      fullName = staff.fullName;
      phoneNumber = staff.phoneNumber;
      email = staff.email;
      permissions = resolvePermissions(roleName, staff.permissions);
    }

    const token = this.generateToken({
      userId: tenantUser.id,
      tenantId: tenantUser.id,
      userType,
      principalId,
      principalKind,
      roleName,
      permissions,
      phoneNumber,
      email,
      businessName: tenantUser.businessName,
    });

    return {
      user: {
        id: tenantUser.id,
        principalId,
        principalKind,
        fullName,
        phoneNumber,
        email,
        userType,
        roleName,
        permissions,
        businessName: tenantUser.businessName,
        profile: toSafeTenantProfile(
          userType,
          (tenantUser.retailerProfile || tenantUser.wholesalerProfile || null) as Record<string, unknown> | null,
        ),
      },
      token,
    };
  }

  /** Shared owner-session payload used by password login and dev quick-login. */
  private static buildOwnerSession(tenantUser: {
    id: string;
    fullName: string;
    phoneNumber: string | null;
    email: string | null;
    userType: 'retailer' | 'wholesaler' | 'driver';
    businessName: string | null;
    retailerProfile?: unknown;
    wholesalerProfile?: unknown;
  }) {
    const permissions = tenantUser.userType === 'driver' ? [] : ['*'];
    const token = this.generateToken({
      userId: tenantUser.id,
      tenantId: tenantUser.id,
      userType: tenantUser.userType,
      principalId: tenantUser.id,
      principalKind: 'owner',
      roleName: 'owner',
      permissions,
      phoneNumber: tenantUser.phoneNumber,
      email: tenantUser.email,
      businessName: tenantUser.businessName,
    });
    return {
      user: {
        id: tenantUser.id,
        principalId: tenantUser.id,
        principalKind: 'owner' as const,
        fullName: tenantUser.fullName,
        phoneNumber: tenantUser.phoneNumber,
        email: tenantUser.email,
        userType: tenantUser.userType,
        roleName: 'owner',
        permissions,
        businessName: tenantUser.businessName,
        profile: toSafeTenantProfile(
          tenantUser.userType,
          (tenantUser.retailerProfile || tenantUser.wholesalerProfile || null) as Record<string, unknown> | null,
        ),
      },
      token,
    };
  }

  static async getCurrentUser(auth: JwtAuthPayload) {
    const principalId = auth.principalId || auth.userId;
    const user = await prisma.user.findUnique({
      where: { id: auth.userId },
      include: {
        retailerProfile: true,
        wholesalerProfile: true,
        addresses: true,
        userSubscription: {
          include: {
            package: true,
          },
        },
      },
    });

    if (!user || !user.isActive || !user.isEmailVerified || user.userType !== auth.userType) throw new AppError(AppErrorCode.UNAUTHORIZED, 'Session is no longer active', 401);

    let fullName = user.fullName;
    let roleName = 'owner';
    let principalKind: JwtAuthPayload['principalKind'] = 'owner';
    let permissions: string[] = user.userType === 'driver' ? [] : ['*'];
    if (auth.principalKind === 'retailer_staff') {
      const staff = await prisma.retailerSubUser.findFirst({ where: { id: principalId, retailerId: user.id, isActive: true }, include: { permissions: true } });
      if (!staff || user.userType !== 'retailer') throw new AppError(AppErrorCode.UNAUTHORIZED, 'Session is no longer active', 401);
      fullName = staff.fullName;
      roleName = staff.roleName;
      principalKind = 'retailer_staff';
      permissions = resolvePermissions(roleName, staff.permissions);
    } else if (auth.principalKind === 'wholesaler_staff') {
      const staff = await prisma.wholesalerSubUser.findFirst({ where: { id: principalId, wholesalerId: user.id, isActive: true }, include: { permissions: true } });
      if (!staff || user.userType !== 'wholesaler') throw new AppError(AppErrorCode.UNAUTHORIZED, 'Session is no longer active', 401);
      fullName = staff.fullName;
      roleName = staff.roleName;
      principalKind = 'wholesaler_staff';
      permissions = resolvePermissions(roleName, staff.permissions);
    }

    return {
      id: user.id,
      principalId,
      principalKind,
      roleName,
      permissions,
      fullName,
      phoneNumber: auth.principalKind === 'owner' ? user.phoneNumber : auth.phoneNumber ?? null,
      email: auth.principalKind === 'owner' ? user.email : auth.email ?? null,
      userType: user.userType,
      businessName: user.businessName,
      isActive: user.isActive,
      isVerified: user.isVerified,
      profile: toSafeTenantProfile(
        user.userType,
        (user.retailerProfile || user.wholesalerProfile || null) as Record<string, unknown> | null,
      ),
      addresses: user.addresses,
      subscription: user.userSubscription,
      createdAt: user.createdAt,
    };
  }

  /**
   * Verify master 4-digit owner PIN for counter security and confidential trade visibility.
   */
  static async verifyOwnerPin(userId: string, pin: string) {
    const verification = await prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({
        where: { id: userId },
        select: { id: true, userType: true },
      });
      if (!user || user.userType === 'driver') return { outcome: 'invalid' as const };

      if (user.userType === 'retailer') {
        await tx.$queryRaw`SELECT profile_id FROM retailer_profiles WHERE user_id = ${userId} FOR UPDATE`;
      } else {
        await tx.$queryRaw`SELECT profile_id FROM wholesaler_profiles WHERE user_id = ${userId} FOR UPDATE`;
      }
      const profile = user.userType === 'retailer'
        ? await tx.retailerProfile.findUnique({ where: { userId } })
        : await tx.wholesalerProfile.findUnique({ where: { userId } });
      if (!user || !profile?.ownerPinHash) return { outcome: 'invalid' as const };

      if (profile.pinLockedUntil && profile.pinLockedUntil.getTime() > Date.now()) {
        return { outcome: 'locked' as const };
      }

      const matches = await bcrypt.compare(pin, profile.ownerPinHash).catch(() => false);
      if (matches) {
        const data = { failedPinAttempts: 0, pinLockedUntil: null };
        if (user.userType === 'retailer') {
          await tx.retailerProfile.update({ where: { userId }, data });
        } else {
          await tx.wholesalerProfile.update({ where: { userId }, data });
        }
        return { outcome: 'verified' as const };
      }

      const failedPinAttempts = profile.failedPinAttempts + 1;
      const pinLockedUntil = failedPinAttempts >= 3
        ? new Date(Date.now() + 15 * 60 * 1000)
        : null;
      const data = { failedPinAttempts, pinLockedUntil };
      if (user.userType === 'retailer') {
        await tx.retailerProfile.update({ where: { userId }, data });
      } else {
        await tx.wholesalerProfile.update({ where: { userId }, data });
      }
      return { outcome: pinLockedUntil ? 'locked' as const : 'invalid' as const };
    });

    if (verification.outcome === 'locked') {
      throw new AppError(AppErrorCode.FORBIDDEN, 'Account temporarily locked', 403);
    }
    if (verification.outcome === 'invalid') {
      throw new AppError(AppErrorCode.UNAUTHORIZED, 'Invalid 4-digit Master Owner PIN', 401);
    }
    return {
      verified: true,
      unlockedUntil: Date.now() + 15 * 60 * 1000,
      message: 'Master Owner PIN verified successfully',
    };
  }

  /**
   * Retrieve sub-accounts list for active business account.
   */
  static async getSubAccounts(userId: string, userType: string) {
    if (userType === 'retailer') {
      return prisma.retailerSubUser.findMany({
        where: { retailerId: userId },
        select: { id: true, fullName: true, phoneNumber: true, email: true, roleName: true, isActive: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
      });
    }
    if (userType === 'wholesaler') {
      return prisma.wholesalerSubUser.findMany({
        where: { wholesalerId: userId },
        select: { id: true, fullName: true, phoneNumber: true, email: true, roleName: true, isActive: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
      });
    }
    throw new AppError(AppErrorCode.FORBIDDEN, 'This account cannot manage staff', 403);
  }

  /**
   * Create a new sub-account with assigned operational role.
   */
  static async createSubAccount(
    userId: string, 
    userType: string, 
    input: { fullName: string; phoneNumber: string; email?: string; roleName: string; password?: string }
  ) {
    if (!['retailer', 'wholesaler'].includes(userType) || !rolesForTenant(userType as 'retailer' | 'wholesaler' | 'driver').includes(input.roleName)) {
      throw new AppError(AppErrorCode.BAD_REQUEST, 'Staff role is invalid for this tenant', 400);
    }
    const temporaryPassword = input.password ? undefined : randomBytes(18).toString('base64url');
    const passwordHash = await bcrypt.hash(input.password || temporaryPassword!, 12);
    const tenant = await prisma.user.findFirst({ where: { id: userId, userType: userType as any, isActive: true }, select: { id: true } });
    if (!tenant) throw new AppError(AppErrorCode.NOT_FOUND, 'Active business account not found', 404);

    const created = await prisma.$transaction(async (tx) => {
      if (userType === 'retailer') {
        const staff = await tx.retailerSubUser.create({
          data: { retailerId: userId, fullName: input.fullName, phoneNumber: input.phoneNumber, email: input.email || null, roleName: input.roleName, passwordHash },
        });
        const defaults = defaultPermissionsForRole(input.roleName);
        if (defaults.length) await tx.retailerSubUserPermission.createMany({ data: defaults.map((permissionKey) => ({ subUserId: staff.id, permissionKey, isEnabled: true })) });
        return { id: staff.id, fullName: staff.fullName, phoneNumber: staff.phoneNumber, email: staff.email, roleName: staff.roleName, isActive: staff.isActive, createdAt: staff.createdAt };
      }
      const staff = await tx.wholesalerSubUser.create({
        data: { wholesalerId: userId, fullName: input.fullName, phoneNumber: input.phoneNumber, email: input.email || null, roleName: input.roleName, passwordHash },
      });
      const defaults = defaultPermissionsForRole(input.roleName);
      if (defaults.length) await tx.subUserPermission.createMany({ data: defaults.map((permissionKey) => ({ subUserId: staff.id, permissionKey, isEnabled: true })) });
      return { id: staff.id, fullName: staff.fullName, phoneNumber: staff.phoneNumber, email: staff.email, roleName: staff.roleName, isActive: staff.isActive, createdAt: staff.createdAt };
    });
    return { ...created, ...(temporaryPassword ? { temporaryPassword } : {}) };
  }
}

