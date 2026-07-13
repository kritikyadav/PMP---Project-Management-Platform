export type RagInput = string | null | undefined;

export function computeProjectHealth(
  schedule: RagInput,
  budget: RagInput,
  scope: RagInput,
  resources: RagInput,
  timeline: RagInput
): 'green' | 'amber' | 'red' | null {
  const VALID = ['green', 'amber', 'red'];
  const inputs = [schedule, budget, scope, resources, timeline];

  if (inputs.some(v => !v || !VALID.includes((v as string).toLowerCase()))) return null;

  const score = (v: string): number => {
    const lower = v.toLowerCase();
    if (lower === 'green') return 3;
    if (lower === 'amber') return 2;
    return 1;
  };

  const avg = inputs.reduce((sum, v) => sum + score(v as string), 0) / 5;

  // Boundary rule: exactly 2.5 → amber (not green); exactly 1.5 → red (not amber)
  if (avg > 2.5) return 'green';
  if (avg > 1.5) return 'amber';
  return 'red';
}
