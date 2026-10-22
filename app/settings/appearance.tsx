'use client';

import { useState, useTransition } from 'react';
import { TEXT_SIZES, THEMES, type Appearance, type TextSize, type Theme } from '@/lib/appearance';
import { saveAppearance } from './actions';

// Overview §7.5. Applied straight away on this page, and saved for every device the user signs in on.
export function AppearanceSettings({ initial }: { initial: Appearance }) {
  const [theme, setTheme] = useState<Theme>(initial.theme);
  const [textSize, setTextSize] = useState<TextSize>(initial.textSize);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const save = (nextTheme: Theme, nextSize: TextSize) => {
    setTheme(nextTheme);
    setTextSize(nextSize);
    document.documentElement.dataset.theme = nextTheme;
    document.documentElement.dataset.textSize = nextSize;
    startTransition(async () => {
      const result = await saveAppearance(nextTheme, nextSize);
      setMessage(result.ok ? 'Saved.' : result.error);
    });
  };

  const select = 'rounded border border-gray-400 bg-surface px-2 py-1 text-sm';
  return (
    <div className="space-y-2 text-sm">
      <label className="flex items-center justify-between gap-2">
        Colour scheme
        <select className={select} value={theme} disabled={pending} onChange={(e) => save(e.target.value as Theme, textSize)}>
          {(Object.keys(THEMES) as Theme[]).map((key) => (
            <option key={key} value={key}>
              {THEMES[key]}
            </option>
          ))}
        </select>
      </label>
      <label className="flex items-center justify-between gap-2">
        Text size
        <select className={select} value={textSize} disabled={pending} onChange={(e) => save(theme, e.target.value as TextSize)}>
          {(Object.keys(TEXT_SIZES) as TextSize[]).map((key) => (
            <option key={key} value={key}>
              {TEXT_SIZES[key]}
            </option>
          ))}
        </select>
      </label>
      <p role="status" className="text-xs text-gray-600">
        {message}
      </p>
    </div>
  );
}
