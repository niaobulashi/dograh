"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
import { useState } from "react";

import { updateNamedModelConfiguration } from "@/client/sdk.gen";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { detailFromError } from "@/lib/apiError";

import { cleanFallbackPolicy, compatibleConnections, selectionForConnection } from "./configuration";
import { ConfigurationSelect } from "./ConfigurationSelect";
import { SchemaFields } from "./SchemaFields";
import type { FallbackCondition, FallbackRule, ModelConnectionCatalog, NamedModelConfiguration, ProviderConnection } from "./types";

const CONDITIONS: { type: FallbackCondition["type"]; titleKey: string; descriptionKey: string }[] = [
    { type: "no_output", titleKey: "fallbackSlowResponseTitle", descriptionKey: "fallbackSlowResponseDescription" },
    { type: "error", titleKey: "fallbackRequestErrorTitle", descriptionKey: "fallbackRequestErrorDescription" },
];

export function LLMFallbackEditor({ saved, catalog, connections, onSaved }: {
    saved: NamedModelConfiguration;
    catalog: ModelConnectionCatalog;
    connections: ProviderConnection[];
    onSaved: () => Promise<void>;
}) {
    const t = useTranslations("Models");
    const [rules, setRules] = useState<FallbackRule[]>(saved.configuration.llm_fallback?.rules || []);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const available = compatibleConnections(catalog, connections, "llm");
    const primary = connections.find(connection => connection.uuid === saved.configuration.llm.provider_connection_uuid);
    const primaryModel = saved.configuration.llm.settings.model || (primary && catalog.services.llm?.[primary.provider]?.settings_schema.properties?.model?.default);
    const duplicatesPrimary = (rule: FallbackRule) => rule.target.provider_connection_uuid === saved.configuration.llm.provider_connection_uuid
        && (rule.target.settings.model || (primary && catalog.services.llm?.[primary.provider]?.settings_schema.properties?.model?.default)) === primaryModel;
    const hasDuplicate = rules.some(duplicatesPrimary);
    const update = (type: FallbackCondition["type"], rule: FallbackRule) => setRules(current => current.map(item => item.condition.type === type ? rule : item));

    return <form className="space-y-6" onSubmit={async event => {
        event.preventDefault();
        if (hasDuplicate) return;
        setSaving(true);
        setError(null);
        try {
            const configuration = { ...saved.configuration, llm_fallback: cleanFallbackPolicy({ version: 1, rules }, catalog, connections) };
            const result = await updateNamedModelConfiguration({ path: { configuration_uuid: saved.uuid }, body: { configuration, revision: saved.revision } });
            if (result.error) throw new Error(detailFromError(result.error, t("failedToSaveLlmFallbacks")));
            if (!result.data) throw new Error(t("failedToSaveLlmFallbacks"));
            await onSaved();
        } catch (cause) { setError(cause instanceof Error ? cause.message : t("failedToSaveLlmFallbacks")); }
        finally { setSaving(false); }
    }}>
        <div className="space-y-2">
            <p className="text-sm text-muted-foreground">{saved.name}</p>
            <h1 className="text-2xl font-bold">{t("llmFallbacks")}</h1>
            <p className="max-w-2xl text-sm text-muted-foreground">{t("llmFallbacksIntro")}</p>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/30 p-4">
            <div><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("primaryLlm")}</p><p className="mt-1 font-medium">{primary?.name || t("unavailableConnection")} <span className="font-normal text-muted-foreground">· {String(primaryModel || t("providerDefault"))}</span></p></div>
            <Button asChild variant="ghost" size="sm"><Link href={`/model-configurations/${saved.uuid}`}>{t("editPrimary")}</Link></Button>
        </div>
        {saved.configuration.mode === "realtime" && <p className="text-sm text-muted-foreground">{t("realtimeFallbackNote")}</p>}
        {error && <p role="alert" className="rounded-md border border-destructive/40 p-3 text-sm text-destructive">{error}</p>}
        <fieldset disabled={saving} className="space-y-4">
            {CONDITIONS.map(({ type, titleKey, descriptionKey }) => {
                const rule = rules.find(item => item.condition.type === type);
                const connection = available.find(item => item.uuid === rule?.target.provider_connection_uuid);
                const entry = connection && catalog.services.llm?.[connection.provider];
                return <section key={type} className="rounded-lg border bg-card">
                    <div className="flex items-start justify-between gap-4 p-5">
                        <div className="space-y-1"><Label htmlFor={`fallback-${type}`} className="text-base font-semibold">{t(titleKey)}</Label><p className="max-w-2xl text-sm text-muted-foreground">{t(descriptionKey)}</p></div>
                        <Switch id={`fallback-${type}`} checked={Boolean(rule)} onCheckedChange={enabled => {
                            if (!enabled) { setRules(current => current.filter(item => item.condition.type !== type)); return; }
                            const target = available.find(item => item.uuid !== saved.configuration.llm.provider_connection_uuid) || available[0];
                            setRules(current => [...current, {
                                condition: type === "no_output" ? { type, after_ms: 1500 } : { type },
                                target: target ? selectionForConnection(catalog, "llm", target) : { provider_connection_uuid: "", settings: {} },
                            }]);
                        }} />
                    </div>
                    {rule && <div className="space-y-5 border-t p-5">
                        {rule.condition.type === "no_output" && <div className="space-y-1.5">
                            <Label htmlFor="fallback-delay">{t("waitBeforeFallback")}</Label>
                            <Input id="fallback-delay" type="number" required min={100} max={10000} step={1} className="max-w-52" value={rule.condition.after_ms || ""}
                                onChange={event => update(type, { ...rule, condition: { type: "no_output", after_ms: Number(event.target.value) } })} />
                            <p className="text-xs text-muted-foreground">{t("waitBeforeFallbackHint")}</p>
                        </div>}
                        <div className="space-y-1.5">
                            <Label htmlFor={`fallback-connection-${type}`}>{t("providerConnection")}</Label>
                            <ConfigurationSelect id={`fallback-connection-${type}`} required value={connection?.uuid || ""} placeholder={t("selectLlmConnection")}
                                options={available.map(item => ({ value: item.uuid, label: `${item.name} · ${catalog.services.llm?.[item.provider]?.title || item.provider}` }))}
                                onValueChange={uuid => {
                                    const next = available.find(item => item.uuid === uuid);
                                    if (next) update(type, { ...rule, target: selectionForConnection(catalog, "llm", next, rule.target, connections) });
                                }} />
                            <p className="text-xs text-muted-foreground">{t.rich("fallbackConnectionHint", { link: chunks => <Link href="/provider-connections" className="underline">{chunks}</Link> })}</p>
                        </div>
                        {entry && <SchemaFields key={connection.provider} provider={connection.provider} role="llm" schema={entry.settings_schema} values={rule.target.settings} context={connection.connection_settings}
                            onChange={(name, value) => {
                                const settings = { ...rule.target.settings, [name]: value };
                                if (value === undefined) delete settings[name];
                                update(type, { ...rule, target: { ...rule.target, settings } });
                            }} />}
                        {duplicatesPrimary(rule) && <p role="alert" className="text-sm text-destructive">{t("duplicateFallbackTarget")}</p>}
                    </div>}
                </section>;
            })}
        </fieldset>
        <div className="flex flex-wrap items-start justify-between gap-4 border-t pt-5">
            <p className="max-w-2xl text-xs leading-relaxed text-muted-foreground">{t("fallbacksFootnote")}</p>
            <Button type="submit" disabled={saving || hasDuplicate || rules.some(rule => !available.some(connection => connection.uuid === rule.target.provider_connection_uuid))}>{saving ? t("saving") : t("saveFallbacks")}</Button>
        </div>
    </form>;
}
