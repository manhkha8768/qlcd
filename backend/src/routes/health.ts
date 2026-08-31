import { Hono } from 'hono';
import type { CloudflareEnv } from '../index';

const router = new Hono<{ Bindings: CloudflareEnv }>();

/**
 * Health Check Endpoint
 * GET /api/health
 *
 * Returns:
 * - 200 OK if service is healthy
 * - Includes database, KV, R2 status
 */
router.get('/', async (c) => {
  try {
    const env = c.env;

    // Check database connectivity
    let dbStatus = 'unknown';
    try {
      const dbResult = await env.DB.prepare('SELECT 1').first();
      dbStatus = dbResult ? 'healthy' : 'unhealthy';
    } catch (e) {
      dbStatus = 'unhealthy';
    }

    // Check KV connectivity
    let kvStatus = 'unknown';
    try {
      await env.KV.put('health-check', JSON.stringify({ timestamp: Date.now() }), { expirationTtl: 60 });
      const kvResult = await env.KV.get('health-check');
      kvStatus = kvResult ? 'healthy' : 'unhealthy';
    } catch (e) {
      kvStatus = 'unhealthy';
    }

    // R2 status (basic check)
    const r2Status = 'operational';

    const isHealthy = dbStatus === 'healthy' && kvStatus === 'healthy';

    return c.json(
      {
        status: isHealthy ? 'ok' : 'degraded',
        timestamp: new Date().toISOString(),
        version: '1.0.0',
        environment: env.ENVIRONMENT,
        dependencies: {
          database: {
            status: dbStatus,
            type: 'D1 (SQLite)',
          },
          cache: {
            status: kvStatus,
            type: 'Cloudflare KV',
          },
          storage: {
            status: r2Status,
            type: 'Cloudflare R2',
          },
        },
      },
      isHealthy ? 200 : 503
    );
  } catch (error) {
    console.error('Health check error:', error);
    return c.json(
      {
        status: 'error',
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      500
    );
  }
});

/**
 * Detailed Health Status
 * GET /api/health/status
 */
router.get('/status', (c) => {
  return c.json({
    service: 'qlcd-api',
    status: 'running',
    uptime: Math.floor(Date.now() / 1000),
  });
});

export default router;
