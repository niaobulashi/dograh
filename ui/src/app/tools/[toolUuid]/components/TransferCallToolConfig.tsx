"use client";

import { ArrowDown, ArrowUp, ExternalLink, Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";

import type { RecordingResponseSchema } from "@/client/types.gen";
import { RecordingSelect, StaticTextWarning } from "@/components/flow/TextOrAudioInput";
import {
    CredentialSelector,
    KeyValueEditor,
    type KeyValueItem,
    ParameterEditor,
    PresetParameterEditor,
    type PresetToolParameter,
    type ToolParameter,
    UrlInput,
} from "@/components/http";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { DOCS_BASE } from "@/constants/documentation";

import {
    type ContextDestinationRuleRow,
    createContextDestinationRouteRow,
    createContextDestinationRuleRow,
    type EndCallMessageType,
    type TransferDestinationSource,
} from "../../config";

export interface TransferCallToolConfigProps {
    name: string;
    onNameChange: (name: string) => void;
    description: string;
    onDescriptionChange: (description: string) => void;
    destinationSource: TransferDestinationSource;
    onDestinationSourceChange: (source: TransferDestinationSource) => void;
    destination: string;
    onDestinationChange: (destination: string) => void;
    messageType: EndCallMessageType;
    onMessageTypeChange: (messageType: EndCallMessageType) => void;
    customMessage: string;
    onCustomMessageChange: (message: string) => void;
    audioRecordingId: string;
    onAudioRecordingIdChange: (id: string) => void;
    recordings?: RecordingResponseSchema[];
    timeout?: number;
    onTimeoutChange: (timeout: number) => void;
    callDisposition: string;
    onCallDispositionChange: (disposition: string) => void;
    introductionEnabled: boolean;
    onIntroductionEnabledChange: (enabled: boolean) => void;
    introductionPrompt: string;
    onIntroductionPromptChange: (prompt: string) => void;
    resolverUrl: string;
    onResolverUrlChange: (url: string) => void;
    resolverCredentialUuid: string;
    onResolverCredentialUuidChange: (uuid: string) => void;
    resolverHeaders: KeyValueItem[];
    onResolverHeadersChange: (headers: KeyValueItem[]) => void;
    resolverTimeoutMs: number;
    onResolverTimeoutMsChange: (timeoutMs: number) => void;
    resolverWaitMessage: string;
    onResolverWaitMessageChange: (message: string) => void;
    parameters: ToolParameter[];
    onParametersChange: (parameters: ToolParameter[]) => void;
    presetParameters: PresetToolParameter[];
    onPresetParametersChange: (parameters: PresetToolParameter[]) => void;
    contextDestinationRules: ContextDestinationRuleRow[];
    onContextDestinationRulesChange: (rules: ContextDestinationRuleRow[]) => void;
    fallbackDestination: string;
    onFallbackDestinationChange: (destination: string) => void;
}

export function TransferCallToolConfig({
    name,
    onNameChange,
    description,
    onDescriptionChange,
    destinationSource,
    onDestinationSourceChange,
    destination,
    onDestinationChange,
    messageType,
    onMessageTypeChange,
    customMessage,
    onCustomMessageChange,
    audioRecordingId,
    onAudioRecordingIdChange,
    recordings = [],
    timeout,
    onTimeoutChange,
    callDisposition,
    onCallDispositionChange,
    introductionEnabled,
    onIntroductionEnabledChange,
    introductionPrompt,
    onIntroductionPromptChange,
    resolverUrl,
    onResolverUrlChange,
    resolverCredentialUuid,
    onResolverCredentialUuidChange,
    resolverHeaders,
    onResolverHeadersChange,
    resolverTimeoutMs,
    onResolverTimeoutMsChange,
    resolverWaitMessage,
    onResolverWaitMessageChange,
    parameters,
    onParametersChange,
    presetParameters,
    onPresetParametersChange,
    contextDestinationRules,
    onContextDestinationRulesChange,
    fallbackDestination,
    onFallbackDestinationChange,
}: TransferCallToolConfigProps) {
    const t = useTranslations("Tools");
    const updateRule = (
        ruleId: string,
        update: (rule: ContextDestinationRuleRow) => ContextDestinationRuleRow,
    ) => {
        onContextDestinationRulesChange(
            contextDestinationRules.map((rule) => (rule.id === ruleId ? update(rule) : rule))
        );
    };

    const moveRule = (index: number, offset: number) => {
        const target = index + offset;
        if (target < 0 || target >= contextDestinationRules.length) return;
        const reordered = [...contextDestinationRules];
        [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
        onContextDestinationRulesChange(reordered);
    };

    return (
        <Card>
            <CardHeader>
                <CardTitle>{t("transferCall.configTitle")}</CardTitle>
                <CardDescription>
                    {t("transferCall.configDescription")}
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
                <div className="grid gap-2">
                    <Label>{t("transferCall.toolName")}</Label>
                    <Label className="text-xs text-muted-foreground">
                        {t("transferCall.toolNameHint")}
                    </Label>
                    <Input
                        value={name}
                        onChange={(e) => onNameChange(e.target.value)}
                        placeholder={t("transferCall.namePlaceholder")}
                    />
                </div>

                <div className="grid gap-2">
                    <Label>{t("transferCall.description")}</Label>
                    <Label className="text-xs text-muted-foreground">
                        {t("transferCall.descriptionHint")}
                    </Label>
                    <Textarea
                        value={description}
                        onChange={(e) => onDescriptionChange(e.target.value)}
                        placeholder={t("transferCall.descriptionPlaceholder")}
                        rows={3}
                    />
                </div>

                <div className="grid gap-4 pt-4 border-t">
                    <Label>{t("transferCall.preTransferMessage")}</Label>
                    <Label className="text-xs text-muted-foreground">
                        {t("transferCall.preTransferMessageHint")}
                    </Label>
                    <RadioGroup
                        value={messageType}
                        onValueChange={(v) => onMessageTypeChange(v as EndCallMessageType)}
                        className="space-y-3"
                    >
                        <label
                            htmlFor="none"
                            className="flex items-center space-x-3 p-3 border rounded-lg hover:bg-muted/50 cursor-pointer"
                        >
                            <RadioGroupItem value="none" id="none" />
                            <div className="flex-1">
                                <span className="font-medium">{t("transferCall.noMessage")}</span>
                                <p className="text-xs text-muted-foreground">
                                    {t("transferCall.noMessageHint")}
                                </p>
                            </div>
                        </label>
                        <div className="flex items-start space-x-3 p-3 border rounded-lg hover:bg-muted/50">
                            <RadioGroupItem value="custom" id="custom" className="mt-1" />
                            <label htmlFor="custom" className="flex-1 space-y-2 cursor-pointer">
                                <span className="font-medium">{t("transferCall.customMessage")}</span>
                                <p className="text-xs text-muted-foreground">
                                    {t("transferCall.customMessageHint")}
                                </p>
                            </label>
                        </div>
                        {messageType === "custom" && (
                            <div className="pl-8 space-y-2">
                                <StaticTextWarning />
                                <Textarea
                                    value={customMessage}
                                    onChange={(e) => onCustomMessageChange(e.target.value)}
                                    placeholder={t("transferCall.customMessagePlaceholder")}
                                    rows={2}
                                />
                            </div>
                        )}
                        <div className="flex items-start space-x-3 p-3 border rounded-lg hover:bg-muted/50">
                            <RadioGroupItem value="audio" id="audio" className="mt-1" />
                            <label htmlFor="audio" className="flex-1 space-y-2 cursor-pointer">
                                <span className="font-medium">{t("transferCall.prerecordedAudio")}</span>
                                <p className="text-xs text-muted-foreground">
                                    {t("transferCall.prerecordedAudioHint")}
                                </p>
                            </label>
                        </div>
                        {messageType === "audio" && (
                            <div className="pl-8">
                                <RecordingSelect
                                    value={audioRecordingId}
                                    onChange={onAudioRecordingIdChange}
                                    recordings={recordings}
                                />
                            </div>
                        )}
                    </RadioGroup>
                </div>

                <div className="grid gap-3 pt-4 border-t">
                    <div className="flex items-center justify-between gap-4">
                        <Label htmlFor="transfer-introduction-enabled">
                            {t("transferCall.introductionEnabled")}
                        </Label>
                        <Switch
                            id="transfer-introduction-enabled"
                            checked={introductionEnabled}
                            onCheckedChange={onIntroductionEnabledChange}
                        />
                    </div>
                    <p className="text-xs text-muted-foreground">
                        {t("transferCall.introductionHint")}
                    </p>
                    {introductionEnabled && (
                        <div className="grid gap-2">
                            <Label htmlFor="transfer-introduction-prompt">
                                {t("transferCall.introductionPrompt")}
                            </Label>
                            <Textarea
                                id="transfer-introduction-prompt"
                                value={introductionPrompt}
                                onChange={(event) => onIntroductionPromptChange(event.target.value)}
                                maxLength={2000}
                                rows={4}
                            />
                            <p className="text-xs text-muted-foreground">
                                {t("transferCall.introductionPromptHint")}
                            </p>
                        </div>
                    )}
                </div>

                <div className="grid gap-2 pt-4 border-t">
                    <Label>{t("transferCall.timeout")}</Label>
                    <Label className="text-xs text-muted-foreground">
                        {t("transferCall.timeoutHint")}
                    </Label>
                    <Input
                        type="number"
                        value={timeout ?? 30}
                        onChange={(e) => {
                            const value = parseInt(e.target.value) || 30;
                            onTimeoutChange(Math.min(Math.max(value, 5), 120));
                        }}
                        placeholder="30"
                        min="5"
                        max="120"
                        className="w-32"
                    />
                    <Label className="text-xs text-muted-foreground">
                        {t("transferCall.timeoutDefault")}
                    </Label>
                </div>

                <div className="grid gap-2 pt-4 border-t">
                    <Label htmlFor="transfer-call-disposition">
                        {t("transferCall.callDisposition")}
                    </Label>
                    <Label className="text-xs text-muted-foreground">
                        {t("transferCall.callDispositionHint")}
                    </Label>
                    <Input
                        id="transfer-call-disposition"
                        value={callDisposition}
                        onChange={(e) => onCallDispositionChange(e.target.value)}
                        placeholder={t("transferCall.callDispositionPlaceholder")}
                        maxLength={64}
                    />
                </div>

                <div className="grid gap-4 pt-4 border-t">
                    <div>
                        <Label>{t("transferCall.destinationSource")}</Label>
                        <p className="text-xs text-muted-foreground">
                            {t("transferCall.destinationSourceHint")}
                        </p>
                    </div>
                    <Tabs
                        value={destinationSource}
                        onValueChange={(v) => onDestinationSourceChange(v as TransferDestinationSource)}
                        className="w-full"
                    >
                        <TabsList className="grid w-full grid-cols-3">
                            <TabsTrigger value="static">{t("transferCall.tabStatic")}</TabsTrigger>
                            <TabsTrigger value="dynamic">{t("transferCall.tabDynamic")}</TabsTrigger>
                            <TabsTrigger value="context_mapping">{t("transferCall.tabContextMapping")}</TabsTrigger>
                        </TabsList>

                        <TabsContent value="static" className="space-y-4 mt-4">
                            <div className="grid gap-2">
                                <Label>{t("transferCall.transferDestination")}</Label>
                                <div className="text-xs text-muted-foreground space-y-1">
                                    <p>{t("transferCall.transferDestinationHint")}</p>
                                    <ul className="list-disc pl-4 space-y-1">
                                        <li>{t("transferCall.sipEndpointExample")}</li>
                                        <li>{t("transferCall.e164Example")}</li>
                                        <li>
                                            {t("transferCall.templateVariableBeforeCode")}{" "}
                                            {"{{initial_context.transfer_destination}}"}
                                        </li>
                                    </ul>
                                </div>
                                <Input
                                    value={destination}
                                    onChange={(e) => onDestinationChange(e.target.value)}
                                    placeholder={t("transferCall.destinationPlaceholder")}
                                />
                            </div>
                        </TabsContent>

                        <TabsContent value="dynamic" className="space-y-5 mt-4">
                            <div>
                                <div className="flex items-center gap-2">
                                    <Label>{t("transferCall.dynamicResolver")}</Label>
                                </div>
                                <p className="text-xs text-muted-foreground">
                                    {t("transferCall.dynamicResolverHint")}{" "}
                                    <a
                                        href={`${DOCS_BASE}/voice-agent/tools/call-transfer#dynamic-resolver-response`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center gap-1 transition-colors hover:text-foreground"
                                    >
                                        {t("docs")} <ExternalLink className="h-3 w-3" />
                                    </a>
                                </p>
                            </div>

                            <div className="grid gap-2">
                                <Label>{t("transferCall.resolverUrl")}</Label>
                                <UrlInput
                                    value={resolverUrl}
                                    onChange={onResolverUrlChange}
                                    placeholder="https://crm.example.com/resolve-transfer"
                                    showValidation
                                />
                                <Label className="text-xs text-muted-foreground">
                                    {t("transferCall.resolverUrlHint")}
                                </Label>
                            </div>

                            <div className="grid gap-2">
                                <Label>{t("transferCall.resolverTimeout")}</Label>
                                <Input
                                    type="number"
                                    value={resolverTimeoutMs}
                                    onChange={(e) => {
                                        const value = parseInt(e.target.value) || 3000;
                                        onResolverTimeoutMsChange(Math.min(Math.max(value, 500), 5000));
                                    }}
                                    min="500"
                                    max="5000"
                                    className="w-36"
                                />
                                <Label className="text-xs text-muted-foreground">
                                    {t("transferCall.resolverTimeoutHint")}
                                </Label>
                            </div>

                            <CredentialSelector
                                value={resolverCredentialUuid}
                                onChange={onResolverCredentialUuidChange}
                                label={t("transferCall.resolverCredential")}
                                description={t("transferCall.resolverCredentialHint")}
                            />

                            <div className="grid gap-2">
                                <Label>{t("transferCall.resolverWaitMessage")}</Label>
                                <Textarea
                                    value={resolverWaitMessage}
                                    onChange={(e) => onResolverWaitMessageChange(e.target.value)}
                                    placeholder={t("transferCall.resolverWaitMessagePlaceholder")}
                                    rows={2}
                                />
                                <Label className="text-xs text-muted-foreground">
                                    {t("transferCall.resolverWaitMessageHint")}
                                </Label>
                            </div>

                            <div className="grid gap-2 pt-4 border-t">
                                <Label>{t("transferCall.llmParameters")}</Label>
                                <p className="text-xs text-muted-foreground">
                                    {t("transferCall.llmParametersHint")}{" "}
                                    <a
                                        href={`${DOCS_BASE}/voice-agent/tools/call-transfer#dynamic-resolver-request`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center gap-1 transition-colors hover:text-foreground"
                                    >
                                        {t("docs")} <ExternalLink className="h-3 w-3" />
                                    </a>
                                </p>
                                <ParameterEditor
                                    parameters={parameters}
                                    onChange={onParametersChange}
                                />
                            </div>

                            <div className="grid gap-2 pt-4 border-t">
                                <Label>{t("transferCall.presetParameters")}</Label>
                                <p className="text-xs text-muted-foreground">
                                    {t("transferCall.presetParametersHintBeforeCode")}{" "}
                                    {`{{initial_context.state}}`}{" "}
                                    {t("transferCall.presetParametersHintBetweenCode")}{" "}
                                    {`{{gathered_context.state}}`}.{" "}
                                    <a
                                        href={`${DOCS_BASE}/voice-agent/tools/call-transfer#dynamic-resolver-request`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center gap-1 transition-colors hover:text-foreground"
                                    >
                                        {t("docs")} <ExternalLink className="h-3 w-3" />
                                    </a>
                                </p>
                                <PresetParameterEditor
                                    parameters={presetParameters}
                                    onChange={onPresetParametersChange}
                                />
                            </div>

                            <div className="grid gap-2 pt-4 border-t">
                                <Label>{t("transferCall.customHeaders")}</Label>
                                <Label className="text-xs text-muted-foreground">
                                    {t("transferCall.customHeadersHint")}
                                </Label>
                                <KeyValueEditor
                                    items={resolverHeaders}
                                    onChange={onResolverHeadersChange}
                                    keyPlaceholder={t("headers.name")}
                                    valuePlaceholder={t("headers.value")}
                                    addButtonText={t("headers.add")}
                                />
                            </div>
                        </TabsContent>
                        <TabsContent value="context_mapping" className="space-y-5 mt-4">
                            <div className="space-y-2">
                                <Label>{t("transferCall.orderedContextRouting")}</Label>
                                <p className="text-xs text-muted-foreground">
                                    {t("transferCall.contextRulesHint")}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                    {t("transferCall.contextFieldHint1")} <code>department</code>{" "}
                                    {t("transferCall.contextFieldHint2")}{" "}
                                    <code>gathered_context.department</code>{" "}
                                    {t("transferCall.contextFieldHint3")}{" "}
                                    <code>initial_context.department</code>
                                    {t("transferCall.contextFieldHint4")}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                    {t("transferCall.destinationsHintBeforeCode")}{" "}
                                    <code>{"{{initial_context.transfer_destination}}"}</code>.{" "}
                                    <a
                                        href={`${DOCS_BASE}/voice-agent/tools/call-transfer#context-mapping`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center gap-1 transition-colors hover:text-foreground"
                                    >
                                        {t("docs")} <ExternalLink className="h-3 w-3" />
                                    </a>
                                </p>
                            </div>
                                {contextDestinationRules.map((rule, ruleIndex) => (
                                    <div key={rule.id} className="space-y-4 rounded-lg border p-4">
                                        <div className="flex items-center justify-between">
                                            <Label>{t("transferCall.rule", { index: ruleIndex + 1 })}</Label>
                                            <div className="flex items-center gap-1">
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="icon"
                                                    aria-label={t("transferCall.moveRuleUp", { index: ruleIndex + 1 })}
                                                    disabled={ruleIndex === 0}
                                                    onClick={() => moveRule(ruleIndex, -1)}
                                                >
                                                    <ArrowUp className="h-4 w-4" />
                                                </Button>
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="icon"
                                                    aria-label={t("transferCall.moveRuleDown", { index: ruleIndex + 1 })}
                                                    disabled={ruleIndex === contextDestinationRules.length - 1}
                                                    onClick={() => moveRule(ruleIndex, 1)}
                                                >
                                                    <ArrowDown className="h-4 w-4" />
                                                </Button>
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="icon"
                                                    aria-label={t("transferCall.removeRule", { index: ruleIndex + 1 })}
                                                    onClick={() => onContextDestinationRulesChange(
                                                        contextDestinationRules.filter((item) => item.id !== rule.id)
                                                    )}
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                </Button>
                                            </div>
                                        </div>
                                        <div className="grid gap-2">
                                            <Label htmlFor={`context-path-${rule.id}`}>
                                                {t("transferCall.contextField")}
                                            </Label>
                                            <Input
                                                id={`context-path-${rule.id}`}
                                                aria-label={t("transferCall.contextFieldAria", { index: ruleIndex + 1 })}
                                                value={rule.context_path}
                                                onChange={(event) => updateRule(rule.id, (item) => ({
                                                    ...item,
                                                    context_path: event.target.value,
                                                }))}
                                                placeholder={t("transferCall.contextFieldPlaceholder")}
                                            />
                                        </div>
                                        <div className="space-y-3">
                                            <div className="flex items-center justify-between">
                                                <Label>{t("transferCall.valueToDestinationMappings")}</Label>
                                                <Button
                                                    type="button"
                                                    variant="outline"
                                                    size="sm"
                                                    aria-label={t("transferCall.addMappingAria", { index: ruleIndex + 1 })}
                                                    onClick={() => updateRule(rule.id, (item) => ({
                                                        ...item,
                                                        routes: [
                                                            ...item.routes,
                                                            createContextDestinationRouteRow(),
                                                        ],
                                                    }))}
                                                >
                                                    <Plus className="mr-1 h-4 w-4" /> {t("transferCall.addMapping")}
                                                </Button>
                                            </div>
                                            {rule.routes.map((route, index) => (
                                                <div key={route.id} className="grid grid-cols-[1fr_1fr_auto] gap-2">
                                                    <Input
                                                        aria-label={t("transferCall.contextValueAria", {
                                                            rule: ruleIndex + 1,
                                                            route: index + 1,
                                                        })}
                                                        value={route.context_value}
                                                        onChange={(event) => updateRule(rule.id, (item) => ({
                                                            ...item,
                                                            routes: item.routes.map((existing) =>
                                                                existing.id === route.id
                                                                    ? { ...existing, context_value: event.target.value }
                                                                    : existing
                                                            ),
                                                        }))}
                                                        placeholder={t("transferCall.contextValuePlaceholder")}
                                                    />
                                                    <Input
                                                        aria-label={t("transferCall.transferDestinationAria", {
                                                            rule: ruleIndex + 1,
                                                            route: index + 1,
                                                        })}
                                                        value={route.destination}
                                                        onChange={(event) => updateRule(rule.id, (item) => ({
                                                            ...item,
                                                            routes: item.routes.map((existing) =>
                                                                existing.id === route.id
                                                                    ? { ...existing, destination: event.target.value }
                                                                    : existing
                                                            ),
                                                        }))}
                                                        placeholder={t("transferCall.routeDestinationPlaceholder")}
                                                    />
                                                    <Button
                                                        type="button"
                                                        variant="ghost"
                                                        size="icon"
                                                        aria-label={t("transferCall.removeMappingAria", {
                                                            rule: ruleIndex + 1,
                                                            route: index + 1,
                                                        })}
                                                        onClick={() => updateRule(rule.id, (item) => ({
                                                            ...item,
                                                            routes: item.routes.filter(
                                                                (existing) => existing.id !== route.id
                                                            ),
                                                        }))}
                                                    >
                                                        <Trash2 className="h-4 w-4" />
                                                    </Button>
                                                </div>
                                            ))}
                                            {rule.routes.length === 0 && (
                                                <p className="text-xs text-muted-foreground">
                                                    {t("transferCall.addAtLeastOneMapping")}
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                ))}
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="w-fit"
                                    onClick={() => onContextDestinationRulesChange([
                                        ...contextDestinationRules,
                                        createContextDestinationRuleRow(),
                                    ])}
                                >
                                    <Plus className="mr-1 h-4 w-4" /> {t("transferCall.addRoutingRule")}
                                </Button>
                                {contextDestinationRules.length === 0 && (
                                    <p className="text-xs text-muted-foreground">
                                        {t("transferCall.addAtLeastOneRoutingRule")}
                                    </p>
                                )}
                                <div className="grid gap-2">
                                    <Label htmlFor="context-fallback-destination">
                                        {t("transferCall.fallbackDestination")}
                                    </Label>
                                    <Input
                                        id="context-fallback-destination"
                                        value={fallbackDestination}
                                        onChange={(event) => onFallbackDestinationChange(event.target.value)}
                                        placeholder={t("transferCall.fallbackDestinationPlaceholder")}
                                    />
                                    <Label className="text-xs text-muted-foreground">
                                        {t("transferCall.fallbackDestinationHint")}
                                    </Label>
                                </div>
                        </TabsContent>
                    </Tabs>
                </div>
            </CardContent>
        </Card>
    );
}
