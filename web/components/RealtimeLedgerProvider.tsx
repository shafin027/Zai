'use client';
import { useRealtimeLedger } from '@/hooks/useRealtimeLedger';

export function RealtimeLedgerProvider({ children }: { children: React.ReactNode }) {
  useRealtimeLedger();
  return <>{children}</>;
}
