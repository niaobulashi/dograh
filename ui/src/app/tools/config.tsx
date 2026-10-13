"use client";

import { ArrowLeftRight, Calculator, Cog, Globe, type LucideIcon, PhoneForwarded, PhoneOff, Puzzle } from "lucide-react";
import { type ReactNode } from "react";

import type {
    CalculatorToolDefinition,
    ContextDestinationMappingConfig,
    ContextDestinationRoute,
    ContextDestinationRule,
    EndCallConfig,
    EndCallToolDefinition,
    HttpApiToolDefinition,
    McpToolDefinition,
    TransferAgentConfig,
    TransferAgentToolDefinition,
    TransferCallConfig,
    TransferCallToolDefinition,
} from "@/client/types.gen";
import { createUuid } from "@/lib/uuid";

export type ToolCategory = "http_api" | "end_call" | "transfer_call" | "transfer_agent" | "calculator" | "native" | "integration" | "mcp";

export type EndCallMessageType = "none" | "custom" | "audio";
export type TransferDestinationSource = "static" | "dynamic" | "context_mapping";

export interface ContextDestinationRouteRow extends ContextDestinationRoute {
    id: string;
}

export interface ContextDestinationRuleRow {
    id: string;
    context_path: string;
    routes: ContextDestinationRouteRow[];
}

export function createContextDestinationRouteRow(
    route?: Partial<ContextDestinationRoute>,
): ContextDestinationRouteRow {
    return {
        id: createUuid(),
        context_value: route?.context_value ?? "",
        destination: route?.destination ?? "",
    };
}

export function createContextDestinationRuleRow(
    rule?: Partial<ContextDestinationRule>,
): ContextDestinationRuleRow {
    return {
        id: createUuid(),
        context_path: rule?.context_path ?? "",
        routes: (rule?.routes ?? [{}]).map(createContextDestinationRouteRow),
    };
}

/** Normalize a stored mapping (ordered or legacy single-rule) into editable rows. */
export function contextMappingToRuleRows(
    mapping?: ContextDestinationMappingConfig | null,
): ContextDestinationRuleRow[] {
    if (!mapping) return [];
    const rules = mapping.rules?.length
        ? mapping.rules
        : mapping.context_path || mapping.routes?.length
            ? [{ context_path: mapping.context_path || "", routes: mapping.routes || [] }]
            : [];
    return rules.map(createContextDestinationRuleRow);
}

export function ruleRowsToContextMappingRules(
    rows: ContextDestinationRuleRow[],
): ContextDestinationRule[] {
    return rows.map((rule) => ({
        context_path: rule.context_path.trim(),
        routes: rule.routes.map((route) => ({
            context_value: route.context_value.trim(),
            destination: route.destination.trim(),
        })),
    }));
}

export interface ToolCategoryConfig {
    value: ToolCategory;
    /** next-intl message key under the `Tools` namespace. */
    labelKey: string;
    /** next-intl message key under the `Tools` namespace. */
    descriptionKey: string;
    icon: LucideIcon;
    iconName: string; // String name for storing in database
    iconColor: string;
    disabled?: boolean;
    autoFill?: {
        /** next-intl message keys under the `Tools` namespace. */
        nameKey: string;
        descriptionKey: string;
    };
}

export const TOOL_CATEGORIES: ToolCategoryConfig[] = [
    {
        value: "http_api",
        labelKey: "categories.httpApi.label",
        descriptionKey: "categories.httpApi.description",
        icon: Globe,
        iconName: "globe",
        iconColor: "#3B82F6",
    },
    {
        value: "end_call",
        labelKey: "categories.endCall.label",
        descriptionKey: "categories.endCall.description",
        icon: PhoneOff,
        iconName: "phone-off",
        iconColor: "#EF4444",
        autoFill: {
            nameKey: "categories.endCall.autoFillName",
            descriptionKey: "categories.endCall.autoFillDescription",
        },
    },
    {
        value: "transfer_call",
        labelKey: "categories.transferCall.label",
        descriptionKey: "categories.transferCall.description",
        icon: PhoneForwarded,
        iconName: "phone-forwarded",
        iconColor: "#10B981",
        autoFill: {
            nameKey: "categories.transferCall.autoFillName",
            descriptionKey: "categories.transferCall.autoFillDescription",
        },
    },
    {
        value: "transfer_agent",
        labelKey: "categories.transferAgent.label",
        descriptionKey: "categories.transferAgent.description",
        icon: ArrowLeftRight,
        iconName: "arrow-left-right",
        iconColor: "#0EA5E9",
        autoFill: {
            nameKey: "categories.transferAgent.autoFillName",
            descriptionKey: "categories.transferAgent.autoFillDescription",
        },
    },
    {
        value: "calculator",
        labelKey: "categories.calculator.label",
        descriptionKey: "categories.calculator.description",
        icon: Calculator,
        iconName: "calculator",
        iconColor: "#F59E0B",
        autoFill: {
            nameKey: "categories.calculator.autoFillName",
            descriptionKey: "categories.calculator.autoFillDescription",
        },
    },
    {
        value: "mcp",
        labelKey: "categories.mcp.label",
        descriptionKey: "categories.mcp.description",
        icon: Puzzle,
        iconName: "puzzle",
        iconColor: "#8B5CF6",
    },
    {
        value: "native",
        labelKey: "categories.native.label",
        descriptionKey: "categories.native.description",
        icon: Cog,
        iconName: "cog",
        iconColor: "#6B7280",
        disabled: true,
    },
    {
        value: "integration",
        labelKey: "categories.integration.label",
        descriptionKey: "categories.integration.description",
        icon: Puzzle,
        iconName: "puzzle",
        iconColor: "#8B5CF6",
        disabled: true,
    },
];

export function getCategoryConfig(category: ToolCategory): ToolCategoryConfig | undefined {
    return TOOL_CATEGORIES.find(c => c.value === category);
}

export function getToolIcon(category: string): LucideIcon {
    const config = TOOL_CATEGORIES.find(c => c.value === category);
    return config?.icon ?? Globe;
}

export function getToolIconColor(category: string, fallbackColor?: string): string {
    const config = TOOL_CATEGORIES.find(c => c.value === category);
    return config?.iconColor ?? fallbackColor ?? "#3B82F6";
}

export function renderToolIcon(category: string, className: string = "w-5 h-5 text-white"): ReactNode {
    const Icon = getToolIcon(category);
    return <Icon className={className} />;
}

/** next-intl message key under the `Tools` namespace for a tool's type label. */
export function getToolTypeKey(category: string): string {
    switch (category) {
        case "end_call":
            return "toolTypes.endCall";
        case "transfer_call":
            return "toolTypes.transferCall";
        case "transfer_agent":
            return "toolTypes.transferAgent";
        case "http_api":
            return "toolTypes.httpApi";
        case "calculator":
            return "toolTypes.calculator";
        case "native":
            return "toolTypes.native";
        case "integration":
            return "toolTypes.integration";
        case "mcp":
            return "toolTypes.mcp";
        default:
            return "toolTypes.fallback";
    }
}

export const DEFAULT_END_CALL_REASON_DESCRIPTION =
    "The reason for ending the call (e.g., 'voicemail_detected', 'issue_resolved', 'customer_requested')";

export const DEFAULT_END_CALL_CONFIG: EndCallConfig = {
    endCallReason: false,
};

export const DEFAULT_TRANSFER_AGENT_MESSAGE =
    "Let me connect you with the right person. One moment please.";

export const DEFAULT_TRANSFER_INTRODUCTION_PROMPT =
    "Briefly introduce this caller to the person receiving the transfer. " +
    "Include their reason for calling, essential details, and any explicit " +
    "language preference. Use the caller's preferred language. Keep it to one " +
    "sentence, at most 25 words. Do not invent details.";

export const DEFAULT_TRANSFER_CALL_CONFIG: TransferCallConfig = {
    destination: "",
    timeout: 30,
    introduction_enabled: false,
    introduction_prompt: DEFAULT_TRANSFER_INTRODUCTION_PROMPT,
};

export type ToolDefinition =
    | HttpApiToolDefinition
    | EndCallToolDefinition
    | TransferCallToolDefinition
    | TransferAgentToolDefinition
    | CalculatorToolDefinition
    | McpToolDefinition;

export function createEndCallDefinition(config: EndCallConfig): EndCallToolDefinition {
    return {
        schema_version: 1,
        type: "end_call",
        messages: [],
        config,
    };
}

export function createTransferCallDefinition(config: TransferCallConfig): TransferCallToolDefinition {
    return {
        schema_version: 1,
        type: "transfer_call",
        messages: [],
        config,
    };
}

/**
 * A transfer tool is defined by where it sends the caller, so there is no
 * meaningful empty default — the create dialog collects the destination and
 * builds the definition from it.
 */
export function createTransferAgentDefinition(
    config: TransferAgentConfig,
    messages: NonNullable<TransferAgentToolDefinition["messages"]> = [
        { event: "start", type: "text", text: DEFAULT_TRANSFER_AGENT_MESSAGE },
    ],
): TransferAgentToolDefinition {
    return {
        schema_version: 1,
        type: "transfer_agent",
        messages,
        config,
    };
}

export function createHttpApiDefinition(): HttpApiToolDefinition {
    return {
        schema_version: 1,
        type: "http_api",
        messages: [],
        config: {
            method: "POST",
            url: "",
        },
    };
}

export function createCalculatorDefinition(): CalculatorToolDefinition {
    return {
        schema_version: 1,
        type: "calculator",
        messages: [],
    };
}

export const MCP_URL_PATTERN = /^https?:\/\//i;

export function createMcpDefinition(
    url: string,
    credentialUuid: string,
    toolsFilterCsv: string,
): McpToolDefinition {
    return {
        schema_version: 1,
        type: "mcp" as const,
        messages: [],
        config: {
            transport: "streamable_http" as const,
            url: url.trim(),
            credential_uuid: credentialUuid || null,
            tools_filter: toolsFilterCsv
                .split(",")
                .map((s) => s.trim())
                .filter((s) => s.length > 0),
        },
    };
}

export function createToolDefinition(category: ToolCategory): ToolDefinition {
    switch (category) {
        case "end_call":
            return createEndCallDefinition(DEFAULT_END_CALL_CONFIG);
        case "transfer_call":
            return createTransferCallDefinition(DEFAULT_TRANSFER_CALL_CONFIG);
        case "calculator":
            return createCalculatorDefinition();
        case "http_api":
        default:
            return createHttpApiDefinition();
    }
}
