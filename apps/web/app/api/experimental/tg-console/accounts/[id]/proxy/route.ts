import net from 'node:net';
import { NextRequest, NextResponse } from 'next/server';
import { getWorkspaceContext } from '@/lib/server/context';
import { saveTgConsoleProxy } from '@/lib/server/repository';
import { encryptJson } from '@/lib/server/tg-console/crypto';
import { tgConsoleProxySchema } from '@telegram-enhancer/shared';

export const dynamic = 'force-dynamic';

async function validateTcp(host: string, port: number) {
  return new Promise<boolean>((resolve) => {
    const socket = net.createConnection({ host, port, timeout: 2500 });
    const done = (ok: boolean) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(ok);
    };
    socket.once('connect', () => done(true));
    socket.once('timeout', () => done(false));
    socket.once('error', () => done(false));
  });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const context = await getWorkspaceContext();
  if (!context?.profile || !context?.workspace) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const body = await req.json();
  const parsed = tgConsoleProxySchema.safeParse(body.proxy ?? body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Proxy settings are invalid.' }, { status: 400 });
  }

  const reachable = await validateTcp(parsed.data.host, parsed.data.port);
  const account = await saveTgConsoleProxy(
    { workspaceId: context.workspace.id, profileId: context.profile.id },
    id,
    {
      proxy: parsed.data,
      proxyConfigCiphertext: encryptJson(parsed.data),
      proxyStatus: reachable ? 'validated' : 'unreachable',
    },
  );

  return NextResponse.json({
    ok: true,
    account,
    proxyStatus: reachable ? 'validated' : 'unreachable',
  });
}
