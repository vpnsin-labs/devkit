import 'dotenv/config';

// Central, typed access to environment config. Required vars abort the process
// early with a clear message instead of failing deep inside a request handler.
function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined || value === '') {
    console.error(`Missing required environment variable: ${name}`);
    process.exit(1);
  }
  return value;
}

export const env = {
  NODE_ENV: process.env.NODE_ENV ?? 'development',
  PORT: Number(process.env.PORT ?? 4000),
  MONGO_URI: required('MONGO_URI', 'mongodb://localhost:27017/app'),
} as const;
