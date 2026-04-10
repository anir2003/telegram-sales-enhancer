import type { TgConsoleProxyConfig } from '@telegram-enhancer/shared';

type ClientOptions = {
  apiId: number;
  apiHash: string;
  session: string;
  proxy?: TgConsoleProxyConfig | null;
};

export function makeNoopTelegramLogger() {
  const noop = () => {};
  return {
    levels: ['error', 'warn', 'info', 'debug'],
    canSend: () => false,
    log: noop,
    debug: noop,
    info: noop,
    warn: noop,
    error: noop,
    setLevel: noop,
    getDateTime: () => '',
    color: noop,
  };
}

function toGramJsProxy(proxy?: TgConsoleProxyConfig | null) {
  if (!proxy) return undefined;
  if (proxy.scheme !== 'socks5') {
    return undefined;
  }
  return {
    socksType: 5,
    ip: proxy.host,
    port: proxy.port,
    username: proxy.username || undefined,
    password: proxy.password || undefined,
  };
}

export async function buildTelegramClient({ apiId, apiHash, session, proxy }: ClientOptions) {
  const { TelegramClient } = await import('telegram');
  const { StringSession } = await import('telegram/sessions/index.js');
  const stringSession = new StringSession(session);
  const options: Record<string, unknown> = {
    connectionRetries: 3,
    useIPV6: false,
    baseLogger: makeNoopTelegramLogger(),
  };

  const gramProxy = toGramJsProxy(proxy);
  if (gramProxy) {
    options.proxy = gramProxy;
  }

  const client = new TelegramClient(stringSession, apiId, apiHash, options as never);
  return { client, session: stringSession };
}
