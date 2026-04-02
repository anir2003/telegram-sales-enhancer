export type BotTask = {
  taskId: string;
  campaignId: string;
  campaignLeadId: string;
  assignedAccountId: string;
  dueAt: string;
  renderedMessage: string;
  campaignName: string;
  accountLabel: string;
  accountUsername: string;
  leadName: string;
  companyName: string;
  telegramUsername: string;
  profileUrl: string;
};

type ApiClientOptions = {
  appUrl: string;
  secret?: string;
};

export class AppApiClient {
  constructor(private readonly options: ApiClientOptions) {}

  private async post<T>(path: string, body: Record<string, unknown> = {}) {
    const response = await fetch(`${this.options.appUrl}${path}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(this.options.secret ? { 'x-telegram-webhook-secret': this.options.secret } : {}),
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`API request failed (${response.status}): ${text}`);
    }

    return (await response.json()) as T;
  }

  linkTelegramUser(input: { code: string; telegramUserId: number; telegramUsername?: string | null }) {
    return this.post<{ profile: { email?: string | null; full_name?: string | null } }>('/api/bot/link', input);
  }

  getNextTask(telegramUserId: number) {
    return this.post<{ task: BotTask | null }>('/api/bot/next', { telegramUserId });
  }

  markTaskSent(taskId: string, telegramUserId: number) {
    return this.post<{ task: { id: string } | null }>('/api/bot/task/sent', { taskId, telegramUserId });
  }

  markTaskSkipped(taskId: string, telegramUserId: number) {
    return this.post<{ task: { id: string } | null }>('/api/bot/task/skip', { taskId, telegramUserId });
  }

  markTaskReply(taskId: string, telegramUserId: number, replyStatus: 'interested' | 'not_interested' | 'replied') {
    return this.post<{ task: { id: string } | null }>('/api/bot/task/reply', {
      taskId,
      telegramUserId,
      replyStatus,
    });
  }

  connectAccount(input: { code: string; telegramUserId: number; telegramUsername: string }) {
    return this.post<{ account: { id: string; label: string; telegram_username: string } | null }>('/api/bot/connect-account', input);
  }

  runScheduler() {
    return this.post<{ result: { created: number; blocked: number; dueTasks: number } }>('/api/bot/scheduler');
  }
}
