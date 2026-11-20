import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import mongoose from 'mongoose';
import { pinoHttp } from 'pino-http';
import { env } from './env.js';

export function createApp() {
  const app = express();

  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cors({ origin: env.WEB_ORIGIN }));
  app.use(express.json({ limit: '1mb' }));
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

  return app;
}