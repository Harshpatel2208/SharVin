import rateLimit from 'express-rate-limit';
import { Request, Response } from 'express';

/**
 * SharVin Unified Rate Limiter Middleware
 * Protects auth endpoints, OTP verification, rate proposals, and general API routes.
 */

// 1. General API Limiter - 300 requests per 15 minutes per IP
export const apiGeneralLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: {
    success: false,
    data: null,
    error: 'API rate limit exceeded. Please slow down your requests.',
    code: 'RATE_LIMIT_EXCEEDED',
  },
  handler: (req: Request, res: Response, _next, options) => {
    res.status(options.statusCode).json(options.message);
  },
});

// 2. Auth Limiter - 10 requests per 15 minutes per IP for /login & /register
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: {
    success: false,
    data: null,
    error: 'Too many authentication attempts from this IP address. Please try again after 15 minutes.',
    code: 'RATE_LIMIT_EXCEEDED',
  },
  handler: (req: Request, res: Response, _next, options) => {
    res.status(options.statusCode).json(options.message);
  },
});

// 3. OTP Verification Limiter - 5 verification attempts per 15 minutes per IP
export const otpVerificationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: {
    success: false,
    data: null,
    error: 'Too many OTP verification attempts from this IP address. Please try again after 15 minutes.',
    code: 'RATE_LIMIT_EXCEEDED',
  },
  handler: (req: Request, res: Response, _next, options) => {
    res.status(options.statusCode).json(options.message);
  },
});

// Resend has an additional per-account 60-second cooldown enforced against PostgreSQL.
export const otpResendLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: {
    success: false,
    data: null,
    error: 'Too many verification code requests. Please try again later.',
    code: 'RATE_LIMIT_EXCEEDED',
  },
  handler: (req: Request, res: Response, _next, options) => {
    res.status(options.statusCode).json(options.message);
  },
});

// 4. Rate Proposal Limiter - 30 proposals per 10 minutes per IP/User for bargaining
export const rateProposalLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: {
    success: false,
    data: null,
    error: 'Too many rate proposals submitted. Please wait a few minutes before submitting new counter-offers.',
    code: 'RATE_LIMIT_EXCEEDED',
  },
  handler: (req: Request, res: Response, _next, options) => {
    res.status(options.statusCode).json(options.message);
  },
});
