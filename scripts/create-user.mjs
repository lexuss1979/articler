import { randomBytes } from 'node:crypto';
import argon2 from 'argon2';
import postgres from 'postgres';

function usage() {
  console.error('Usage: pnpm create-user <email> [--password=<password>]');
  process.exit(1);
}

function parseArgs(argv) {
  let email = null;
  let password = null;
  for (const arg of argv) {
    if (arg.startsWith('--password=')) password = arg.slice('--password='.length);
    else if (!arg.startsWith('--') && email === null) email = arg;
    else usage();
  }
  if (!email) usage();
  return { email, password };
}

const { email, password: providedPassword } = parseArgs(process.argv.slice(2));

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('DATABASE_URL is not set');
  process.exit(1);
}

const password = providedPassword ?? randomBytes(12).toString('base64url');
const passwordHash = await argon2.hash(password, { type: argon2.argon2id });

const sql = postgres(databaseUrl, { max: 1 });
try {
  const existing = await sql`SELECT id FROM users WHERE email = ${email}`;
  if (existing.length > 0) {
    console.log(`already exists: ${email}`);
  } else {
    await sql`INSERT INTO users (email, password_hash) VALUES (${email}, ${passwordHash})`;
    console.log(`created: ${email}`);
    if (!providedPassword) console.log(`password: ${password}`);
  }
} finally {
  await sql.end();
}
