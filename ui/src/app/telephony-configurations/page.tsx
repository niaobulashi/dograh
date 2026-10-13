"use client";

import {
  AlertTriangle,
  ChevronRight,
  Copy,
  ExternalLink,
  Pencil,
  Plus,
  RotateCcw,
  Star,
  Trash2,
} from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import {
  deleteTelephonyConfigurationApiV1OrganizationsTelephonyConfigsConfigIdDelete,
  getTelephonyConfigurationByIdApiV1OrganizationsTelephonyConfigsConfigIdGet,
  listTelephonyConfigurationsApiV1OrganizationsTelephonyConfigsGet,
  reactivateTelephonyConfigurationApiV1OrganizationsTelephonyConfigsConfigIdReactivatePost,
  setDefaultOutboundApiV1OrganizationsTelephonyConfigsConfigIdSetDefaultOutboundPost,
} from "@/client/sdk.gen";
import type {
  TelephonyConfigurationDetail,
  TelephonyConfigurationListItem,
} from "@/client/types.gen";
import { PageLayout, PageSection } from "@/components/layout/PageLayout";
import { ConfigFormDialog } from "@/components/telephony/ConfigFormDialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useTelephonyConfigWarnings } from "@/context/TelephonyConfigWarningsContext";
import { detailFromError } from "@/lib/apiError";
import { useAuth } from "@/lib/auth";
import { copyTextToClipboard } from "@/lib/clipboard";

export default function TelephonyConfigurationsPage() {
  const t = useTranslations("Telephony");
  const { user, getAccessToken, loading: authLoading } = useAuth();
  const searchParams = useSearchParams();
  const {
    telnyxMissingWebhookPublicKeyCount,
    vonageMissingSignatureSecretCount,
    refresh: refreshWarnings,
  } = useTelephonyConfigWarnings();
  const [items, setItems] = useState<TelephonyConfigurationListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<TelephonyConfigurationDetail | null>(
    null,
  );
  const [editOpen, setEditOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] =
    useState<TelephonyConfigurationListItem | null>(null);

  const fetchItems = useCallback(async () => {
    if (authLoading || !user) return;
    setLoading(true);
    try {
      const token = await getAccessToken();
      const res = await listTelephonyConfigurationsApiV1OrganizationsTelephonyConfigsGet(
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (res.error) throw new Error(detailFromError(res.error));
      setItems(res.data?.configurations ?? []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("failedToLoadConfigurations"));
    } finally {
      setLoading(false);
    }
  }, [authLoading, user, getAccessToken]);

  // After a save (create/update), webhook-verification warning state may have
  // changed — refresh the cached warning state so the page banner and nav badge
  // update without a manual reload.
  const onSaved = useCallback(async () => {
    await fetchItems();
    await refreshWarnings();
  }, [fetchItems, refreshWarnings]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  // ?add=1 lands the user straight on the provider form — used by the Phone
  // Call dialog's "Add provider" action so the choice isn't asked twice.
  useEffect(() => {
    if (searchParams.get("add") === "1") setCreateOpen(true);
  }, [searchParams]);

  const onEdit = async (item: TelephonyConfigurationListItem) => {
    try {
      const token = await getAccessToken();
      const res = await getTelephonyConfigurationByIdApiV1OrganizationsTelephonyConfigsConfigIdGet(
        {
          headers: { Authorization: `Bearer ${token}` },
          path: { config_id: item.id },
        },
      );
      if (res.error) throw new Error(detailFromError(res.error));
      setEditTarget(res.data ?? null);
      setEditOpen(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("failedToLoadConfiguration"));
    }
  };

  const onSetDefault = async (item: TelephonyConfigurationListItem) => {
    try {
      const token = await getAccessToken();
      const res = await setDefaultOutboundApiV1OrganizationsTelephonyConfigsConfigIdSetDefaultOutboundPost(
        {
          headers: { Authorization: `Bearer ${token}` },
          path: { config_id: item.id },
        },
      );
      if (res.error) throw new Error(detailFromError(res.error));
      toast.success(t("defaultOutboundSet", { name: item.name }));
      fetchItems();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("failedToSetDefault"));
    }
  };

  const onReactivate = async (item: TelephonyConfigurationListItem) => {
    try {
      const token = await getAccessToken();
      const res = await reactivateTelephonyConfigurationApiV1OrganizationsTelephonyConfigsConfigIdReactivatePost(
        {
          headers: { Authorization: `Bearer ${token}` },
          path: { config_id: item.id },
        },
      );
      if (res.error) throw new Error(detailFromError(res.error));
      toast.success(t("reactivatedNamed", { name: item.name }));
      fetchItems();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : t("failedToReactivate"),
      );
    }
  };

  const onConfirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      const token = await getAccessToken();
      const res = await deleteTelephonyConfigurationApiV1OrganizationsTelephonyConfigsConfigIdDelete(
        {
          headers: { Authorization: `Bearer ${token}` },
          path: { config_id: deleteTarget.id },
        },
      );
      if (res.error) throw new Error(detailFromError(res.error));
      toast.success(t("configurationDeleted"));
      setDeleteTarget(null);
      fetchItems();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("failedToDeleteConfiguration"));
    }
  };

  return (
    <>
      <PageLayout title={t("pageTitle")} description={<>{t("pageDescription")}{" "}
        <a
          href="https://docs.dograh.com/integrations/telephony/overview"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-0.5 underline"
        >
          {t("learnMore")} <ExternalLink className="h-3 w-3" />
        </a></>}>
        {telnyxMissingWebhookPublicKeyCount > 0 && (
          <div className="rounded-md border border-amber-300 bg-amber-50 p-4 text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
              <div className="space-y-1 text-sm">
                <p className="font-medium">{t("webhookPublicKeyNotConfigured")}</p>
                <p>
                  {t.rich("telnyxWebhookKeyWarning", {
                    count: telnyxMissingWebhookPublicKeyCount,
                    key: (chunks) => <span className="whitespace-nowrap">{chunks}</span>,
                  })}
                </p>
              </div>
            </div>
          </div>
        )}

        {vonageMissingSignatureSecretCount > 0 && (
          <div className="rounded-md border border-amber-300 bg-amber-50 p-4 text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
              <div className="space-y-1 text-sm">
                <p className="font-medium">{t("signatureSecretNotConfigured")}</p>
                <p>
                  {t("vonageSignatureWarning", { count: vonageMissingSignatureSecretCount })}
                </p>
              </div>
            </div>
          </div>
        )}

        <PageSection title={t("yourConfigurations")}
          description={t("yourConfigurationsDescription")}
          actions={<Button onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4" />{t("addConfiguration")}</Button>}>
          {loading ? (
            <div className="space-y-4">
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          ) : items.length === 0 ? (
            <div className="py-12 text-center">
              <p className="mb-2 font-medium">{t("noConfigurations")}</p>
              <p className="mb-4 text-sm text-muted-foreground">{t("noConfigurationsHint")}</p>
              <Button onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4" />{t("addConfiguration")}</Button>
            </div>
          ) : (
            <div className="space-y-4">
              {items.map((item) => (
                <div key={item.id} className="flex flex-col gap-4 rounded-lg border p-4 sm:flex-row sm:items-center">
                  <Link
                    href={`/telephony-configurations/${item.id}`}
                    className="flex flex-1 items-center gap-4 min-w-0"
                  >
                    <div className="flex flex-col gap-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium truncate">{item.name}</span>
                        <Badge variant="secondary">{item.provider}</Badge>
                        {item.is_default_outbound && (
                          <Badge className="gap-1">
                            <Star className="h-3 w-3 fill-current" />
                            {t("defaultBadge")}
                          </Badge>
                        )}
                        {item.inactive && (
                          <Badge variant="destructive">{t("inactive")}</Badge>
                        )}
                        {!item.inactive && item.is_ready_for_outbound === false && (
                          <Badge
                            variant="outline"
                            className="gap-1 border-amber-400 text-amber-700 dark:border-amber-700 dark:text-amber-400"
                          >
                            <AlertTriangle className="h-3 w-3" />
                            {t("setupIncomplete")}
                          </Badge>
                        )}
                      </div>
                      <span className="text-sm text-muted-foreground">
                        {t("phoneCount", { count: item.phone_number_count })}
                      </span>
                      {item.inactive && (
                        <span className="text-sm text-destructive">
                          {t("disabledAfterFailures")}
                          {item.inactive_reason ? `: ${item.inactive_reason}` : ""}
                        </span>
                      )}
                      {!item.inactive && item.outbound_blocked_reason && (
                        <span className="text-sm text-amber-700 dark:text-amber-500">
                          {item.outbound_blocked_reason}
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          copyTextToClipboard(String(item.id))
                            .then(() => toast.success(t("configurationIdCopied")))
                            .catch(() => toast.error(t("failedToCopyId")));
                        }}
                        title={t("clickToCopy")}
                        className="inline-flex items-center gap-1 self-start rounded font-mono text-xs text-muted-foreground hover:text-foreground"
                      >
                        <span className="truncate">{t("configurationIdLabel", { id: item.id })}</span>
                        <Copy className="h-3 w-3 shrink-0" />
                      </button>
                    </div>
                  </Link>
                  <div className="flex w-full flex-wrap items-center justify-end gap-1 sm:w-auto sm:flex-nowrap">
                    {item.inactive && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onReactivate(item)}
                        title={t("reconnectNow")}
                      >
                        <RotateCcw className="h-4 w-4 mr-1" />
                        {t("reactivate")}
                      </Button>
                    )}
                    {!item.is_default_outbound && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onSetDefault(item)}
                        title={t("setAsDefaultOutbound")}
                      >
                        <Star className="h-4 w-4" />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onEdit(item)}
                      title={t("edit")}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setDeleteTarget(item)}
                      title={t("delete")}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                    <Button variant="outline" size="sm" asChild>
                      <Link
                        href={`/telephony-configurations/${item.id}`}
                        aria-label={t("managePhoneNumbersAria", { name: item.name })}
                      >
                        {t("managePhoneNumbers")}
                        <ChevronRight className="h-4 w-4" />
                      </Link>
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </PageSection>
      </PageLayout>

      <ConfigFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        existing={null}
        suggestDefaultOutbound={!items.some((item) => item.is_default_outbound)}
        onSaved={onSaved}
      />
      <ConfigFormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        existing={editTarget}
        onSaved={onSaved}
      />

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("deleteConfigurationTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("deleteConfigurationDescription", { name: deleteTarget?.name ?? "" })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={onConfirmDelete}>{t("delete")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
