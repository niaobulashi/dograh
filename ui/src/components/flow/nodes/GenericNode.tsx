import { NodeProps, NodeToolbar, Position } from "@xyflow/react";
import * as LucideIcons from "lucide-react";
import { Check, Circle, Copy, Edit, type LucideIcon, Trash2Icon } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { useWorkflow } from "@/app/workflow/[workflowId]/contexts/WorkflowContext";
import type { NodeSpec } from "@/client/types.gen";
import { DocumentBadges } from "@/components/flow/DocumentBadges";
import { NodeEditForm, useNodeSpecs } from "@/components/flow/renderer";
import { ToolBadges } from "@/components/flow/ToolBadges";
import { FlowNodeData } from "@/components/flow/types";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { NODE_DOCUMENTATION_URLS } from "@/constants/documentation";
import { useAppConfig } from "@/context/AppConfigContext";
import { copyTextToClipboard } from "@/lib/clipboard";
import { cn } from "@/lib/utils";
import { createUuid } from "@/lib/uuid";
import { resolveWebhookBaseUrl } from "@/lib/webhookUrl";

import { NodeContent } from "./common/NodeContent";
import { NodeEditDialog } from "./common/NodeEditDialog";
import { useNodeHandlers } from "./common/useNodeHandlers";

// ─── Static per-spec UI maps ──────────────────────────────────────────────
// Small lookups indexed by spec.name. Keeping these in the renderer (not
// the spec) avoids leaking UI concerns into the backend schema. Add an
// entry when registering a new node type.

type NodeStyleVariant =
    | "start"
    | "agent"
    | "end"
    | "global"
    | "trigger"
    | "webhook"
    | "qa"
    | "integration";

const STYLE_VARIANT_BY_SPEC: Record<string, NodeStyleVariant> = {
    startCall: "start",
    agentNode: "agent",
    endCall: "end",
    globalNode: "global",
    trigger: "trigger",
    webhook: "webhook",
    qa: "qa",
};

const HANDLES_BY_SPEC: Record<string, { source: boolean; target: boolean }> = {
    startCall: { source: true, target: false },
    agentNode: { source: true, target: true },
    endCall: { source: false, target: true },
    globalNode: { source: false, target: false },
    trigger: { source: false, target: false },
    webhook: { source: false, target: false },
    qa: { source: false, target: false },
};

const DOC_URL_BY_SPEC: Record<string, string | undefined> = {
    startCall: NODE_DOCUMENTATION_URLS.startCall,
    agentNode: NODE_DOCUMENTATION_URLS.agent,
    endCall: NODE_DOCUMENTATION_URLS.endCall,
    globalNode: NODE_DOCUMENTATION_URLS.global,
    trigger: NODE_DOCUMENTATION_URLS.apiTrigger,
    webhook: NODE_DOCUMENTATION_URLS.webhook,
    qa: NODE_DOCUMENTATION_URLS.qaAnalysis,
};

// ─── Helpers ──────────────────────────────────────────────────────────────

function resolveIcon(name: string): LucideIcon {
    const icons = LucideIcons as unknown as Record<string, LucideIcon>;
    return icons[name] ?? Circle;
}

function seedValues(
    data: FlowNodeData,
    spec: NodeSpec,
): Record<string, unknown> {
    const d = data as unknown as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const prop of spec.properties) {
        out[prop.name] = d[prop.name] ?? prop.default ?? undefined;
    }
    return out;
}

interface TriggerEndpoints {
    production: string;
    test: string;
}

function buildTriggerEndpoints(
    triggerPath: string | undefined,
    baseUrl: string,
): TriggerEndpoints {
    if (!triggerPath) return { production: "", test: "" };
    return {
        production: `${baseUrl}/api/v1/public/agent/${triggerPath}`,
        test: `${baseUrl}/api/v1/public/agent/test/${triggerPath}`,
    };
}

function resolveIntegrationEnabled(
    spec: NodeSpec,
    data: FlowNodeData,
): boolean {
    for (const prop of spec.properties) {
        if (!prop.name.endsWith("enabled")) continue;
        const value = data[prop.name];
        if (typeof value === "boolean") return value;
    }
    return true;
}

function resolveIntegrationSummary(
    spec: NodeSpec,
    data: FlowNodeData,
    t: (key: string) => string,
): string {
    let hasSecret = false;
    for (const prop of spec.properties) {
        if (prop.name === "name" || prop.name.endsWith("enabled")) {
            continue;
        }
        // A configured API key/token/secret is never displayed, but it does
        // prove the node is set up. Remember that so a node whose only real
        // config is a secret (e.g. an integration identified solely by its key)
        // isn't mislabelled "Not configured".
        if (/api[_-]?key|token|secret/i.test(prop.name)) {
            const secret = data[prop.name];
            if (typeof secret === "string" && secret.trim().length > 0) {
                hasSecret = true;
            }
            continue;
        }

        const value = data[prop.name];
        if (typeof value === "string" && value.trim().length > 0) {
            return value.length > 30 ? `${value.slice(0, 30)}...` : value;
        }
        if (typeof value === "number") {
            return String(value);
        }
    }
    return hasSecret ? t("configured") : t("notConfigured");
}

function getBadgeForSpec(
    spec: NodeSpec | undefined,
    variant: NodeStyleVariant,
    t: (key: string) => string,
): { label: string; className: string } {
    if (!spec) {
        return { label: t("nodeBadge"), className: "bg-zinc-500 text-white" };
    }

    switch (variant) {
        case "start":
            return { label: t("startNodeBadge"), className: "bg-emerald-500 text-white" };
        case "agent":
            return { label: t("agentNodeBadge"), className: "bg-blue-500 text-white" };
        case "end":
            return { label: t("endNodeBadge"), className: "bg-rose-500 text-white" };
        case "global":
            return { label: t("globalNodeBadge"), className: "bg-amber-500 text-white" };
        case "trigger":
            return { label: t("apiTriggerBadge"), className: "bg-purple-500 text-white" };
        case "webhook":
            return { label: t("webhookBadge"), className: "bg-indigo-500 text-white" };
        case "qa":
            return { label: t("qaAnalysisBadge"), className: "bg-teal-500 text-white" };
        case "integration":
            return { label: spec.display_name, className: "bg-cyan-600 text-white" };
    }
}

// ─── Canvas preview dispatch ──────────────────────────────────────────────

function CanvasPreview({
    spec,
    data,
    onCopyTrigger,
    triggerCopied,
    onStaleTools,
    onStaleDocuments,
}: {
    spec: NodeSpec;
    data: FlowNodeData;
    onCopyTrigger: () => void;
    triggerCopied: boolean;
    onStaleTools: (uuids: string[]) => void;
    onStaleDocuments: (uuids: string[]) => void;
}) {
    const t = useTranslations("Workflow");
    const { config: appConfig } = useAppConfig();
    if (spec.name === "trigger") {
        const endpoint = buildTriggerEndpoints(
            data.trigger_path,
            resolveWebhookBaseUrl(appConfig?.tunnelUrl),
        ).production;
        return (
            <div className="space-y-2">
                <p className="text-xs text-muted-foreground">{t("apiEndpoint")}</p>
                <div className="flex items-center gap-1">
                    <code className="text-xs break-all bg-muted px-1 py-0.5 rounded flex-1">
                        {endpoint || t("generating")}
                    </code>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 shrink-0"
                        onClick={(e) => {
                            e.stopPropagation();
                            onCopyTrigger();
                        }}
                    >
                        {triggerCopied ? (
                            <Check className="h-3 w-3" />
                        ) : (
                            <Copy className="h-3 w-3" />
                        )}
                    </Button>
                </div>
            </div>
        );
    }

    if (spec.name === "webhook") {
        const method = data.http_method || "POST";
        const url = data.endpoint_url || "";
        const enabled = data.enabled !== false;
        const truncated = !url
            ? t("notConfigured")
            : url.length > 30
            ? url.slice(0, 30) + "..."
            : url;
        return (
            <div className="space-y-2">
                <div className="flex items-center gap-2">
                    <span className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded">
                        {method}
                    </span>
                    <span className="text-xs text-muted-foreground truncate flex-1">
                        {truncated}
                    </span>
                </div>
                <StatusDot enabled={enabled} />
            </div>
        );
    }

    if (spec.name === "qa") {
        const llmSource =
            data.qa_use_workflow_llm !== false
                ? t("workflowLlm")
                : `${data.qa_provider || "openai"}/${data.qa_model || "gpt-4.1"}`;
        const enabled = data.qa_enabled !== false;
        return (
            <div className="space-y-2">
                <div className="flex items-center gap-2">
                    <span className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded">
                        {llmSource}
                    </span>
                </div>
                <StatusDot enabled={enabled} />
            </div>
        );
    }

    if (spec.category === "integration") {
        const enabled = resolveIntegrationEnabled(spec, data);
        const destination = resolveIntegrationSummary(spec, data, t);
        return (
            <div className="space-y-2">
                <div className="flex items-center gap-2">
                    <span className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded">
                        {destination}
                    </span>
                </div>
                <StatusDot enabled={enabled} />
            </div>
        );
    }

    // Default: prompt preview + tool/document badges (when spec declares them).
    const hasToolRefs = spec.properties.some((p) => p.type === "tool_refs");
    const hasDocRefs = spec.properties.some((p) => p.type === "document_refs");
    return (
        <>
            <p className="text-sm text-muted-foreground line-clamp-5 leading-relaxed">
                {data.prompt || t("noPromptConfigured")}
            </p>
            {hasToolRefs && data.tool_uuids && data.tool_uuids.length > 0 && (
                <div className="mt-3 pt-3 border-t border-border/50">
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-2">
                        <LucideIcons.Wrench className="h-3 w-3" />
                        <span>{t("toolsField")}</span>
                    </div>
                    <ToolBadges
                        toolUuids={data.tool_uuids}
                        onStaleUuidsDetected={onStaleTools}
                        mcpToolFilters={data.mcp_tool_filters}
                    />
                </div>
            )}
            {hasDocRefs && data.document_uuids && data.document_uuids.length > 0 && (
                <div className="mt-3 pt-3 border-t border-border/50">
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-2">
                        <LucideIcons.FileText className="h-3 w-3" />
                        <span>{t("documentsField")}</span>
                    </div>
                    <DocumentBadges
                        documentUuids={data.document_uuids}
                        onStaleUuidsDetected={onStaleDocuments}
                    />
                </div>
            )}
        </>
    );
}

function StatusDot({ enabled }: { enabled: boolean }) {
    const t = useTranslations("Workflow");
    return (
        <div className="flex items-center gap-1.5">
            <Circle
                className={`h-2 w-2 ${
                    enabled
                        ? "fill-green-500 text-green-500"
                        : "fill-gray-400 text-gray-400"
                }`}
            />
            <span className="text-xs text-muted-foreground">
                {enabled ? t("enabled") : t("disabled")}
            </span>
        </div>
    );
}

// ─── Trigger webhook URLs (test + production) — rendered inside the dialog ─

function buildCurl(endpoint: string): string {
    return `curl -X POST "${endpoint}" \\
  -H "X-API-Key: YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"phone_number": "+1234567890", "initial_context": {}}'`;
}

function ClickToCopy({
    value,
    children,
    className,
    title,
}: {
    value: string;
    children: React.ReactNode;
    className?: string;
    title?: string;
}) {
    const t = useTranslations("Workflow");
    const [copied, setCopied] = useState(false);
    const onCopy = async () => {
        if (!value) return;
        try {
            await copyTextToClipboard(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch {
            toast.error(t("failedToCopyValue"));
        }
    };
    return (
        <button
            type="button"
            onClick={onCopy}
            title={title ?? t("clickToCopy")}
            className={cn(
                "group relative text-left transition-colors hover:bg-accent/60 cursor-pointer disabled:cursor-default",
                className,
            )}
            disabled={!value}
        >
            {children}
            <span
                aria-hidden={!copied}
                className={cn(
                    "pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 rounded bg-foreground/90 px-1.5 py-0.5 text-[10px] font-medium text-background shadow transition-opacity",
                    copied ? "opacity-100" : "opacity-0",
                )}
            >
                {t("copied")}
            </span>
        </button>
    );
}

function UrlPanel({
    endpoint,
    helperText,
}: {
    endpoint: string;
    helperText: string;
}) {
    const t = useTranslations("Workflow");
    const curl = endpoint ? buildCurl(endpoint) : "";
    return (
        <div className="grid gap-2 pt-2">
            <div className="flex items-center gap-2">
                <span className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded shrink-0">
                    POST
                </span>
                <ClickToCopy
                    value={endpoint}
                    title={t("clickToCopyUrl")}
                    className="flex-1 bg-muted rounded px-2 py-1"
                >
                    <code className="text-xs break-all">
                        {endpoint || t("generating")}
                    </code>
                </ClickToCopy>
            </div>
            <p className="text-xs text-muted-foreground">{helperText}</p>
            <p className="text-sm font-medium pt-2">{t("exampleRequest")}</p>
            <ClickToCopy
                value={curl}
                title={t("clickToCopyCurl")}
                className="block w-full bg-muted rounded"
            >
                <pre className="text-xs px-3 py-2 overflow-x-auto whitespace-pre-wrap">
                    {curl || t("generating")}
                </pre>
            </ClickToCopy>
        </div>
    );
}

function TriggerWebhookUrls({ endpoints }: { endpoints: TriggerEndpoints }) {
    const t = useTranslations("Workflow");
    return (
        <div className="grid gap-2">
            <p className="text-sm font-medium">{t("webhookUrls")}</p>
            <p className="text-xs text-muted-foreground">
                {t("webhookUrlsHint")}{" "}
                <Link
                    href="/api-keys"
                    target="_blank"
                    className="text-primary underline hover:no-underline"
                >
                    {t("getYourApiKey")}
                </Link>
            </p>
            <Tabs defaultValue="test" className="w-full">
                <TabsList>
                    <TabsTrigger value="test">{t("testUrl")}</TabsTrigger>
                    <TabsTrigger value="production">{t("productionUrl")}</TabsTrigger>
                </TabsList>
                <TabsContent value="test">
                    <UrlPanel
                        endpoint={endpoints.test}
                        helperText={t("testUrlHelper")}
                    />
                </TabsContent>
                <TabsContent value="production">
                    <UrlPanel
                        endpoint={endpoints.production}
                        helperText={t("productionUrlHelper")}
                    />
                </TabsContent>
            </Tabs>
        </div>
    );
}

// ─── GenericNode ──────────────────────────────────────────────────────────

interface GenericNodeProps extends NodeProps {
    data: FlowNodeData;
    type: string;
}

export const GenericNode = memo(({ data, selected, id, type }: GenericNodeProps) => {
    const t = useTranslations("Workflow");
    // Per-type metadata that StartCall/EndCall used to set via `additionalData`
    // (is_start / is_end). Pulled from the spec name here.
    const additionalData = useMemo<Record<string, boolean> | undefined>(() => {
        const out: Record<string, boolean> = {};
        if (type === "startCall") out.is_start = true;
        if (type === "endCall") out.is_end = true;
        return Object.keys(out).length > 0 ? out : undefined;
    }, [type]);

    const { open, setOpen, handleSaveNodeData, handleDeleteNode } = useNodeHandlers({
        id,
        additionalData,
    });
    const { saveWorkflow, tools, documents, recordings } = useWorkflow();
    const { bySpecName } = useNodeSpecs();
    const { config: appConfig } = useAppConfig();
    const spec = bySpecName.get(type);
    const webhookBaseUrl = resolveWebhookBaseUrl(appConfig?.tunnelUrl);

    // ── Form state ─────────────────────────────────────────────────────
    // mcp_tool_filters is not a spec property, so seedValues won't carry it;
    // seed merges it back in alongside the spec-derived values.
    const seed = useCallback(
        () =>
            spec
                ? { ...seedValues(data, spec), mcp_tool_filters: data.mcp_tool_filters }
                : {},
        [data, spec],
    );

    const [values, setValues] = useState<Record<string, unknown>>(seed);

    // Re-seed once the spec arrives (initial fetch race).
    useEffect(() => {
        if (spec && Object.keys(values).length === 0) {
            setValues(seed());
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [spec]);

    // ── Trigger auto-UUID + canvas copy state ──────────────────────────
    const [triggerCopied, setTriggerCopied] = useState(false);
    const handleCopyTrigger = useCallback(async () => {
        const endpoint = buildTriggerEndpoints(data.trigger_path, webhookBaseUrl).production;
        if (!endpoint) return;
        try {
            await copyTextToClipboard(endpoint);
            setTriggerCopied(true);
            setTimeout(() => setTriggerCopied(false), 2000);
        } catch {
            toast.error(t("failedToCopyTriggerUrl"));
        }
    }, [data.trigger_path, webhookBaseUrl, t]);

    // For trigger nodes without a path yet, generate one and persist.
    useEffect(() => {
        if (type !== "trigger") return;
        if (data.trigger_path) return;
        const newPath = createUuid();
        handleSaveNodeData({ ...data, trigger_path: newPath });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [type]);

    // ── Stale tool/document cleanup (was duplicated in Start/Agent) ─────
    const handleStaleTools = useCallback(
        async (staleUuids: string[]) => {
            const cleaned = (data.tool_uuids ?? []).filter(
                (u) => !staleUuids.includes(u),
            );
            handleSaveNodeData({
                ...data,
                tool_uuids: cleaned.length > 0 ? cleaned : undefined,
            });
            await saveWorkflow();
        },
        [data, handleSaveNodeData, saveWorkflow],
    );
    const handleStaleDocuments = useCallback(
        async (staleUuids: string[]) => {
            const cleaned = (data.document_uuids ?? []).filter(
                (u) => !staleUuids.includes(u),
            );
            handleSaveNodeData({
                ...data,
                document_uuids: cleaned.length > 0 ? cleaned : undefined,
            });
            await saveWorkflow();
        },
        [data, handleSaveNodeData, saveWorkflow],
    );

    // ── Dirty / save / open handlers ────────────────────────────────────
    const propertyNames = useMemo(
        () => spec?.properties.map((p) => p.name) ?? [],
        [spec],
    );

    const isDirty = useMemo(() => {
        if (!spec) return false;
        const baseline = seedValues(data, spec);
        if (propertyNames.some((n) => values[n] !== baseline[n])) return true;
        return (
            JSON.stringify(values.mcp_tool_filters ?? {}) !==
            JSON.stringify(data.mcp_tool_filters ?? {})
        );
    }, [values, data, spec, propertyNames]);

    const handleSave = async () => {
        if (!spec) return;
        handleSaveNodeData({
            ...data,
            ...(values as Partial<FlowNodeData>),
        });
        setOpen(false);
        await saveWorkflow();
    };

    const handleOpenChange = (newOpen: boolean) => {
        if (newOpen && spec) setValues(seed());
        setOpen(newOpen);
    };

    useEffect(() => {
        if (open && spec) setValues(seed());
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [data, open]);

    // ── Render ──────────────────────────────────────────────────────────
    const styleVariant =
        STYLE_VARIANT_BY_SPEC[type] ??
        (spec?.category === "integration" ? "integration" : "agent");
    const handles =
        HANDLES_BY_SPEC[type] ??
        (spec?.category === "integration"
            ? { source: false, target: false }
            : { source: true, target: true });
    const badge = getBadgeForSpec(spec, styleVariant, t);
    const Icon = spec ? resolveIcon(spec.icon) : Circle;
    const docUrl = spec?.docs_url ?? DOC_URL_BY_SPEC[type];
    const contentLabel = spec?.properties.some((p) => p.name === "prompt")
        ? t("contentLabelPrompt")
        : t("contentLabelDetails");

    // Edit dialog title: "Edit {display_name}". Webhook keeps the original
    // "Edit Webhook" wording — display_name is "Webhook" so it works out.
    const dialogTitle = spec ? t("editNamed", { name: spec.display_name }) : t("editNode");
    const fallbackTitle = spec?.display_name ?? t("nodeBadge");

    return (
        <>
            <NodeContent
                selected={selected}
                invalid={data.invalid}
                selected_through_edge={data.selected_through_edge}
                hovered_through_edge={data.hovered_through_edge}
                runtimeActive={data.runtime_active}
                title={data.name || fallbackTitle}
                icon={<Icon />}
                badgeLabel={badge.label}
                badgeClassName={badge.className}
                contentLabel={contentLabel}
                hasSourceHandle={handles.source}
                hasTargetHandle={handles.target}
                onDoubleClick={() => setOpen(true)}
                nodeId={id}
            >
                {spec && (
                    <CanvasPreview
                        spec={spec}
                        data={data}
                        onCopyTrigger={handleCopyTrigger}
                        triggerCopied={triggerCopied}
                        onStaleTools={handleStaleTools}
                        onStaleDocuments={handleStaleDocuments}
                    />
                )}
            </NodeContent>

            <NodeToolbar isVisible={selected} position={Position.Right}>
                <div className="flex flex-col gap-1">
                    <Button onClick={() => setOpen(true)} variant="outline" size="icon">
                        <Edit />
                    </Button>
                    {/* Start nodes can't be deleted (workflow always needs one). */}
                    {type !== "startCall" && (
                        <Button
                            onClick={handleDeleteNode}
                            variant="outline"
                            size="icon"
                        >
                            <Trash2Icon />
                        </Button>
                    )}
                </div>
            </NodeToolbar>

            <NodeEditDialog
                open={open}
                onOpenChange={handleOpenChange}
                nodeData={data}
                title={dialogTitle}
                onSave={handleSave}
                isDirty={isDirty}
                documentationUrl={docUrl}
            >
                {open && spec && (
                    <div className="grid gap-4">
                        <NodeEditForm
                            spec={spec}
                            values={values}
                            onChange={setValues}
                            context={{
                                tools: tools ?? [],
                                documents: documents ?? [],
                                recordings: recordings ?? [],
                                mcpToolFilters:
                                    (values.mcp_tool_filters as
                                        | Record<string, string[]>
                                        | undefined) ?? {},
                                onMcpToolFiltersChange: (next) =>
                                    setValues((prev) => ({
                                        ...prev,
                                        mcp_tool_filters:
                                            Object.keys(next).length > 0
                                                ? next
                                                : undefined,
                                    })),
                            }}
                        />
                        {type === "trigger" && (
                            <TriggerWebhookUrls
                                endpoints={buildTriggerEndpoints(data.trigger_path, webhookBaseUrl)}
                            />
                        )}
                    </div>
                )}
            </NodeEditDialog>
        </>
    );
});

GenericNode.displayName = "GenericNode";
