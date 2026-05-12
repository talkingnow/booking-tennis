import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  children: ReactNode;
};

const styles: Record<NonNullable<Props['variant']>, string> = {
  primary: 'bg-accent text-bg font-semibold hover:bg-cyan-300 disabled:opacity-50',
  secondary: 'bg-slate-700 hover:bg-slate-600 text-slate-100 font-medium disabled:opacity-50',
  danger: 'bg-red-600 hover:bg-red-500 text-white font-medium disabled:opacity-50',
  ghost: 'bg-transparent text-slate-300 hover:text-slate-100',
};

export function Button({ variant = 'primary', className = '', children, ...rest }: Props) {
  return (
    <button
      {...rest}
      className={`w-full px-4 py-3 rounded-xl transition-colors text-sm ${styles[variant]} ${className}`}
    >
      {children}
    </button>
  );
}
