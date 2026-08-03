// Shell layout — fixed liquid-island-style nav, restrained.
import Link from 'next/link';
import type { Profile } from '@/types/database';
import { Avatar } from '@/components/ui/Avatar';

export function Shell({
  user,
  children,
  pathname
}: {
  user: Profile | null;
  children: React.ReactNode;
  pathname: string;
}) {
  return (
    <div className="min-h-[100dvh] flex flex-col">
      <nav className="sticky top-0 z-40 backdrop-blur-md bg-surface/70 border-b border-surface-line/60">
        <div className="mx-auto max-w-6xl px-6 h-14 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <span aria-hidden className="inline-block w-2 h-2 rounded-full bg-accent animate-pulse" />
            <span className="font-serif text-xl tracking-tight">cofre</span>
          </Link>
          {user ? (
            <ul className="flex items-center gap-6 text-sm">
              {[
                ['Dashboard', '/dashboard'],
                ['Expenses', '/expenses'],
                ['Ledger', '/lend'],
                ['Tours', '/tours'],
                ['Friends', '/friends']
              ].map(([label, href]) => (
                <li key={href}>
                  <Link
                    href={href}
                    className={`tracking-tight ${
                      pathname.startsWith(href as string) ? 'text-ink' : 'text-ink-muted hover:text-accent-glow'
                    }`}
                  >
                    {label}
                  </Link>
                </li>
              ))}
              <li>
                <Link href="/settings" aria-label="Settings" className="flex items-center gap-2">
                  <Avatar src={user.photo_url ?? null} name={user.first_name} size={28} />
                </Link>
              </li>
            </ul>
          ) : (
            <Link href="/" className="text-sm muted">
              Sign in
            </Link>
          )}
        </div>
      </nav>
      <main className="flex-1">{children}</main>
      <footer className="border-t border-surface-line mt-24">
        <div className="mx-auto max-w-6xl px-6 py-10 flex items-center justify-between text-xs muted">
          <span>cofra keeps your money honest.</span>
          <span className="font-mono">v0.1</span>
        </div>
      </footer>
    </div>
  );
}
