import { useEffect, useState } from 'react';
import axios from 'axios';

interface HealthStatus {
  status: string;
  timestamp: string;
  version: string;
  environment: string;
  dependencies?: {
    database?: { status: string; type: string };
    cache?: { status: string; type: string };
    storage?: { status: string; type: string };
  };
}

/**
 * Health Check Page
 * Displays API health status
 * M0A Foundation - Infrastructure verification
 */
export default function HealthPage() {
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const checkHealth = async () => {
      try {
        const response = await axios.get('/api/health', {
          headers: { 'Content-Type': 'application/json' },
        });
        setHealth(response.data);
        setError(null);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : 'Failed to fetch health status'
        );
        setHealth(null);
      } finally {
        setLoading(false);
      }
    };

    checkHealth();
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-100 px-4">
      <div className="w-full max-w-2xl rounded-lg bg-white p-8 shadow-md">
        <h1 className="mb-6 text-3xl font-bold text-gray-900">
          QLCD API Health Check
        </h1>

        {loading && (
          <div className="flex items-center justify-center space-x-2">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-blue-600 border-t-transparent"></div>
            <p className="text-gray-600">Checking API health...</p>
          </div>
        )}

        {error && (
          <div className="rounded-lg bg-red-50 p-4">
            <p className="text-sm font-medium text-red-800">{error}</p>
          </div>
        )}

        {health && (
          <div className="space-y-4">
            <div className="rounded-lg bg-gray-50 p-4">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-sm font-medium text-gray-600">Status</span>
                <span
                  className={`inline-block rounded-full px-3 py-1 text-sm font-semibold ${
                    health.status === 'ok'
                      ? 'bg-green-100 text-green-800'
                      : 'bg-yellow-100 text-yellow-800'
                  }`}
                >
                  {health.status.toUpperCase()}
                </span>
              </div>
              <div className="mb-3 flex items-center justify-between">
                <span className="text-sm font-medium text-gray-600">
                  Version
                </span>
                <span className="text-sm text-gray-900">{health.version}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-600">
                  Environment
                </span>
                <span className="text-sm text-gray-900">
                  {health.environment}
                </span>
              </div>
              <div className="mt-2 flex items-center justify-between">
                <span className="text-sm font-medium text-gray-600">
                  Timestamp
                </span>
                <span className="text-sm text-gray-900">
                  {new Date(health.timestamp).toLocaleString()}
                </span>
              </div>
            </div>

            {health.dependencies && (
              <div className="space-y-2">
                <h2 className="font-semibold text-gray-900">Dependencies</h2>
                {health.dependencies.database && (
                  <div className="flex items-center justify-between rounded-lg bg-gray-50 p-3">
                    <div>
                      <p className="text-sm font-medium text-gray-600">
                        Database
                      </p>
                      <p className="text-xs text-gray-500">
                        {health.dependencies.database.type}
                      </p>
                    </div>
                    <span
                      className={`rounded-full px-2 py-1 text-xs font-semibold ${
                        health.dependencies.database.status === 'healthy'
                          ? 'bg-green-100 text-green-800'
                          : 'bg-red-100 text-red-800'
                      }`}
                    >
                      {health.dependencies.database.status}
                    </span>
                  </div>
                )}
                {health.dependencies.cache && (
                  <div className="flex items-center justify-between rounded-lg bg-gray-50 p-3">
                    <div>
                      <p className="text-sm font-medium text-gray-600">
                        Cache
                      </p>
                      <p className="text-xs text-gray-500">
                        {health.dependencies.cache.type}
                      </p>
                    </div>
                    <span
                      className={`rounded-full px-2 py-1 text-xs font-semibold ${
                        health.dependencies.cache.status === 'healthy'
                          ? 'bg-green-100 text-green-800'
                          : 'bg-red-100 text-red-800'
                      }`}
                    >
                      {health.dependencies.cache.status}
                    </span>
                  </div>
                )}
                {health.dependencies.storage && (
                  <div className="flex items-center justify-between rounded-lg bg-gray-50 p-3">
                    <div>
                      <p className="text-sm font-medium text-gray-600">
                        Storage
                      </p>
                      <p className="text-xs text-gray-500">
                        {health.dependencies.storage.type}
                      </p>
                    </div>
                    <span
                      className={`rounded-full px-2 py-1 text-xs font-semibold ${
                        health.dependencies.storage.status === 'operational'
                          ? 'bg-green-100 text-green-800'
                          : 'bg-red-100 text-red-800'
                      }`}
                    >
                      {health.dependencies.storage.status}
                    </span>
                  </div>
                )}
              </div>
            )}

            <div className="mt-6 flex gap-2">
              <button
                onClick={() => window.location.reload()}
                className="flex-1 rounded-lg bg-blue-600 px-4 py-2 text-center text-sm font-medium text-white hover:bg-blue-700"
              >
                Refresh
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
