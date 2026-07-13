import bcrypt from 'bcrypt';
import { db } from '../db';

type DummyUser = {
  email: string;
  name: string;
  role: 'cxo' | 'program_manager' | 'pm' | 'employee';
  ms_department: string;
  ms_job_title: string;
};


const DUMMY_USERS: DummyUser[] = [
  { email: '', name: 'Cameron XO', role: 'cxo', ms_department: 'Executive', ms_job_title: 'Chief Experience Officer' },
  { email: '', name: 'Priya Program', role: 'program_manager', ms_department: 'Delivery', ms_job_title: 'Program Manager' },
  { email: '', name: 'Raj Program', role: 'program_manager', ms_department: 'Delivery', ms_job_title: 'Program Manager' },
  { email: '', name: 'Paula PM', role: 'pm', ms_department: 'Delivery', ms_job_title: 'Project Manager' },
  { email: '', name: 'Marcus PM', role: 'pm', ms_department: 'Delivery', ms_job_title: 'Project Manager' },
  { email: '', name: 'Nina PM', role: 'pm', ms_department: 'Delivery', ms_job_title: 'Project Manager' },
  { email: '', name: 'Isaac PM', role: 'pm', ms_department: 'Delivery', ms_job_title: 'Project Manager' },
  { email: '', name: 'Aisha Employee', role: 'employee', ms_department: 'Engineering', ms_job_title: 'Software Engineer' },
  { email: '', name: 'Ben Employee', role: 'employee', ms_department: 'Engineering', ms_job_title: 'QA Analyst' },
  { email: '', name: 'Chen Employee', role: 'employee', ms_department: 'Engineering', ms_job_title: 'DevOps Engineer' },
  { email: '', name: 'Dana Employee', role: 'employee', ms_department: 'Design', ms_job_title: 'UX Designer' },
  { email: '', name: 'Eli Employee', role: 'employee', ms_department: 'Product', ms_job_title: 'Business Analyst' },
  { email: '', name: 'Fatima Employee', role: 'employee', ms_department: 'Engineering', ms_job_title: 'Frontend Engineer' },
  { email: '', name: 'George Employee', role: 'employee', ms_department: 'Engineering', ms_job_title: 'Backend Engineer' },
  { email: '', name: 'Hana Employee', role: 'employee', ms_department: 'Operations', ms_job_title: 'Project Coordinator' },
  { email: '', name: 'Ibrahim Employee', role: 'employee', ms_department: 'Support', ms_job_title: 'Customer Success' },
  { email: '', name: 'Julia Employee', role: 'employee', ms_department: 'Finance', ms_job_title: 'Finance Analyst' },
];

export async function fillDummyUsers(): Promise<void> {
  const generateEmail = (fullName: string): string => {
    const firstName = fullName.split(' ')[0].toLowerCase();
    return `${firstName}@email.co`;
  };

  const generatePassword = (fullName: string): string => {
    const firstName = fullName.split(' ')[0];
    return `${firstName}@123`;
  };

  const client = await db.connect();
  try {
    const adminCheck = await client.query(
      `SELECT 1 FROM users WHERE email = $1 LIMIT 1`,
      ['admin@email.com']
    );
    if (adminCheck.rowCount === 0) {
      throw new Error('Admin user admin@email.com not found. Please run "npm run seed:admin" before "npm run fill:dummydata".');
    }

    await client.query('BEGIN');
    for (const user of DUMMY_USERS) {
      const email = generateEmail(user.name);
      const password = generatePassword(user.name);
      const passwordHash = await bcrypt.hash(password, 12);
      await client.query(
        `INSERT INTO users (email, name, role, is_active, password_hash, ms_department, ms_job_title)
         VALUES ($1, $2, $3, true, $4, $5, $6)
         ON CONFLICT (email) DO UPDATE SET
           name = EXCLUDED.name,
           role = EXCLUDED.role,
           is_active = EXCLUDED.is_active,
           password_hash = EXCLUDED.password_hash,
           ms_department = EXCLUDED.ms_department,
           ms_job_title = EXCLUDED.ms_job_title`,
        [email.toLowerCase(), user.name, user.role, passwordHash, user.ms_department, user.ms_job_title]
      );
    }
    await client.query('COMMIT');
    console.log(`Seed complete. ${DUMMY_USERS.length} dummy users upserted with password hashes.`);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

if (require.main === module) {
  fillDummyUsers()
    .then(() => process.exit(0))
    .catch((err: unknown) => {
      console.error('Dummy data seed failed:', err);
      process.exit(1);
    });
}
