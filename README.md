# Telegram Sales Enhancer

A Telegram-native, bot-assisted sales CRM for manual outreach at team scale.

This repo is now a monorepo with:
- `apps/web`: Next.js CRM for leads, campaigns, accounts, activity, settings
- `apps/bot`: internal Telegram task bot using `grammY`
- `packages/shared`: shared types, template helpers, and validation
- `supabase`: SQL migrations, local config, and seed data

## Product model

This v1 is a manual-send enhancer:
- Leads live once in the CRM and are reusable across campaigns
- Campaigns attach leads, assign Telegram accounts, and define sequence steps
- Follow-ups stay pinned to the same Telegram account for that lead
- The bot hands teammates the next due task
- Teammates open the target chat, send manually, then mark `Sent`, `Skip`, or log a reply

This is intentionally not a personal-account auto-sender.

## Monorepo commands

Install everything:

```bash
pnpm install
```

Run the web app:

```bash
pnpm dev:web
```

Run the Telegram bot:

```bash
pnpm dev:bot
```

Run both together:

```bash
pnpm dev
```

Build the monorepo:

```bash
pnpm build
```

## Environment variables

Copy `.env.example` to `.env` and fill in:

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
TELEGRAM_BOT_TOKEN=
TELEGRAM_WEBHOOK_SECRET=
APP_URL=http://localhost:3000
BOT_PUBLIC_URL=http://localhost:4000
```

`PORT` is optional for the bot and defaults to `4000`.

If Supabase is not configured, the web app falls back to an in-memory demo mode so the UI can still be explored locally.

## Step-by-step setup

### 1. Supabase

1. Create a new Supabase project.
2. In `Authentication > Providers`, enable email login.
3. Open the SQL editor and run the migration in [supabase/migrations/202604021700_init.sql](/Users/anir/Desktop/salessystem/supabase/migrations/202604021700_init.sql).
4. Run the seed in [supabase/seed.sql](/Users/anir/Desktop/salessystem/supabase/seed.sql).
5. In `Storage`, confirm the `imports` bucket exists. The migration creates it automatically.
6. Copy the project URL, anon key, and service role key into `.env`.

### 2. Telegram bot

1. Open Telegram and message `@BotFather`.
2. Run `/newbot`.
3. Choose a display name and username.
4. Copy the bot token into `TELEGRAM_BOT_TOKEN`.
5. Set a random `TELEGRAM_WEBHOOK_SECRET` string.

### 3. Local development

1. Run `pnpm install`.
2. Start the web app with `pnpm dev:web`.
3. In another terminal, start the bot with `pnpm dev:bot`.
4. Open the web app at [http://localhost:3000](http://localhost:3000).
5. Go to Settings and generate a bot link code.
6. In Telegram, DM your bot with `/link CODE`.
7. Create or import leads, create a campaign, assign accounts, attach leads, then launch.
8. In Telegram, run `/next` to pull due tasks.

## Railway deployment

Create two Railway services from this same repository:

### Web service

- Root directory: `/`
- Start command: `pnpm --filter web start`
- Build command: `pnpm install && pnpm --filter web build`
- Required env vars:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `TELEGRAM_WEBHOOK_SECRET`
  - `APP_URL`

### Bot service

- Root directory: `/`
- Start command: `pnpm --filter bot start`
- Build command: `pnpm install && pnpm --filter bot build`
- Required env vars:
  - `TELEGRAM_BOT_TOKEN`
  - `TELEGRAM_WEBHOOK_SECRET`
  - `APP_URL`
  - `BOT_PUBLIC_URL`

After the bot service has a public URL, the bot process will register its Telegram webhook automatically at:

```text
{BOT_PUBLIC_URL}/telegram/webhook
```

## Database model

The repo ships with these core tables:
- `workspaces`
- `profiles`
- `leads`
- `telegram_accounts`
- `campaigns`
- `campaign_sequence_steps`
- `campaign_account_assignments`
- `campaign_leads`
- `send_tasks`
- `activity_log`
- `bot_link_codes`

## UI modules

The CRM only keeps the necessary screens:
- Leads
- Campaigns
- Campaign Detail
- Accounts
- Activity
- Settings

## Telegram task flow

1. Generate a one-time code in Settings
2. DM the bot: `/link CODE`
3. Run `/next`
4. Tap `Open Chat`
5. Send manually from the assigned Telegram account
6. Return to the bot and tap `Mark Sent`, `Skip`, `Replied`, `Interested`, or `Not Interested`

The CRM records every outcome in the activity log and advances the lead inside that specific campaign.

## Current limits of v1

- Manual send only
- Username-first targeting
- Single-workspace setup
- Reply outcomes are logged manually
- No true Telegram personal-account auto-send
