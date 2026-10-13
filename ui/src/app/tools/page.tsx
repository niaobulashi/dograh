"use client";

import { ExternalLink, Plus, RotateCcw, Search, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";

import {
    createToolApiV1ToolsPost,
    deleteToolApiV1ToolsToolUuidDelete,
    getWorkflowsSummaryApiV1WorkflowSummaryGet,
    listToolsApiV1ToolsGet,
    unarchiveToolApiV1ToolsToolUuidUnarchivePost,
} from "@/client/sdk.gen";
import type { CreateToolRequest, ToolResponse } from "@/client/types.gen";
import { CredentialSelector } from "@/components/http";
import { PageLayout, PageSection } from "@/components/layout/PageLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { detailFromError } from "@/lib/apiError";
import { useAuth } from "@/lib/auth";

import {
    createMcpDefinition,
    createToolDefinition,
    createTransferAgentDefinition,
    getCategoryConfig,
    MCP_URL_PATTERN,
    renderToolIcon,
    TOOL_CATEGORIES,
    type ToolCategory,
    type ToolDefinition,
} from "./config";

export default function ToolsPage() {
    const t = useTranslations("Tools");
    const { user, getAccessToken, redirectToLogin, loading } = useAuth();
    const router = useRouter();

    const [tools, setTools] = useState<ToolResponse[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState("");
    const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
    const [newToolName, setNewToolName] = useState("");
    const [newToolDescription, setNewToolDescription] = useState("");
    const [newToolCategory, setNewToolCategory] = useState<ToolCategory>("http_api");
    const [isCreating, setIsCreating] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [createError, setCreateError] = useState<string | null>(null);

    // MCP-specific create dialog state
    // A transfer tool is defined by where it sends the caller, so the
    // destination is collected up front rather than defaulted to nothing.
    const [newTransferAgentWorkflowId, setNewTransferAgentWorkflowId] = useState("");
    const [agentOptions, setAgentOptions] = useState<{ id: number; name: string }[]>([]);

    const [mcpUrl, setMcpUrl] = useState("");
    const [mcpCredentialUuid, setMcpCredentialUuid] = useState("");
    const [mcpToolsFilter, setMcpToolsFilter] = useState("");

    // Redirect if not authenticated
    useEffect(() => {
        if (!loading && !user) {
            redirectToLogin();
        }
    }, [loading, user, redirectToLogin]);

    const fetchTools = useCallback(async () => {
        if (loading || !user) return;

        try {
            setIsLoading(true);
            setError(null);
            const accessToken = await getAccessToken();

            const response = await listToolsApiV1ToolsGet({
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                },
                query: {
                    status: "active,archived",
                },
            });

            if (response.data) {
                setTools(response.data);
            }
        } catch (err) {
            setError(t("list.errorFetch"));
            console.error("Error fetching tools:", err);
        } finally {
            setIsLoading(false);
        }
    }, [loading, user, getAccessToken, t]);

    const fetchAgentOptions = useCallback(async () => {
        if (loading || !user) return;
        try {
            const response = await getWorkflowsSummaryApiV1WorkflowSummaryGet({});
            // The generated client resolves rather than throws on a 4xx/5xx.
            if (response.error || !response.data) {
                setAgentOptions([]);
                return;
            }
            setAgentOptions(
                response.data.map((workflow) => ({
                    id: workflow.id,
                    name: workflow.name,
                })),
            );
        } catch {
            setAgentOptions([]);
        }
    }, [loading, user]);

    useEffect(() => {
        fetchTools();
    }, [fetchTools]);

    useEffect(() => {
        // Only the agent-transfer dialog needs the agent list; fetch it when
        // that category is actually picked.
        if (isCreateDialogOpen && newToolCategory === "transfer_agent") {
            fetchAgentOptions();
        }
    }, [isCreateDialogOpen, newToolCategory, fetchAgentOptions]);

    const handleCreateTool = async () => {
        if (!newToolName.trim()) {
            setCreateError(t("list.errorNameRequired"));
            return;
        }

        if (newToolCategory === "transfer_agent" && !newTransferAgentWorkflowId) {
            setCreateError(t("list.errorChooseAgent"));
            return;
        }

        if (newToolCategory === "mcp" && !mcpUrl.trim()) {
            setCreateError(t("list.errorMcpUrlRequired"));
            return;
        }

        if (newToolCategory === "mcp" && !MCP_URL_PATTERN.test(mcpUrl.trim())) {
            setCreateError(t("list.errorMcpUrlInvalid"));
            return;
        }

        try {
            setIsCreating(true);
            setCreateError(null);
            const accessToken = await getAccessToken();

            const categoryConfig = getCategoryConfig(newToolCategory);

            let definition: ToolDefinition;
            if (newToolCategory === "mcp") {
                definition = createMcpDefinition(mcpUrl, mcpCredentialUuid, mcpToolsFilter);
            } else if (newToolCategory === "transfer_agent") {
                definition = createTransferAgentDefinition({
                    workflow_id: Number(newTransferAgentWorkflowId),
                });
            } else {
                definition = createToolDefinition(newToolCategory);
            }

            const requestBody: CreateToolRequest = {
                name: newToolName,
                description: newToolDescription || undefined,
                category: newToolCategory,
                icon: categoryConfig?.iconName || "globe",
                icon_color: categoryConfig?.iconColor || "#3B82F6",
                definition,
            };

            const response = await createToolApiV1ToolsPost({
                body: requestBody,
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                },
            });

            if (response.error) {
                setCreateError(detailFromError(response.error, t("list.errorCreate")));
                return;
            }

            if (response.data) {
                setIsCreateDialogOpen(false);
                setNewToolName("");
                setNewToolDescription("");
                setNewToolCategory("http_api");
                setNewTransferAgentWorkflowId("");
                setMcpUrl("");
                setMcpCredentialUuid("");
                setMcpToolsFilter("");
                // Navigate to the new tool's detail page
                router.push(`/tools/${response.data.tool_uuid}`);
            }
        } catch (err: unknown) {
            let errorMessage = t("list.errorCreate");
            if (err && typeof err === "object") {
                const errObj = err as Record<string, unknown>;
                // Handle API client error response
                if (errObj.error && typeof errObj.error === "object") {
                    const errorData = errObj.error as Record<string, unknown>;
                    if (typeof errorData.detail === "string") {
                        errorMessage = errorData.detail;
                    }
                }
                // Handle standard Error objects
                else if (errObj.message && typeof errObj.message === "string") {
                    errorMessage = errObj.message;
                }
            }
            setCreateError(errorMessage);
            console.error("Error creating tool:", err);
        } finally {
            setIsCreating(false);
        }
    };

    const handleDeleteTool = async (toolUuid: string, e: React.MouseEvent) => {
        e.stopPropagation();
        if (!confirm(t("list.confirmArchive"))) return;

        try {
            setError(null);
            const accessToken = await getAccessToken();

            await deleteToolApiV1ToolsToolUuidDelete({
                path: {
                    tool_uuid: toolUuid,
                },
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                },
            });

            fetchTools();
        } catch (err) {
            setError(t("list.errorArchive"));
            console.error("Error archiving tool:", err);
        }
    };

    const handleUnarchiveTool = async (toolUuid: string, e: React.MouseEvent) => {
        e.stopPropagation();

        try {
            setError(null);
            const accessToken = await getAccessToken();

            await unarchiveToolApiV1ToolsToolUuidUnarchivePost({
                path: {
                    tool_uuid: toolUuid,
                },
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                },
            });

            fetchTools();
        } catch (err) {
            setError(t("list.errorUnarchive"));
            console.error("Error unarchiving tool:", err);
        }
    };

    const filteredTools = tools.filter(
        (tool) =>
            tool.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            tool.description?.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const activeTools = filteredTools.filter((tool) => tool.status === "active");
    const archivedTools = filteredTools.filter((tool) => tool.status === "archived");

    const selectedCategoryConfig = getCategoryConfig(newToolCategory);

    const getCategoryBadge = (category: string) => {
        switch (category) {
            case "http_api":
                return <Badge variant="default">{t("category.httpApi")}</Badge>;
            case "end_call":
                return <Badge variant="destructive">{t("category.endCall")}</Badge>;
            case "calculator":
                return <Badge variant="secondary">{t("category.calculator")}</Badge>;
            case "native":
                return <Badge variant="secondary">{t("category.native")}</Badge>;
            case "integration":
                return <Badge variant="outline">{t("category.integration")}</Badge>;
            case "mcp":
                return <Badge variant="outline">{t("category.mcp")}</Badge>;
            default:
                return <Badge variant="outline">{category}</Badge>;
        }
    };

    const getStatusBadge = (status: string) => {
        switch (status) {
            case "active":
                return <Badge className="bg-green-500">{t("status.active")}</Badge>;
            case "draft":
                return <Badge variant="secondary">{t("status.draft")}</Badge>;
            case "archived":
                return <Badge variant="destructive">{t("status.archived")}</Badge>;
            default:
                return <Badge variant="outline">{status}</Badge>;
        }
    };

    if (loading || !user) {
        return (
            <PageLayout title={t("title")}>
                <div className="space-y-4">
                    <Skeleton className="h-12 w-64" />
                    <Skeleton className="h-64 w-full" />
                </div>
            </PageLayout>
        );
    }

    return (
        <>
            <PageLayout title={t("title")} description={<>{t("description")}{" "}
                <a href="https://docs.dograh.com/voice-agent/tools/introduction" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 underline">
                    {t("learnMore")} <ExternalLink className="h-3 w-3" />
                </a></>}>

                {error && (
                    <div className="mb-4 p-4 bg-destructive/10 border border-destructive/20 rounded-lg text-destructive">
                        {error}
                    </div>
                )}

                <PageSection title={t("list.yourTools")}
                    description={t("list.yourToolsDescription")}
                    actions={<Button onClick={() => setIsCreateDialogOpen(true)}>
                        <Plus className="w-4 h-4 mr-2" />
                        {t("list.createTool")}
                    </Button>}
                    toolbar={<div className="relative">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                            placeholder={t("list.searchPlaceholder")}
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="pl-10"
                        />
                    </div>}>
                    {isLoading ? (
                        <div className="space-y-4">
                            {[1, 2, 3].map((i) => (
                                <div
                                    key={i}
                                    className="flex items-center justify-between p-4 border rounded-lg"
                                >
                                    <div className="space-y-2">
                                        <Skeleton className="h-4 w-32" />
                                        <Skeleton className="h-3 w-48" />
                                    </div>
                                    <Skeleton className="h-8 w-20" />
                                </div>
                            ))}
                        </div>
                    ) : activeTools.length === 0 && archivedTools.length === 0 ? (
                        <div className="text-center py-12">
                            {renderToolIcon("http_api", "w-12 h-12 text-muted-foreground mx-auto mb-4")}
                            <p className="text-muted-foreground mb-4">
                                {searchQuery
                                    ? t("list.noMatch")
                                    : t("list.noTools")}
                            </p>
                            {!searchQuery && (
                                <Button onClick={() => setIsCreateDialogOpen(true)}>
                                    {t("list.createFirstTool")}
                                </Button>
                            )}
                        </div>
                    ) : (
                        <>
                            {/* Active Tools */}
                            {activeTools.length > 0 ? (
                                <div className="space-y-4">
                                    {activeTools.map((tool) => (
                                        <div
                                            key={tool.tool_uuid}
                                            className="flex items-center justify-between gap-3 p-4 border rounded-lg hover:bg-muted/50 cursor-pointer transition-colors"
                                            onClick={() =>
                                                router.push(`/tools/${tool.tool_uuid}`)
                                            }
                                        >
                                            <div className="flex min-w-0 flex-1 items-center gap-4">
                                                <div
                                                    className="w-10 h-10 shrink-0 rounded-lg flex items-center justify-center"
                                                    style={{
                                                        backgroundColor:
                                                            tool.icon_color || getCategoryConfig(tool.category as ToolCategory)?.iconColor || "#3B82F6",
                                                    }}
                                                >
                                                    {renderToolIcon(tool.category)}
                                                </div>
                                                <div className="min-w-0">
                                                    <div className="flex flex-wrap items-center gap-2">
                                                        <span className="break-words font-medium">
                                                            {tool.name}
                                                        </span>
                                                        {getCategoryBadge(tool.category)}
                                                    </div>
                                                    {tool.description && (
                                                        <p className="break-words text-sm text-muted-foreground mt-1">
                                                            {tool.description}
                                                        </p>
                                                    )}
                                                </div>
                                            </div>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={(e) =>
                                                    handleDeleteTool(tool.tool_uuid, e)
                                                }
                                                className="text-destructive hover:text-destructive/90"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </Button>
                                        </div>
                                    ))}
                                </div>
                            ) : !searchQuery ? (
                                <div className="text-center py-8">
                                    <p className="text-muted-foreground mb-4">
                                        {t("list.noActiveTools")}
                                    </p>
                                    <Button onClick={() => setIsCreateDialogOpen(true)}>
                                        {t("list.createFirstTool")}
                                    </Button>
                                </div>
                            ) : null}

                            {/* Archived Tools */}
                            {archivedTools.length > 0 && (
                                <div className="mt-8">
                                    <h3 className="text-lg font-semibold text-muted-foreground mb-4">
                                        {t("list.archivedTools")}
                                    </h3>
                                    <div className="space-y-4">
                                        {archivedTools.map((tool) => (
                                            <div
                                                key={tool.tool_uuid}
                                                className="flex items-center justify-between gap-3 p-4 border rounded-lg hover:bg-muted/50 cursor-pointer transition-colors opacity-60"
                                                onClick={() =>
                                                    router.push(`/tools/${tool.tool_uuid}`)
                                                }
                                            >
                                                <div className="flex min-w-0 flex-1 items-center gap-4">
                                                    <div
                                                        className="w-10 h-10 shrink-0 rounded-lg flex items-center justify-center"
                                                        style={{
                                                            backgroundColor:
                                                                tool.icon_color || getCategoryConfig(tool.category as ToolCategory)?.iconColor || "#3B82F6",
                                                        }}
                                                    >
                                                        {renderToolIcon(tool.category)}
                                                    </div>
                                                    <div className="min-w-0">
                                                        <div className="flex flex-wrap items-center gap-2">
                                                            <span className="break-words font-medium">
                                                                {tool.name}
                                                            </span>
                                                            {getCategoryBadge(tool.category)}
                                                            {getStatusBadge(tool.status)}
                                                        </div>
                                                        {tool.description && (
                                                            <p className="break-words text-sm text-muted-foreground mt-1">
                                                                {tool.description}
                                                            </p>
                                                        )}
                                                    </div>
                                                </div>
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={(e) =>
                                                        handleUnarchiveTool(tool.tool_uuid, e)
                                                    }
                                                    className="text-primary hover:text-primary/90"
                                                    title={t("list.restoreTool")}
                                                >
                                                    <RotateCcw className="w-4 h-4" />
                                                </Button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </PageSection>
            </PageLayout>

            {/* Create Tool Dialog */}
            <Dialog open={isCreateDialogOpen} onOpenChange={(open) => {
                setIsCreateDialogOpen(open);
                if (open) {
                    setCreateError(null);
                } else {
                    // Reset MCP fields when dialog is closed without creating
                    setMcpUrl("");
                    setMcpCredentialUuid("");
                    setMcpToolsFilter("");
                }
            }}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{t("list.createDialogTitle")}</DialogTitle>
                        <DialogDescription>
                            {t("list.createDialogDescription")}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="grid gap-2">
                            <Label>{t("list.toolType")}</Label>
                            <Select
                                value={newToolCategory}
                                onValueChange={(v) => {
                                    const category = v as ToolCategory;
                                    setNewToolCategory(category);
                                    setCreateError(null);
                                    const categoryConfig = getCategoryConfig(category);
                                    if (categoryConfig?.autoFill) {
                                        setNewToolName(t(categoryConfig.autoFill.nameKey));
                                        setNewToolDescription(t(categoryConfig.autoFill.descriptionKey));
                                    }
                                }}
                            >
                                <SelectTrigger className="w-full">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {TOOL_CATEGORIES.map((category) => (
                                        <SelectItem
                                            key={category.value}
                                            value={category.value}
                                            disabled={category.disabled}
                                        >
                                            {t(category.labelKey)}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <p className="text-xs text-muted-foreground">
                                {selectedCategoryConfig && t(selectedCategoryConfig.descriptionKey)}
                            </p>
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="name">{t("list.toolName")}</Label>
                            <Label className="text-xs text-muted-foreground">
                                {t("list.toolNameHint")}
                            </Label>
                            <Input
                                id="name"
                                value={newToolName}
                                onChange={(e) => setNewToolName(e.target.value)}
                                placeholder={t("list.toolNamePlaceholder")}
                            />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="description">{t("list.descriptionOptional")}</Label>
                            <Label className="text-xs text-muted-foreground">
                                {t("list.descriptionHint")}
                            </Label>
                            <Input
                                id="description"
                                value={newToolDescription}
                                onChange={(e) => setNewToolDescription(e.target.value)}
                                placeholder={t("list.descriptionPlaceholder")}
                            />
                        </div>

                        {newToolCategory === "transfer_agent" && (
                            <div className="grid gap-2">
                                <Label htmlFor="transfer-agent-workflow">
                                    {t("list.transferToAgent")}
                                </Label>
                                <Label className="text-xs text-muted-foreground">
                                    {t("list.transferToAgentHint")}
                                </Label>
                                <Select
                                    value={newTransferAgentWorkflowId}
                                    onValueChange={setNewTransferAgentWorkflowId}
                                >
                                    <SelectTrigger id="transfer-agent-workflow">
                                        <SelectValue placeholder={t("list.selectAgent")} />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {agentOptions.map((agent) => (
                                            <SelectItem
                                                key={agent.id}
                                                value={String(agent.id)}
                                            >
                                                {agent.name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        )}

                        {newToolCategory === "mcp" && (
                            <>
                                <div className="grid gap-2">
                                    <Label htmlFor="mcp-url">{t("list.mcpServerUrl")}</Label>
                                    <Input
                                        id="mcp-url"
                                        value={mcpUrl}
                                        onChange={(e) => setMcpUrl(e.target.value)}
                                        placeholder="https://your-mcp-server.example.com/mcp"
                                    />
                                </div>
                                <div className="grid gap-2">
                                    <Label>{t("list.transport")}</Label>
                                    <Input
                                        value={t("list.streamableHttp")}
                                        disabled
                                        readOnly
                                    />
                                </div>
                                <CredentialSelector
                                    value={mcpCredentialUuid}
                                    onChange={setMcpCredentialUuid}
                                    label={t("list.credentialOptional")}
                                    description={t("list.credentialDescription")}
                                />
                                <div className="grid gap-2">
                                    <Label htmlFor="mcp-tools-filter">{t("list.toolsFilterOptional")}</Label>
                                    <Input
                                        id="mcp-tools-filter"
                                        value={mcpToolsFilter}
                                        onChange={(e) => setMcpToolsFilter(e.target.value)}
                                        placeholder={t("list.toolsFilterPlaceholder")}
                                    />
                                    <p className="text-xs text-muted-foreground">
                                        {t("list.toolsFilterHint")}
                                    </p>
                                </div>
                            </>
                        )}
                    </div>
                    {createError && (
                        <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-destructive text-sm">
                            {createError}
                        </div>
                    )}
                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => setIsCreateDialogOpen(false)}
                        >
                            {t("cancel")}
                        </Button>
                        <Button onClick={handleCreateTool} disabled={isCreating}>
                            {isCreating ? t("list.creating") : t("list.createTool")}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}
