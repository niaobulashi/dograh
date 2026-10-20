import { vi } from "vitest";

/**
 * Most component tests render bare, without a NextIntlClientProvider, so any
 * component that calls useTranslations would throw. Fall back to the English
 * catalog in that case: assertions written against the shipped copy keep
 * matching, and tests that do wrap in NextIntlClientProvider keep their own
 * messages.
 */
vi.mock("next-intl", async (importOriginal) => {
    const actual = await importOriginal<typeof import("next-intl")>();
    const messages = (await import("./messages/en.json")).default;
    type Translator = ReturnType<typeof actual.useTranslations>;
    const translators = new Map<string, Translator>();
    const fallbackTranslator = (namespace?: string) => {
        const cacheKey = namespace ?? "";
        let translator = translators.get(cacheKey);
        if (!translator) {
            translator = actual.createTranslator({
                locale: "en",
                namespace: namespace as never,
                messages,
            }) as unknown as Translator;
            translators.set(cacheKey, translator);
        }
        return translator;
    };
    return {
        ...actual,
        useLocale: (() => {
            try {
                return actual.useLocale();
            } catch {
                return "en";
            }
        }) as unknown as typeof actual.useLocale,
        useTranslations: ((namespace?: string) => {
            try {
                return actual.useTranslations(namespace as never);
            } catch {
                return fallbackTranslator(namespace);
            }
        }) as unknown as typeof actual.useTranslations,
    };
});
