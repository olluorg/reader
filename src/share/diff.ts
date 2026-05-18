/**
 * Minimal line-level diff for rendering "applied changes" in the versions panel.
 *
 * Uses a classic LCS dynamic-programming pass (O(n*m) time/space). That's fine
 * for the doc sizes we ever encode into a URL — even 50 KB of markdown is only
 * a few thousand lines.
 */

export type DiffOp = 'eq' | 'add' | 'del';

export interface DiffHunk {
  op: DiffOp;
  /** Line of text — never empty for add/del; may be empty for blank lines. */
  text: string;
}

export function diffLines(before: string, after: string): DiffHunk[] {
  const a = before.split('\n');
  const b = after.split('\n');
  const n = a.length;
  const m = b.length;

  // dp[i][j] = LCS length of a[i..] and b[j..]
  const dp: Uint32Array[] = Array.from(
    { length: n + 1 },
    () => new Uint32Array(m + 1),
  );
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      if (a[i] === b[j]) {
        dp[i][j] = dp[i + 1][j + 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
  }

  const out: DiffHunk[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out.push({ op: 'eq', text: a[i] });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      out.push({ op: 'del', text: a[i] });
      i++;
    } else {
      out.push({ op: 'add', text: b[j] });
      j++;
    }
  }
  while (i < n) out.push({ op: 'del', text: a[i++] });
  while (j < m) out.push({ op: 'add', text: b[j++] });
  return out;
}

export interface DiffStats {
  added: number;
  removed: number;
  unchanged: number;
}

export function diffStats(hunks: DiffHunk[]): DiffStats {
  let added = 0;
  let removed = 0;
  let unchanged = 0;
  for (const h of hunks) {
    if (h.op === 'add') added++;
    else if (h.op === 'del') removed++;
    else unchanged++;
  }
  return { added, removed, unchanged };
}
