import { Pool, types } from 'pg';
import { config } from './config';

// 1082 is the PostgreSQL OID for DATE. By default, node-postgres parses it to local JS Date objects.
// We override it to return the raw string (YYYY-MM-DD) so it is serialized correctly in JSON.
types.setTypeParser(1082, (val) => val);

export const db = new Pool(
  config.db.connectionString
    ? { connectionString: config.db.connectionString }
    : {
        host: config.db.host,
        port: config.db.port,
        database: config.db.database,
        user: config.db.user,
        password: config.db.password,
      }
);

db.on('error', (err) => {
  console.error('Unexpected PostgreSQL pool error', err);
  process.exit(1);
});
