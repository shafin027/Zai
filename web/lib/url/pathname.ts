// Reads the request's pathname on the server. Helper for layouts that need to
// know the active route to highlight a nav link.
import { headers } from 'next/headers';

export function currentPathname(): string {
  // Next.js exposes path via x-invoke-path or directly via x-pathname in App Router.
  const h = headers();
  return h.get('x-pathname') ?? h.get('x-invoke-path') ?? h.get('next-url') ?? '/dashboard';
}
