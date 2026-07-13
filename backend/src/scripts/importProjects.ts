import path from 'path';
import { randomUUID } from 'crypto';
import ExcelJS from 'exceljs';
import { db } from '../db';

const VALID_ENGAGEMENT_TYPES = ['Fixed Cost', 'T&M', 'Hybrid'] as const;
const VALID_METHODOLOGIES    = ['Agile', 'Waterfall'] as const;
const VALID_MILESTONE_STATUSES = ['On Track', 'At Risk', 'Delayed', 'Completed', 'Not Started'] as const;

// ─── Args ──────────────────────────────────────────────────────────────────────
const args          = process.argv.slice(2);
const filePath      = args.find(a => !a.startsWith('--'));
const createdByArg  = args.find(a => a.startsWith('--created-by='))?.split('=')[1] ?? 'admin@email.com';
const dryRun        = args.includes('--dry-run');

if (!filePath) {
  console.error(
    'Usage: ts-node src/scripts/importProjects.ts <excel-file> [--created-by=admin@email.com] [--dry-run]'
  );
  process.exit(1);
}

// ─── Helpers ───────────────────────────────────────────────────────────────────
function parseDate(val: unknown): string | null {
  if (!val) return null;
  if (val instanceof Date) return val.toISOString().split('T')[0];
  const str = String(val).trim();
  if (!str) return null;
  const ddmmyyyy = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (ddmmyyyy) return `${ddmmyyyy[3]}-${ddmmyyyy[2].padStart(2, '0')}-${ddmmyyyy[1].padStart(2, '0')}`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
  return null;
}

function cellStr(cell: ExcelJS.Cell): string {
  const v = cell.value;
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return v.toISOString().split('T')[0];
  if (typeof v === 'object' && v !== null && 'text' in v)
    return String((v as { text: unknown }).text).trim();
  return String(v).trim();
}

function getHeaderMap(ws: ExcelJS.Worksheet): Map<string, number> {
  const map = new Map<string, number>();
  ws.getRow(1).eachCell((cell, col) => {
    const h = cellStr(cell).toLowerCase().replace(/\s+/g, '_');
    if (h) map.set(h, col);
  });
  return map;
}

// ─── Row types ─────────────────────────────────────────────────────────────────
interface ProjectRow     { project_name: string; client_name: string; pm_email: string; engagement_type: string; methodology: string; project_start_date: string; project_end_date: string }
interface StakeholderRow { project_name: string; name: string; contact_no: string; email: string }
interface TeamMemberRow  { project_name: string; employee_name: string; employee_id: string; role: string; allocation_percentage: string }
interface MilestoneRow   { project_name: string; name: string; target_date: string; status: string }

function readSheet<T extends Record<string, string>>(
  ws: ExcelJS.Worksheet | undefined,
  requiredCols: (keyof T)[],
): T[] {
  if (!ws) return [];
  const headers = getHeaderMap(ws);
  const rows: T[] = [];
  ws.eachRow((row, rowNum) => {
    if (rowNum === 1) return;
    const get = (col: string): string => {
      const idx = headers.get(col);
      return idx ? cellStr(row.getCell(idx)) : '';
    };
    const obj = {} as T;
    for (const col of Object.keys(Object.fromEntries(headers))) {
      (obj as Record<string, string>)[col] = get(col);
    }
    if (requiredCols.every(c => get(c as string))) rows.push(obj);
  });
  return rows;
}

// ─── Main ──────────────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  const absPath = path.resolve(filePath!);
  console.log(`\nReading: ${absPath}`);

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(absPath);

  const findSheet = (name: string) =>
    workbook.worksheets.find(ws => ws.name.toLowerCase() === name.toLowerCase());

  const projectsSheet = findSheet('Projects');
  if (!projectsSheet) {
    console.error('ERROR: Sheet "Projects" not found. Ensure the first sheet is named "Projects".');
    process.exit(1);
  }

  // ─── Parse all sheets ────────────────────────────────────────────────────────
  const projectHeaders = getHeaderMap(projectsSheet);
  const projects: ProjectRow[] = [];
  projectsSheet.eachRow((row, rowNum) => {
    if (rowNum === 1) return;
    const get = (col: string) => { const i = projectHeaders.get(col); return i ? cellStr(row.getCell(i)) : ''; };
    const name = get('project_name'), client = get('client_name');
    if (!name || !client) return;
    projects.push({
      project_name: name, client_name: client,
      pm_email: get('pm_email'), engagement_type: get('engagement_type'),
      methodology: get('methodology'), project_start_date: get('project_start_date'),
      project_end_date: get('project_end_date'),
    });
  });

  const stakeholdersSheet = findSheet('Stakeholders');
  const stakeholders: StakeholderRow[] = [];
  if (stakeholdersSheet) {
    const h = getHeaderMap(stakeholdersSheet);
    stakeholdersSheet.eachRow((row, rowNum) => {
      if (rowNum === 1) return;
      const get = (col: string) => { const i = h.get(col); return i ? cellStr(row.getCell(i)) : ''; };
      const pname = get('project_name'), name = get('name');
      if (!pname || !name) return;
      stakeholders.push({ project_name: pname, name, contact_no: get('contact_no'), email: get('email') });
    });
  }

  const teamMembersSheet = findSheet('Team_Members');
  const teamMembers: TeamMemberRow[] = [];
  if (teamMembersSheet) {
    const h = getHeaderMap(teamMembersSheet);
    teamMembersSheet.eachRow((row, rowNum) => {
      if (rowNum === 1) return;
      const get = (col: string) => { const i = h.get(col); return i ? cellStr(row.getCell(i)) : ''; };
      const pname = get('project_name'), ename = get('employee_name');
      if (!pname || !ename) return;
      teamMembers.push({ project_name: pname, employee_name: ename, employee_id: get('employee_id'), role: get('role'), allocation_percentage: get('allocation_percentage') });
    });
  }

  const milestonesSheet = findSheet('Milestones');
  const milestones: MilestoneRow[] = [];
  if (milestonesSheet) {
    const h = getHeaderMap(milestonesSheet);
    milestonesSheet.eachRow((row, rowNum) => {
      if (rowNum === 1) return;
      const get = (col: string) => { const i = h.get(col); return i ? cellStr(row.getCell(i)) : ''; };
      const pname = get('project_name'), mname = get('name');
      if (!pname || !mname) return;
      milestones.push({ project_name: pname, name: mname, target_date: get('target_date'), status: get('status') });
    });
  }

  if (!projects.length) {
    console.error('ERROR: No valid rows found in the Projects sheet (need at least project_name + client_name).');
    process.exit(1);
  }

  // ─── DB lookups ───────────────────────────────────────────────────────────────
  const { rows: cbRows } = await db.query<{ id: string }>(
    'SELECT id FROM users WHERE email = $1 AND is_active = true', [createdByArg]
  );
  if (!cbRows.length) {
    console.error(`ERROR: User '${createdByArg}' not found or inactive. Pass --created-by=<email> with an active user.`);
    process.exit(1);
  }
  const createdById = cbRows[0].id;

  const { rows: pmRows } = await db.query<{ id: string; email: string }>(
    `SELECT id, email FROM users WHERE role = 'pm' AND is_active = true`
  );
  const pmByEmail = new Map(pmRows.map(r => [r.email.toLowerCase(), r.id]));

  // ─── Validate ─────────────────────────────────────────────────────────────────
  const errors: string[] = [];
  const seenNames = new Set<string>();

  for (const [i, p] of projects.entries()) {
    const row = i + 2;
    const key = p.project_name.toLowerCase();
    if (seenNames.has(key))
      errors.push(`Projects row ${row}: duplicate project_name "${p.project_name}"`);
    seenNames.add(key);

    if (p.engagement_type && !VALID_ENGAGEMENT_TYPES.includes(p.engagement_type as typeof VALID_ENGAGEMENT_TYPES[number]))
      errors.push(`Projects row ${row}: engagement_type must be one of [${VALID_ENGAGEMENT_TYPES.join(', ')}] — got "${p.engagement_type}"`);

    if (p.methodology && !VALID_METHODOLOGIES.includes(p.methodology as typeof VALID_METHODOLOGIES[number]))
      errors.push(`Projects row ${row}: methodology must be one of [${VALID_METHODOLOGIES.join(', ')}] — got "${p.methodology}"`);

    if (p.pm_email && !pmByEmail.has(p.pm_email.toLowerCase()))
      errors.push(`Projects row ${row}: pm_email "${p.pm_email}" not found or inactive in the system`);

    if (p.project_start_date && !parseDate(p.project_start_date))
      errors.push(`Projects row ${row}: project_start_date "${p.project_start_date}" is not a valid date (use DD/MM/YYYY)`);

    if (p.project_end_date && !parseDate(p.project_end_date))
      errors.push(`Projects row ${row}: project_end_date "${p.project_end_date}" is not a valid date (use DD/MM/YYYY)`);
  }

  for (const [i, s] of stakeholders.entries()) {
    if (!seenNames.has(s.project_name.toLowerCase()))
      errors.push(`Stakeholders row ${i + 2}: project_name "${s.project_name}" not in Projects sheet`);
  }

  for (const [i, t] of teamMembers.entries()) {
    if (!seenNames.has(t.project_name.toLowerCase()))
      errors.push(`Team_Members row ${i + 2}: project_name "${t.project_name}" not in Projects sheet`);
  }

  for (const [i, m] of milestones.entries()) {
    if (!seenNames.has(m.project_name.toLowerCase()))
      errors.push(`Milestones row ${i + 2}: project_name "${m.project_name}" not in Projects sheet`);
    if (m.status && !VALID_MILESTONE_STATUSES.includes(m.status as typeof VALID_MILESTONE_STATUSES[number]))
      errors.push(`Milestones row ${i + 2}: status must be one of [${VALID_MILESTONE_STATUSES.join(', ')}] — got "${m.status}"`);
  }

  if (errors.length) {
    console.error('\nValidation errors — fix before importing:\n');
    errors.forEach(e => console.error(`  ✗ ${e}`));
    process.exit(1);
  }

  // ─── Summary ──────────────────────────────────────────────────────────────────
  console.log(`\nReady to import:`);
  console.log(`  Projects     : ${projects.length}`);
  console.log(`  Stakeholders : ${stakeholders.length}`);
  console.log(`  Team Members : ${teamMembers.length}`);
  console.log(`  Milestones   : ${milestones.length}`);
  console.log(`  Created by   : ${createdByArg}`);

  if (dryRun) {
    console.log('\n[DRY RUN] No changes written to database.\n');
    process.exit(0);
  }

  // ─── Insert ───────────────────────────────────────────────────────────────────
  let inserted = 0;
  let skipped  = 0;

  for (const p of projects) {
    const { rows: existing } = await db.query<{ id: string }>(
      'SELECT id FROM projects WHERE lower(name) = lower($1) AND lower(client_name) = lower($2)',
      [p.project_name, p.client_name]
    );
    if (existing.length) {
      console.warn(`  SKIP (already exists): "${p.project_name}" / "${p.client_name}"`);
      skipped++;
      continue;
    }

    const pmId      = p.pm_email ? (pmByEmail.get(p.pm_email.toLowerCase()) ?? null) : null;
    const startDate = parseDate(p.project_start_date);
    const endDate   = parseDate(p.project_end_date);

    const projectStakeholders = stakeholders
      .filter(s => s.project_name.toLowerCase() === p.project_name.toLowerCase())
      .map(s => ({ id: randomUUID(), name: s.name, contact_no: s.contact_no || '', email: s.email || '' }));

    const projectTeam = teamMembers
      .filter(t => t.project_name.toLowerCase() === p.project_name.toLowerCase())
      .map((t, idx) => ({
        serial_number: idx + 1,
        user_id: null,
        employee_id: t.employee_id || '',
        role: t.role || '',
        employee_name: t.employee_name,
        allocation_percentage: t.allocation_percentage ? parseFloat(t.allocation_percentage) : null,
      }));

    const projectMilestones = milestones
      .filter(m => m.project_name.toLowerCase() === p.project_name.toLowerCase())
      .map(m => ({
        id: randomUUID(),
        name: m.name,
        target_date: parseDate(m.target_date),
        status: m.status || 'Not Started',
        comment: null,
      }));

    await db.query(
      `INSERT INTO projects
         (name, client_name, assigned_pm_id, engagement_type, methodology,
          project_start_date, project_end_date,
          stakeholders, team_members, milestones, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,$10::jsonb,$11)`,
      [
        p.project_name, p.client_name, pmId,
        p.engagement_type || null, p.methodology || null,
        startDate, endDate,
        JSON.stringify(projectStakeholders),
        JSON.stringify(projectTeam),
        JSON.stringify(projectMilestones),
        createdById,
      ]
    );

    const pmLabel = pmId ? ` → PM: ${p.pm_email}` : '';
    console.log(`  ✓ "${p.project_name}" (${p.client_name})${pmLabel}`);
    inserted++;
  }

  console.log(`\nDone. Inserted: ${inserted}, Skipped (duplicate): ${skipped}\n`);
  process.exit(0);
}

main().catch((err: unknown) => {
  console.error('Import failed:', err);
  process.exit(1);
});
