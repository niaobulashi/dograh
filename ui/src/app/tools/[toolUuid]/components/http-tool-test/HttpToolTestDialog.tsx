"use client";

import { AlertTriangle, Loader2, Pencil } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { testToolApiV1ToolsToolUuidTestPost } from "@/client/sdk.gen";
import type { ToolTestResponse } from "@/client/types.gen";
import type { HttpMethod, PresetToolParameter, ToolParameter } from "@/components/http";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { detailFromError } from "@/lib/apiError";
import { useAuth } from "@/lib/auth";

import {
    generateSampleValue,
    isUnsafeHttpMethod,
    parseTestParameterValues,
} from "./helpers";

type HttpToolTestDialogProps = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    toolUuid: string;
    httpMethod: HttpMethod;
    url: string;
    parameters: ToolParameter[];
    presetParameters: PresetToolParameter[];
};

type TestParameter = ToolParameter | PresetToolParameter;
type ParameterSource = "llm" | "preset";
type JsonEditTarget = {
    source: ParameterSource;
    name: string;
};

type ParameterFieldsProps = {
    idPrefix: string;
    parameters: TestParameter[];
    values: Record<string, string>;
    onValueChange: (name: string, value: string) => void;
    onEditJson: (name: string) => void;
};

function defaultInputValue(parameter: TestParameter): string {
    if (
        "valueTemplate" in parameter &&
        parameter.valueTemplate &&
        !parameter.valueTemplate.includes("{{")
    ) {
        return parameter.valueTemplate;
    }
    switch (parameter.type) {
        case "number":
            return "0";
        case "boolean":
            return "true";
        case "object":
            return "{}";
        case "array":
            return "[]";
        default:
            return "";
    }
}

function seedMissingValues(
    previous: Record<string, string>,
    parameters: TestParameter[]
): Record<string, string> {
    const next = { ...previous };
    let changed = false;

    for (const parameter of parameters) {
        if (!parameter.name || parameter.name in next) continue;
        next[parameter.name] = defaultInputValue(parameter);
        changed = true;
    }

    return changed ? next : previous;
}

function ParameterFields({
    idPrefix,
    parameters,
    values,
    onValueChange,
    onEditJson,
}: ParameterFieldsProps) {
    const t = useTranslations("Tools");
    if (parameters.length === 0) {
        return <p className="text-sm text-muted-foreground">{t("testDialog.noParameters")}</p>;
    }

    return (
        <div className="space-y-4">
            {parameters.map((parameter) => {
                const inputId = `${idPrefix}-${parameter.name}`;
                const value = values[parameter.name] ?? defaultInputValue(parameter);

                return (
                    <div key={parameter.name} className="space-y-1.5">
                        <div className="flex items-center gap-2">
                            <Label htmlFor={inputId} className="text-sm font-mono">
                                {parameter.name}
                            </Label>
                            <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                                {parameter.type}
                            </span>
                            {parameter.required && (
                                <span className="text-xs text-destructive">
                                    {t("testDialog.required")}
                                </span>
                            )}
                        </div>
                        {"description" in parameter && parameter.description && (
                            <p className="text-xs text-muted-foreground">{parameter.description}</p>
                        )}
                        {"valueTemplate" in parameter && parameter.valueTemplate && (
                            <p className="break-all text-xs text-muted-foreground">
                                {t("testDialog.configuredPreset")} <code>{parameter.valueTemplate}</code>
                            </p>
                        )}
                        {parameter.type === "boolean" ? (
                            <select
                                id={inputId}
                                value={value}
                                onChange={(event) => onValueChange(parameter.name, event.target.value)}
                                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm"
                            >
                                <option value="true">true</option>
                                <option value="false">false</option>
                            </select>
                        ) : parameter.type === "number" ? (
                            <Input
                                id={inputId}
                                type="number"
                                value={value}
                                onChange={(event) => onValueChange(parameter.name, event.target.value)}
                            />
                        ) : parameter.type === "object" || parameter.type === "array" ? (
                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={() => onEditJson(parameter.name)}
                                    className="h-9 flex-1 truncate rounded-md border border-input bg-background px-3 py-1 text-left font-mono text-sm shadow-sm hover:bg-accent"
                                >
                                    {!value || value === (parameter.type === "array" ? "[]" : "{}") ? (
                                        <span className="text-muted-foreground">{t("testDialog.empty")}</span>
                                    ) : (
                                        value
                                    )}
                                </button>
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="icon"
                                    onClick={() => onEditJson(parameter.name)}
                                    aria-label={t("testDialog.editParamAria", { name: parameter.name })}
                                >
                                    <Pencil className="h-4 w-4" />
                                </Button>
                            </div>
                        ) : (
                            <Input
                                id={inputId}
                                value={value}
                                onChange={(event) => onValueChange(parameter.name, event.target.value)}
                                placeholder={t("testDialog.enterParamPlaceholder", { name: parameter.name })}
                            />
                        )}
                    </div>
                );
            })}
        </div>
    );
}

export function HttpToolTestDialog({
    open,
    onOpenChange,
    toolUuid,
    httpMethod,
    url,
    parameters,
    presetParameters,
}: HttpToolTestDialogProps) {
    const t = useTranslations("Tools");
    const { getAccessToken } = useAuth();
    const [llmParamValues, setLlmParamValues] = useState<Record<string, string>>({});
    const [presetParamValues, setPresetParamValues] = useState<Record<string, string>>({});
    const [result, setResult] = useState<ToolTestResponse | null>(null);
    const [isTesting, setIsTesting] = useState(false);
    const [testError, setTestError] = useState<string | null>(null);
    const [jsonEditTarget, setJsonEditTarget] = useState<JsonEditTarget | null>(null);
    const [jsonEditDraft, setJsonEditDraft] = useState("");
    const [jsonEditError, setJsonEditError] = useState<string | null>(null);

    useEffect(() => {
        setLlmParamValues((previous) => seedMissingValues(previous, parameters));
    }, [parameters]);

    useEffect(() => {
        setPresetParamValues((previous) => seedMissingValues(previous, presetParameters));
    }, [presetParameters]);

    const handleFillSampleValues = () => {
        setLlmParamValues((previous) => {
            const next = { ...previous };
            for (const parameter of parameters) {
                next[parameter.name] = generateSampleValue(parameter.type);
            }
            return next;
        });
        setPresetParamValues((previous) => {
            const next = { ...previous };
            for (const parameter of presetParameters) {
                next[parameter.name] = generateSampleValue(parameter.type);
            }
            return next;
        });
    };

    const closeJsonEditDialog = () => {
        setJsonEditTarget(null);
        setJsonEditDraft("");
        setJsonEditError(null);
    };

    const openJsonEditDialog = (source: ParameterSource, parameterName: string) => {
        const values = source === "llm" ? llmParamValues : presetParamValues;
        const current = values[parameterName] ?? "";
        let draft = current;

        try {
            draft = JSON.stringify(JSON.parse(current), null, 2);
        } catch {
            // Keep incomplete or invalid JSON as-is. Validation is triggered
            // only when the user explicitly chooses Save or Format JSON.
        }

        setJsonEditTarget({ source, name: parameterName });
        setJsonEditDraft(draft);
        setJsonEditError(null);
    };

    const handleJsonEditDraftChange = (value: string) => {
        setJsonEditDraft(value);
        setJsonEditError(null);
    };

    const handleFormatJson = () => {
        try {
            const parsed = JSON.parse(jsonEditDraft);
            setJsonEditDraft(JSON.stringify(parsed, null, 2));
            setJsonEditError(null);
        } catch (caughtError) {
            setJsonEditError(caughtError instanceof Error ? caughtError.message : t("testDialog.invalidJson"));
        }
    };

    const handleSaveJsonEdit = () => {
        if (jsonEditTarget === null) return;
        const target = jsonEditTarget;

        try {
            const parsed = JSON.parse(jsonEditDraft);
            const setValues = target.source === "llm" ? setLlmParamValues : setPresetParamValues;
            setValues((previous) => ({ ...previous, [target.name]: JSON.stringify(parsed) }));
            closeJsonEditDialog();
        } catch (caughtError) {
            setJsonEditError(caughtError instanceof Error ? caughtError.message : t("testDialog.invalidJson"));
        }
    };

    const handleTestTool = async () => {
        try {
            setIsTesting(true);
            setTestError(null);
            setResult(null);

            const llmParams = parseTestParameterValues(parameters, llmParamValues);
            const presetParams = parseTestParameterValues(presetParameters, presetParamValues);

            const accessToken = await getAccessToken();
            const response = await testToolApiV1ToolsToolUuidTestPost({
                path: { tool_uuid: toolUuid },
                headers: { Authorization: `Bearer ${accessToken}` },
                body: {
                    llm_params: llmParams,
                    preset_params: presetParams,
                },
            });

            if (response.error) {
                setTestError(detailFromError(response.error, t("testDialog.errorTest")));
                return;
            }

            if (response.data) setResult(response.data);
        } catch (caughtError) {
            setTestError(caughtError instanceof Error ? caughtError.message : t("testDialog.errorTest"));
        } finally {
            setIsTesting(false);
        }
    };

    const isSuccess =
        result?.status === "success" &&
        (result.status_code == null || (result.status_code >= 200 && result.status_code < 300));
    const resultBadgeLabel = isSuccess
        ? t("testDialog.badgeSuccess")
        : result?.status === "success"
          ? t("testDialog.badgeFailed")
          : t("testDialog.badgeError");

    return (
        <>
            <Dialog open={open} onOpenChange={onOpenChange}>
                <DialogContent className="max-h-[90vh] max-w-3xl grid-rows-[auto_minmax(0,1fr)]">
                    <DialogHeader>
                        <DialogTitle>{t("testDialog.title")}</DialogTitle>
                        <DialogDescription>
                            {t("testDialog.description")}
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-6 overflow-y-auto pr-1">
                        <div className="rounded-lg border bg-muted/40 p-4">
                            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                                {t("testDialog.request")}
                            </p>
                            <div className="flex items-start gap-3">
                                <span className="rounded bg-foreground px-2 py-1 font-mono text-xs font-semibold text-background">
                                    {httpMethod}
                                </span>
                                <code className="break-all pt-0.5 text-sm">{url}</code>
                            </div>
                        </div>

                        {isUnsafeHttpMethod(httpMethod) && (
                            <div
                                role="alert"
                                className="flex gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4 text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200"
                            >
                                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
                                <div className="space-y-1">
                                    <p className="text-sm font-medium">{t("testDialog.unsafeTitle")}</p>
                                    <p className="text-sm">
                                        {t("testDialog.unsafeBody", { method: httpMethod })}
                                    </p>
                                </div>
                            </div>
                        )}

                        <div className="space-y-3">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-sm font-medium">{t("testDialog.parameters")}</p>
                                    <p className="text-xs text-muted-foreground">
                                        {t("testDialog.parametersHint")}
                                    </p>
                                </div>
                                {(parameters.length > 0 || presetParameters.length > 0) && (
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        onClick={handleFillSampleValues}
                                    >
                                        {t("testDialog.fillSampleValues")}
                                    </Button>
                                )}
                            </div>
                        </div>

                        <div className="space-y-3 border-t pt-4">
                            <div>
                                <p className="text-sm font-medium">{t("testDialog.llmParameters")}</p>
                                <p className="text-xs text-muted-foreground">
                                    {t("testDialog.llmParametersHint")}
                                </p>
                            </div>
                            <ParameterFields
                                idPrefix="llm-param"
                                parameters={parameters}
                                values={llmParamValues}
                                onValueChange={(name, value) =>
                                    setLlmParamValues((previous) => ({ ...previous, [name]: value }))
                                }
                                onEditJson={(name) => openJsonEditDialog("llm", name)}
                            />
                        </div>

                        <div className="space-y-3 border-t pt-4">
                            <div>
                                <p className="text-sm font-medium">{t("testDialog.presetParameters")}</p>
                                <p className="text-xs text-muted-foreground">
                                    {t("testDialog.presetParametersHint")}
                                </p>
                            </div>
                            <ParameterFields
                                idPrefix="preset-param"
                                parameters={presetParameters}
                                values={presetParamValues}
                                onValueChange={(name, value) =>
                                    setPresetParamValues((previous) => ({ ...previous, [name]: value }))
                                }
                                onEditJson={(name) => openJsonEditDialog("preset", name)}
                            />
                        </div>

                        <div className="flex justify-end">
                            <Button onClick={handleTestTool} disabled={isTesting}>
                                {isTesting ? (
                                    <>
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        {t("testDialog.testing")}
                                    </>
                                ) : (
                                    t("testDialog.title")
                                )}
                            </Button>
                        </div>

                        {testError && (
                            <div className="rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
                                {testError}
                            </div>
                        )}

                        {result && (
                            <div className="space-y-3 border-t pt-4">
                                {(result.request_method || result.request_url) && (
                                    <div className="space-y-1 overflow-auto rounded-lg bg-muted p-3 font-mono text-xs">
                                        <p className="font-medium text-foreground">
                                            {result.request_method} {result.request_url}
                                        </p>
                                        {result.request_headers && Object.keys(result.request_headers).length > 0 && (
                                            <pre className="whitespace-pre-wrap">
                                                {t("testDialog.headers")}{" "}
                                                {JSON.stringify(result.request_headers, null, 2)}
                                            </pre>
                                        )}
                                        {result.request_body != null && (
                                            <pre className="whitespace-pre-wrap">
                                                {t("testDialog.body")}{" "}
                                                {JSON.stringify(result.request_body, null, 2)}
                                            </pre>
                                        )}
                                        {result.request_params != null && Object.keys(result.request_params).length > 0 && (
                                            <pre className="whitespace-pre-wrap">
                                                {t("testDialog.query")}{" "}
                                                {Object.entries(result.request_params)
                                                    .map(([key, value]) => `${key}=${value}`)
                                                    .join("  ")}
                                            </pre>
                                        )}
                                    </div>
                                )}
                                <div className="flex items-center gap-3">
                                    <span
                                        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
                                            isSuccess
                                                ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
                                                : "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400"
                                        }`}
                                    >
                                        <span>{isSuccess ? "✓" : "✗"}</span>
                                        {resultBadgeLabel}
                                    </span>
                                    {result.status_code != null && (
                                        <span className="text-sm text-muted-foreground">HTTP {result.status_code}</span>
                                    )}
                                    {result.duration_ms !== undefined && (
                                        <span className="rounded bg-muted px-2 py-0.5 font-mono text-xs text-muted-foreground">
                                            {result.duration_ms}ms
                                        </span>
                                    )}
                                </div>
                                {result.hint && (
                                    <div className="rounded border border-amber-200 bg-amber-100 p-3 text-sm text-amber-900 dark:border-amber-900/40 dark:bg-amber-900/20 dark:text-amber-400">
                                        {result.hint}
                                    </div>
                                )}
                                {result.error && (
                                    <div className="rounded border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
                                        {result.error}
                                    </div>
                                )}
                                {result.data != null && (
                                    <div className="max-h-80 overflow-auto rounded-lg bg-muted p-4 font-mono text-sm">
                                        <pre>{JSON.stringify(result.data, null, 2)}</pre>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </DialogContent>
            </Dialog>

            <Dialog
                open={jsonEditTarget !== null}
                onOpenChange={(isOpen) => {
                    if (!isOpen) closeJsonEditDialog();
                }}
            >
                <DialogContent className="max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>{t("testDialog.editTitle", { name: jsonEditTarget?.name ?? "" })}</DialogTitle>
                        <DialogDescription>
                            {t("testDialog.editDescription")}
                        </DialogDescription>
                    </DialogHeader>
                    <textarea
                        value={jsonEditDraft}
                        onChange={(event) => handleJsonEditDraftChange(event.target.value)}
                        rows={12}
                        className="w-full resize-y rounded-md border border-input bg-background px-3 py-2 font-mono text-sm shadow-sm"
                        spellCheck={false}
                    />
                    {jsonEditError && <p className="text-sm text-destructive">{jsonEditError}</p>}
                    <div className="flex justify-end gap-2">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={handleFormatJson}
                            disabled={jsonEditDraft.length === 0}
                        >
                            {t("testDialog.formatJson")}
                        </Button>
                        <Button type="button" variant="outline" onClick={closeJsonEditDialog}>
                            {t("cancel")}
                        </Button>
                        <Button type="button" onClick={handleSaveJsonEdit}>
                            {t("save")}
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </>
    );
}
