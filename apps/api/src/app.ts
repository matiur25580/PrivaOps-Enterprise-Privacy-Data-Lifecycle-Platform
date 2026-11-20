import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import mongoose from 'mongoose';
import { pinoHttp } from 'pino-http';
import { env } from './env.js';
import { identityRouter } from './modules/identity/routes.js';
import { inventoryRouter } from './modules/inventory/routes.js';
import { privacyRequestRouter } from './modules/privacy-requests/routes.js';

export function createApp() {
  const app = express();

  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cors({ origin: env.WEB_ORIGIN, credentials: true }));
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());
  app.use(pinoHttp());

  app.get('/health/live', (_request, response) => {
    response.status(200).json({ status: 'ok', service: 'privaops-api' });
  });

  app.get('/health/ready', (_request, response) => {
    const databaseReady = mongoose.connection.readyState === 1;
    response.status(databaseReady ? 200 : 503).json({
      status: databaseReady ? 'ready' : 'not-ready',
      dependencies: { mongodb: databaseReady ? 'connected' : 'disconnected' },
    });
  });

  app.get('/api/v1', (_request, response) => {
    response.status(200).json({
      name: 'PrivaOps API',
      version: 'v1',
      message: 'API foundation is running.',
    });
  });

  app.use('/api/v1', identityRouter);
  app.use('/api/v1', inventoryRouter);
  app.use('/api/v1', privacyRequestRouter);

  return app;
}