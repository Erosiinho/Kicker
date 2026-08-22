import { createI18n } from 'vue-i18n';
import en from './locales/en.json';
import fr from './locales/fr.json';

export const SUPPORTED_LOCALES = ['en', 'fr'] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];

const LOCALE_KEY = 'kicker:locale';

function isSupportedLocale(value: string | null): value is Locale {
    return !!value && (SUPPORTED_LOCALES as readonly string[]).includes(value);
}

function detectLocale(): Locale {
    const stored = localStorage.getItem(LOCALE_KEY);
    if (isSupportedLocale(stored)) return stored;

    const browserLanguages = navigator.languages ?? [navigator.language];
    for (const lang of browserLanguages) {
        const short = lang.slice(0, 2).toLowerCase();
        if (isSupportedLocale(short)) return short;
    }

    return 'en';
}

export const i18n = createI18n({
    legacy: false,
    locale: detectLocale(),
    fallbackLocale: 'en',
    messages: { en, fr },
});

export function setLocale(locale: Locale) {
    i18n.global.locale.value = locale;
    localStorage.setItem(LOCALE_KEY, locale);
    document.documentElement.lang = locale;
}

// Keep <html lang> in sync on boot too, not just on manual switches.
document.documentElement.lang = i18n.global.locale.value;
