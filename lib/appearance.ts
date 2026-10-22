// Display preferences (overview §7.5), remembered per user in their user_metadata. Not security
// settings: users may edit their own user_metadata, and anything unknown falls back to the default.
export const THEMES = { system: 'Same as my device', light: 'Light', dark: 'Dark' } as const;
export const TEXT_SIZES = { normal: 'Normal', large: 'Large', 'extra-large': 'Extra large' } as const;

export type Theme = keyof typeof THEMES;
export type TextSize = keyof typeof TEXT_SIZES;
export type Appearance = { theme: Theme; textSize: TextSize };

export const DEFAULT_APPEARANCE: Appearance = { theme: 'system', textSize: 'normal' };

export function appearanceFrom(metadata: unknown): Appearance {
  const m = (metadata ?? {}) as { theme?: unknown; text_size?: unknown };
  const theme = typeof m.theme === 'string' && Object.hasOwn(THEMES, m.theme) ? (m.theme as Theme) : DEFAULT_APPEARANCE.theme;
  const textSize =
    typeof m.text_size === 'string' && Object.hasOwn(TEXT_SIZES, m.text_size) ? (m.text_size as TextSize) : DEFAULT_APPEARANCE.textSize;
  return { theme, textSize };
}
