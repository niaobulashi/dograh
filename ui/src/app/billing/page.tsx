"use client";

import {
    ChevronLeft,
    ChevronRight,
    CircleDollarSign,
    CreditCard,
    ExternalLink,
    Info,
    RefreshCw,
} from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { createMpsCreditPurchaseUrlApiV1OrganizationsUsageMpsCreditsPurchaseUrlPost, getBillingCreditsApiV1OrganizationsBillingCreditsGet } from "@/client/sdk.gen";
import type { MpsBillingCreditsResponse, MpsCreditLedgerEntryResponse } from "@/client/types.gen";
import { PageLayout } from "@/components/layout/PageLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { useAppConfig } from "@/context/AppConfigContext";
import { useOrgConfig } from "@/context/OrgConfigContext";
import { useOrganizationTimezone } from "@/hooks/useOrganizationTimezone";
import { detailFromError } from "@/lib/apiError";
import { useAuth } from "@/lib/auth";
import { getBillingActivity, getBillingDateRange, getBillingPeriod } from "@/lib/billingFilters";
import { formatDateTime } from "@/lib/dateTime";
import { trackMetaInitiateCheckout } from "@/lib/metaPixel";

import { BillingLedgerFilters } from "./BillingLedgerFilters";

const LEDGER_PAGE_SIZE = 50;

const formatCredits = (value: number | null | undefined) => (
    (value ?? 0).toLocaleString(undefined, {
        maximumFractionDigits: 2,
        minimumFractionDigits: 0,
    })
);

const formatAmount = (amountMinor?: number | null, currency?: string | null) => {
    if (amountMinor == null) {
        return "-";
    }

    return new Intl.NumberFormat(undefined, {
        style: "currency",
        currency: currency || "USD",
    }).format(amountMinor / 100);
};

const metricLabels: Record<string, string> = {
    voice_minutes: "metricVoiceUsage",
    platform_usage: "metricPlatformUsage",
};

const formatTitleCase = (value: string | null | undefined) => (
    value ? value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()) : "-"
);

const formatBillableQuantity = (entry: MpsCreditLedgerEntryResponse) => {
    if (entry.billable_quantity == null || !entry.quantity_unit) {
        return null;
    }

    const unit = entry.quantity_unit === "minute" ? "min" : entry.quantity_unit;
    return `${formatCredits(entry.billable_quantity)} ${unit}`;
};

const getRunHref = (entry: MpsCreditLedgerEntryResponse) => {
    if (!entry.workflow_id || !entry.workflow_run_id) {
        return null;
    }

    return `/workflow/${entry.workflow_id}/run/${entry.workflow_run_id}`;
};

const getPageFromSearchParams = (
    searchParams: { get: (name: string) => string | null },
) => {
    const pageParam = searchParams.get("page");
    const page = pageParam ? Number.parseInt(pageParam, 10) : 1;
    return Number.isFinite(page) && page > 0 ? page : 1;
};

export default function BillingPage() {
    const t = useTranslations("Billing");
    const getLedgerEntryLabel = (entry: MpsCreditLedgerEntryResponse) => {
        if (entry.metric_code) {
            const key = metricLabels[entry.metric_code];
            return key ? t(key) : formatTitleCase(entry.metric_code);
        }

        if (entry.entry_type === "grant") {
            return t("creditGrant");
        }

        if (entry.entry_type === "purchase") {
            return t("creditPurchase");
        }

        return formatTitleCase(entry.entry_type);
    };
    const router = useRouter();
    const searchParams = useSearchParams();
    const auth = useAuth();
    const { config, loading: configLoading } = useAppConfig();
    const { orgContext, loading: orgLoading } = useOrgConfig();
    const organizationTimezone = useOrganizationTimezone();
    const [credits, setCredits] = useState<MpsBillingCreditsResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [refreshKey, setRefreshKey] = useState(0);
    const [fetchError, setFetchError] = useState<string | null>(null);
    const [purchasing, setPurchasing] = useState(false);
    const currentPage = getPageFromSearchParams(searchParams);
    const activity = getBillingActivity(searchParams.get("activity"));
    const period = getBillingPeriod(searchParams.get("period"));
    const customStartDate = searchParams.get("start_date");
    const customEndDate = searchParams.get("end_date");
    const { start_date: startDate, end_date: endDate } = getBillingDateRange(
        period, organizationTimezone, customStartDate, customEndDate,
    );

    const hasAppConfig = !configLoading && config !== null;
    const isOssMode = hasAppConfig && config.deploymentMode === "oss";
    const canPurchaseCredits = hasAppConfig && config.deploymentMode !== "oss";
    const totalQuota = credits?.total_quota ?? 0;
    const remainingCredits = credits?.remaining_credits ?? 0;
    const usedCredits = credits?.total_credits_used ?? 0;
    const usagePercent = totalQuota > 0 ? Math.min(100, Math.round((usedCredits / totalQuota) * 100)) : 0;

    const ledgerEntries = useMemo(() => credits?.ledger_entries ?? [], [credits?.ledger_entries]);
    const ledgerPage = credits?.page ?? currentPage;
    const ledgerTotalCount = credits?.total_count ?? ledgerEntries.length;
    const ledgerTotalPages = credits?.total_pages ?? 0;

    useEffect(() => {
        if (auth.loading || configLoading || orgLoading) {
            return;
        }

        if (!auth.isAuthenticated) {
            setLoading(false);
            return;
        }

        const controller = new AbortController();
        const fetchCredits = async () => {
            setLoading(true);
            setFetchError(null);
            try {
                const response = await getBillingCreditsApiV1OrganizationsBillingCreditsGet({
                    query: {
                        page: currentPage, limit: LEDGER_PAGE_SIZE,
                        ...(!isOssMode && {
                            entry_type: activity === "all" ? undefined : activity,
                            start_date: startDate,
                            end_date: endDate,
                            timezone: organizationTimezone,
                        }),
                    },
                    signal: controller.signal,
                });

                if (response.error) {
                    throw new Error(detailFromError(response.error, t("fetchError")));
                }

                if (!controller.signal.aborted) setCredits(response.data ?? null);
            } catch (error) {
                if (controller.signal.aborted) return;
                console.error("Failed to fetch billing credits:", error);
                const message = error instanceof Error ? error.message : t("fetchError");
                setFetchError(message);
                toast.error(message);
            } finally {
                if (!controller.signal.aborted) setLoading(false);
            }
        };
        void fetchCredits();
        return () => controller.abort();
    }, [auth.isAuthenticated, auth.loading, configLoading, orgLoading,
        orgContext?.organization_id, isOssMode, currentPage, activity,
        startDate, endDate, organizationTimezone, refreshKey, t]);

    const handleRefresh = () => {
        setRefreshKey(value => value + 1);
    };

    const updateUrlParams = useCallback((updates: Record<string, string | null>, resetPage = true) => {
        const newParams = new URLSearchParams(searchParams.toString());
        if (resetPage) newParams.delete("page");
        for (const [key, value] of Object.entries(updates)) {
            if (value === null) newParams.delete(key);
            else newParams.set(key, value);
        }

        const queryString = newParams.toString();
        router.push(queryString ? `/billing?${queryString}` : "/billing", { scroll: false });
    }, [router, searchParams]);

    const handlePageChange = (page: number) => {
        const nextPage = Math.max(1, page);
        updateUrlParams({ page: nextPage > 1 ? String(nextPage) : null }, false);
    };

    const handlePurchaseCredits = async () => {
        if (!canPurchaseCredits) {
            return;
        }

        // Fire on checkout intent (the click). The purchase-URL round-trip below
        // gives the pixel beacon time to flush before the full-page redirect.
        trackMetaInitiateCheckout();
        setPurchasing(true);
        try {
            const response = await createMpsCreditPurchaseUrlApiV1OrganizationsUsageMpsCreditsPurchaseUrlPost();
            const checkoutUrl = response.data?.checkout_url;
            if (!checkoutUrl) {
                throw new Error("Missing checkout URL");
            }
            window.location.href = checkoutUrl;
        } catch (error) {
            console.error("Failed to create credit purchase URL:", error);
            toast.error(t("checkoutError"));
            setPurchasing(false);
        }
    };

    if ((loading && !credits && !fetchError) || configLoading || orgLoading) {
        return (
            <PageLayout title={t("title")} description={t("description")}>
                <div className="grid gap-4 md:grid-cols-2">
                    <Skeleton className="h-36 rounded-lg" />
                    <Skeleton className="h-36 rounded-lg" />
                </div>
                <Skeleton className="h-80 rounded-lg" />
            </PageLayout>
        );
    }

    return (
        <PageLayout title={t("title")} description={t("description")}
            actions={<><Button variant="outline" onClick={handleRefresh} disabled={loading}>
                <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
                {t("refresh")}
            </Button>
                {canPurchaseCredits && (
                    <Button onClick={handlePurchaseCredits} disabled={purchasing}>
                        <CreditCard className="h-4 w-4 mr-2" />
                        {purchasing ? t("opening") : t("addCredits")}
                    </Button>
                )}</>}>
            {isOssMode && (
                <div className="flex gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-900/50 dark:bg-amber-950/30">
                    <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600 dark:text-amber-400" />
                    <div className="text-sm text-amber-900 dark:text-amber-200">
                        <p className="font-medium">{t("ossUnavailable")}</p>
                        <p className="mt-1">
                            {t("ossBodyBeforeLink")}{" "}
                            <a
                                href="https://app.dograh.com"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 font-medium underline underline-offset-2"
                            >
                                app.dograh.com
                                <ExternalLink className="h-3 w-3" />
                            </a>
                            {t("ossBodyAfterFirstLink")}{" "}
                            <Link
                                href="/model-configurations"
                                className="font-medium underline underline-offset-2"
                            >
                                {t("modelConfigurations")}
                            </Link>
                            {t("ossBodyAfterSecondLink")}
                        </p>
                    </div>
                </div>
            )}

            <div className="grid gap-4 md:grid-cols-2">
                <Card>
                    <CardHeader className="pb-2">
                        <CardDescription>{t(isOssMode ? "creditsRemaining" : "creditBalance")}</CardDescription>
                        <CardTitle className="flex items-center gap-2 text-3xl">
                            <CircleDollarSign className="h-6 w-6 text-muted-foreground" />
                            {formatCredits(remainingCredits)}
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-sm text-muted-foreground">{t("oneCreditOneCent")}</p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="pb-2">
                        <CardDescription>{t(isOssMode ? "creditsUsed" : "allTimeCreditsUsed")}</CardDescription>
                        <CardTitle className="text-3xl">{formatCredits(usedCredits)}</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-sm text-muted-foreground">
                            {t(isOssMode ? "currentAllocationUsage" : "totalLedgerDebits")}
                        </p>
                    </CardContent>
                </Card>
            </div>

            {!isOssMode ? (
                <Card>
                    <CardHeader>
                        <CardTitle>{t("creditLedger")}</CardTitle>
                        <CardDescription>{t("creditLedgerDescription")}</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <BillingLedgerFilters
                            key={`${period}:${customStartDate}:${customEndDate}`}
                            activity={activity} period={period}
                            startDate={customStartDate} endDate={customEndDate}
                            timezone={organizationTimezone} onChange={updateUrlParams}
                        />
                        {loading ? (
                            <Skeleton className="h-64 w-full" />
                        ) : fetchError ? (
                            <p role="alert" className="py-8 text-center text-destructive">{fetchError}</p>
                        ) : ledgerEntries.length > 0 ? (
                            <div className="bg-card border rounded-lg overflow-x-auto shadow-sm">
                                <Table>
                                    <TableHeader>
                                        <TableRow className="bg-muted/50">
                                            <TableHead>{t("colDate")}</TableHead>
                                            <TableHead>{t("colActivity")}</TableHead>
                                            <TableHead>{t("colOrigin")}</TableHead>
                                            <TableHead>{t("colRun")}</TableHead>
                                            <TableHead className="text-right">{t("colCredits")}</TableHead>
                                            <TableHead className="text-right">{t("colBalance")}</TableHead>
                                            <TableHead className="text-right">{t("colAmountPaid")}</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {ledgerEntries.map((entry) => {
                                            const delta = entry.credits_delta ?? 0;
                                            const runHref = getRunHref(entry);
                                            const billableQuantity = formatBillableQuantity(entry);
                                            return (
                                                <TableRow key={entry.id}>
                                                    <TableCell>
                                                        {formatDateTime(entry.created_at, organizationTimezone)}
                                                    </TableCell>
                                                    <TableCell>
                                                        <div className="flex flex-col gap-1">
                                                            <span className="font-medium">{getLedgerEntryLabel(entry)}</span>
                                                            {billableQuantity && (
                                                                <span className="text-xs text-muted-foreground">{billableQuantity}</span>
                                                            )}
                                                        </div>
                                                    </TableCell>
                                                    <TableCell>
                                                        {entry.origin ? (
                                                            <Badge variant="secondary">{formatTitleCase(entry.origin)}</Badge>
                                                        ) : (
                                                            "-"
                                                        )}
                                                    </TableCell>
                                                    <TableCell>
                                                        {entry.workflow_run_id ? (
                                                            runHref ? (
                                                                <Link className="font-medium text-primary hover:underline" href={runHref}>
                                                                    #{entry.workflow_run_id}
                                                                </Link>
                                                            ) : (
                                                                <span>#{entry.workflow_run_id}</span>
                                                            )
                                                        ) : (
                                                            "-"
                                                        )}
                                                    </TableCell>
                                                    <TableCell className={`text-right font-medium ${delta >= 0 ? "text-green-600" : "text-destructive"}`}>
                                                        {delta >= 0 ? "+" : ""}
                                                        {formatCredits(delta)}
                                                    </TableCell>
                                                    <TableCell className="text-right">{formatCredits(entry.balance_after)}</TableCell>
                                                    <TableCell className="text-right">
                                                        {formatAmount(entry.amount_minor, entry.amount_currency)}
                                                    </TableCell>
                                                </TableRow>
                                            );
                                        })}
                                    </TableBody>
                                </Table>
                            </div>
                        ) : (
                            <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
                                {t("noEntries")}
                            </div>
                        )}
                        {!loading && !fetchError && ledgerTotalPages > 1 && (
                            <div className="flex items-center justify-between mt-6">
                                <p className="text-sm text-muted-foreground">
                                    {t("pageOf", { page: ledgerPage, totalPages: ledgerTotalPages, total: ledgerTotalCount })}
                                </p>
                                <div className="flex gap-2">
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => handlePageChange(ledgerPage - 1)}
                                        disabled={ledgerPage <= 1 || loading}
                                    >
                                        <ChevronLeft className="h-4 w-4" />
                                        {t("previous")}
                                    </Button>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => handlePageChange(ledgerPage + 1)}
                                        disabled={ledgerPage >= ledgerTotalPages || loading}
                                    >
                                        {t("next")}
                                        <ChevronRight className="h-4 w-4" />
                                    </Button>
                                </div>
                            </div>
                        )}
                    </CardContent>
                </Card>
            ) : (
                <Card>
                    <CardHeader>
                        <CardTitle>{t("creditUsage")}</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <Progress value={usagePercent} />
                        <div className="flex justify-between text-sm text-muted-foreground">
                            <span>{t("percentUsed", { percent: usagePercent })}</span>
                            <span>{t("remainingOfTotal", { remaining: formatCredits(remainingCredits), total: formatCredits(totalQuota) })}</span>
                        </div>
                    </CardContent>
                </Card>
            )}
        </PageLayout>
    );
}
