export enum AppErrorCode {
  INTERNAL_SERVER_ERROR = 'INTERNAL_SERVER_ERROR',
  BAD_REQUEST = 'BAD_REQUEST',
  UNAUTHORIZED = 'UNAUTHORIZED',
  FORBIDDEN = 'FORBIDDEN',
  NOT_FOUND = 'NOT_FOUND',
  CONFLICT = 'CONFLICT',
  UNPROCESSABLE_ENTITY = 'UNPROCESSABLE_ENTITY',
  STOCK_EXHAUSTED = 'STOCK_EXHAUSTED',
  MARGIN_FLOOR_BREACH = 'MARGIN_FLOOR_BREACH',
  MOQ_BREACH = 'MOQ_BREACH',
  SECURITY_LOCKOUT = 'SECURITY_LOCKOUT',
  OPTIMISTIC_LOCK_ERROR = 'OPTIMISTIC_LOCK_ERROR',
}

export class AppError extends Error {
  public readonly code: AppErrorCode;
  public readonly statusCode: number;
  public readonly details?: any;

  constructor(code: AppErrorCode, message: string, statusCode: number = 400, details?: any) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
    
    // Ensure the stack trace is captured correctly in TypeScript
    Error.captureStackTrace(this, this.constructor);
  }
}
