"use client";

import {
  AlertTriangle,
  ArrowLeft,
  Copy,
  ExternalLink,
  Pencil,
  Plus,
  RefreshCw,
  RotateCcw,
  Star,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import {
  deletePhoneNumberApiV1OrganizationsTelephonyConfigsConfigIdPhoneNumbersPhoneNumberIdDelete,
  getTelephonyConfigurationByIdApiV1OrganizationsTelephonyConfigsConfigIdGet,
  listPhoneNumbersApiV1OrganizationsTelephonyConfigsConfigIdPhoneNumbersGet,
  reactivateTelephonyConfigurationApiV1OrganizationsTelephonyConfigsConfigIdReactivatePost,
  setDefaultCallerIdApiV1OrganizationsTelephonyConfigsConfigIdPhoneNumbersPhoneNumberIdSetDefaultCallerPost,
  setDefaultOutboundApiV1OrganizationsTelephonyConfigsConfigIdSetDefaultOutboundPost,
  syncPhoneNumbersApiV1OrganizationsTelephonyConfigsConfigIdPhoneNumbersSyncPost,
} from "@/client/sdk.gen";
import type {
  PhoneNumberResponse,
  TelephonyConfigurationDetail,
} from "@/client/types.gen";
import { PageShell } from "@/components/layout/PageShell";
import { ConfigFormDialog } from "@/components/telephony/ConfigFormDialog";
import { PhoneNumberDialog } from "@/components/telephony/PhoneNumberDialog";
import { SetupChecklistCard } from "@/components/telephony/SetupChecklistCard";
import { SipConnectivityCard } from "@/components/telephony/SipConnectivityCard";
import { TrunkCard } from "@/components/telephony/TrunkCard";
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
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import { copyTextToClipboard } from "@/lib/clipboard";
import { formatDateTime } from "@/lib/dateTime";
import { resolveWebhookBaseUrl } from "@/lib/webhookUrl";

const INBOUND_WEBHOOK_PATH = "/api/v1/telephony/inbound/run";

export default function TelephonyConfigurationDetailPage() {
  const t = useTranslations("Telephony");
  const router = useRouter();
  const params = useParams<{ configId: string }>();
  const configId = Number(params.configId);

  const { user, getAccessToken, loading: authLoading } = useAuth();
  const { config: appConfig } = useAppConfig();
  const { externalPbxIntegrationsEnabled } = useOrgConfig();
  const organizationTimezone = useOrganizationTimezone();
  const [config, setConfig] = useState<TelephonyConfigurationDetail | null>(null);
  const webhookBaseUrl = resolveWebhookBaseUrl(appConfig?.tunnelUrl);
  const inboundWebhookUrl = `${webhookBaseUrl}${INBOUND_WEBHOOK_PATH}`;
  // ARI only: Dograh generates the Stasis application name, so the dialplan
  // line cannot be written until the configuration has been saved.
  const stasisAppName =
    typeof config?.credentials?.stasis_app_name === "string"
      ? config.credentials.stasis_app_name
      : "";
  const stasisDialplanLine = `same => n,Stasis(${stasisAppName})`;
  // WhatsApp only: Meta verifies the webhook with a token Dograh generates on
  // save, and delivers calls to the provider's own route rather than the
  // shared inbound dispatcher — so the customer pastes this pair into Meta.
  const webhookVerifyToken =
    typeof config?.credentials?.webhook_verify_token === "string"
      ? config.credentials.webhook_verify_token
      : "";
  const providerWebhookUrl = `${webhookBaseUrl}/api/v1/telephony/${config?.provider}/webhook`;
  const [phoneNumbers, setPhoneNumbers] = useState<PhoneNumberResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncingNumbers, setSyncingNumbers] = useState(false);
  const [editConfigOpen, setEditConfigOpen] = useState(false);

  const [phoneDialogOpen, setPhoneDialogOpen] = useState(false);
  const [phoneEditTarget, setPhoneEditTarget] = useState<PhoneNumberResponse | null>(
    null,
  );
  const [phoneDeleteTarget, setPhoneDeleteTarget] = useState<PhoneNumberResponse | null>(
    null,
  );
  // Set when the dialog is opened from a trunk, so the number lands on it.
  const [phoneDefaultTrunkId, setPhoneDefaultTrunkId] = useState<number | null>(null);

  const openPhoneDialog = useCallback(
    (target: PhoneNumberResponse | null, trunkId: number | null = null) => {
      setPhoneEditTarget(target);
      setPhoneDefaultTrunkId(trunkId);
      setPhoneDialogOpen(true);
    },
    [],
  );

  const fetchAll = useCallback(async () => {
    if (authLoading || !user || !configId) return;
    setLoading(true);
    try {
      const token = await getAccessToken();
      const [cfgRes, numbersRes] = await Promise.all([
        getTelephonyConfigurationByIdApiV1OrganizationsTelephonyConfigsConfigIdGet({
          headers: { Authorization: `Bearer ${token}` },
          path: { config_id: configId },
        }),
        listPhoneNumbersApiV1OrganizationsTelephonyConfigsConfigIdPhoneNumbersGet({
          headers: { Authorization: `Bearer ${token}` },
          path: { config_id: configId },
        }),
      ]);

      if (cfgRes.error) throw new Error(detailFromError(cfgRes.error));
      if (numbersRes.error) throw new Error(detailFromError(numbersRes.error));

      setConfig(cfgRes.data ?? null);
      setPhoneNumbers(numbersRes.data?.phone_numbers ?? []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("failedToLoadConfiguration"));
    } finally {
      setLoading(false);
    }
  }, [authLoading, user, configId, getAccessToken]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const onSetDefaultOutbound = async () => {
    if (!config) return;
    try {
      const token = await getAccessToken();
      const res = await setDefaultOutboundApiV1OrganizationsTelephonyConfigsConfigIdSetDefaultOutboundPost(
        {
          headers: { Authorization: `Bearer ${token}` },
          path: { config_id: config.id },
        },
      );
      if (res.error) throw new Error(detailFromError(res.error));
      toast.success(t("setAsDefaultOutbound"));
      fetchAll();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("failedToSetDefault"));
    }
  };

  const onReactivate = async () => {
    if (!config) return;
    try {
      const token = await getAccessToken();
      const res = await reactivateTelephonyConfigurationApiV1OrganizationsTelephonyConfigsConfigIdReactivatePost(
        {
          headers: { Authorization: `Bearer ${token}` },
          path: { config_id: config.id },
        },
      );
      if (res.error) throw new Error(detailFromError(res.error));
      toast.success(t("reactivated"));
      fetchAll();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : t("failedToReactivate"),
      );
    }
  };

  const onSetDefaultCaller = async (n: PhoneNumberResponse) => {
    try {
      const token = await getAccessToken();
      const res = await setDefaultCallerIdApiV1OrganizationsTelephonyConfigsConfigIdPhoneNumbersPhoneNumberIdSetDefaultCallerPost(
        {
          headers: { Authorization: `Bearer ${token}` },
          path: { config_id: configId, phone_number_id: n.id },
        },
      );
      if (res.error) throw new Error(detailFromError(res.error));
      toast.success(t("defaultCallerSet", { address: n.address }));
      fetchAll();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("failedToSetDefaultCaller"));
    }
  };

  // Import the provider account's numbers. Nothing is removed on our side:
  // numbers the provider no longer lists are reported so the operator decides.
  const onSyncPhoneNumbers = async () => {
    if (!config) return;
    setSyncingNumbers(true);
    try {
      const token = await getAccessToken();
      const res = await syncPhoneNumbersApiV1OrganizationsTelephonyConfigsConfigIdPhoneNumbersSyncPost(
        {
          headers: { Authorization: `Bearer ${token}` },
          path: { config_id: config.id },
        },
      );
      if (res.error) throw new Error(detailFromError(res.error));
      const outcome = res.data;
      const created = outcome?.created.length ?? 0;
      const updated = outcome?.updated.length ?? 0;
      const skipped = outcome?.skipped ?? [];
      const missing = outcome?.missing_at_provider ?? [];
      const parts = [
        t("numbersAddedCount", { count: created }),
        t("numbersRefreshedCount", { count: updated }),
        ...(skipped.length > 0 ? [t("numbersSkippedCount", { count: skipped.length })] : []),
      ];
      toast.success(t("numbersRefreshed", { parts: parts.join(", ") }));
      for (const s of skipped) {
        toast.warning(t("numberSkipped", { address: s.address, reason: s.reason }));
      }
      if (missing.length > 0) {
        toast.warning(
          t("numbersMissingAtProvider", {
            count: missing.length,
            addresses: missing.map((n) => n.address).join(", "),
          }),
        );
      }
      fetchAll();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("failedToRefreshNumbers"));
    } finally {
      setSyncingNumbers(false);
    }
  };

  const onConfirmDeletePhone = async () => {
    if (!phoneDeleteTarget) return;
    try {
      const token = await getAccessToken();
      const res = await deletePhoneNumberApiV1OrganizationsTelephonyConfigsConfigIdPhoneNumbersPhoneNumberIdDelete(
        {
          headers: { Authorization: `Bearer ${token}` },
          path: {
            config_id: configId,
            phone_number_id: phoneDeleteTarget.id,
          },
        },
      );
      if (res.error) throw new Error(detailFromError(res.error));
      toast.success(t("phoneNumberDeleted"));
      setPhoneDeleteTarget(null);
      fetchAll();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("failedToDeletePhoneNumber"));
    }
  };

  if (loading) {
    return (
      <PageShell className="space-y-3">
        <Skeleton className="h-10 w-1/3" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </PageShell>
    );
  }

  if (!config) {
    return (
      <PageShell>
        <Button variant="ghost" onClick={() => router.push("/telephony-configurations")}>
          <ArrowLeft className="h-4 w-4 mr-2" /> {t("back")}
        </Button>
        <p className="mt-4 text-muted-foreground">{t("configurationNotFound")}</p>
      </PageShell>
    );
  }

  return (
    <PageShell className="space-y-6">
      <div>
        <Link
          href="/telephony-configurations"
          className="inline-flex items-center text-sm text-muted-foreground hover:underline"
        >
          <ArrowLeft className="h-4 w-4 mr-1" /> {t("allConfigurations")}
        </Link>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div className="space-y-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <CardTitle className="truncate">{config.name}</CardTitle>
              <Badge variant="secondary">{config.provider}</Badge>
              {config.is_default_outbound && (
                <Badge className="gap-1">
                  <Star className="h-3 w-3 fill-current" />
                  {t("defaultBadge")}
                </Badge>
              )}
              {config.inactive && <Badge variant="destructive">{t("inactive")}</Badge>}
            </div>
            <CardDescription>
              {t("updatedAt", { date: formatDateTime(config.updated_at, organizationTimezone) })}
            </CardDescription>
            <button
              type="button"
              onClick={() => {
                copyTextToClipboard(String(config.id))
                  .then(() => toast.success(t("configurationIdCopied")))
                  .catch(() => toast.error(t("failedToCopyId")));
              }}
              title={t("clickToCopy")}
              className="inline-flex items-center gap-1 self-start rounded font-mono text-xs text-muted-foreground hover:text-foreground"
            >
              <span className="truncate">{t("configurationIdLabel", { id: config.id })}</span>
              <Copy className="h-3 w-3 shrink-0" />
            </button>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {config.inactive && (
              <Button variant="outline" size="sm" onClick={onReactivate}>
                <RotateCcw className="h-4 w-4 mr-2" /> {t("reactivate")}
              </Button>
            )}
            {!config.is_default_outbound && config.supports_outbound !== false && (
              <Button variant="outline" size="sm" onClick={onSetDefaultOutbound}>
                <Star className="h-4 w-4 mr-2" /> {t("setAsDefault")}
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => setEditConfigOpen(true)}>
              <Pencil className="h-4 w-4 mr-2" /> {t("editCredentials")}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {config.inactive && (
            <div className="rounded-md border border-destructive/40 bg-destructive/5 p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5 text-destructive" />
                <div className="space-y-1 text-sm">
                  <p className="font-medium text-destructive">
                    {t("configDisabledTitle")}
                  </p>
                  <p className="text-muted-foreground">
                    {t("configDisabledBody", { reason: config.inactive_reason ? `: ${config.inactive_reason}` : "" })}
                  </p>
                  {config.inactive_since && (
                    <p className="text-muted-foreground">
                      {t("disabledAt", { date: formatDateTime(config.inactive_since, organizationTimezone) })}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}
          <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
            {Object.entries(config.credentials ?? {})
              .filter(([key]) => key !== "external_pbx" || externalPbxIntegrationsEnabled)
              .filter(([key]) => key !== "stasis_app_name" && key !== "webhook_verify_token")
              .map(([k, v]) => (
                <div key={k} className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">{k}</dt>
                  <dd className="font-mono text-right truncate max-w-[60%]">
                    {v && typeof v === "object" ? t("configured") : String(v ?? "")}
                  </dd>
                </div>
              ))}
          </dl>
          {stasisAppName && (
            <div className="space-y-1 rounded-md border border-dashed p-3">
              <p className="text-sm font-medium">{t("stasisTitle")}</p>
              <p className="text-xs text-muted-foreground">
                {t.rich("stasisHint", { code: (chunks) => <code>{chunks}</code> })}
              </p>
              <button
                type="button"
                onClick={() => {
                  copyTextToClipboard(stasisDialplanLine)
                    .then(() => toast.success(t("dialplanCopied")))
                    .catch(() => toast.error(t("failedToCopy")));
                }}
                title={t("clickToCopy")}
                className="group mt-1 flex w-full items-center gap-2 rounded-md border bg-muted/20 p-2 text-left font-mono text-xs transition-colors hover:bg-muted/40"
              >
                <code className="flex-1 truncate">{stasisDialplanLine}</code>
                <Copy className="h-3 w-3 shrink-0 text-muted-foreground group-hover:text-foreground" />
              </button>
            </div>
          )}
          {webhookVerifyToken ? (
            <div className="space-y-2 rounded-md border border-dashed p-3">
              <p className="text-sm font-medium">{t("metaWebhookTitle")}</p>
              <p className="text-xs text-muted-foreground">
                {t.rich("metaWebhookHint", { code: (chunks) => <code>{chunks}</code> })}
              </p>
              {[
                { label: t("callbackUrl"), value: providerWebhookUrl },
                { label: t("verifyToken"), value: webhookVerifyToken },
              ].map(({ label, value }) => (
                <div key={label} className="space-y-1">
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <button
                    type="button"
                    onClick={() => {
                      copyTextToClipboard(value)
                        .then(() => toast.success(t("copiedLabel", { label })))
                        .catch(() => toast.error(t("failedToCopy")));
                    }}
                    title={t("clickToCopy")}
                    className="group flex w-full items-center gap-2 rounded-md border bg-muted/20 p-2 text-left font-mono text-xs transition-colors hover:bg-muted/40"
                  >
                    <code className="flex-1 truncate">{value}</code>
                    <Copy className="h-3 w-3 shrink-0 text-muted-foreground group-hover:text-foreground" />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">{t("inboundWebhookUrl")}</p>
              <button
                type="button"
                onClick={() => {
                  const url = inboundWebhookUrl;
                  copyTextToClipboard(url)
                    .then(() => toast.success(t("inboundWebhookUrlCopied")))
                    .catch(() => toast.error(t("failedToCopyUrl")));
                }}
                title={t("clickToCopyInboundWebhook")}
                aria-label={t("copyInboundWebhookAria")}
                className="inline-flex items-center gap-1 self-start rounded font-mono text-xs text-muted-foreground hover:text-foreground"
              >
                <span className="truncate">{inboundWebhookUrl}</span>
                <Copy className="h-3 w-3 shrink-0" />
              </button>
            </div>
          )}
        </CardContent>
      </Card>

      {config.setup_checklist ? (
        <SetupChecklistCard
          checklist={config.setup_checklist}
          connectivity={config.connectivity}
        />
      ) : null}

      {config.sip_connectivity?.regions.length ? (
        <SipConnectivityCard
          details={config.sip_connectivity}
          // The checklist sends the user in here for the endpoints to hand
          // their carrier, so don't make them find the toggle first.
          defaultOpen={config.setup_checklist?.ready_for_outbound === false}
        />
      ) : null}

      {config.supports_trunks ? (
        <TrunkCard
          configuration={config}
          phoneNumbers={phoneNumbers}
          onChanged={fetchAll}
          onAddPhoneNumber={(trunk) => openPhoneDialog(null, trunk.id)}
          onEditPhoneNumber={(number) => openPhoneDialog(number)}
        />
      ) : null}

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div className="space-y-1">
            <CardTitle>{t("phoneNumbersTitle")}</CardTitle>
            <CardDescription>
              {config.supports_outbound === false
                ? t("phoneNumbersInboundOnlyDescription")
                : t("phoneNumbersDescription")}{" "}
              <a
                href="https://docs.dograh.com/integrations/telephony/inbound"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-0.5 underline"
              >
                {t("inboundDocs")} <ExternalLink className="h-3 w-3" />
              </a>
            </CardDescription>
          </div>
          <div className="flex shrink-0 gap-2">
            {config.supports_phone_number_sync && (
              <Button
                size="sm"
                variant="outline"
                onClick={onSyncPhoneNumbers}
                disabled={syncingNumbers}
              >
                <RefreshCw
                  className={`h-4 w-4 mr-2 ${syncingNumbers ? "animate-spin" : ""}`}
                />
                {t("refreshNumbers")}
              </Button>
            )}
            <Button size="sm" onClick={() => openPhoneDialog(null)}>
              <Plus className="h-4 w-4 mr-2" /> {t("addPhoneNumber")}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {phoneNumbers.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {config.supports_phone_number_sync
                ? t("noPhoneNumbersWithSync", {
                    mode: t(config.supports_outbound === false ? "callsReceiving" : "callsPlacingOrReceiving"),
                  })
                : t("noPhoneNumbersAdd", {
                    mode: t(config.supports_outbound === false ? "callsReceiving" : "callsPlacingOrReceiving"),
                  })}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("address")}</TableHead>
                  <TableHead>{t("phoneNumberId")}</TableHead>
                  <TableHead>{t("type")}</TableHead>
                  <TableHead>{t("label")}</TableHead>
                  <TableHead>{t("status")}</TableHead>
                  <TableHead>{t("inboundWorkflow")}</TableHead>
                  {(config.trunks?.length ?? 0) > 0 && (
                    <TableHead>{t("outboundTrunk")}</TableHead>
                  )}
                  <TableHead className="text-right">{t("actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {phoneNumbers.map((n) => (
                  <TableRow key={n.id}>
                    <TableCell className="font-mono">{n.address}</TableCell>
                    <TableCell>
                      <button
                        type="button"
                        onClick={() => {
                          copyTextToClipboard(String(n.id))
                            .then(() => toast.success(t("phoneNumberIdCopied")))
                            .catch(() => toast.error(t("failedToCopyId")));
                        }}
                        title={t("clickToCopyPhoneNumberId")}
                        aria-label={t("copyPhoneNumberIdAria", { id: n.id })}
                        className="group inline-flex items-center gap-1 rounded font-mono text-xs text-muted-foreground hover:text-foreground"
                      >
                        <span>{n.id}</span>
                        <Copy className="h-3 w-3 shrink-0" />
                      </button>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{n.address_type}</Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {n.label ?? "-"}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {n.is_active ? (
                          <Badge variant="secondary">{t("active")}</Badge>
                        ) : (
                          <Badge variant="outline">{t("inactive")}</Badge>
                        )}
                        {n.is_default_caller_id && (
                          <Badge className="gap-1">
                            <Star className="h-3 w-3 fill-current" /> {t("defaultCaller")}
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {n.inbound_workflow_id ? (
                        <Link
                          href={`/workflow/${n.inbound_workflow_id}`}
                          className="inline-flex items-center gap-1 hover:underline hover:text-foreground"
                        >
                          <span>#{n.inbound_workflow_id}</span>
                          {n.inbound_workflow_name && (
                            <span
                              className="truncate max-w-[160px]"
                              title={n.inbound_workflow_name}
                            >
                              {n.inbound_workflow_name.length > 24
                                ? `${n.inbound_workflow_name.slice(0, 24)}…`
                                : n.inbound_workflow_name}
                            </span>
                          )}
                        </Link>
                      ) : (
                        "-"
                      )}
                    </TableCell>
                    {(config.trunks?.length ?? 0) > 0 && (
                      <TableCell className="text-muted-foreground">
                        {/* Unassigned is only ambiguous once there are
                            several trunks; with one the call path falls
                            back to it. */}
                        {config.trunks?.find(
                          (t) => t.id === n.telephony_trunk_id,
                        )?.name ?? (
                          <span
                            className={
                              (config.trunks?.length ?? 0) > 1
                                ? "text-amber-600 dark:text-amber-500"
                                : undefined
                            }
                          >
                            {t("unassigned")}
                          </span>
                        )}
                      </TableCell>
                    )}
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        {!n.is_default_caller_id &&
                          n.is_active &&
                          config.supports_outbound !== false && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => onSetDefaultCaller(n)}
                            title={t("setAsDefaultCallerId")}
                          >
                            <Star className="h-4 w-4" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openPhoneDialog(n)}
                          title={t("edit")}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setPhoneDeleteTarget(n)}
                          title={t("delete")}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <ConfigFormDialog
        open={editConfigOpen}
        onOpenChange={setEditConfigOpen}
        existing={config}
        onSaved={fetchAll}
      />

      <PhoneNumberDialog
        open={phoneDialogOpen}
        onOpenChange={setPhoneDialogOpen}
        configId={configId}
        supportsOutbound={config?.supports_outbound !== false}
        trunks={config?.trunks}
        defaultTrunkId={phoneDefaultTrunkId}
        existing={phoneEditTarget}
        onSaved={fetchAll}
      />

      <AlertDialog
        open={!!phoneDeleteTarget}
        onOpenChange={(o) => !o && setPhoneDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("deletePhoneNumberTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("deletePhoneNumberDescription", { address: phoneDeleteTarget?.address ?? "" })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={onConfirmDeletePhone}>{t("delete")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageShell>
  );
}
