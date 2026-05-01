# Articler

AI-powered long-form article writing assistant.

## Quick start

```bash
cp .env.example .env
# Fill in OPENROUTER_API_KEY and AUTH_SECRET in .env
docker compose up
```

The app is available at http://localhost:18080.

## Local development

```bash
pnpm install
pnpm dev          # Next.js dev server at http://localhost:3000
```

## Database

```bash
docker compose up -d db          # start Postgres on port 13036
pnpm db:migrate                  # apply migrations
```

## Commands

| Command             | Description                      |
| ------------------- | -------------------------------- |
| `pnpm dev`          | Start Next.js dev server         |
| `pnpm build`        | Production build                 |
| `pnpm lint`         | ESLint                           |
| `pnpm typecheck`    | TypeScript type check            |
| `pnpm test`         | Vitest unit tests                |
| `pnpm format`       | Prettier (write)                 |
| `pnpm format:check` | Prettier (check only)            |
| `pnpm db:generate`  | Generate Drizzle migrations      |
| `pnpm db:migrate`   | Apply migrations to DATABASE_URL |

## Required environment variables

See `.env.example` for the full list.

| Variable             | Description                         |
| -------------------- | ----------------------------------- |
| `DATABASE_URL`       | Postgres connection string          |
| `OPENROUTER_API_KEY` | OpenRouter API key for LLM access   |
| `AUTH_SECRET`        | Auth.js session secret (random str) |
