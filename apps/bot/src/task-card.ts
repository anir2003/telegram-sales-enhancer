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
    '1. Tap <b>Open Chat</b> (message is auto-copied).',
    '2. Paste and send the message from the assigned Telegram account.',
    '3. Return here and tap <b>Sent</b>.',
  ].join('\n');
}

export function buildTaskKeyboard(task: BotTask) {
  const keyboard = new InlineKeyboard();

  if (task.profileUrl) {
    keyboard.url('Open Chat', task.profileUrl).row();
  }

  keyboard.text('Sent', `task:sent:${task.taskId}`);
  keyboard.text('Replied', `task:reply:replied:${task.taskId}`);

  return keyboard;
}

export function buildSentKeyboard(taskId: string) {
  return new InlineKeyboard()
    .text('Status: sent', 'noop')
    .text('Replied', `task:reply:replied:${taskId}`)
    .row()
    .text('Next Task', 'task:next');
}

export function buildResolvedKeyboard(statusLabel: string) {
  return new InlineKeyboard().text(statusLabel, 'noop').row().text('Next Task', 'task:next');
}
