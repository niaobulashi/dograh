"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";

import {
  savePreferencesApiV1OrganizationsPreferencesPut,
  testCallEventsConnectionApiV1OrganizationsCallEventsTestPost,
} from "@/client/sdk.gen";
import type { CallEventsSettings } from "@/client/types.gen";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useOrgConfig } from "@/context/OrgConfigContext";
import { detailFromError } from "@/lib/apiError";
import { useAuth } from "@/lib/auth";

type DestinationFieldsProps = {
  config: Record<string, unknown>;
  onChange: (config: Record<string, unknown>) => void;
  deploymentIdentityAvailable: boolean;
};

function BigQueryFields({ config, onChange, deploymentIdentityAvailable }: DestinationFieldsProps) {
  const t = useTranslations("Shared");
  const authMode = config.auth_mode === "application_default" ? "application_default" : "service_account";
  const update = (field: string, value: string) => onChange({ ...config, [field]: value });
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="call-events-table">{t("table")}</Label>
        <Input id="call-events-table" placeholder="project.dataset.table" value={String(config.table ?? "")} onChange={(e) => update("table", e.target.value)} required />
        <p className="text-sm text-muted-foreground">{t("tableHint")}</p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="call-events-auth">{t("authentication")}</Label>
        <Select value={authMode} onValueChange={(value) => onChange({ table: config.table ?? "", auth_mode: value })}>
          <SelectTrigger id="call-events-auth"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="service_account">{t("serviceAccount")}</SelectItem>
            {deploymentIdentityAvailable && <SelectItem value="application_default">{t("deploymentIdentity")}</SelectItem>}
          </SelectContent>
        </Select>
      </div>
      {authMode === "service_account" ? (
        <>
          <div className="space-y-2">
            <Label htmlFor="call-events-email">{t("serviceAccountEmail")}</Label>
            <Input id="call-events-email" type="email" autoComplete="off" placeholder="account@project.iam.gserviceaccount.com" value={String(config.client_email ?? "")} onChange={(e) => update("client_email", e.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="call-events-key">{t("privateKey")}</Label>
            <Textarea id="call-events-key" autoComplete="off" spellCheck={false} placeholder={t("privateKeyPlaceholder")} value={String(config.private_key ?? "")} onChange={(e) => update("private_key", e.target.value.replaceAll("\\n", "\n"))} required className="font-mono text-xs" />
            <p className="text-sm text-muted-foreground">{t("savedKeysMasked")}</p>
          </div>
        </>
      ) : <p className="text-sm text-muted-foreground">{t("usesGoogleIdentity")}</p>}
      <p className="text-sm text-muted-foreground">{t("identityPermission")}</p>
    </div>
  );
}

// Each destination owns its fields. Adding a sink does not change event capture.
const destinations = {
  bigquery: { label: "BigQuery", Fields: BigQueryFields },
};

export function CallEventsSection() {
  const t = useTranslations("Shared");
  const { user, loading: authLoading, provider } = useAuth();
  const { orgContext, organizationPreferences, loading: orgLoading, error, refreshConfig } = useOrgConfig();
  if (authLoading || orgLoading || !user) {
    return <p className="text-sm text-muted-foreground">{t("loadingCallEventSettings")}</p>;
  }
  if (error || !orgContext?.organization_id || !organizationPreferences) {
    return <div className="space-y-2"><p role="alert">{error?.message ?? t("couldNotLoadOrgSettings")}</p><Button variant="outline" onClick={() => void refreshConfig()}>{t("retry")}</Button></div>;
  }
  return <CallEventsForm key={orgContext.organization_id} initialSettings={organizationPreferences.call_events} deploymentIdentityAvailable={provider === "local"} />;
}

function formSettings(settings: CallEventsSettings): CallEventsSettings {
  return { enabled: settings.enabled, sink_type: settings.sink_type ?? "bigquery", config: settings.config ?? {} };
}

function CallEventsForm({ initialSettings, deploymentIdentityAvailable }: {
  initialSettings: CallEventsSettings;
  deploymentIdentityAvailable: boolean;
}) {
  const t = useTranslations("Shared");
  const { refreshConfig } = useOrgConfig();
  const [settings, setSettings] = useState<CallEventsSettings>(() => formSettings(initialSettings));
  const [busy, setBusy] = useState(false);

  async function run(action: "save" | "test" | "remove") {
    setBusy(true);
    try {
      if (action === "test") {
        const { data, error } = await testCallEventsConnectionApiV1OrganizationsCallEventsTestPost({ body: settings });
        if (error || !data) throw new Error(detailFromError(error, t("connectionCheckFailed")));
        toast.success(data.message);
      } else {
        const { data, error } = await savePreferencesApiV1OrganizationsPreferencesPut({
          body: { call_events: action === "save" ? settings : null },
        });
        if (error || !data) throw new Error(detailFromError(error, t("couldNotUpdateCallEventSettings")));
        setSettings(formSettings(data.call_events));
        await refreshConfig();
        toast.success(action === "save" ? t("callEventSettingsSaved") : t("callEventDestinationRemoved"));
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("requestFailed"));
    } finally {
      setBusy(false);
    }
  }

  const destination = destinations[settings.sink_type as keyof typeof destinations];
  return (
    <form onSubmit={(event) => { event.preventDefault(); void run("save"); }}>
      <fieldset disabled={busy} className="space-y-4">
        <div className="flex items-center gap-2">
          <Switch id="call-events-enabled" checked={settings.enabled ?? false} onCheckedChange={(enabled) => setSettings({ ...settings, enabled })} />
          <Label htmlFor="call-events-enabled">{t("exportCallEvents")}</Label>
        </div>
        <p className="text-sm text-muted-foreground">{t("sendCallDiagnostics")}</p>
        <div className="space-y-2">
          <Label htmlFor="call-events-destination">{t("destination")}</Label>
          <Select value={settings.sink_type ?? "bigquery"} onValueChange={(sink_type) => setSettings({ ...settings, sink_type, config: {} })}>
            <SelectTrigger id="call-events-destination"><SelectValue /></SelectTrigger>
            <SelectContent>{Object.entries(destinations).map(([value, item]) => <SelectItem key={value} value={value}>{item.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        {destination && <destination.Fields config={settings.config ?? {}} deploymentIdentityAvailable={deploymentIdentityAvailable} onChange={(config) => setSettings({ ...settings, config })} />}
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={!destination}>{busy ? t("working") : t("save")}</Button>
          <Button type="button" variant="outline" disabled={!destination} onClick={() => void run("test")}>{t("testConnection")}</Button>
          <Button type="button" variant="ghost" onClick={() => void run("remove")}>{t("remove")}</Button>
        </div>
      </fieldset>
    </form>
  );
}
