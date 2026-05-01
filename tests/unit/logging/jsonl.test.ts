import { describe, it, expect, afterEach } from 'vitest';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { appendRunLog } from '../../../src/server/logging/jsonl';

let tmpDir: string | undefined;

afterEach(async () => {
  if (tmpDir) {
    await fs.rm(tmpDir, { recursive: true, force: true });
    tmpDir = undefined;
  }
});

describe('appendRunLog', () => {
  it('writes two entries on the same UTC day to the same file as valid JSON lines', async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'jsonl-test-'));
    const now = new Date('2026-05-01T10:00:00Z');

    const r1 = await appendRunLog({ stage: 'a', idx: 1 }, { now, baseDir: tmpDir });
    const r2 = await appendRunLog({ stage: 'b', idx: 2 }, { now, baseDir: tmpDir });

    expect(r1.path).toBe(r2.path);
    expect(path.basename(r1.path)).toBe('2026-05-01.jsonl');

    const raw = await fs.readFile(r1.path, 'utf8');
    const lines = raw.trimEnd().split('\n');
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0])).toMatchObject({ stage: 'a', idx: 1 });
    expect(JSON.parse(lines[1])).toMatchObject({ stage: 'b', idx: 2 });
  });

  it('writes to different files on different UTC days', async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'jsonl-test-'));
    const day1 = new Date('2026-05-01T23:59:00Z');
    const day2 = new Date('2026-05-02T00:01:00Z');

    const r1 = await appendRunLog({ day: 1 }, { now: day1, baseDir: tmpDir });
    const r2 = await appendRunLog({ day: 2 }, { now: day2, baseDir: tmpDir });

    expect(r1.path).not.toBe(r2.path);
    expect(path.basename(r1.path)).toBe('2026-05-01.jsonl');
    expect(path.basename(r2.path)).toBe('2026-05-02.jsonl');
  });

  it('returns the absolute file path', async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'jsonl-test-'));
    const result = await appendRunLog({}, { now: new Date(), baseDir: tmpDir });
    expect(path.isAbsolute(result.path)).toBe(true);
  });
});
