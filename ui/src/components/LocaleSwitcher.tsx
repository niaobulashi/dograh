"use client";

import { Languages } from "lucide-react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useTransition } from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  isLocale,
  type Locale,
  LOCALE_COOKIE,
  localeLabels,
  locales,
} from "@/i18n/config";
import { cn } from "@/lib/utils";

interface LocaleSwitcherProps {
  className?: string;
  side?: "top" | "bottom" | "left" | "right";
  align?: "start" | "center" | "end";
}

/**
 * Language picker. Writes the choice to a cookie and soft-refreshes so the
 * server request config picks it up — no URL change involved (phase 1).
 */
export function LocaleSwitcher({
  className,
  side = "bottom",
  align = "end",
}: LocaleSwitcherProps) {
  const activeLocale = useLocale() as Locale;
  const t = useTranslations("LocaleSwitcher");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function setLocale(next: string) {
    if (!isLocale(next) || next === activeLocale) {
      return;
    }
    document.cookie = `${LOCALE_COOKIE}=${next};path=/;max-age=31536000;samesite=lax`;
    startTransition(() => router.refresh());
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={t("label")}
          disabled={isPending}
          className={cn("rounded-full hover:bg-accent hover:text-accent-foreground", className)}
        >
          <Languages className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} side={side} className="w-40">
        <DropdownMenuLabel>{t("label")}</DropdownMenuLabel>
        {locales.map((locale) => (
          <DropdownMenuItem
            key={locale}
            onSelect={() => setLocale(locale)}
            className={cn("cursor-pointer", locale === activeLocale && "font-medium")}
          >
            {localeLabels[locale]}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default LocaleSwitcher;
