import { NextRequest, NextResponse } from 'next/server';
import { Api } from 'telegram';
import { computeCheck } from 'telegram/Password.js';
import { isTelegramMockAdapter } from '@/lib/env';
import { resolveWorkspaceTgCredentials } from '@/lib/server/tg-console/credentials';
import { getWorkspaceContext } from '@/lib/server/context';
import {
  getTgConsoleAccountPrivate,
  saveTgConsoleAuthenticatedSession,
  upsertTgConsolePendingAccount,
} from '@/lib/server/repository';
import { buildTelegramClient } from '@/lib/server/tg-console/client';
import { decryptJson, decryptSecret, encryptJson, encryptSecret } from '@/lib/server/tg-console/crypto';
import { redactTgProxyConfig, tgConsolePhoneSchema, tgConsoleProxySchema, type TgConsoleProxyConfig } from '@telegram-enhancer/shared';

export const dynamic = 'force-dynamic';

function displayNameFromMe(me: any) {
  return [me?.firstName, me?.lastName].filter(Boolean).join(' ').trim() || me?.username || null;
}

export async function POST(req: NextRequest) {
  const context = await getWorkspaceContext();
  if (!context?.profile || !context?.workspace) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const ctx = { workspaceId: context.workspace.id, profileId: context.profile.id };
  const body = await req.json();
  const action = String(body.action ?? '');

  const tgCreds = isTelegramMockAdapter() ? null : await resolveWorkspaceTgCredentials(ctx);
  if (!isTelegramMockAdapter() && !tgCreds) {
    return NextResponse.json({
      error: 'Telegram phone sign-in is not configured on this server yet.',
    }, { status: 503 });
  }

  if (action === 'send-code') {
    const parsed = tgConsolePhoneSchema.safeParse({ phone: body.phone });
    if (!parsed.success) {
      return NextResponse.json({ error: 'Enter a valid phone number.' }, { status: 400 });
    }

    const proxyParsed = body.proxy ? tgConsoleProxySchema.safeParse(body.proxy) : null;
    if (proxyParsed && !proxyParsed.success) {
      return NextResponse.json({ error: 'Proxy settings are invalid.' }, { status: 400 });
    }
    const proxy = proxyParsed?.success ? proxyParsed.data : null;

    if (isTelegramMockAdapter()) {
      const account = await upsertTgConsolePendingAccount(ctx, {
        phone: parsed.data.phone,
        pendingSessionCiphertext: encryptSecret(`mock-pending:${parsed.data.phone}`),
        phoneCodeHash: 'mock-phone-code-hash',
        proxyConfigCiphertext: proxy ? encryptJson(proxy) : null,
        proxyRedacted: redactTgProxyConfig(proxy),
      });
      return NextResponse.json({ ok: true, step: 'verify', account });
    }

    const { apiId, apiHash } = tgCreds!;
    const { client, session } = await buildTelegramClient({
      apiId: Number(apiId),
      apiHash,
      session: '',
      proxy,
    });

    try {
      await client.connect();
      const result = await client.sendCode({ apiId: Number(apiId), apiHash }, parsed.data.phone);
      const account = await upsertTgConsolePendingAccount(ctx, {
        phone: parsed.data.phone,
        pendingSessionCiphertext: encryptSecret(session.save() as string),
        phoneCodeHash: result.phoneCodeHash,
        proxyConfigCiphertext: proxy ? encryptJson(proxy) : null,
        proxyRedacted: redactTgProxyConfig(proxy),
      });
      return NextResponse.json({ ok: true, step: 'verify', account });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return NextResponse.json({ error: `Failed to send Telegram code: ${message}` }, { status: 500 });
    } finally {
      await client.disconnect();
    }
  }

  if (action === 'verify') {
    const accountId = String(body.accountId ?? '');
    const code = String(body.code ?? '').trim();
    const password = typeof body.password === 'string' ? body.password : '';
    if (!accountId || !code) {
      return NextResponse.json({ error: 'Account and verification code are required.' }, { status: 400 });
    }

    const account = await getTgConsoleAccountPrivate(ctx, accountId);
    if (!account) {
      return NextResponse.json({ error: 'Telegram account not found.' }, { status: 404 });
    }
    if (!account.phone_code_hash && !isTelegramMockAdapter()) {
      return NextResponse.json({ error: 'No pending Telegram code. Send a new code first.' }, { status: 400 });
    }

    if (isTelegramMockAdapter()) {
      if (code === '222222' && !password) {
        return NextResponse.json({ ok: false, step: '2fa' });
      }
      if (code !== '12345' && code !== '222222') {
        return NextResponse.json({ error: 'Invalid code. In mock mode use 12345, or 222222 to test 2FA.' }, { status: 400 });
      }
      const connected = await saveTgConsoleAuthenticatedSession(ctx, accountId, {
        sessionCiphertext: encryptSecret(`mock-session:${account.phone}`),
        telegramUserId: '90010001',
        telegramUsername: `mock_${account.phone.replace(/\D/g, '').slice(-6)}`,
        displayName: 'Mock Telegram Account',
      });
      return NextResponse.json({ ok: true, step: 'done', account: connected });
    }

    const { apiId, apiHash } = tgCreds!;
    const sessionString = decryptSecret(account.pending_session_ciphertext || account.session_ciphertext) ?? '';
    const proxy = decryptJson<TgConsoleProxyConfig>(account.proxy_config_ciphertext);
    const { client, session } = await buildTelegramClient({
      apiId: Number(apiId),
      apiHash,
      session: sessionString,
      proxy,
    });

    try {
      await client.connect();
      try {
        await client.invoke(new Api.auth.SignIn({
          phoneNumber: account.phone,
          phoneCodeHash: account.phone_code_hash ?? '',
          phoneCode: code,
        }));
      } catch (signInError) {
        const message = signInError instanceof Error ? signInError.message : String(signInError);
        if (message.includes('SESSION_PASSWORD_NEEDED')) {
          if (!password) {
            return NextResponse.json({ ok: false, step: '2fa' });
          }
          const passwordSrp = await client.invoke(new Api.account.GetPassword());
          const checked = await computeCheck(passwordSrp, password);
          await client.invoke(new Api.auth.CheckPassword({ password: checked }));
        } else if (message.includes('PHONE_CODE_INVALID')) {
          return NextResponse.json({ error: 'Invalid code. Please try again.' }, { status: 400 });
        } else if (message.includes('PHONE_CODE_EXPIRED')) {
          return NextResponse.json({ error: 'Code expired. Please request a new one.' }, { status: 400 });
        } else {
          throw signInError;
        }
      }

      const me = await client.getMe();
      const connected = await saveTgConsoleAuthenticatedSession(ctx, accountId, {
        sessionCiphertext: encryptSecret(session.save() as string),
        telegramUserId: (me as any)?.id ? String((me as any).id) : null,
        telegramUsername: (me as any)?.username ?? null,
        displayName: displayNameFromMe(me),
      });

      return NextResponse.json({ ok: true, step: 'done', account: connected });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return NextResponse.json({ error: `Telegram authentication failed: ${message}` }, { status: 500 });
    } finally {
      await client.disconnect();
    }
  }

  return NextResponse.json({ error: 'Unknown Telegram auth action.' }, { status: 400 });
}
