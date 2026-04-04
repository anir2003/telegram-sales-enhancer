import { NextRequest, NextResponse } from 'next/server';
import { getWorkspaceContext } from '@/lib/server/context';
import {
  getTelegramCredential,
  saveTelegramPhoneCodeHash,
  saveTelegramSession,
} from '@/lib/server/repository';

export const dynamic = 'force-dynamic';

// Helper: build a TelegramClient with gramjs
async function buildClient(apiId: number, apiHash: string, sessionStr: string) {
  const { TelegramClient } = await import('telegram');
  const { StringSession } = await import('telegram/sessions/index.js');
  const session = new StringSession(sessionStr);
  const client = new TelegramClient(session, apiId, apiHash, {
    connectionRetries: 3,
    timeout: 20,
    useIPV6: false,
    baseLogger: { levels: [], canSend: () => false, log: () => {} } as never,
  });
  return { client, session };
}

export async function POST(req: NextRequest) {
  const context = await getWorkspaceContext();
  if (!context?.profile || !context?.workspace) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const ctx = { workspaceId: context.workspace.id, profileId: context.profile.id };
  const body = await req.json();
  const { action } = body;

  const cred = await getTelegramCredential(ctx);
  if (!cred) {
    return NextResponse.json({ error: 'No API credentials saved. Add them first.' }, { status: 400 });
  }

  // ── Action: send-code ─────────────────────────────────────────────
  if (action === 'send-code') {
    try {
      const { client, session } = await buildClient(parseInt(cred.api_id), cred.api_hash, '');
      await client.connect();

      const result = await client.sendCode(
        { apiId: parseInt(cred.api_id), apiHash: cred.api_hash },
        cred.phone,
      );

      const sessionStr = session.save() as string;
      await saveTelegramPhoneCodeHash(ctx, result.phoneCodeHash, sessionStr);
      await client.disconnect();

      return NextResponse.json({ ok: true, step: 'verify' });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return NextResponse.json({ error: `Failed to send code: ${msg}` }, { status: 500 });
    }
  }

  // ── Action: verify ────────────────────────────────────────────────
  if (action === 'verify') {
    const { code, password } = body;
    if (!code) return NextResponse.json({ error: 'Code is required.' }, { status: 400 });
    if (!cred.phone_code_hash) {
      return NextResponse.json({ error: 'No pending code. Please send a new code first.' }, { status: 400 });
    }

    try {
      const { client, session } = await buildClient(
        parseInt(cred.api_id),
        cred.api_hash,
        cred.session_string ?? '',
      );
      await client.connect();

      try {
        await client.invoke(
          new (await import('telegram')).Api.auth.SignIn({
            phoneNumber: cred.phone,
            phoneCodeHash: cred.phone_code_hash,
            phoneCode: String(code).trim(),
          }),
        );
      } catch (signInErr: unknown) {
        const errMsg = signInErr instanceof Error ? signInErr.message : String(signInErr);

        // 2FA required
        if (errMsg.includes('SESSION_PASSWORD_NEEDED')) {
          if (!password) {
            await client.disconnect();
            return NextResponse.json({ ok: false, step: '2fa' });
          }
          const { computeCheck } = await import('telegram/Password.js');
          const { Api } = await import('telegram');
          const passwordSrp = await client.invoke(new Api.account.GetPassword());
          const checked = await computeCheck(passwordSrp, password);
          await client.invoke(new Api.auth.CheckPassword({ password: checked }));
        } else if (errMsg.includes('PHONE_CODE_INVALID')) {
          await client.disconnect();
          return NextResponse.json({ error: 'Invalid code. Please try again.' }, { status: 400 });
        } else if (errMsg.includes('PHONE_CODE_EXPIRED')) {
          await client.disconnect();
          return NextResponse.json({ error: 'Code expired. Please request a new one.' }, { status: 400 });
        } else {
          await client.disconnect();
          return NextResponse.json({ error: errMsg }, { status: 500 });
        }
      }

      const sessionStr = session.save() as string;
      await saveTelegramSession(ctx, sessionStr);
      await client.disconnect();

      return NextResponse.json({ ok: true, step: 'done' });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return NextResponse.json({ error: `Auth failed: ${msg}` }, { status: 500 });
    }
  }

  return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
}
