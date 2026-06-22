import mongoose from 'mongoose';
import { env } from './env.js';

// Single shared Mongoose connection. Call connectDb() once at startup and
// disconnectDb() on graceful shutdown so sockets drain cleanly.
mongoose.connection.on('connected', () => {
  console.info('MongoDB connected');
});
mongoose.connection.on('error', (err) => {
  console.error('MongoDB connection error:', err);
});

export async function connectDb(): Promise<void> {
  mongoose.set('strictQuery', true);
  await mongoose.connect(env.MONGO_URI);
}

export async function disconnectDb(): Promise<void> {
  await mongoose.disconnect();
}
