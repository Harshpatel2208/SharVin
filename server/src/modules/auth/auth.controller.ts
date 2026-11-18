import { Response, NextFunction } from 'express';
import { AppError, AppErrorCode } from '../../utils/app-error';
import { AuthService } from './auth.service';
import { registerSchema, loginSchema, updateOwnerPinSchema, createSubAccountSchema, verifyEmailSchema, resendEmailOtpSchema } from './auth.validation';
import { AuthenticatedRequest } from '../../types/auth.types';

const attachSessionCookie = <T extends { token: string }>(res: Response, result: T): Omit<T, 'token'> => {
  const { token, ...safeResult } = result;
  res.cookie('token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 24 * 60 * 60 * 1000,
  });
  return safeResult;
};

export class AuthController {
  static async getProfile(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const user = req.user!;
      const data = await AuthService.getProfile(user.tenantId, user.userType);
      res.status(200).json({ success: true, data, error: null });
    } catch (error) { next(error); }
  }

  static async updateProfile(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const body = req.body || {};
      if (typeof body.tradeName !== 'string' || body.tradeName.trim().length < 2 ||
          typeof body.gstin !== 'string' ||
          !body.address || typeof body.address !== 'object' ||
          !(body.deliveryRadiusKm === null || Number.isFinite(Number(body.deliveryRadiusKm)))) {
        throw new AppError(AppErrorCode.BAD_REQUEST, 'Trade name, GSTIN, address, and a valid delivery radius are required', 400);
      }
      const data = await AuthService.updateProfile(req.user!.tenantId, req.user!.userType, {
        tradeName: body.tradeName,
        gstin: body.gstin,
        address: body.address,
        deliveryRadiusKm: body.deliveryRadiusKm === null ? null : Number(body.deliveryRadiusKm),
      });
      res.status(200).json({ success: true, data, error: null });
    } catch (error) { next(error); }
  }

  static async setOwnerPin(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const newPin = req.body?.newPin;
      if (typeof newPin !== 'string' || !/^\d{4}$/.test(newPin)) {
        throw new AppError(AppErrorCode.BAD_REQUEST, 'PIN must be exactly 4 digits', 400);
      }
      const result = await AuthService.updateOwnerPin(req.user!.tenantId, req.user!.userType, newPin);
      res.status(200).json({ success: true, data: result, error: null });
    } catch (error) { next(error); }
  }

  static async signup(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const validation = registerSchema.safeParse(req.body);
      if (!validation.success) {
        res.status(400).json({ success: false, data: null, error: validation.error.issues.map((issue) => issue.message).join(', ') });
        return;
      }
      const result = await AuthService.register(validation.data);
      res.status(202).json({ success: true, data: result, error: null });
    } catch (error: any) {
      if (error instanceof AppError) return next(error);
      if (error?.code === 'P2002') {
        res.status(409).json({ success: false, data: null, error: 'An account with the provided details may already exist' });
        return;
      }
      next(error);
    }
  }

  static async register(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    return AuthController.signup(req, res, next);
  }

  static async verifyEmail(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    const parsed = verifyEmailSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, data: null, error: parsed.error.issues[0]?.message || 'Invalid verification request' });
      return;
    }
    try {
      const result = await AuthService.verifyEmail(parsed.data.email, parsed.data.otp);
      res.status(200).json({ success: true, data: attachSessionCookie(res, result), error: null });
    } catch (error) {
      next(error);
    }
  }

  static async resendEmailOtp(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    const parsed = resendEmailOtpSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, data: null, error: parsed.error.issues[0]?.message || 'Invalid email address' });
      return;
    }
    try {
      const result = await AuthService.resendVerificationOtp(parsed.data.email);
      res.status(202).json({ success: true, data: result, error: null });
    } catch (error) {
      next(error);
    }
  }

  static async login(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const validation = loginSchema.safeParse(req.body);
      if (!validation.success) {
        res.status(400).json({
          success: false,
          data: null,
          error: validation.error.issues.map((i) => i.message).join(', '),
        });
        return;
      }

      const result = await AuthService.login(validation.data);
      res.status(200).json({
        success: true,
        data: attachSessionCookie(res, result),
        error: null,
      });
    } catch (error: any) {
      if (error instanceof AppError) {
        next(error);
        return;
      }
      res.status(401).json({ success: false, data: null, error: 'Invalid credentials' });
    }
  }

  static async getDemoUsers(_req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const users = await AuthService.getDemoUsers();
      res.status(200).json({ success: true, data: users, error: null });
    } catch (error) {
      next(error);
    }
  }

  static async getDevUsers(_req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const users = await AuthService.getDevUsers();
      res.status(200).json({ success: true, data: users, error: null });
    } catch (error) {
      next(error);
    }
  }

  static async devLogin(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = typeof req.body?.userId === 'string' ? req.body.userId.trim() : '';
      if (!userId) {
        res.status(400).json({ success: false, data: null, error: 'userId is required' });
        return;
      }
      const result = await AuthService.issueDevSession(userId);
      res.status(200).json({ success: true, data: attachSessionCookie(res, result), error: null });
    } catch (error) {
      next(error);
    }
  }

  static async devVerify(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = typeof req.body?.userId === 'string' ? req.body.userId.trim() : '';
      if (!userId) {
        res.status(400).json({ success: false, data: null, error: 'userId is required' });
        return;
      }
      const result = await AuthService.devVerifyAccount(userId);
      res.status(200).json({ success: true, data: result, error: null });
    } catch (error) {
      next(error);
    }
  }

  static async getMe(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user?.userId) {
        res.status(401).json({
          success: false,
          data: null,
          error: 'Unauthorized',
        });
        return;
      }

      const user = await AuthService.getCurrentUser(req.user);
      res.status(200).json({
        success: true,
        data: user,
        error: null,
      });
    } catch (error: any) {
      if (error instanceof AppError) {
        next(error);
        return;
      }
      res.status(404).json({
        success: false,
        data: null,
        error: error.message || 'User not found',
      });
    }
  }

  static async verifyOwnerPin(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { pin } = req.body;
      if (!pin || typeof pin !== 'string') {
        res.status(400).json({
          success: false,
          data: null,
          error: 'PIN must be a 4-digit string',
        });
        return;
      }

      const userId = req.user!.userId;
      const result = await AuthService.verifyOwnerPin(userId, pin);
      res.status(200).json({
        success: true,
        data: result,
        error: null,
      });
    } catch (error: any) {
      if (error instanceof AppError) {
        next(error);
        return;
      }
      res.status(401).json({
        success: false,
        data: null,
        error: error.message || 'PIN verification failed',
      });
    }
  }

  static async updateOwnerPin(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const parsed = updateOwnerPinSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          success: false,
          data: null,
          error: parsed.error.issues[0]?.message || 'Current and new 4-digit PINs are required',
        });
        return;
      }

      const userId = req.user!.userId;
      await AuthService.verifyOwnerPin(userId, parsed.data.currentPin);
      const result = await AuthService.updateOwnerPin(userId, req.user!.userType, parsed.data.newPin);
      res.status(200).json({
        success: true,
        data: result,
        error: null,
      });
    } catch (error: any) {
      if (error instanceof AppError) {
        next(error);
        return;
      }
      res.status(400).json({
        success: false,
        data: null,
        error: error.message || 'Failed to update PIN',
      });
    }
  }

  static async getSubAccounts(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.userId;
      const userType = req.user!.userType;
      const accounts = await AuthService.getSubAccounts(userId, userType);
      res.status(200).json({
        success: true,
        data: accounts,
        error: null,
      });
    } catch (error: any) {
      if (error instanceof AppError) {
        next(error);
        return;
      }
      res.status(500).json({
        success: false,
        data: null,
        error: error.message || 'Failed to fetch sub-accounts',
      });
    }
  }

  static async createSubAccount(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user!.userId;
      const userType = req.user!.userType;
      const parsed = createSubAccountSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          success: false,
          data: null,
          error: parsed.error.issues[0]?.message || 'Invalid staff account details',
        });
        return;
      }

      const created = await AuthService.createSubAccount(userId, userType, parsed.data);

      res.status(201).json({
        success: true,
        data: created,
        error: null,
      });
    } catch (error: any) {
      if (error instanceof AppError) {
        next(error);
        return;
      }
      res.status(400).json({
        success: false,
        data: null,
        error: error.message || 'Failed to create sub-account',
      });
    }
  }
}

