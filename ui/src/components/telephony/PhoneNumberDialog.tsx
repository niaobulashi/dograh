"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import {
  createPhoneNumberApiV1OrganizationsTelephonyConfigsConfigIdPhoneNumbersPost,
  getWorkflowsSummaryApiV1WorkflowSummaryGet,
  updatePhoneNumberApiV1OrganizationsTelephonyConfigsConfigIdPhoneNumbersPhoneNumberIdPut,
} from "@/client/sdk.gen";
import type { PhoneNumberResponse, TrunkResponse } from "@/client/types.gen";
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
import { Switch } from "@/components/ui/switch";
import { detailFromError } from "@/lib/apiError";
import { useAuth } from "@/lib/auth";

interface PhoneNumberDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  configId: number;
  /** False for a provider that only receives calls: a number on it is never a
      caller ID, so the default-caller choice is not offered. */
  supportsOutbound?: boolean;
  /** Carrier paths on this configuration; empty for providers without trunks. */
  trunks?: TrunkResponse[];
  /** Preselected trunk when creating — set when the dialog is opened from a
      trunk rather than from the flat numbers table. */
  defaultTrunkId?: number | null;
  existing?: PhoneNumberResponse | null;
  onSaved: () => void;
}

const NO_WORKFLOW = "__none__";
const NO_TRUNK = "__no_trunk__";

// Mirrors api/schemas/telephony_phone_number.py::_validate_address_shape and
// api/utils/telephony_address.py — keep in sync. Returns an error message
// when the address would normalize to a broken canonical form, or null when
// the input is acceptable.
const ADDRESS_FORMAT_STRIP_RE = /[\s\-()]/g;
const ADDRESS_E164_RE = /^\+\d{8,15}$/;
const ADDRESS_BARE_DIGITS_RE = /^\d{8,15}$/;

type TranslationFn = (key: string, values?: Record<string, string | number>) => string;

function validateAddress(rawAddress: string, countryCode: string, t: TranslationFn): string | null {
  const trimmed = rawAddress.trim();
  if (!trimmed) return t("addressRequired");
  if (/^sips?:/i.test(trimmed)) return null;
  const stripped = trimmed.replace(ADDRESS_FORMAT_STRIP_RE, "");
  if (ADDRESS_E164_RE.test(stripped)) return null;
  if (ADDRESS_BARE_DIGITS_RE.test(stripped) && !countryCode.trim()) {
    return t("addressHintError");
  }
  return null;
}

export function PhoneNumberDialog({
  open,
  onOpenChange,
  configId,
  supportsOutbound = true,
  trunks = [],
  defaultTrunkId = null,
  existing,
  onSaved,
}: PhoneNumberDialogProps) {
  const t = useTranslations("Telephony");
  const { user, getAccessToken } = useAuth();
  const isEdit = !!existing;

  const [address, setAddress] = useState("");
  const [countryCode, setCountryCode] = useState("");
  const [label, setLabel] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [isDefaultCallerId, setIsDefaultCallerId] = useState(false);
  const [inboundWorkflowId, setInboundWorkflowId] = useState<string>(NO_WORKFLOW);
  const [trunkId, setTrunkId] = useState<string>(NO_TRUNK);
  const [workflows, setWorkflows] = useState<{ id: number; name: string }[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [addressTouched, setAddressTouched] = useState(false);

  // Reset form when the dialog opens.
  useEffect(() => {
    if (!open) return;
    setAddress(existing?.address ?? "");
    setCountryCode(existing?.country_code ?? "");
    setLabel(existing?.label ?? "");
    setIsActive(existing?.is_active ?? true);
    setIsDefaultCallerId(existing?.is_default_caller_id ?? false);
    setInboundWorkflowId(
      existing?.inbound_workflow_id ? String(existing.inbound_workflow_id) : NO_WORKFLOW,
    );
    const initialTrunkId = existing
      ? existing.telephony_trunk_id
      : (defaultTrunkId ?? null);
    setTrunkId(initialTrunkId ? String(initialTrunkId) : NO_TRUNK);
    setAddressTouched(false);
  }, [open, existing, defaultTrunkId]);

  // Only validate the address on create — edits keep the immutable address.
  const addressError = isEdit ? null : validateAddress(address, countryCode, t);

  // Load workflows for the inbound dropdown.
  useEffect(() => {
    if (!open || !user) return;
    let cancelled = false;
    (async () => {
      const token = await getAccessToken();
      const res = await getWorkflowsSummaryApiV1WorkflowSummaryGet({
        headers: { Authorization: `Bearer ${token}` },
        query: { status: "active" },
      });
      if (cancelled) return;
      const items = res.data ?? [];
      setWorkflows(items.map((w) => ({ id: w.id, name: w.name })));
    })();
    return () => {
      cancelled = true;
    };
  }, [open, user, getAccessToken]);

  const handleSubmit = async () => {
    if (!isEdit) {
      const err = validateAddress(address, countryCode, t);
      if (err) {
        setAddressTouched(true);
        toast.error(err);
        return;
      }
    }
    setSubmitting(true);
    try {
      const token = await getAccessToken();
      const inboundId =
        inboundWorkflowId === NO_WORKFLOW ? null : Number(inboundWorkflowId);
      const selectedTrunkId = trunkId === NO_TRUNK ? null : Number(trunkId);

      let providerSync: PhoneNumberResponse["provider_sync"] | undefined;
      if (isEdit && existing) {
        const res = await updatePhoneNumberApiV1OrganizationsTelephonyConfigsConfigIdPhoneNumbersPhoneNumberIdPut(
          {
            headers: { Authorization: `Bearer ${token}` },
            path: { config_id: configId, phone_number_id: existing.id },
            body: {
              label: label || undefined,
              is_active: isActive,
              country_code: countryCode || undefined,
              inbound_workflow_id: inboundId ?? undefined,
              clear_inbound_workflow: inboundId === null,
              telephony_trunk_id: selectedTrunkId ?? undefined,
              clear_trunk: selectedTrunkId === null,
            },
          },
        );
        if (res.error) throw new Error(detailFromError(res.error, t("failedToSavePhoneNumber")));
        providerSync = res.data?.provider_sync;
        toast.success(t("phoneNumberUpdated"));
      } else {
        const res = await createPhoneNumberApiV1OrganizationsTelephonyConfigsConfigIdPhoneNumbersPost(
          {
            headers: { Authorization: `Bearer ${token}` },
            path: { config_id: configId },
            body: {
              address: address.trim(),
              country_code: countryCode || undefined,
              label: label || undefined,
              is_active: isActive,
              is_default_caller_id: supportsOutbound && isDefaultCallerId,
              inbound_workflow_id: inboundId ?? undefined,
              telephony_trunk_id: selectedTrunkId ?? undefined,
            },
          },
        );
        if (res.error) throw new Error(detailFromError(res.error, t("failedToSavePhoneNumber")));
        providerSync = res.data?.provider_sync;
        toast.success(t("phoneNumberAdded"));
      }
      if (providerSync && !providerSync.ok) {
        toast.warning(
          providerSync.message ?? t("providerSyncFailed"),
        );
      }
      onOpenChange(false);
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("failedToSavePhoneNumber"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? t("editPhoneNumberTitle") : t("addPhoneNumber")}
          </DialogTitle>
          <DialogDescription>
            {t("phoneDialogDescription")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="pn-address">{t("address")}</Label>
            <Input
              id="pn-address"
              placeholder={t("addressPlaceholder")}
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              onBlur={() => setAddressTouched(true)}
              disabled={isEdit}
              aria-invalid={addressTouched && !!addressError}
            />
            {!isEdit && addressTouched && addressError && (
              <p className="text-xs text-destructive">{addressError}</p>
            )}
            {isEdit && (
              <p className="text-xs text-muted-foreground">
                {t("addressImmutable")}
              </p>
            )}
            {isEdit && (
              <p className="text-xs text-muted-foreground">
                {t.rich("storedAs", {
                  normalized: existing?.address_normalized ?? "",
                  type: existing?.address_type ?? "",
                  code: (chunks) => <code>{chunks}</code>,
                })}
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="pn-country">{t("countryLabel")}</Label>
              <Input
                id="pn-country"
                placeholder="US"
                maxLength={2}
                value={countryCode}
                onChange={(e) => setCountryCode(e.target.value.toUpperCase())}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="pn-label">{t("label")}</Label>
              <Input
                id="pn-label"
                placeholder={t("labelPlaceholder")}
                value={label}
                onChange={(e) => setLabel(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="pn-workflow">{t("inboundWorkflow")}</Label>
            <Select value={inboundWorkflowId} onValueChange={setInboundWorkflowId}>
              <SelectTrigger id="pn-workflow">
                <SelectValue placeholder={t("none")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_WORKFLOW}>{t("none")}</SelectItem>
                {workflows.map((w) => (
                  <SelectItem key={w.id} value={String(w.id)}>
                    #{w.id} - {w.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {t("inboundWorkflowHint")}
            </p>
          </div>

          {trunks.length > 0 && (
            <div className="space-y-1">
              <Label htmlFor="pn-trunk">{t("outboundTrunk")}</Label>
              <Select value={trunkId} onValueChange={setTrunkId}>
                <SelectTrigger id="pn-trunk">
                  <SelectValue placeholder={t("none")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_TRUNK}>{t("none")}</SelectItem>
                  {trunks.map((trunk) => (
                    <SelectItem key={trunk.id} value={String(trunk.id)}>
                      {trunk.name}
                      {trunk.enabled ? "" : t("disabledSuffix")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {trunks.length > 1
                  ? t("trunkHintMultiple")
                  : t("trunkHintSingle")}
              </p>
            </div>
          )}

          <div className="flex items-center justify-between rounded border p-3">
            <Label className="text-sm">{t("active")}</Label>
            <Switch checked={isActive} onCheckedChange={setIsActive} />
          </div>

          {!isEdit && supportsOutbound && (
            <div className="flex items-center justify-between rounded border p-3">
              <div>
                <Label className="text-sm">{t("defaultCallerIdLabel")}</Label>
                <p className="text-xs text-muted-foreground">
                  {t("defaultCallerIdHint")}
                </p>
              </div>
              <Switch
                checked={isDefaultCallerId}
                onCheckedChange={setIsDefaultCallerId}
              />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            {t("cancel")}
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={submitting || (!isEdit && !!addressError)}
          >
            {submitting ? t("savingEllipsis") : isEdit ? t("saveChanges") : t("add")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
