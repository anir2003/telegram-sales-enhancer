import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions/index.js';
import type { TgConsoleProxyConfig } from '@telegram-enhancer/shared';

function makeNoopLogger() {
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
  if (!proxy || proxy.scheme !== 'socks5') return undefined;
  return {
    socksType: 5,
    ip: proxy.host,
    port: proxy.port,
    username: proxy.username || undefined,
    password: proxy.password || undefined,
  };
}

export function createTelegramClient(
  sessionString: string,
  apiId: number,
  apiHash: string,
  proxy?: TgConsoleProxyConfig | null,
) {
  const options: Record<string, unknown> = {
    connectionRetries: 3,
    useIPV6: false,
    baseLogger: makeNoopLogger(),
  };
  const gramProxy = toGramJsProxy(proxy);
  if (gramProxy) options.proxy = gramProxy;

  return new TelegramClient(new StringSession(sessionString), apiId, apiHash, options as never);
}
