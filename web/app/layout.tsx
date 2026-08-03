import './globals.css';
import type { Metadata, Viewport } from 'next';
import { Inter, Cormorant_Garamond, JetBrains_Mono } from 'next/font/google';
import { Providers } from '@/components/Providers';

const inter = Inter({ subsets: ['latin'], variable: '--font-sans-var', display: 'swap' });
const cormorant = Cormorant_Garamond({
  weight: ['400', '500'],
  subsets: ['latin'],
  variable: '--font-serif-var',
  display: 'swap'
});
const mono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-mono-var', display: 'swap' });

export const metadata: Metadata = {
  title: 'Cofre: your money, kept honest',
  description: 'Personal expenses and a private lend/borrow ledger with friends.',
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'),
  openGraph: {
    title: 'Cofre',
    description: 'Personal expenses and a private lend/borrow ledger with friends.',
    type: 'website'
  },
  icons: { icon: '/favicon.svg' }
};

export const viewport: Viewport = {
  themeColor: '#0E0E10',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${cormorant.variable} ${mono.variable}`}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
