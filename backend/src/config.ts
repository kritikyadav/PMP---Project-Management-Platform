import dotenv from 'dotenv';
dotenv.config();

function require_env(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required env var: ${key}`);
  return val;
}

export const config = {
  port: parseInt(process.env['PORT'] ?? '4000', 10),
  db: {
    connectionString: process.env['DATABASE_URL'],
    host: process.env['DB_HOST'],
    port: parseInt(process.env['DB_PORT'] ?? '5432', 10),
    database: process.env['DB_NAME'],
    user: process.env['DB_USER'],
    password: process.env['DB_PASSWORD'],
  },
  jwt: {
    secret: require_env('JWT_SECRET'),
    expiresIn: process.env['JWT_EXPIRES_IN'] ?? '15m',
    refreshSecret: process.env['JWT_REFRESH_SECRET'] ?? require_env('JWT_SECRET'),
    refreshExpiresIn: process.env['JWT_REFRESH_EXPIRES_IN'] ?? '7d',
  },
  azure: {
    tenantId: require_env('AZURE_TENANT_ID'),
    clientId: require_env('AZURE_CLIENT_ID'),
    clientSecret: require_env('AZURE_CLIENT_SECRET'),
    redirectUri: require_env('AZURE_REDIRECT_URI'),
  },
  cors: {
    origin: process.env['CORS_ORIGIN'] ?? 'http://localhost:5173',
    devMode: (process.env['NODE_ENV'] ?? 'development') === 'development',
  },
  resend: {
    apiKey: process.env['RESEND_API_KEY'] ?? '',
  },
  app: {
    // FRONTEND_URL takes precedence; falls back to CORS_ORIGIN so no extra env var is needed in dev
    frontendUrl: process.env['FRONTEND_URL'] ?? process.env['CORS_ORIGIN'] ?? 'http://localhost:5173',
  },
  nodeEnv: process.env['NODE_ENV'] ?? 'development',
};
