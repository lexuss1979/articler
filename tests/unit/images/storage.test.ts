import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { saveImageFromB64 } from '@/server/images/storage';

const ONE_PX_PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

describe('saveImageFromB64', () => {
  let tmpRoot: string;

  beforeEach(async () => {
    tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'articler-images-'));
  });

  afterEach(async () => {
    await fs.rm(tmpRoot, { recursive: true, force: true });
  });

  it('writes the file and returns the expected paths', async () => {
    const { localPath, absPath } = await saveImageFromB64({
      sessionId: 1,
      slotId: 'slot_a',
      candidateId: 'c1',
      mime: 'image/png',
      b64: ONE_PX_PNG_B64,
      root: tmpRoot,
    });
    expect(localPath).toBe('/api/images/1/slot_a/c1.png');
    expect(absPath).toBe(path.join(tmpRoot, '1', 'slot_a', 'c1.png'));

    const readBack = await fs.readFile(absPath);
    expect(readBack.equals(Buffer.from(ONE_PX_PNG_B64, 'base64'))).toBe(true);
  });

  it('uses jpg for image/jpeg', async () => {
    const { localPath } = await saveImageFromB64({
      sessionId: 3,
      slotId: 'slot_b',
      candidateId: 'cj',
      mime: 'image/jpeg',
      b64: ONE_PX_PNG_B64,
      root: tmpRoot,
    });
    expect(localPath.endsWith('.jpg')).toBe(true);
  });

  it('falls back to png extension for an unknown mime', async () => {
    const { localPath, absPath } = await saveImageFromB64({
      sessionId: 4,
      slotId: 'slot_c',
      candidateId: 'cu',
      mime: 'application/x-unknown',
      b64: ONE_PX_PNG_B64,
      root: tmpRoot,
    });
    expect(localPath.endsWith('.png')).toBe(true);
    await expect(fs.stat(absPath)).resolves.toBeDefined();
  });

  it('creates nested directories on demand', async () => {
    await saveImageFromB64({
      sessionId: 7,
      slotId: 'slot_x',
      candidateId: 'c1',
      mime: 'image/png',
      b64: ONE_PX_PNG_B64,
      root: tmpRoot,
    });
    const stat = await fs.stat(path.join(tmpRoot, '7', 'slot_x'));
    expect(stat.isDirectory()).toBe(true);
  });
});
