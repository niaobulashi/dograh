"use client";

import { ArrowLeft } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { toast } from "sonner";

import { PageShell } from "@/components/layout/PageShell";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useOrgConfig } from "@/context/OrgConfigContext";

import { LLMFallbackEditor } from "./LLMFallbackEditor";
import { useModelConnections } from "./useModelConnections";

export function LLMConfigurationPage({ configurationUuid }: { configurationUuid: string }) {
    const t = useTranslations("Models");
    const { catalog, connections, configurations, loading, error, reload } = useModelConnections();
    const { refreshConfig } = useOrgConfig();
    const saved = configurations.find(item => item.uuid === configurationUuid && item.is_active);
    return <PageShell className="space-y-6">
        <Button asChild variant="ghost" className="-ml-3"><Link href={`/model-configurations/${configurationUuid}`}><ArrowLeft className="h-4 w-4" />{t("backToModelConfiguration")}</Link></Button>
        {loading && !catalog ? <Skeleton className="h-80 w-full" /> : error ? <div role="alert" className="space-y-3 text-sm text-destructive"><p>{error}</p><Button variant="outline" onClick={() => void reload()}>{t("retry")}</Button></div>
            : !saved ? <p role="alert">{t("modelConfigurationUnavailable")}</p>
                : connections.find(item => item.uuid === saved.configuration.llm.provider_connection_uuid)?.provider === "dograh" ? <p role="alert">{t("llmFallbacksUnavailableDograh")}</p>
                : catalog && <LLMFallbackEditor key={`${saved.uuid}-${saved.revision}`} saved={saved} catalog={catalog} connections={connections} onSaved={async () => {
                    await reload();
                    await refreshConfig();
                    toast.success(t("llmFallbacksSaved"));
                }} />}
    </PageShell>;
}
