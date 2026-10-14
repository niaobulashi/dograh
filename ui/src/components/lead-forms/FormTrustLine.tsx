import { useTranslations } from "next-intl";
// Shared reassurance line shown beneath every lead-form submit. A small,
// consistent trust signal — keeps the promise identical across all forms.

export function FormTrustLine() {
    const t = useTranslations("LeadForms");
  return (
    <p className="text-center text-xs text-muted-foreground">
      {t("averageResponseUnder10MinutesDuringBusinessHours")}</p>
  );
}
