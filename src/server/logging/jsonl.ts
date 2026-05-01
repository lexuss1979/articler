import fs from 'fs/promises';
import path from 'path';

function dayKey(now: Date): string {
  return now.toISOString().slice(0, 10);
}

export async function appendRunLog(
  entry: object,
  opts?: { now?: Date; baseDir?: string },
): Promise<{ path: string }> {
  const now = opts?.now ?? new Date();
  const baseDir = opts?.baseDir ?? path.resolve(process.cwd(), 'logs/runs');
  const filePath = path.join(baseDir, `${dayKey(now)}.jsonl`);

  await fs.mkdir(baseDir, { recursive: true });
  await fs.appendFile(filePath, JSON.stringify(entry) + '\n', 'utf8');

  return { path: filePath };
}
