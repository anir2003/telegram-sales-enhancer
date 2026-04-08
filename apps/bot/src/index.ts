import 'dotenv/config';
import { createServer } from 'node:http';
import { Bot, Context, Keyboard, webhookCallback } from 'grammy';
import { AppApiClient, type BotTask } from './api';
import { getBotConfig } from './config';
import { buildResolvedKeyboard, buildSentKeyboard, buildSkipPromptKeyboard, buildTaskKeyboard, buildTaskMessage } from './task-card';

const config = getBotConfig();
const api = new AppApiClient({
  appUrl: config.appUrl,
  secret: config.webhookSecret || undefined,
});
const bot = new Bot(config.token);

// Tracks users who clicked Skip and are expected to type a reason next.
// Maps telegramUserId → { taskId, promptMsgId, chatId }
const pendingSkips = new Map<number, { taskId: string; promptMsgId: number; chatId: number }>();
const pendingRestrictions = new Map<number, { promptMsgId: number; chatId: number }>();

function commandMenu() {
  return new Keyboard().text('Next task').text('Restricted').resized();
}

// Intercept plain text messages from users who are mid-skip flow (typed a reason).
bot.use(async (ctx, next) => {
  const userId = ctx.from?.id;
  const text = ctx.message?.text;
  if (userId && text && !text.startsWith('/') && pendingRestrictions.has(userId)) {
    const pending = pendingRestrictions.get(userId)!;
    pendingRestrictions.delete(userId);
    try {
      const { result } = await api.reportRestriction(userId, text.trim());
      try {
        await ctx.api.editMessageText(
          pending.chatId,
          pending.promptMsgId,
          `⚠ <b>Restriction saved</b>\n\nRestricted until: <b>${result.restrictedUntil}</b>\nCooldown until: <b>${result.cooldownUntil}</b>\nTransferred leads in the affected send window: <b>${result.transferWindowCount}</b>`,
          { parse_mode: 'HTML' },
        );
      } catch { /* ignore */ }
      await ctx.reply('Restriction recorded. This account will stop receiving tasks until the cooldown and recovery rules allow it again.', {
        reply_markup: commandMenu(),
      });
    } catch (error: any) {
      await ctx.reply(error?.message ?? 'Could not parse that SpamBot message. Please paste the full message exactly as Telegram sent it.');
      pendingRestrictions.set(userId, pending);
    }
    return;
  }
  if (userId && text && !text.startsWith('/') && pendingSkips.has(userId)) {
    const pending = pendingSkips.get(userId)!;
    pendingSkips.delete(userId);
    await api.markTaskSkipped(pending.taskId, userId, text.trim());
    try {
      await ctx.api.editMessageText(
        pending.chatId,
        pending.promptMsgId,
        `⏭ <b>Skipped</b> · <i>Note saved: "${text.trim()}"</i>`,
        { parse_mode: 'HTML' },
      );
    } catch { /* message may already be gone */ }
    await sendNextTask(ctx);
    return;
  }
  await next();
});

async function sendTaskCard(ctx: Context, task: BotTask) {
  await ctx.reply(buildTaskMessage(task), {
    parse_mode: 'HTML',
    link_preview_options: { is_disabled: true },
    reply_markup: buildTaskKeyboard(task),
  });
}

async function sendNextTask(ctx: Context) {
  const telegramUserId = ctx.from?.id;
  if (!telegramUserId) {
    await ctx.reply('Telegram user not found for this session.');
    return;
  }

  try {
    const response = await api.getNextTask(telegramUserId);
    if (!response.task) {
      await ctx.reply('No due tasks right now. When a campaign step becomes due, it will show up here.', {
        reply_markup: commandMenu(),
      });
      return;
    }

    await sendTaskCard(ctx, response.task);
  } catch (error: any) {
    if (error.message?.includes('NOT_LINKED')) {
      await ctx.reply('This Telegram account is not registered as a Sender Account! Please generate a connect code on the Accounts page and send /connect CODE to this bot.');
    } else {
      console.error(error);
      await ctx.reply('Something went wrong fetching the next task.');
    }
  }
}

async function promptRestrictionFlow(ctx: Context) {
  const userId = ctx.from?.id;
  if (!userId) {
    await ctx.reply('Telegram user not found for this session.');
    return;
  }

  const prompt = await ctx.reply(
    [
      '⚠ <b>Report restriction</b>',
      '',
      '1. Open <b>@SpamBot</b> in Telegram.',
      '2. Send <code>/start</code> there.',
      '3. Copy the full restriction message you receive.',
      '4. Paste that full message here.',
    ].join('\n'),
    { parse_mode: 'HTML' },
  );
  pendingRestrictions.set(userId, { promptMsgId: prompt.message_id, chatId: prompt.chat.id });
}

bot.command('start', async (ctx) => {
  await ctx.reply(
    [
      'This is your internal Telegram sales task bot.',
      '',
      '/connect CODE — Register this account as a sender (from Accounts page)',
      '/next — Pull the next due outreach task',
      '/restricted — Report a Telegram restriction from SpamBot',
      '/replied @username — Mark a lead as replied by their Telegram username',
      '',
      'Each Telegram account you want to use for sending needs its own /connect code.',
    ].join('\n'),
    { reply_markup: commandMenu() },
  );
});

bot.command('connect', async (ctx) => {
  const code = ctx.message?.text.split(/\s+/)[1]?.trim()?.toUpperCase();
  if (!code) {
    await ctx.reply(
      'Send /connect CODE using the code generated on the Accounts page to register this Telegram account as a sender.',
    );
    return;
  }

  if (!ctx.from) {
    await ctx.reply('Telegram user not found for this session.');
    return;
  }

  try {
    const response = await api.connectAccount({
      code,
      telegramUserId: ctx.from.id,
      telegramUsername: ctx.from.username ?? `user_${ctx.from.id}`,
    });

    const account = response.account;
    await ctx.reply(
      `Telegram account connected as sender.\n\nLabel: ${account?.label ?? 'Account'}\nUsername: @${account?.telegram_username ?? ctx.from.username}\n\nThis account can now be assigned to campaigns. Use /next to pull tasks.`,
      { reply_markup: commandMenu() },
    );
  } catch (error) {
    console.error(error);
    await ctx.reply(
      'That account link code is invalid or expired. Generate a fresh code on the Accounts page and try again.',
    );
  }
});

bot.command('replied', async (ctx) => {
  const parts = ctx.message?.text.split(/\s+/);
  const rawUsername = parts?.[1]?.trim().replace(/^@/, '');
  if (!rawUsername) {
    await ctx.reply('Usage: /replied @username\n\nMarks the most recent active outreach to that Telegram user as replied.');
    return;
  }
  if (!ctx.from) return;

  try {
    const result = await api.markLeadReplied(rawUsername, ctx.from.id);
    if (result.ok) {
      await ctx.reply(`✅ @${rawUsername} has been marked as replied.`);
    } else {
      await ctx.reply(`Could not find an active campaign lead for @${rawUsername}. Make sure the username is correct.`);
    }
  } catch (err: any) {
    console.error('mark-replied error', err);
    await ctx.reply(`Something went wrong: ${err?.message ?? 'unknown error'}`);
  }
});

bot.command('next', sendNextTask);
bot.command('restricted', promptRestrictionFlow);
bot.hears(/^next task$/i, sendNextTask);
bot.hears(/^restricted$/i, promptRestrictionFlow);
bot.hears(/^[A-Z0-9]{6}$/i, async (ctx) => {
  const code = ctx.message?.text?.trim()?.toUpperCase();
  if (!code || !ctx.from) {
    return;
  }

  try {
    const response = await api.connectAccount({
      code,
      telegramUserId: ctx.from.id,
      telegramUsername: ctx.from.username ?? `user_${ctx.from.id}`,
    });

    const account = response.account;
    await ctx.reply(
      `Telegram account connected as sender.\n\nLabel: ${account?.label ?? 'Account'}\nUsername: @${account?.telegram_username ?? ctx.from.username}\n\nThis account can now be assigned to campaigns. Use /next to pull tasks.`,
      { reply_markup: commandMenu() },
    );
  } catch (error) {
    console.error(error);
    await ctx.reply(
      'That account link code is invalid or expired. Generate a fresh code on the Accounts page and try again.',
    );
  }
});

bot.callbackQuery('noop', async (ctx) => {
  await ctx.answerCallbackQuery();
});
bot.callbackQuery('task:next', sendNextTask);

bot.callbackQuery(/^task:sent:(.+)$/, async (ctx) => {
  const taskId = ctx.match[1];
  await api.markTaskSent(taskId, ctx.from.id);
  await ctx.answerCallbackQuery({ text: 'Marked sent' });
  try {
    await ctx.editMessageReplyMarkup({
      reply_markup: buildSentKeyboard(taskId),
    });
  } catch (error) {
    console.warn('Unable to update inline keyboard', error);
  }
  await sendNextTask(ctx);
});

bot.callbackQuery(/^task:change-message:(.+)$/, async (ctx) => {
  const taskId = ctx.match[1];
  const response = await api.changeTaskMessage(taskId, ctx.from.id);
  await ctx.answerCallbackQuery({ text: 'Message updated' });
  if (response.task) {
    try {
      await ctx.editMessageText(buildTaskMessage(response.task), {
        parse_mode: 'HTML',
        link_preview_options: { is_disabled: true },
        reply_markup: buildTaskKeyboard(response.task),
      });
    } catch (error) {
      console.warn('Unable to update message text', error);
    }
  }
});

// Step 1 — user clicked ⏭ Skip on the task card: ask for a reason.
bot.callbackQuery(/^task:skip:ask:(.+)$/, async (ctx) => {
  const taskId = ctx.match[1];
  const userId = ctx.from.id;
  await ctx.answerCallbackQuery();
  try {
    await ctx.editMessageReplyMarkup({ reply_markup: buildResolvedKeyboard('⏭ Skipping…') });
  } catch { /* ignore */ }
  const prompt = await ctx.reply(
    '⏭ <b>Add a skip note?</b>\n\nType your reason now and it will be saved to this lead\'s CRM notes.\nOr tap below to skip without a note.',
    {
      parse_mode: 'HTML',
      reply_markup: buildSkipPromptKeyboard(taskId),
    },
  );
  pendingSkips.set(userId, { taskId, promptMsgId: prompt.message_id, chatId: prompt.chat.id });
});

bot.callbackQuery('task:restricted', async (ctx) => {
  await ctx.answerCallbackQuery();
  await promptRestrictionFlow(ctx);
});

// Step 2a — user tapped "Skip without reason".
bot.callbackQuery(/^task:skip:confirm:(.+)$/, async (ctx) => {
  const taskId = ctx.match[1];
  const userId = ctx.from.id;
  pendingSkips.delete(userId);
  await api.markTaskSkipped(taskId, userId);
  await ctx.answerCallbackQuery({ text: 'Skipped' });
  try {
    await ctx.editMessageText('⏭ <b>Skipped</b> · <i>No note added</i>', { parse_mode: 'HTML' });
  } catch { /* ignore */ }
  await sendNextTask(ctx);
});

bot.callbackQuery(/^task:reply:(interested|not_interested|replied):(.+)$/, async (ctx) => {
  const replyStatus = ctx.match[1] as 'interested' | 'not_interested' | 'replied';
  const taskId = ctx.match[2];

  await api.markTaskReply(taskId, ctx.from.id, replyStatus);
  await ctx.answerCallbackQuery({ text: 'Reply logged' });
  try {
    await ctx.editMessageReplyMarkup({
      reply_markup: buildResolvedKeyboard('Status: replied'),
    });
  } catch (error) {
    console.warn('Unable to update inline keyboard', error);
  }
  await sendNextTask(ctx);
});

bot.catch(async (error) => {
  console.error('Telegram bot error', error.error);
  try {
    await error.ctx.reply('Something went wrong while processing that task. Please try again in a moment.');
  } catch (replyError) {
    console.error('Failed to send bot error message', replyError);
  }
});

async function tickScheduler() {
  try {
    const { result } = await api.runScheduler();
    if (result.created || result.blocked) {
      console.info('Scheduler tick', result);
    }
  } catch (error) {
    console.error('Scheduler tick failed', error);
  }
}

async function startWebhookMode() {
  const path = '/telegram/webhook';
  // Increase timeout to 45 s — default 10 s is too short when the Next.js
  // API is cold-starting or the DB query is slow.
  const callback = webhookCallback(bot, 'http', { timeoutMilliseconds: 45_000 });

  await bot.api.setMyCommands([
    { command: 'start', description: 'Open the internal bot guide' },
    { command: 'connect', description: 'Register this account as a sender' },
    { command: 'next', description: 'Pull the next due outreach task' },
    { command: 'replied', description: 'Mark a lead as replied — /replied @username' },
  ]);

  await bot.api.setWebhook(`${config.botPublicUrl}${path}`, {
    secret_token: config.webhookSecret || undefined,
  });

  createServer((request, response) => {
    if (request.url === '/healthz') {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ ok: true }));
      return;
    }

    if (request.url === path && request.method === 'POST') {
      void callback(request, response);
      return;
    }

    response.writeHead(404, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ ok: false }));
  }).listen(config.port, () => {
    console.info(`Telegram webhook bot listening on ${config.port}`);
  });
}

async function startPollingMode() {
  await bot.api.setMyCommands([
    { command: 'start', description: 'Open the internal bot guide' },
    { command: 'connect', description: 'Register this account as a sender' },
    { command: 'next', description: 'Pull the next due outreach task' },
    { command: 'replied', description: 'Mark a lead as replied — /replied @username' },
  ]);
  await bot.start({
    onStart: () => {
      console.info('Telegram bot started in long-polling mode');
    },
  });
}

async function main() {
  await tickScheduler();
  setInterval(() => {
    void tickScheduler();
  }, 60_000);

  if (config.useWebhook) {
    await startWebhookMode();
    return;
  }

  await startPollingMode();
}

void main().catch((error) => {
  console.error('Unable to start Telegram bot', error);
  process.exit(1);
});
