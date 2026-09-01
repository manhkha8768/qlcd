import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { secureHeaders } from 'hono/secure-headers';
import { HTTPException } from 'hono/http-exception';

// Import routes
import healthRouter from './routes/health';
import authRouter from './routes/auth';

// Cloudflare bindings type (from Workers types)
interface D1Database {
  prepare(query: string): D1PreparedStatement;
}

interface D1PreparedStatement {
  bind(...params: unknown[]): D1PreparedStatement;
  first(): Promise<Record<string, unknown> | undefined>;
  all(): Promise<{ success: boolean; results: Record<string, unknown>[] }>;
  run(): Promise<{ success: boolean }>;
}

interface R2Bucket {
  put(key: string, value: ArrayBuffer | ReadableStream<Uint8Array> | Blob | string, options?: object): Promise<R2Object>;
  get(key: string): Promise<R2ObjectBody | null>;
}

interface R2Object {
  key: string;
  version: string;
  size: number;
  etag: string;
}

interface R2ObjectBody {
  body: ReadableStream<Uint8Array>;
  bodyUsed: boolean;
  arrayBuffer(): Promise<ArrayBuffer>;
  text(): Promise<string>;
}

interface KVNamespace {
  get(key: string, options?: { type?: 'text' | 'json' | 'arrayBuffer' | 'stream' }): Promise<string | null>;
  put(key: string, value: string | ArrayBuffer | ReadableStream<Uint8Array>, options?: { expirationTtl?: number; expirationSeconds?: number; metadata?: object }): Promise<void>;
  delete(key: string): Promise<void>;
  list(options?: { prefix?: string; limit?: number; cursor?: string }): Promise<{ keys: Array<{ name: string; metadata?: unknown }>; list_complete: boolean; cursor?: string }>;
}

// Types
export interface CloudflareEnv {
  DB: D1Database;
  FILES: R2Bucket;
  KV: KVNamespace;
  ENVIRONMENT: string;
}

// Create Hono app
const app = new Hono<{ Bindings: CloudflareEnv }>();

// Middleware - CORS
app.use(
  cors({
    origin: ['http://localhost:5173', 'http://localhost:3000'],
    credentials: true,
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
  })
);

// Middleware - Security Headers
app.use(secureHeaders());

// Middleware - Logger
app.use(logger());

// Middleware - Error Handling
app.onError((err, c) => {
  console.error('Error:', err);

  if (err instanceof HTTPException) {
    return c.json(
      {
        error: err.message,
        status: err.status,
      },
      err.status
    );
  }

  return c.json(
    {
      error: 'Internal Server Error',
      status: 500,
    },
    500
  );
});

// Routes
app.route('/api/health', healthRouter);
app.route('/api/auth', authRouter);

// 404 Handler
app.notFound((c) => {
  return c.json(
    {
      error: 'Not Found',
      status: 404,
    },
    404
  );
});

export default app;
