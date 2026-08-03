// Middleware: refreshes the Supabase session cookie on every request.
// Critical for RLS — we transmit the user's telegram_id via a custom claim at
// sign-in (Supabase hook) so SQL can resolve current_profile_id().
import { NextResponse, type NextRequest } from 'next/server';
import { createMiddlewareClient } from '@supabase/ssr';

export async function middleware(req: NextRequest) {
  const res = NextResponse.next();
  const supabase = createMiddlewareClient({ req, res });
  await supabase.auth.getSession();
  return res;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|robots.txt).*)']
};
