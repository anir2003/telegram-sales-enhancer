import { InlineKeyboard } from 'grammy';
import type { BotTask } from './api';

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function formatDueAt(value: string) {
  return new Intl.DateTimeFormat('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'UTC',
  }).format(new Date(value));
}

export function buildTaskMessage(task: BotTask) {
  return [
    '<b>Next outreach task</b>',
    '',
    `<b>Campaign</b>: ${escapeHtml(task.campaignName)}`,
    `<b>Lead</b>: ${escapeHtml(task.leadName)}`,
    `<b>Company</b>: ${escapeHtml(task.companyName)}`,
    `<b>Target</b>: @${escapeHtml(task.telegramUsername)}`,
    `<b>Assigned account</b>: ${escapeHtml(task.accountLabel)} (@${escapeHtml(task.accountUsername)})`,
    `<b>Due</b>: ${escapeHtml(formatDueAt(task.dueAt))} UTC`,
    '',
    '<b>Message to send</b>',
    `<pre>${escapeHtml(task.renderedMessage)}</pre>`,
    '',
    '1. Tap <b>Open Chat</b>.',
    '2. Send the message manually from the assigned Telegram account.',
    '3. Return here and mark the outcome.',
  ].join('\n');
}

export function buildTaskKeyboard(task: BotTask) {
  const keyboard = new InlineKeyboard();

  if (task.profileUrl) {
    keyboard.url('Open Chat', task.profileUrl);
    keyboard.row();
  }

  keyboard.text('Mark Sent', `task:sent:${task.taskId}`);
  keyboard.text('Skip', `task:skip:${task.taskId}`);
  keyboard.row();
  keyboard.text('Replied', `task:reply:replied:${task.taskId}`);
  keyboard.text('Interested', `task:reply:interested:${task.taskId}`);
  keyboard.row();
  keyboard.text('Not Interested', `task:reply:not_interested:${task.taskId}`);
  keyboard.row();
  keyboard.text('Next Task', 'task:next');

  return keyboard;
}

export function buildResolvedKeyboard(statusLabel: string) {
  return new InlineKeyboard().text(statusLabel, 'noop').row().text('Next Task', 'task:next');
}
