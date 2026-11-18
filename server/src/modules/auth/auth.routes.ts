import { Router } from 'express';
import { AuthController } from './auth.controller';
import { authenticate, authorizeOwner } from '../../middleware/auth.middleware';
import { authLimiter, otpResendLimiter, otpVerificationLimiter } from '../../middleware/rate-limiter.middleware';
import { isDevAuthEnabled } from './auth-dev';

const router = Router();

// Public routes (Hardened with rate limiter against brute-force attacks)
router.post('/register', authLimiter, AuthController.register);
router.post('/signup', authLimiter, AuthController.signup);
router.post('/login', authLimiter, AuthController.login);
router.post('/verify-email', otpVerificationLimiter, AuthController.verifyEmail);
router.post('/resend-otp', otpResendLimiter, AuthController.resendEmailOtp);
router.get('/demo-users', authLimiter, AuthController.getDemoUsers);

// Development-only quick-login affordances (404 outside NODE_ENV=development).
// Listed users come from the live database, so signup-created accounts appear immediately.
if (isDevAuthEnabled()) {
  router.get('/dev-users', AuthController.getDevUsers);
  router.post('/dev-login', AuthController.devLogin);
  router.post('/dev-verify', AuthController.devVerify);
}

// Protected routes
router.get('/me', authenticate, AuthController.getMe);
router.get('/profile', authenticate, authorizeOwner, AuthController.getProfile);
router.patch('/profile', authenticate, authorizeOwner, AuthController.updateProfile);
router.patch('/pin', authLimiter, authenticate, authorizeOwner, AuthController.setOwnerPin);
router.post('/verify-owner-pin', authLimiter, authenticate, AuthController.verifyOwnerPin);
router.patch('/update-owner-pin', authLimiter, authenticate, authorizeOwner, AuthController.updateOwnerPin);
router.get('/sub-accounts', authenticate, authorizeOwner, AuthController.getSubAccounts);
router.post('/sub-accounts', authenticate, authorizeOwner, AuthController.createSubAccount);

export default router;

