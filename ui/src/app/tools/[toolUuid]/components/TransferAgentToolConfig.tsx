"use client";

import { useTranslations } from "next-intl";

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
import { Textarea } from "@/components/ui/textarea";

export interface TransferAgentWorkflowOption {
    id: number;
    name: string;
}

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
    /** Whether the destination agent opens with its Start Call greeting. */
    playGreeting: boolean;
    onPlayGreetingChange: (playGreeting: boolean) => void;
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
    playGreeting,
    onPlayGreetingChange,
}: TransferAgentToolConfigProps) {
    const t = useTranslations("Tools");
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
                        value={message}
                        onChange={(e) => onMessageChange(e.target.value)}
                        placeholder={t("transferAgent.handoverMessagePlaceholder")}
                    />
                </div>

                <div className="flex items-center justify-between gap-4">
                    <div className="grid gap-1">
                        <Label htmlFor="transfer-agent-play-greeting">
                            {t("transferAgent.playGreeting")}
                        </Label>
                        <p className="text-xs text-muted-foreground">
                            {t("transferAgent.playGreetingHint")}
                        </p>
                    </div>
                    <Switch
                        id="transfer-agent-play-greeting"
                        checked={playGreeting}
                        onCheckedChange={onPlayGreetingChange}
                    />
                </div>
            </CardContent>
        </Card>
    );
}
