export type ActivityIdentity = {
  label: string;
  subjectLabel: string;
  jobReference: string | null;
};

/** Collapse only back-to-back rows that describe the same event. Earlier rows stay. */
export function collapseActivity<T extends ActivityIdentity>(rows: readonly T[]): Array<T & { count: number }> {
  const collapsed: Array<T & { count: number }> = [];
  for (const row of rows) {
    const last = collapsed[collapsed.length - 1];
    if (
      last &&
      last.label === row.label &&
      last.subjectLabel === row.subjectLabel &&
      last.jobReference === row.jobReference
    ) {
      last.count += 1;
      continue;
    }
    collapsed.push({ ...row, count: 1 });
  }
  return collapsed;
}
