// Locale registry for the UI.
//
// Phase 1 note: we intentionally do NOT use next-intl's `[locale]` URL routing.
// The active locale is resolved from a cookie (see `request.ts`), so the app
// tree, existing links (`next/link` → `/overview` etc.) and the auth middleware
// stay untouched. Moving to `/zh/...` URLs later only means adding the
// `app/[locale]` segment — none of the translation call sites need to change.

export const locales = ["zh-CN", "en"] as const;

export type Locale = (typeof locales)[number];

/** Chinese is the default so a fresh install renders in Chinese. */
export const defaultLocale: Locale = "zh-CN";

/** Cookie holding the visitor's explicit locale choice. */
export const LOCALE_COOKIE = "DOGRAH_LOCALE";

/** Native, self-referential labels — never translated. */
export const localeLabels: Record<Locale, string> = {
  "zh-CN": "简体中文",
  en: "English",
};

export function isLocale(value: string | undefined | null): value is Locale {
  return !!value && (locales as readonly string[]).includes(value);
}
