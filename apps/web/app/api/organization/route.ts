import { NextRequest, NextResponse } from 'next/server';
import { createOrganizationForProfile, joinOrganizationForProfile } from '@/lib/server/repository';
import { getWorkspaceContext } from '@/lib/server/context';

export async function POST(request: NextRequest) {
  const context = await getWorkspaceContext();

  if (context?.configured && !context.profile) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!context?.profile) {
    return NextResponse.json({ error: 'Profile not found' }, { status: 400 });
  }

  const body = await request.json();

  try {
    if (body.mode === 'create') {
      const result = await createOrganizationForProfile({
        profileId: context.profile.id,
        name: body.name ?? '',
        slug: body.slug ?? '',
        timezone: body.timezone ?? 'UTC',
        password: body.password ?? '',
      });

      return NextResponse.json(result);
    }

    if (body.mode === 'join') {
      const result = await joinOrganizationForProfile({
        profileId: context.profile.id,
        slug: body.slug ?? '',
        password: body.password ?? '',
      });

      return NextResponse.json(result);
    }

    return NextResponse.json({ error: 'Invalid organization action' }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Organization request failed' },
      { status: 400 },
    );
  }
}
