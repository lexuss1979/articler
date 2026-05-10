import { fileURLToPath } from 'node:url';

function isMain() {
  const entry = process.argv[1];
  if (!entry) return false;
  return fileURLToPath(import.meta.url) === entry;
}

const HELP = `Usage: node scripts/audit-assertions.mjs (--profile <id> | --all) [--apply]

One-off cleanup tool that re-checks every \`source = 'session'\` assertion against
the L-10 cross-topic generality validator and, with --apply, deletes the rows
that fail.

Run this manually after deploying T-L10-1 through T-L10-6 to clean historical
contamination. The producer-side guards should keep the table clean going
forward, so this script is not meant to run on a schedule.

  --profile <id>   audit a single profile by id
  --all            audit every profile in the system
  --apply          actually delete flagged rows (default: dry run)
  --help, -h       print this message

The script never touches \`source = 'examples'\` rows under any flag.`;

const BATCH_SIZE = 5;

export function parseArgs(argv) {
  let profileId = null;
  let all = false;
  let apply = false;
  let help = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--apply') apply = true;
    else if (arg === '--all') all = true;
    else if (arg === '--help' || arg === '-h') help = true;
    else if (arg === '--profile') {
      const v = argv[++i];
      const n = Number(v);
      profileId = Number.isInteger(n) && n > 0 ? n : null;
    } else if (arg.startsWith('--profile=')) {
      const n = Number(arg.slice('--profile='.length));
      profileId = Number.isInteger(n) && n > 0 ? n : null;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return { profileId, all, apply, help };
}

export async function auditProfile({
  profileId,
  apply,
  listAssertionsFn,
  validateGeneralityFn,
  deleteAssertionFn,
  log = console.log,
}) {
  const all = await listAssertionsFn(profileId);
  const sessionRows = all.filter((r) => r.source === 'session');

  const flagged = [];
  const kept = [];

  for (let i = 0; i < sessionRows.length; i += BATCH_SIZE) {
    const batch = sessionRows.slice(i, i + BATCH_SIZE);
    const items = batch.map((r) => ({
      key: r.key,
      category: r.category,
      assertion: r.assertion,
    }));
    const { results } = await validateGeneralityFn({ items });
    for (let j = 0; j < batch.length; j++) {
      const verdict = results[j];
      if (verdict && verdict.passes === true) {
        kept.push(batch[j]);
      } else {
        flagged.push({ row: batch[j], reason: verdict?.reason ?? '(no reason)' });
      }
    }
  }

  log(`profile ${profileId}: ${kept.length} kept, ${flagged.length} flagged`);
  for (const { row, reason } of flagged) {
    log(`  FLAG ${row.key} — "${row.assertion}" — reason: ${reason}`);
  }

  if (apply) {
    for (const { row } of flagged) {
      await deleteAssertionFn(profileId, row.id);
    }
    log(`deleted ${flagged.length} flagged rows`);
  }

  return { kept, flagged };
}

if (isMain()) {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    console.error(HELP);
    process.exit(2);
  }

  if (args.help || (args.profileId === null && !args.all)) {
    console.log(HELP);
    process.exit(args.help ? 0 : 2);
  }

  const [{ listAssertions, deleteAssertion }, { validateAssertionGenerality }, { runWithLLMContext }] =
    await Promise.all([
      import('../src/server/profiles/profile-assertions-repo.ts'),
      import('../src/server/pipeline/stages/validate-assertion-generality.ts'),
      import('../src/server/llm/context.ts'),
    ]);

  const ctx = {
    emit: async () => undefined,
    userInput: async () => {
      throw new Error('userInput not available in audit script');
    },
    log: { append: async () => {} },
    llm: undefined,
  };

  const validateGeneralityFn = (input) =>
    runWithLLMContext({ userId: 0, sessionId: 0, stage: 'audit', task: 'audit' }, () =>
      validateAssertionGenerality.run(input, ctx),
    );

  const profileIds = args.all ? await loadAllProfileIds() : [args.profileId];

  for (const profileId of profileIds) {
    await auditProfile({
      profileId,
      apply: args.apply,
      listAssertionsFn: listAssertions,
      validateGeneralityFn,
      deleteAssertionFn: deleteAssertion,
    });
  }

  if (!args.apply) {
    console.log('(dry run — pass --apply to delete flagged rows)');
  }

  process.exit(0);
}

async function loadAllProfileIds() {
  const { db } = await import('../src/server/db/client.ts');
  const { profiles } = await import('../src/server/db/schema.ts');
  const rows = await db.select({ id: profiles.id }).from(profiles);
  return rows.map((r) => r.id);
}
