// Browser-side Supabase client. Used by client components for live UI.
// Rely on the @supabase/ssr cookie adapter for auth session to survive SSR.
import { createBrowserClient } from '@supabase/ssr';

export function supabaseBrowser() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
