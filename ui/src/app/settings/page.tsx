"use client";

import { ExternalLink } from "lucide-react";
import { useTranslations } from "next-intl";

import { CallEventsSection } from "@/components/CallEventsSection";
import { PageLayout } from "@/components/layout/PageLayout";
import { MCPSection } from "@/components/MCPSection";
import { OrganizationPreferencesSection } from "@/components/OrganizationPreferencesSection";
import { TelemetrySection } from "@/components/TelemetrySection";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function SettingsPage() {
  const t = useTranslations("Settings");
  return (
    <PageLayout title={t("title")} description={t("description")} width="narrow">

      <Card>
        <CardHeader>
          <CardTitle>{t("preferencesTitle")}</CardTitle>
          <CardDescription>
            {t("preferencesDescription")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <OrganizationPreferencesSection />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("mcpSectionTitle")}</CardTitle>
          <CardDescription>
            {t("mcpSectionDescription")}{" "}
            <a
              href="https://docs.dograh.com/integrations/mcp"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-0.5 underline"
            >
              {t("learnMore")} <ExternalLink className="h-3 w-3" />
            </a>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <MCPSection />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("telemetryTitle")}</CardTitle>
          <CardDescription>
            {t("telemetryDescription")}{" "}
            <a
              href="https://docs.dograh.com/configurations/tracing"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-0.5 underline"
            >
              {t("learnMore")} <ExternalLink className="h-3 w-3" />
            </a>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <TelemetrySection />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{t("callEventsTitle")}</CardTitle>
          <CardDescription>{t("callEventsDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          <CallEventsSection />
        </CardContent>
      </Card>
    </PageLayout>
  );
}
