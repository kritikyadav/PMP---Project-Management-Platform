import { readFile } from 'fs/promises';
import path from 'path';
import { db } from '../db';

async function seedProjectDummyData(): Promise<void> {
  const sqlPath = path.resolve(__dirname, '../../scripts/seed_dummy_data.sql');
  const sql = await readFile(sqlPath, 'utf8');
  await db.query(sql);
  console.log('Project dummy data seeded successfully.');
}

if (require.main === module) {
  seedProjectDummyData()
    .then(() => process.exit(0))
    .catch((err: unknown) => {
      console.error('Project dummy data seed failed:', err);
      process.exit(1);
    });
}

export { seedProjectDummyData };
