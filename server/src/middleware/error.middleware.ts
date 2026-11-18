import { NextFunction, Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { ZodError } from 'zod';
import { AppError, AppErrorCode } from '../utils/app-error';
import { Logger } from '../utils/logger';

interface NormalizedError {
  statusCode: number;
  code: AppErrorCode;
  message: string;
  details?: unknown;
}

function mapZodError(err: ZodError): NormalizedError {
  return {
    statusCode: 400,
    code: AppErrorCode.BAD_REQUEST,
    message: 'Validation failed',
    details: err.issues,
  };
}

function mapPrismaError(err: Prisma.PrismaClientKnownRequestError): NormalizedError {
  switch (err.code) {
    case 'P2025':
      return {
        statusCode: 404,
        code: AppErrorCode.NOT_FOUND,
        message: 'Requested record was not found',
      };
    case 'P2002': {
      const target = Array.isArray(err.meta?.target)
        ? (err.meta?.target as string[]).join(', ')
        : String(err.meta?.target ?? 'field');
      return {
        statusCode: 409,
        code: AppErrorCode.CONFLICT,
        message: `A record with this ${target} already exists`,
      };
    }
    case 'P2003':
      return {
        statusCode: 400,
        code: AppErrorCode.BAD_REQUEST,
        message: 'Related record constraint failed',
      };
    case 'P2034':
      return {
        statusCode: 409,
        code: AppErrorCode.OPTIMISTIC_LOCK_ERROR,
        message: 'Concurrent update detected. Please retry the operation.',
      };
    default:
      return {
        statusCode: 500,
        code: AppErrorCode.INTERNAL_SERVER_ERROR,
        message: 'Database operation failed',
      };
  }
}

/**
 * Terminal 404 handler for unmatched API routes.
 */
export function notFoundHandler(req: Request, _res: Response, next: NextFunction): void {
  next(new AppError(AppErrorCode.NOT_FOUND, `Route not found: ${req.method} ${req.originalUrl}`, 404));
}

/**
 * Centralized error handler. Produces a consistent API error envelope:
 * { success: false, data: null, error: { code, message, details? } }
 */
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  const context = {
    method: req.method,
    path: req.originalUrl,
    userId: (req as any).user?.userId,
  };

  let normalized: NormalizedError;

  if (err instanceof AppError) {
    normalized = {
      statusCode: err.statusCode,
      code: err.code,
      message: err.message,
      details: err.details,
    };
  } else if (err instanceof ZodError || (err as any)?.name === 'ZodError') {
    normalized = mapZodError(err as ZodError);
  } else if (err instanceof Prisma.PrismaClientKnownRequestError) {
    normalized = mapPrismaError(err);
  } else if (err instanceof SyntaxError && 'body' in err) {
    normalized = {
      statusCode: 400,
      code: AppErrorCode.BAD_REQUEST,
      message: 'Malformed JSON request body',
    };
  } else {
    const message = err instanceof Error ? err.message : 'Internal server error';
    Logger.error('[API] Unhandled exception', err instanceof Error ? err : undefined, context);
    normalized = {
      statusCode: 500,
      code: AppErrorCode.INTERNAL_SERVER_ERROR,
      message: process.env.NODE_ENV === 'production' ? 'Internal server error' : message,
    };
  }

  if (normalized.statusCode >= 500) {
    Logger.error(`[API] ${normalized.statusCode} ${normalized.code}: ${normalized.message}`, undefined, context);
  } else {
    Logger.warn(`[API] ${normalized.statusCode} ${normalized.code}: ${normalized.message}`, context);
  }

  res.status(normalized.statusCode).json({
    success: false,
    data: null,
    error: {
      code: normalized.code,
      message: normalized.message,
      ...(normalized.details ? { details: normalized.details } : {}),
    },
  });
}
