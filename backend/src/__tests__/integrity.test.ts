import { readFileSync } from 'fs';
import path from 'path';

describe('Database integrity migrations', () => {
  it('prevents direct mutation of rows that are already published', () => {
    const migration = readFileSync(
      path.resolve(__dirname, '../../migrations/003_published_submission_immutability.sql'),
      'utf8'
    );

    expect(migration).toContain('prevent_published_submission_mutation');
    expect(migration).toContain("OLD.status = 'published'");
    expect(migration).toContain('BEFORE UPDATE ON project_submissions');
    expect(migration).toContain('BEFORE DELETE ON project_submissions');
  });
});
