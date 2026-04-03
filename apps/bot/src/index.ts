import 'dotenv/config';
import { createServer } from 'node:http';
import { Bot, Context, Keyboard, webhookCallback } from 'grammy';
import { AppApiClient, type BotTask } from './api';
import { getBotConfig } from './config';
import { buildResolvedKeyboard, buildSentKeyboard, buildTaskKeyboard, buildTaskMessage } from './task-card';

const config = getBotConfig();
const api = new AppApiClient({
  appUrl: config.appUrl,
  secret: config.webhookSecret || undefined,
});
const bot = new Bot(config.token);

// Store last rendered message per user for copy functionality
const lastTaskMessage = new Map<number, string>();

function commandMenu() {
  return new Keyboard().text('Next task').resized();
}

async function handleLinkCode(ctx: Context, code: string) {
  if (!ctx.from) {
    await ctx.reply('Telegram user not found for this session.');
    return;
  }

  const trimmedCode = code.trim().toUpperCase();
  if (!trimmedCode) {
    await ctx.reply('Send /link CODE using the one-time code from Settings.');
    return;
  }

  try {
    const response = await api.linkTelegramUser({
      code: trimmedCode,
      telegramUserId: ctx.from.id,
      telegramUsername: ctx.from.username ?? null,
    });

    await ctx.reply(
      `Linked successfully${response.profile?.email ? ` for ${response.profile.email}` : ''}. Use /next to get the next task.`,
      { reply_markup: commandMenu() },
    );
  } catch (error) {
    console.error(error);
    await ctx.reply('That link code is invalid or expired. Generate a fresh code in Settings and try again.');
  }
}

async function sendTaskCard(ctx: Context, task: BotTask) {
  if (ctx.from) {
    lastTaskMessage.set(ctx.from.id, task.renderedMessage);
  }
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

bot.command('start', async (ctx) => {
  await ctx.reply(
    [
      'This is your internal Telegram sales task bot.',
      '',
      '/link CODE — Link your identity (from Settings page)',
      '/connect CODE — Register this account as a sender (from Accounts page)',
      '/next — Pull the next due outreach task',
      '',
      'Each Telegram account you want to use for sending needs its own /connect code.',
    ].join('\n'),
    { reply_markup: commandMenu() },
  );
});

bot.command('link', async (ctx) => {
  const code = ctx.message?.text.split(/\s+/)[1]?.trim();
  if (!code) {
    await ctx.reply('Send /link CODE using the one-time code from Settings, or just paste the six-character code directly.');
    return;
  }

  await handleLinkCode(ctx, code);
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

bot.command('next', sendNextTask);
bot.hears(/^next task$/i, sendNextTask);
bot.hears(/^[A-Z0-9]{6}$/i, async (ctx) => {
  const code = ctx.message?.text;
  if (!code) {
    return;
  }
  await handleLinkCode(ctx, code);
});
bot.callbackQuery('noop', async (ctx) => {
  await ctx.answerCallbackQuery();
});
bot.callbackQuery('task:next', sendNextTask);

// Copy message handler - sends the rendered message as a copyable reply
bot.callbackQuery(/^task:copy:(.+)$/, async (ctx) => {
  const userId = ctx.from.id;
  const message = lastTaskMessage.get(userId);
  if (message) {
    await ctx.reply(message);
    await ctx.answerCallbackQuery({ text: 'Message sent — copy it from above' });
  } else {
    await ctx.answerCallbackQuery({ text: 'Message not available, pull /next again' });
  }
});

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

bot.callbackQuery(/^task:skip:(.+)$/, async (ctx) => {
  const taskId = ctx.match[1];
  await api.markTaskSkipped(taskId, ctx.from.id);
  await ctx.answerCallbackQuery({ text: 'Marked skipped' });
  try {
    await ctx.editMessageReplyMarkup({
      reply_markup: buildResolvedKeyboard('Status: skipped'),
    });
  } catch (error) {
    console.warn('Unable to update inline keyboard', error);
  }
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
  const callback = webhookCallback(bot, 'http');

  await bot.api.setMyCommands([
    { command: 'start', description: 'Open the internal bot guide' },
    { command: 'link', description: 'Link your Telegram user to the CRM' },
    { command: 'connect', description: 'Register this account as a sender' },
    { command: 'next', description: 'Pull the next due outreach task' },
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
    { command: 'link', description: 'Link your Telegram user to the CRM' },
    { command: 'connect', description: 'Register this account as a sender' },
    { command: 'next', description: 'Pull the next due outreach task' },
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
