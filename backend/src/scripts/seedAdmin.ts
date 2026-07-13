import bcrypt from 'bcrypt';
import { db } from '../db';

export async function seedAdminUser(): Promise<void> {
  const email = 'admin@email.com';
  const name = 'Admin';
  const role = 'system_admin';
  const password = 'Test@123';

  const passwordHash = await bcrypt.hash(password, 12);

  await db.query(
    `INSERT INTO users (email, name, role, is_active, password_hash)
     VALUES ($1, $2, $3, true, $4)
     ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash, role = EXCLUDED.role`,
    [email, name, role, passwordHash]
  );

  console.log(`Seed complete. Admin user '${email}' upserted with password hash.`);
}

// Allow running directly: ts-node src/scripts/seedAdmin.ts
if (require.main === module) {
  seedAdminUser()
    .then(() => process.exit(0))
    .catch((err: unknown) => {
      console.error('Seed failed:', err);
      process.exit(1);
    });
}
