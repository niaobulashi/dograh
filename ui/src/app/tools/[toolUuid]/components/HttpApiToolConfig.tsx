"use client";

import { Info } from "lucide-react";
import { useTranslations } from "next-intl";

import {
    CredentialSelector,
    extractUrlHostnameParameters,
    extractUrlPathParameters,
    type HttpMethod,
    HttpMethodSelector,
    KeyValueEditor,
    type KeyValueItem,
    ParameterEditor,
    PresetParameterEditor,
    type PresetToolParameter,
    type ToolParameter,
    UrlInput,
} from "@/components/http";
import { BodyTemplateEditor } from "@/components/http/body-template-editor";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

export type HttpBodyFormat = "json" | "form";

export interface HttpApiToolConfigProps {
    name: string;
    onNameChange: (name: string) => void;
    description: string;
    onDescriptionChange: (description: string) => void;
    httpMethod: HttpMethod;
    onHttpMethodChange: (method: HttpMethod) => void;
    url: string;
    onUrlChange: (url: string) => void;
    credentialUuid: string;
    onCredentialUuidChange: (uuid: string) => void;
    headers: KeyValueItem[];
    onHeadersChange: (headers: KeyValueItem[]) => void;
    parameters: ToolParameter[];
    onParametersChange: (parameters: ToolParameter[]) => void;
    presetParameters: PresetToolParameter[];
    onPresetParametersChange: (parameters: PresetToolParameter[]) => void;
    bodyTemplateEnabled: boolean;
    onBodyTemplateEnabledChange: (enabled: boolean) => void;
    bodyTemplate: Record<string, unknown> | null;
    onBodyTemplateChange: (template: Record<string, unknown> | null) => void;
    onBodyTemplateValidityChange: (valid: boolean) => void;
    bodyFormat: HttpBodyFormat;
    onBodyFormatChange: (format: HttpBodyFormat) => void;
    timeoutMs: number;
    onTimeoutMsChange: (timeout: number) => void;
}

export function HttpApiToolConfig({
    name,
    onNameChange,
    description,
    onDescriptionChange,
    httpMethod,
    onHttpMethodChange,
    url,
    onUrlChange,
    credentialUuid,
    onCredentialUuidChange,
    headers,
    onHeadersChange,
    parameters,
    onParametersChange,
    presetParameters,
    onPresetParametersChange,
    bodyTemplateEnabled,
    onBodyTemplateEnabledChange,
    bodyTemplate,
    onBodyTemplateChange,
    onBodyTemplateValidityChange,
    bodyFormat,
    onBodyFormatChange,
    timeoutMs,
    onTimeoutMsChange,
}: HttpApiToolConfigProps) {
    const t = useTranslations("Tools");
    const urlHostnameParameters = extractUrlHostnameParameters(url);
    const urlPathParameters = extractUrlPathParameters(url);

    return (
        <Card>
            <CardHeader>
                <CardTitle>{t("httpApi.configTitle")}</CardTitle>
                <CardDescription>
                    {t("httpApi.configDescription")}
                </CardDescription>
            </CardHeader>
            <CardContent>
                <Tabs defaultValue="settings" className="w-full">
                    <TabsList className="grid w-full grid-cols-3">
                        <TabsTrigger value="settings">{t("httpApi.tabSettings")}</TabsTrigger>
                        <TabsTrigger value="auth">{t("httpApi.tabAuth")}</TabsTrigger>
                        <TabsTrigger value="parameters">{t("httpApi.tabParameters")}</TabsTrigger>
                    </TabsList>

                    <TabsContent value="settings" className="space-y-4 mt-4">
                        <div className="grid gap-2">
                            <Label>{t("httpApi.toolName")}</Label>
                            <Label className="text-xs text-muted-foreground">
                                {t("list.toolNameHint")}
                            </Label>
                            <Input
                                value={name}
                                onChange={(e) => onNameChange(e.target.value)}
                                placeholder={t("httpApi.namePlaceholder")}
                            />
                        </div>

                        <div className="grid gap-2">
                            <Label>{t("httpApi.description")}</Label>
                            <Label className="text-xs text-muted-foreground">
                                {t("builtin.descriptionHint")}
                            </Label>
                            <Textarea
                                value={description}
                                onChange={(e) => onDescriptionChange(e.target.value)}
                                placeholder={t("list.descriptionPlaceholder")}
                                rows={3}
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="grid gap-2">
                                <Label>{t("httpApi.httpMethod")}</Label>
                                <HttpMethodSelector
                                    value={httpMethod}
                                    onChange={onHttpMethodChange}
                                />
                            </div>
                            <div className="grid gap-2">
                                <Label>{t("httpApi.timeout")}</Label>
                                <Input
                                    type="number"
                                    value={timeoutMs}
                                    onChange={(e) =>
                                        onTimeoutMsChange(parseInt(e.target.value) || 5000)
                                    }
                                    min={1000}
                                    max={30000}
                                />
                            </div>
                        </div>

                        <div className="grid gap-2">
                            <Label>{t("httpApi.endpointUrl")}</Label>
                            <UrlInput
                                value={url}
                                onChange={onUrlChange}
                                placeholder="https://api.example.com/appointments"
                                showValidation
                            />
                            {urlHostnameParameters.length > 0 && (
                                <div className="rounded-lg border border-blue-500/20 bg-blue-500/10 p-3 text-sm text-blue-600 flex gap-2 items-start mt-2">
                                    <Info className="h-4 w-4 mt-0.5 shrink-0" />
                                    <span>
                                        {t("httpApi.hostnameParamsDetected", {
                                            params: urlHostnameParameters.join(", "),
                                        })}
                                    </span>
                                </div>
                            )}
                            {urlPathParameters.length > 0 && (
                                <div className="rounded-lg border border-blue-500/20 bg-blue-500/10 p-3 text-sm text-blue-600 flex gap-2 items-start mt-2">
                                    <Info className="h-4 w-4 mt-0.5 shrink-0" />
                                    <span>
                                        {t("httpApi.pathParamsDetected", {
                                            params: urlPathParameters.join(", "),
                                        })}
                                    </span>
                                </div>
                            )}
                        </div>
                    </TabsContent>

                    <TabsContent value="auth" className="space-y-4 mt-4">
                        <CredentialSelector
                            value={credentialUuid}
                            onChange={onCredentialUuidChange}
                        />
                    </TabsContent>

                    <TabsContent value="parameters" className="space-y-4 mt-4">
                        <div className="grid gap-2">
                            <Label>{t("httpApi.llmParameters")}</Label>
                            <Label className="text-xs text-muted-foreground">
                                {t("httpApi.llmParametersHint")}
                            </Label>
                            <ParameterEditor
                                parameters={parameters}
                                onChange={onParametersChange}
                            />
                        </div>

                        <div className="grid gap-2 pt-4 border-t">
                            <Label>{t("httpApi.presetParameters")}</Label>
                            <Label className="text-xs text-muted-foreground">
                                {t("httpApi.presetParametersHintBeforeCode")}{" "}
                                {`{{initial_context.phone_number}}`}{" "}
                                {t("httpApi.presetParametersHintAfterCode")}
                            </Label>
                            <PresetParameterEditor
                                parameters={presetParameters}
                                onChange={onPresetParametersChange}
                            />
                        </div>

                        {["POST", "PUT", "PATCH"].includes(httpMethod) && (
                            <div className="grid gap-4 pt-4 border-t">
                                <div className="grid gap-2">
                                    <Label htmlFor="body-format">{t("httpApi.bodyFormat")}</Label>
                                    <p className="text-xs text-muted-foreground">
                                        {t("httpApi.bodyFormatHint")}
                                    </p>
                                    <Select
                                        value={bodyFormat}
                                        onValueChange={(value) => onBodyFormatChange(value as HttpBodyFormat)}
                                    >
                                        <SelectTrigger id="body-format">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="json">{t("httpApi.bodyFormatJson")}</SelectItem>
                                            <SelectItem value="form">
                                                {t("httpApi.bodyFormatForm")}
                                            </SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="flex items-center justify-between gap-4">
                                    <div className="grid gap-1">
                                        <Label htmlFor="body-template-enabled">
                                            {t("httpApi.bodyTemplate")}
                                        </Label>
                                        <p className="text-xs text-muted-foreground">
                                            {t("httpApi.bodyTemplateHint")}
                                        </p>
                                    </div>
                                    <Switch
                                        id="body-template-enabled"
                                        checked={bodyTemplateEnabled}
                                        onCheckedChange={onBodyTemplateEnabledChange}
                                    />
                                </div>
                                {bodyTemplateEnabled && (
                                    <BodyTemplateEditor
                                        value={bodyTemplate}
                                        onChange={onBodyTemplateChange}
                                        onValidityChange={onBodyTemplateValidityChange}
                                    />
                                )}
                            </div>
                        )}

                        <div className="grid gap-2 pt-4 border-t">
                            <Label>{t("httpApi.customHeaders")}</Label>
                            <Label className="text-xs text-muted-foreground">
                                {t("httpApi.customHeadersHint")}
                            </Label>
                            <KeyValueEditor
                                items={headers}
                                onChange={onHeadersChange}
                                keyPlaceholder={t("headers.name")}
                                valuePlaceholder={t("headers.value")}
                                addButtonText={t("headers.add")}
                            />
                        </div>
                    </TabsContent>
                </Tabs>
            </CardContent>
        </Card>
    );
}
