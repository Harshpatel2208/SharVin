import express, { Request, Response, ErrorRequestHandler } from 'express';
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import helmet from 'helmet';
import { apiGeneralLimiter } from './middleware/rate-limiter.middleware';
import { errorHandler, notFoundHandler } from './middleware/error.middleware';

import authRoutes from './modules/auth/auth.routes';
import posRoutes from './modules/pos/pos.routes';
import { inventoryRouter } from './modules/inventory/inventory.routes';
import wholesalerRoutes from './modules/wholesaler/wholesaler.routes';
import cartRoutes from './modules/cart/cart.routes';
import chatRoutes from './modules/chat/chat.routes';
import deliveryRoutes from './modules/delivery/delivery.routes';
import ledgerRoutes from './modules/ledger/ledger.routes';
import invoiceRoutes from './modules/invoice/invoice.routes';
import orderLifecycleRoutes from './modules/orders/order-lifecycle.routes';
import notificationRoutes from './modules/notifications/notification.routes';
import { registerChatGateway } from './modules/chat/chat.gateway';


dotenv.config();

const app = express();
app.set('trust proxy', 1);
const server = http.createServer(app);

const PORT = process.env.PORT || 5000;
const FRONTEND_ORIGIN = process.env.FRONTEND_URL || 'http://localhost:5173';

// Security Middleware (OWASP Hardening)
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        imgSrc: ["'self'", 'data:', 'blob:'],
        connectSrc: ["'self'", 'ws:', 'wss:'],
      },
    },
    frameguard: { action: 'deny' },
    noSniff: true,
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
    },
    hidePoweredBy: true,
  })
);

// General API Rate Limiting (Baseline DDoS & brute-force throttling)
app.use('/api/v1', apiGeneralLimiter);

// Middleware
app.use(cors({ origin: [process.env.FRONTEND_URL || 'http://localhost:5173'], credentials: true }));
app.use(express.json());

// Realtime Gateway Server
const io = new SocketIOServer(server, {
  pingTimeout: 60000,
  pingInterval: 25000,
  cors: {
    origin: [FRONTEND_ORIGIN],
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

// Attach io to express app for REST controller access
app.set('io', io);

// Register Socket.io Event Gateway
registerChatGateway(io);

// API Routes
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/pos', posRoutes);
app.use('/api/v1/inventory', inventoryRouter);
app.use('/api/v1/wholesaler', wholesalerRoutes);
app.use('/api/v1/wholesalers', wholesalerRoutes);
app.use('/api/v1/cart', cartRoutes);
app.use('/api/v1', chatRoutes);
app.use('/api/v1', deliveryRoutes);
app.use('/api/v1/ledger', ledgerRoutes);
app.use('/api/v1/invoices', invoiceRoutes);
app.use('/api/v1/orders', orderLifecycleRoutes);
app.use('/api/v1/notifications', notificationRoutes);


// Health & System Info Route
app.get('/api/v1/health', (_req: Request, res: Response) => {
  res.status(200).json({
    success: true,
    data: {
      service: 'SharVin Unified API',
      status: 'healthy',
      timestamp: new Date().toISOString(),
      supportedClients: ['Web', 'Android', 'Windows'],
    },
    error: null,
  });
});

// Centralized error handling (must be registered after all routes)
app.use(notFoundHandler);

async function startServer(): Promise<void> {
  const sentryDsn = process.env.SENTRY_DSN?.trim();
  if (sentryDsn) {
    // @ts-ignore -- Optional SDK: install @sentry/node before enabling SENTRY_DSN.
    const Sentry = await import('@sentry/node');
    Sentry.init({
      dsn: sentryDsn,
      environment: process.env.NODE_ENV || 'development',
      sendDefaultPii: false,
      // Errors are captured by the explicit middleware below.
      integrations: [Sentry.expressIntegration({ shouldHandleError: false })],
    });

    // First error middleware: capture before the application formats the response.
    const sentryErrorHandler: ErrorRequestHandler = (error, _req, _res, next) => {
      const status = Number(error?.statusCode ?? error?.status ?? 500);
      if (!Number.isFinite(status) || status >= 500) {
        try {
          Sentry.captureException(error);
        } catch {
          console.error('[SharVin Server] Error tracking could not capture an exception.');
        }
      }
      next(error);
    };
    app.use(sentryErrorHandler);
  }
  app.use(errorHandler);

  server.listen(Number(PORT), '0.0.0.0', () => {
    console.log(`[SharVin Server] Running on http://127.0.0.1:${PORT}`);
    console.log(`[SharVin Server] API health available at http://127.0.0.1:${PORT}/api/v1/health`);
  });
}

void startServer().catch((error: unknown) => {
  console.error('[SharVin Server] Startup failed. Check the optional Sentry SDK and configuration.', error);
  process.exit(1);
});
