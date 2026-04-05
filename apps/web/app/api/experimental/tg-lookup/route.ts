import { NextRequest, NextResponse } from 'next/server';
import { getWorkspaceContext } from '@/lib/server/context';
import { getTelegramCredential } from '@/lib/server/repository';

export const dynamic = 'force-dynamic';

function decodeStatus(status: unknown): string {
  if (!status) return 'Unknown';
  const name = (status as { className?: string }).className ?? '';
  if (name === 'UserStatusOnline') return 'Online now';
  if (name === 'UserStatusOffline') {
    const wasOnline = (status as { wasOnline?: number }).wasOnline;
    if (wasOnline) {
      const ago = Math.floor((Date.now() / 1000 - wasOnline) / 60);
      if (ago < 60) return `${ago}m ago`;
      if (ago < 1440) return `${Math.floor(ago / 60)}h ago`;
      return `${Math.floor(ago / 1440)}d ago`;
    }
    return 'Recently';
  }
  if (name === 'UserStatusRecently') return 'Recently';
  if (name === 'UserStatusLastWeek') return 'Last week';
  if (name === 'UserStatusLastMonth') return 'Last month';
  return 'Unknown';
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function safeStr(v: any): string | null {
  if (typeof v === 'string' && v.trim().length > 0) return v.trim();
  return null;
}

export async function POST(req: NextRequest) {
  const context = await getWorkspaceContext();
  if (!context?.profile || !context?.workspace) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const ctx = { workspaceId: context.workspace.id, profileId: context.profile.id };

  const cred = await getTelegramCredential(ctx);
  if (!cred?.is_authenticated || !cred.session_string) {
    return NextResponse.json({ error: 'Not authenticated. Connect your Telegram account first.' }, { status: 401 });
  }

  const body = await req.json();
  const { username } = body;
  if (!username) return NextResponse.json({ error: 'username is required.' }, { status: 400 });

  const clean = String(username).replace(/^@/, '').trim();
  if (!clean) return NextResponse.json({ error: 'Invalid username.' }, { status: 400 });

  const noop = () => {};
  const noopLogger = {
    levels: ['error', 'warn', 'info', 'debug'],
    canSend: () => false,
    log: noop, debug: noop, info: noop, warn: noop, error: noop,
    setLevel: noop, getDateTime: () => '', color: noop,
  };

  try {
    const { TelegramClient, Api } = await import('telegram');
    const { StringSession } = await import('telegram/sessions/index.js');

    const client = new TelegramClient(
      new StringSession(cred.session_string),
      parseInt(cred.api_id),
      cred.api_hash,
      { connectionRetries: 3, baseLogger: noopLogger as never },
    );
    await client.connect();

    // ── Resolve entity ────────────────────────────────────────────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let user: any;
    try {
      user = await client.getEntity(clean);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      await client.disconnect();
      if (msg.includes('USERNAME_NOT_OCCUPIED') || msg.includes('No user has') || msg.includes('could not find')) {
        return NextResponse.json({ found: false, message: `@${clean} does not exist on Telegram.` });
      }
      return NextResponse.json({ error: `Lookup failed: ${msg}` }, { status: 500 });
    }

    if (user?.className !== 'User') {
      await client.disconnect();
      return NextResponse.json({ found: false, message: `@${clean} is not a user account (may be a channel or group).` });
    }

    // ── Fetch full profile (bio, common chats) ────────────────────
    let bio: string | null = null;
    let commonChats = 0;
    try {
      const inputEntity = await client.getInputEntity(clean);
      // invoke returns Api.users.UserFull which has { fullUser: Api.UserFull, users, chats }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const fullResponse: any = await client.invoke(new Api.users.GetFullUser({ id: inputEntity }));
      // Try both direct property and nested .fullUser
      const fullUser = fullResponse?.fullUser ?? fullResponse;
      bio = safeStr(fullUser?.about);
      commonChats = typeof fullUser?.commonChatsCount === 'number' ? fullUser.commonChatsCount : 0;
    } catch {
      // bio unavailable — not fatal
    }

    // ── Fetch profile photo ───────────────────────────────────────
    let photoBase64: string | null = null;
    try {
      const photoBuffer = await client.downloadProfilePhoto(clean);
      if (Buffer.isBuffer(photoBuffer) && photoBuffer.length > 0) {
        photoBase64 = photoBuffer.toString('base64');
      }
    } catch {
      // photo not available or private — not fatal
    }

    await client.disconnect();

    return NextResponse.json({
      found: true,
      user: {
        id: String(user.id ?? ''),
        username: safeStr(user.username),
        firstName: safeStr(user.firstName),
        lastName: safeStr(user.lastName),
        phone: safeStr(user.phone),
        premium: Boolean(user.premium),
        verified: Boolean(user.verified),
        fake: Boolean(user.fake),
        bot: Boolean(user.bot),
        restricted: Boolean(user.restricted),
        scam: Boolean(user.scam),
        bio,
        commonChats,
        lastSeen: decodeStatus(user.status),
        photoBase64,
      },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: `Lookup error: ${msg}` }, { status: 500 });
  }
}
