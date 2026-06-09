import express, { type Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { healthRouter } from './routes/health.js';

// App factory — keep it pure (no listen()) so tests can import and exercise it.
export function createApp(): Express {
  const app = express();

  app.use(helmet());
  app.use(cors());
  app.use(express.json());

  app.use('/health', healthRouter);

  // Fallback 404.
  app.use((_req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  return app;
}
