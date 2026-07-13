import cron from 'node-cron';
import axios from 'axios';
import { db } from './db';
import { config } from './config';

const TOKEN_URL = `https://login.microsoftonline.com/${config.azure.tenantId}/oauth2/v2.0/token`;
const GRAPH_USERS_URL = 'https://graph.microsoft.com/v1.0/users?$select=displayName,mail,userPrincipalName,department,jobTitle&$top=999';

async function getMsAccessToken(): Promise<string> {
  const params = new URLSearchParams();
  params.append('grant_type', 'client_credentials');
  params.append('client_id', config.azure.clientId);
  params.append('client_secret', config.azure.clientSecret);
  params.append('scope', 'https://graph.microsoft.com/.default');

  const response = await axios.post(TOKEN_URL, params.toString(), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });

  return response.data.access_token as string;
}

async function fetchAllMsUsers(token: string): Promise<any[]> {
  const users: any[] = [];
  let url: string | null = GRAPH_USERS_URL;

  while (url) {
    const response = await axios.get<{ value: any[]; '@odata.nextLink'?: string }>(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data: { value: any[]; '@odata.nextLink'?: string } = response.data;
    if (Array.isArray(data.value)) users.push(...data.value);
    url = data['@odata.nextLink'] ?? null;
  }

  return users;
}

export async function syncMsEmployees(): Promise<void> {
  console.log('[MS Sync] Starting MS Teams employee sync...');

  try {
    const token = await getMsAccessToken();
    const msUsers = await fetchAllMsUsers(token);

    const client = await db.connect();
    let syncedCount = 0;

    try {
      await client.query('BEGIN');

      for (const u of msUsers) {
        const email = (u.mail || u.userPrincipalName || '').toLowerCase();
        if (!email || email.includes('#ext#')) continue;

        const name: string | null = u.displayName || null;
        const department: string | null = u.department || null;
        const jobTitle: string | null = u.jobTitle || null;

        const existing = await client.query(
          'SELECT id, name FROM users WHERE email = $1',
          [email]
        );

        if (existing.rows.length > 0) {
          const currentName: string | null = existing.rows[0].name;
          await client.query(
            `UPDATE users
             SET ms_department = $1,
                 ms_job_title  = $2,
                 name          = COALESCE($3, name),
                 updated_at    = NOW()
             WHERE email = $4`,
            [department, jobTitle, currentName ? null : name, email]
          );
        } else {
          await client.query(
            `INSERT INTO users (email, name, role, is_active, ms_department, ms_job_title)
             VALUES ($1, $2, 'employee', true, $3, $4)`,
            [email, name, department, jobTitle]
          );
        }

        syncedCount++;
      }

      await client.query('COMMIT');
      console.log(`[MS Sync] Synced ${syncedCount} users from MS Graph.`);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err: any) {
    console.error('[MS Sync] Sync failed:', err.response?.data ?? err.message);
  }
}

export function startMsCron(): void {
  cron.schedule('0 0 * * *', () => {
    void syncMsEmployees();
  });
  console.log('[MS Sync] Scheduled daily MS Teams employee sync.');
}
