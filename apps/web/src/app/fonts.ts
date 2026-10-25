import { Big_Shoulders, Instrument_Sans, JetBrains_Mono } from 'next/font/google';

export const displayFont = Big_Shoulders({
  subsets: ['latin'],
  weight: ['700', '800'],
  variable: '--font-display-face',
  display: 'swap',
  adjustFontFallback: false,
  fallback: ['Impact', 'Arial Narrow', 'sans-serif'],
});

export const sansFont = Instrument_Sans({
  subsets: ['latin'],
  variable: '--font-sans-face',
  display: 'swap',
});

export const monoFont = JetBrains_Mono({
  subsets: ['latin'],
  weight: '500',
  variable: '--font-mono-face',
  display: 'swap',
});
