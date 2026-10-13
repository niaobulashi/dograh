"use client";

import { ExternalLink, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { ConfigurationFields, type ConfigurationFieldsDensity } from "./ConfigurationFields";
import { ConfigurationSelect } from "./ConfigurationSelect";
import type { WorkflowModelOverride } from "./useWorkflowModelOverride";

const INHERIT = "__inherit__";
const LEGACY = "__legacy__";
const UNAVAILABLE = "__unavailable__";

/** The rendered status line, resolved to a `Models` message key plus its ICU values. */
type StatusLine = { textKey: string; values?: Record<string, string>; tone: "muted" | "changed" | "warn" };

function status(model: WorkflowModelOverride): StatusLine {
    const { binding, view, incomplete, edited } = model;
    if (view === "custom") {
        if (incomplete) return { textKey: "statusChooseProvider", tone: "warn" };
        if (binding.kind !== "custom" && !edited) return { textKey: "statusCustomFirstChange", tone: "warn" };
        return { textKey: "statusCustom", tone: "changed" };
    }
    switch (binding.kind) {
        case "none": return { textKey: "statusNoConfig", tone: "warn" };
        case "legacy": return { textKey: "statusLegacy", tone: "warn" };
        case "unavailable": return { textKey: "statusUnavailable", tone: "warn" };
        case "existing": return binding.isDefault
            ? { textKey: "statusFollowingDefault", values: { name: binding.base.name }, tone: "muted" }
            : { textKey: "statusFollowing", values: { name: binding.base.name }, tone: "muted" };
        default: return { textKey: "", tone: "muted" };
    }
}

const TONE_CLASS = {
    muted: "border-border bg-muted/30 text-muted-foreground",
    changed: "border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-300",
    warn: "border-border bg-muted/30 text-foreground",
};

/**
 * The workflow's model settings: follow a preset configuration, or build
 * custom settings from scratch with the configuration fields at the given
 * density. The editor's Model view shows it compact (one tab per service);
 * the settings page shows it in full.
 */
export function WorkflowModelPicker({ model, density = "full", fields }: {
    model: WorkflowModelOverride;
    density?: ConfigurationFieldsDensity;
    /** Setting names to show for each service; all of them when omitted. */
    fields?: string[];
}) {
    const t = useTranslations("Models");
    const { binding, view, configuration, shared, catalog, connections, defaultUuid, loading, loadError, reload, error, saving } = model;
    const compact = density === "compact";
    if (loading && !catalog) return <p className="text-sm text-muted-foreground">{t("loadingModelConfigurations")}</p>;
    if (loadError || !catalog) return <div role="alert" className="space-y-2 rounded-md border border-destructive/40 p-3 text-sm text-destructive">
        {loadError || t("failedToLoadModelConfigurations")}
        <div><Button type="button" size="sm" variant="outline" onClick={() => void reload()}>{t("retry")}</Button></div>
    </div>;
    const line = status(model);
    const lineText = line.textKey ? t(line.textKey, line.values) : "";
    const defaultName = shared.find(item => item.uuid === defaultUuid)?.name;
    const selected = binding.kind === "existing" ? (binding.isDefault ? INHERIT : binding.base.uuid)
        : binding.kind === "legacy" ? LEGACY : binding.kind === "unavailable" ? UNAVAILABLE : INHERIT;
    return <div className={compact ? "space-y-3" : "space-y-4"}>
        <Tabs value={view} onValueChange={next => { if (next === "custom") model.startCustom(); else void model.leaveCustom(); }}>
            <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="existing" disabled={saving}>{t("presetConfiguration")}</TabsTrigger>
                <TabsTrigger value="custom" disabled={saving}>{t("custom")}</TabsTrigger>
            </TabsList>
        </Tabs>
        {/* On the canvas the select already names the configuration; only warnings and custom state need a line. */}
        {lineText && !(compact && line.tone === "muted") && <p className={`rounded-md border px-3 py-2 text-xs leading-relaxed ${TONE_CLASS[line.tone]}`} role="status">{lineText}</p>}
        {view === "existing" && <div className={compact ? "space-y-1" : "space-y-1.5"}>
            <label htmlFor="workflow-model-base" className={compact ? "text-xs font-medium text-muted-foreground" : "text-sm font-medium"}>{t("configuration")}</label>
            <ConfigurationSelect id="workflow-model-base" value={selected} disabled={saving} placeholder={t("chooseConfiguration")} onValueChange={next => {
                if (next === LEGACY || next === UNAVAILABLE) return;
                void model.useExisting(next === INHERIT ? null : next);
            }} options={[
                // Following the default moves with it; naming a configuration, the default included, pins it.
                { value: INHERIT, label: defaultName ? t("organizationDefaultNamed", { name: defaultName }) : t("organizationDefault") },
                ...shared.map(item => ({ value: item.uuid, label: item.name })),
                ...(binding.kind === "legacy" ? [{ value: LEGACY, label: t("existingWorkflowOverride") }] : []),
                ...(binding.kind === "unavailable" ? [{ value: UNAVAILABLE, label: t("unavailableConfiguration") }] : []),
            ]} />
            {binding.kind === "existing" && <Link href={`/model-configurations/${binding.base.uuid}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-muted-foreground underline underline-offset-2">
                {t("openInModels", { name: binding.base.name })}<ExternalLink className="h-3 w-3" />
            </Link>}
        </div>}
        {view === "custom" && configuration && <ConfigurationFields configuration={configuration} catalog={catalog} connections={connections} onChange={model.edit} onConnectionAdded={model.addConnection} density={density} fields={fields} />}
        {error && <div role="alert" className="flex flex-wrap items-center gap-2 text-xs text-destructive">
            <span>{error}</span>
            {model.dirty && <Button type="button" size="sm" variant="outline" className="h-6 px-2 text-xs" disabled={saving} onClick={model.retry}>{t("retry")}</Button>}
        </div>}
        {(saving || !compact) && <p className="inline-flex items-center gap-2 text-xs text-muted-foreground">
            {saving ? <><Loader2 className="h-3 w-3 animate-spin" />{t("savingToDraft")}</>
                : <span>{t.rich("manageConfigurationsIn", { link: chunks => <Link href="/model-configurations" className="inline-flex items-center gap-0.5 underline">{chunks}<ExternalLink className="h-3 w-3" /></Link> })}</span>}
        </p>}
    </div>;
}
