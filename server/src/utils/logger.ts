export enum LogLevel {
  INFO = 'INFO',
  WARN = 'WARN',
  ERROR = 'ERROR',
  DEBUG = 'DEBUG',
}

export class Logger {
  static log(level: LogLevel, message: string, context: any = {}, error?: Error) {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      level,
      message,
      context,
      error: error ? {
        message: error.message,
        stack: error.stack,
      } : undefined,
    };

    const formattedLog = `[${timestamp}] ${level}: ${message} ${JSON.stringify(context)}`;
    
    switch (level) {
      case LogLevel.ERROR:
        console.error(formattedLog, error || '');
        break;
      case LogLevel.WARN:
        console.warn(formattedLog);
        break;
      case LogLevel.DEBUG:
        if (process.env.NODE_ENV === 'development') {
          console.debug(formattedLog);
        }
        break;
      default:
        console.log(formattedLog);
    }
  }

  static info(message: string, context?: any) {
    this.log(LogLevel.INFO, message, context);
  }

  static warn(message: string, context?: any) {
    this.log(LogLevel.WARN, message, context);
  }

  static error(message: string, error?: unknown, context?: any) {
    const normalized =
      error === undefined
        ? undefined
        : error instanceof Error
        ? error
        : new Error(typeof error === 'string' ? error : JSON.stringify(error));
    this.log(LogLevel.ERROR, message, context, normalized);
  }

  static debug(message: string, context?: any) {
    this.log(LogLevel.DEBUG, message, context);
  }
}
