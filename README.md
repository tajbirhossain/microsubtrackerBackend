# MicroSubTracker — backend

API for the subscription tracker app. Handles auth, CRUD for subs, burn-rate stuff, currency conversion, receipt parsing (Gemini), push jobs via BullMQ, the usual SaaS plumbing.

Not trying to be fancy. Express + TS talking to Postgres, Redis for cache / rate limits / queues.

## Stack

- Node 20, Express, TypeScript
- PostgreSQL
- Redis + BullMQ
- Zod for validation, JWT auth, Pino logs
- Jest + Supertest for tests
- Gemini for parsing receipts / SMS-ish text when you wire that up

## Quick start (local)

You'll want Docker for Postgres + Redis. From this folder:

```bash
docker compose up -d
```

That brings up postgres on `5432` and redis on `6379`.

Copy env and fill in secrets (JWT secrets at least):

```bash
cp .env.example .env
```

Point `DATABASE_URL` at something like:

`postgresql://mst:mst@127.0.0.1:5432/microsubtracker`

`REDIS_URL` can stay `redis://127.0.0.1:6379`.

Then:

```bash
npm install
npm run migrate
npm run dev
```

API lands on port 5000. Health is at `/health` if you just wanna poke it.

Worker is optional locally — `RUN_WORKER_IN_API` in `.env` can embed jobs in the API process, or run `npm run worker` separately.

There's also a `Dockerfile` if you want to build the API image itself. Compose here is mostly for the deps so you don't install Postgres by hand.

## Tests

```bash
npm test
```

Watch mode if you're iterating:

```bash
npm run test:watch
```

There's a handful of unit/integration tests (parser, currency, subscriptions, idempotency, a bit of API via supertest). Make sure compose is up if anything hits redis/db — most of the service tests are mocked-ish but the env still likes having things around.

Misc smoke scripts if you're curious:

```bash
npm run parser:test
npm run currency:test
npm run security:check
```
