"use client";

import { useTranslations } from "next-intl";

import type { TransferAgentConfig } from "@/client/types.gen";
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
import { Textarea } from "@/components/ui/textarea";

export type TransferGreetingMode = NonNullable<TransferAgentConfig["greeting_mode"]>;

export interface TransferAgentWorkflowOption {
    id: number;
    name: string;
}

/** How the destination agent opens, in the order the select offers them. */
const GREETING_MODES: { value: TransferGreetingMode; labelKey: string; hintKey: string }[] = [
    {
        value: "start_greeting",
        labelKey: "transferAgent.greetingModeStartGreeting",
        hintKey: "transferAgent.greetingModeStartGreetingHint",
    },
    {
        value: "continue",
        labelKey: "transferAgent.greetingModeContinue",
        hintKey: "transferAgent.greetingModeContinueHint",
    },
    {
        value: "introduce_and_continue",
        labelKey: "transferAgent.greetingModeIntroduce",
        hintKey: "transferAgent.greetingModeIntroduceHint",
    },
];

export interface TransferAgentToolConfigProps {
    name: string;
    onNameChange: (name: string) => void;
    description: string;
    onDescriptionChange: (description: string) => void;
    /** The agent this tool transfers to. */
    workflowId: string;
    onWorkflowIdChange: (workflowId: string) => void;
    /** Agents in this organization, offered as the destination. */
    workflows: TransferAgentWorkflowOption[];
    workflowsLoading?: boolean;
    message: string;
    onMessageChange: (message: string) => void;
    /** How the destination agent opens once it has the call. */
    greetingMode: TransferGreetingMode;
    onGreetingModeChange: (greetingMode: TransferGreetingMode) => void;
    /** What the destination says as it takes over; used by "introduce_and_continue". */
    introduction: string;
    onIntroductionChange: (introduction: string) => void;
}

export function TransferAgentToolConfig({
    name,
    onNameChange,
    description,
    onDescriptionChange,
    workflowId,
    onWorkflowIdChange,
    workflows,
    workflowsLoading = false,
    message,
    onMessageChange,
    greetingMode,
    onGreetingModeChange,
    introduction,
    onIntroductionChange,
}: TransferAgentToolConfigProps) {
    const t = useTranslations("Tools");
    const selectedMode = GREETING_MODES.find((mode) => mode.value === greetingMode);
    return (
        <Card>
            <CardHeader>
                <CardTitle>{t("transferAgent.configTitle")}</CardTitle>
                <CardDescription>
                    {t("transferAgent.configDescription")}
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
                <div className="grid gap-2">
                    <Label htmlFor="transfer-agent-name">{t("transferAgent.toolName")}</Label>
                    <Label className="text-xs text-muted-foreground">
                        {t("transferAgent.toolNameHint")}
                    </Label>
                    <Input
                        id="transfer-agent-name"
                        value={name}
                        onChange={(e) => onNameChange(e.target.value)}
                        placeholder={t("transferAgent.namePlaceholder")}
                    />
                </div>

                <div className="grid gap-2">
                    <Label htmlFor="transfer-agent-description">{t("transferAgent.description")}</Label>
                    <Label className="text-xs text-muted-foreground">
                        {t("transferAgent.descriptionHint")}
                    </Label>
                    <Textarea
                        id="transfer-agent-description"
                        value={description}
                        onChange={(e) => onDescriptionChange(e.target.value)}
                        placeholder={t("transferAgent.descriptionPlaceholder")}
                        rows={3}
                    />
                </div>

                <div className="grid gap-2">
                    <Label htmlFor="transfer-agent-workflow">{t("transferAgent.transferToAgent")}</Label>
                    <Select value={workflowId} onValueChange={onWorkflowIdChange}>
                        <SelectTrigger id="transfer-agent-workflow">
                            <SelectValue
                                placeholder={
                                    workflowsLoading
                                        ? t("transferAgent.loadingAgents")
                                        : t("transferAgent.selectAgent")
                                }
                            />
                        </SelectTrigger>
                        <SelectContent>
                            {workflows.map((workflow) => (
                                <SelectItem key={workflow.id} value={String(workflow.id)}>
                                    {workflow.name}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>

                <div className="grid gap-2">
                    <Label htmlFor="transfer-agent-message">{t("transferAgent.handoverMessage")}</Label>
                    <Label className="text-xs text-muted-foreground">
                        {t("transferAgent.handoverMessageHint")}
                    </Label>
                    <Input
                        id="transfer-agent-message"
                        maxLength={500}
                        value={message}
                        onChange={(e) => onMessageChange(e.target.value)}
                        placeholder={t("transferAgent.handoverMessagePlaceholder")}
                    />
                </div>

                <div className="grid gap-2">
                    <Label htmlFor="transfer-agent-greeting-mode">
                        {t("transferAgent.greetingModeLabel")}
                    </Label>
                    <Select
                        value={greetingMode}
                        onValueChange={(value) =>
                            onGreetingModeChange(value as TransferGreetingMode)
                        }
                    >
                        <SelectTrigger id="transfer-agent-greeting-mode">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {GREETING_MODES.map((mode) => (
                                <SelectItem key={mode.value} value={mode.value}>
                                    {t(mode.labelKey)}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    {selectedMode && (
                        <p className="text-xs text-muted-foreground">{t(selectedMode.hintKey)}</p>
                    )}
                </div>

                {greetingMode === "introduce_and_continue" && (
                    <div className="grid gap-2">
                        <Label htmlFor="transfer-agent-introduction">{t("transferAgent.introduction")}</Label>
                        <Label className="text-xs text-muted-foreground">
                            {t("transferAgent.introductionHint")}
                        </Label>
                        <Textarea
                            id="transfer-agent-introduction"
                            maxLength={500}
                            value={introduction}
                            onChange={(e) => onIntroductionChange(e.target.value)}
                            placeholder={t("transferAgent.introductionPlaceholder")}
                            rows={2}
                        />
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
