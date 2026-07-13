const { Pool } = require('pg');
require('dotenv').config({ path: '.env' });

const db = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function main() {
  const users = await db.query("SELECT id, email, name, role FROM users WHERE email='pm1@gmail.com'");
  console.log('Users:');
  console.table(users.rows);

  const pmUser = users.rows[0];

  const projects = await db.query("SELECT id, name, assigned_pm_id FROM projects");
  console.log('Projects:');
  console.table(projects.rows);

  if (pmUser) {
    const pmId = pmUser.id;
    console.log(`pm1@gmail.com ID is: ${pmId}`);
    const pmProjects = projects.rows.filter(p => p.assigned_pm_id === pmId);
    console.log(`Projects assigned to pm1:`, pmProjects.length);
  }

  await db.end();
}

main().catch(console.error);
