import { Router } from 'express';
import mongoose from 'mongoose';

export const healthRouter = Router();

// Liveness/readiness probe: reports process uptime and the live DB state.
healthRouter.get('/', (_req, res) => {
  res.json({
    status: 'ok',
    db: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    uptime: process.uptime(),
  });
});
