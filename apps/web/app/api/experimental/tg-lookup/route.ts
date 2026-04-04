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

  try {
    const { TelegramClient, Api } = await import('telegram');
    const { StringSession } = await import('telegram/sessions/index.js');

    const client = new TelegramClient(
      new StringSession(cred.session_string),
      parseInt(cred.api_id),
      cred.api_hash,
      {
        connectionRetries: 3,
        timeout: 20,
        baseLogger: { levels: [], canSend: () => false, log: () => {} } as never,
      },
    );
    await client.connect();

    let user: Record<string, unknown>;
    try {
      user = await client.getEntity(clean) as Record<string, unknown>;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      await client.disconnect();
      if (msg.includes('USERNAME_NOT_OCCUPIED') || msg.includes('No user has')) {
        return NextResponse.json({ found: false, message: `@${clean} does not exist on Telegram.` });
      }
      return NextResponse.json({ error: `Lookup failed: ${msg}` }, { status: 500 });
    }

    // Only works for User entities
    if ((user as { className?: string }).className !== 'User') {
      await client.disconnect();
      return NextResponse.json({ found: false, message: `@${clean} is not a user account (may be a channel or group).` });
    }

    // Get full user info (bio etc.)
    let bio: string | null = null;
    let commonChats = 0;
    try {
      const fullResult = await client.invoke(
        new Api.users.GetFullUser({ id: await client.getInputEntity(clean) }),
      );
      bio = (fullResult.fullUser as Record<string, unknown>)?.about as string | null ?? null;
      commonChats = (fullResult.fullUser as Record<string, unknown>)?.commonChatsCount as number ?? 0;
    } catch { /* bio unavailable */ }

    await client.disconnect();

    return NextResponse.json({
      found: true,
      user: {
        id: String((user as { id?: unknown }).id ?? ''),
        username: (user as { username?: unknown }).username as string | null ?? null,
        firstName: (user as { firstName?: unknown }).firstName as string | null ?? null,
        lastName: (user as { lastName?: unknown }).lastName as string | null ?? null,
        phone: (user as { phone?: unknown }).phone as string | null ?? null,
        premium: Boolean((user as { premium?: unknown }).premium),
        verified: Boolean((user as { verified?: unknown }).verified),
        fake: Boolean((user as { fake?: unknown }).fake),
        bot: Boolean((user as { bot?: unknown }).bot),
        restricted: Boolean((user as { restricted?: unknown }).restricted),
        bio,
        commonChats,
        lastSeen: decodeStatus((user as { status?: unknown }).status),
      },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: `Lookup error: ${msg}` }, { status: 500 });
  }
}
