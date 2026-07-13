/** Format an ISO date string or Date as dd/mm/yyyy. Returns '-' for null/undefined/invalid. */
export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return '-';
  const d = typeof value === 'string' ? new Date(value) : value;
  if (isNaN(d.getTime())) return '-';
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const yyyy = d.getUTCFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

/** Format two ISO dates as a range: "dd/mm/yyyy → dd/mm/yyyy" */
export function formatDateRange(start: string | null | undefined, end: string | null | undefined): string {
  if (!start && !end) return 'N/A';
  return `${formatDate(start)} → ${formatDate(end)}`;
}
