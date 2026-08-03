'use client';
import { forwardRef } from 'react';

type Variant = 'primary' | 'ghost' | 'link';

const base =
  'inline-flex items-center justify-center gap-2 px-4 h-10 text-sm tracking-tight rounded-sm transition-colors duration-200 select-none';

const variants: Record<Variant, string> = {
  primary:
    'bg-ink text-surface hover:bg-accent-glow active:bg-accent disabled:opacity-40 disabled:cursor-not-allowed',
  ghost:
    'bg-transparent border border-surface-line text-ink hover:border-accent hover:text-accent-glow',
  link: 'px-0 h-auto text-accent hover:text-accent-glow underline-offset-4 hover:underline'
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', className = '', ...rest },
  ref
) {
  return <button ref={ref} className={`${base} ${variants[variant]} ${className}`} {...rest} />;
});
