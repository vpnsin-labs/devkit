import 'dotenv/config';

// Central, typed access to environment config. Extend with validation
// (e.g. zod) as the surface grows.
export const env = {
  NODE_ENV: process.env.NODE_ENV ?? 'development',
  PORT: Number(process.env.PORT ?? 3000),
} as const;
