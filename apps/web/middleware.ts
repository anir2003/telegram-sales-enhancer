import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { getSupabasePublicKey } from '@/lib/env';

function isConfigured() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && getSupabasePublicKey());
}

// Static file extensions to skip
const STATIC_EXTENSIONS = /\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|woff|woff2|ttf|otf|eot)$/;

export async function middleware(request: NextRequest) {
  // Skip static files early
  if (STATIC_EXTENSIONS.test(request.nextUrl.pathname)) {
    return NextResponse.next();
  }

  // Skip if Supabase is not configured (demo mode)
  if (!isConfigured()) {
    return NextResponse.next();
  }

  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });
  type CookieToSet = {
    name: string;
    value: string;
    options?: any;
  };

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    getSupabasePublicKey(),
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    },
  );

  // Refresh session if expired - required for Server Components
  // Only refresh every 5 minutes to avoid excessive auth calls
  const sessionRefreshed = request.cookies.get('sb-session-refreshed');
  const shouldRefresh = !sessionRefreshed || 
    Date.now() - parseInt(sessionRefreshed.value) > 5 * 60 * 1000;

  if (shouldRefresh) {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      response.cookies.set('sb-session-refreshed', Date.now().toString(), {
        maxAge: 60 * 60 * 24 * 7, // 7 days
        httpOnly: false,
        sameSite: 'lax',
      });
    }
  }

  return response;
}

// Optimized matcher - more specific to reduce middleware execution
export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
