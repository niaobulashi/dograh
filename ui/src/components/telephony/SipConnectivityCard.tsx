"use client";

import { ChevronDown, Copy } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";

import type { SipConnectivityDetails } from "@/client/types.gen";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { copyTextToClipboard } from "@/lib/clipboard";

interface SipConnectivityCardProps {
  details: SipConnectivityDetails;
  /** Start expanded — used when the setup checklist points the user in here. */
  defaultOpen?: boolean;
}

/**
 * The endpoints a customer hands to their carrier: where to send calls in, and
 * which IP calls leave from. Read-only reference material, hence the fold —
 * the trunks that use it are edited in their own card, always visible.
 */
export function SipConnectivityCard({
  details,
  defaultOpen = false,
}: SipConnectivityCardProps) {
  const t = useTranslations("Telephony");
  const [open, setOpen] = useState(defaultOpen);
  const [selectedRegion, setSelectedRegion] = useState<string>();
  const defaultRegion =
    details.regions.find(
      (candidate) => candidate.region.toLowerCase() === "global",
    ) ?? details.regions[0];
  const region =
    details.regions.find((candidate) => candidate.region === selectedRegion) ??
    defaultRegion;

  if (!region) return null;

  // A region's transports all share one hostname and differ only by port, and
  // UDP/TCP usually share that too — so the endpoint is one hostname plus a
  // short port list ("UDP/TCP 9060", "TLS 9443"), not a row per transport.
  const inboundHostname = region.inbound_transports[0]?.hostname;
  const portGroups = region.inbound_transports.reduce<
    { port: number; transports: string[] }[]
  >((groups, transport) => {
    const group = groups.find((candidate) => candidate.port === transport.port);
    if (group) group.transports.push(transport.transport);
    else groups.push({ port: transport.port, transports: [transport.transport] });
    return groups;
  }, []);

  const copyValue = (value: string, label: string) => {
    copyTextToClipboard(value)
      .then(() => toast.success(t("copiedLabel", { label })))
      .catch(() => toast.error(t("failedToCopyLabel", { label: label.toLowerCase() })));
  };

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div className="space-y-1">
            <CardTitle>{t("sipConnectivity")}</CardTitle>
            <CardDescription>
              {t("sipConnectivityDescription")}
            </CardDescription>
          </div>
          <CollapsibleTrigger asChild>
            <Button variant="outline" size="sm" className="shrink-0">
              {open ? t("hideDetails") : t("viewDetails")}
              <ChevronDown
                className={`ml-2 h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`}
              />
            </Button>
          </CollapsibleTrigger>
        </CardHeader>

        <CollapsibleContent>
          <CardContent className="space-y-6 border-t pt-6">
            <div className="max-w-xs space-y-2">
              <p className="flex items-center gap-2 text-sm font-medium">
                {t("selectRegion")}
                {/* Every endpoint below is region-specific, so the picker is
                    easy to walk past and read the wrong hostnames from. */}
                <span aria-hidden className="relative flex h-3 w-3 shrink-0">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-blue-500" />
                </span>
              </p>
              <Select value={region.region} onValueChange={setSelectedRegion}>
                <SelectTrigger aria-label={t("sipRegionAria")}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {details.regions.map((candidate) => (
                    <SelectItem key={candidate.region} value={candidate.region}>
                      {candidate.region}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <section className="overflow-hidden rounded-md border">
              <div className="border-b bg-muted/20 p-4">
                <h3 className="font-semibold">{t("inbound")}</h3>
                <p className="text-sm text-muted-foreground">
                  {t("inboundDescription", { provider: details.provider_display_name })}
                </p>
              </div>
              <div className="space-y-3 p-4">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md bg-muted/30 px-3 py-2 text-sm">
                  <span className="text-muted-foreground">{t("hostname")}</span>
                  {inboundHostname ? (
                    <button
                      type="button"
                      onClick={() => copyValue(inboundHostname, t("hostname"))}
                      title={t("copyInboundHostname")}
                      aria-label={t("copyInboundHostname")}
                      className="inline-flex items-center gap-2 rounded font-mono hover:text-foreground"
                    >
                      {inboundHostname}
                      <Copy className="h-3.5 w-3.5 text-muted-foreground" />
                    </button>
                  ) : null}
                </div>
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="text-muted-foreground">{t("ports")}</span>
                  {portGroups.map((group) => (
                    <Badge
                      key={group.port}
                      variant="outline"
                      className="font-mono font-normal"
                    >
                      {group.transports.join("/")} {group.port}
                    </Badge>
                  ))}
                </div>
              </div>
            </section>

            <section className="overflow-hidden rounded-md border">
              <div className="border-b bg-muted/20 p-4">
                <h3 className="font-semibold">{t("outbound")}</h3>
                <p className="text-sm text-muted-foreground">
                  {t("outboundDescription", { provider: details.provider_display_name })}
                </p>
              </div>
              <div className="space-y-3 p-4">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md bg-muted/30 px-3 py-2 text-sm">
                  <span className="text-muted-foreground">{t("originIpAddress")}</span>
                  <button
                    type="button"
                    onClick={() =>
                      copyValue(region.outbound_origin_ip, t("originIpAddress"))
                    }
                    title={t("copyOriginIp")}
                    aria-label={t("copyOriginIp")}
                    className="inline-flex items-center gap-2 rounded font-mono hover:text-foreground"
                  >
                    {region.outbound_origin_ip}
                    <Copy className="h-3.5 w-3.5 text-muted-foreground" />
                  </button>
                </div>
              </div>
            </section>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}
