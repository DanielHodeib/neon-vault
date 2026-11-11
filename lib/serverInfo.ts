import { execFileSync } from 'node:child_process';

// Status numbers for the admin server tab.
let commit: string | null | undefined;
const version = () => {
  if (commit === undefined) {
    try {
      commit = execFileSync('git', ['log', '-1', '--format=%h · %s'], { encoding: 'utf8', timeout: 2000 }).trim();
    } catch {
      commit = null; // no git checkout
    }
  }
  return commit;
};

export function serverInfo() {
  const up = Math.floor(process.uptime());
  return {
    uptime: up >= 86_400 ? `${Math.floor(up / 86_400)} T ${Math.floor((up % 86_400) / 3600)} Std` : `${Math.floor(up / 3600)} Std ${Math.floor((up % 3600) / 60)} Min`,
    memoryMb: Math.round(process.memoryUsage().rss / 1_048_576),
    node: process.version,
    version: version(),
    production: process.env.NODE_ENV === 'production',
  };
}

/** Whole seconds until `at` (ms timestamp). */
export const secondsUntil = (at: number) => Math.max(0, Math.round((at - Date.now()) / 1000));
