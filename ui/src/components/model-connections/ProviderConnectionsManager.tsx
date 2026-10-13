"use client";

import { Archive, ChevronRight, ExternalLink, Pencil, Plus, RotateCcw } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";

import { archiveProviderConnection, restoreProviderConnection } from "@/client/sdk.gen";
import { LIST_ROW_ACTIONS_CLASS, LIST_ROW_CLASS, LIST_ROW_TARGET_CLASS } from "@/components/layout/ListRow";
import { PageLayout, PageSection } from "@/components/layout/PageLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useOrgConfig } from "@/context/OrgConfigContext";
import { detailFromError } from "@/lib/apiError";

import { connectionProviders } from "./configuration";
import { useModelConnections } from "./useModelConnections";

export default function ProviderConnectionsManager({ docsUrl }: { docsUrl?: string }) {
    const t = useTranslations("Models");
    const { catalog, connections, loading, error, reload } = useModelConnections({ includeArchived: true });
    const { refreshConfig } = useOrgConfig();
    const [archive, setArchive] = useState<{ uuid: string; name: string } | null>(null);
    const [busy, setBusy] = useState(false);
    const [actionError, setActionError] = useState<string | null>(null);
    const [archivedOpen, setArchivedOpen] = useState(false);
    const [restoringUuid, setRestoringUuid] = useState<string | null>(null);

    const refresh = async () => { await reload(); await refreshConfig(); };
    const activeConnections = connections.filter(item => item.is_active);
    const archivedItems = connections.filter(item => !item.is_active);
    const providers = catalog ? connectionProviders(catalog) : {};

    const restore = async (uuid: string) => {
        setBusy(true); setRestoringUuid(uuid); setActionError(null);
        try {
            const response = await restoreProviderConnection({ path: { connection_uuid: uuid } });
            if (response.error) throw new Error(detailFromError(response.error, t("unableToRestore")));
            await refresh(); toast.success(t("restored"));
        } catch (cause) { setActionError(cause instanceof Error ? cause.message : t("unableToRestore")); }
        finally { setBusy(false); setRestoringUuid(null); }
    };

    return <PageLayout title={t("providersTitle")}
        description={<>{t.rich("providersPageDescription", { link: chunks => <Link href="/model-configurations" className="underline">{chunks}</Link> })}
            {docsUrl && <> <a href={docsUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 underline">{t("learnMore")}<ExternalLink className="h-3 w-3" /></a></>}</>}
    >
        <PageSection title={t("providerConnections")} description={t("providerConnectionsDescription")}
            actions={<Button asChild><Link href="/provider-connections/new"><Plus className="h-4 w-4" />{t("addProvider")}</Link></Button>}>
            {loading && !catalog && <div className="grid gap-3"><Skeleton className="h-24 w-full" /><Skeleton className="h-24 w-full" /></div>}
            {(error || actionError) && <div role="alert" className="flex items-center justify-between gap-3 rounded-md border border-destructive/40 p-4 text-sm text-destructive">
                <span>{actionError || error}</span>{error && <Button type="button" size="sm" variant="outline" onClick={() => void reload()}>{t("retry")}</Button>}
            </div>}
            {catalog && <>
                {activeConnections.length === 0 && <p className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">{t("noProviderConnections")}</p>}
                <div className="space-y-4">
                    {activeConnections.map(connection => {
                        const entry = providers[connection.provider];
                        return <div key={connection.uuid} className={LIST_ROW_CLASS}>
                            <div className="min-w-0 flex-1 space-y-1">
                                <h3 className="truncate font-medium"><Link href={`/provider-connections/${connection.uuid}`} className={LIST_ROW_TARGET_CLASS}>{connection.name}</Link></h3>
                                <p className="text-sm text-muted-foreground">{entry?.title || connection.provider}</p>
                            </div>
                            <div className={LIST_ROW_ACTIONS_CLASS}>
                                <Button asChild variant="ghost" size="sm"><Link href={`/provider-connections/${connection.uuid}`}><Pencil className="h-3.5 w-3.5" />{t("edit")}</Link></Button>
                                <Button type="button" variant="ghost" size="sm" onClick={() => { setActionError(null); setArchive({ uuid: connection.uuid, name: connection.name }); }}>{t("archive")}</Button>
                            </div>
                        </div>;
                    })}
                </div>
                {archivedItems.length > 0 && <Collapsible open={archivedOpen} onOpenChange={setArchivedOpen}>
                    <CollapsibleTrigger asChild>
                        <button type="button" aria-label={t("toggleArchived")} className="group flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left transition-colors hover:bg-accent">
                            <ChevronRight size={16} className={`shrink-0 text-muted-foreground transition-transform duration-200 ${archivedOpen ? "rotate-90" : ""}`} />
                            <Archive size={16} className="shrink-0 text-muted-foreground" />
                            <span className="font-medium text-muted-foreground">{t("archived")}</span>
                            <Badge variant="secondary" className="ml-1 font-normal">{archivedItems.length}</Badge>
                        </button>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="space-y-3 pt-3">
                        {archivedItems.map(item => {
                            return <div key={item.uuid} className="flex flex-col justify-between gap-3 rounded-lg border p-4 sm:flex-row sm:items-center">
                                <div className="min-w-0 flex-1 space-y-1">
                                    <div className="opacity-60">
                                        <h3 className="font-medium">{item.name}</h3>
                                        <p className="text-sm text-muted-foreground">{providers[item.provider]?.title || item.provider}</p>
                                    </div>
                                </div>
                                <div className="flex w-full flex-wrap items-center justify-end gap-1 sm:w-auto">
                                    <Button type="button" variant="outline" size="sm" disabled={busy || loading} onClick={() => void restore(item.uuid)}>
                                        <RotateCcw className="h-3.5 w-3.5" />{restoringUuid === item.uuid ? t("restoring") : t("restore")}
                                    </Button>
                                </div>
                            </div>;
                        })}
                    </CollapsibleContent>
                </Collapsible>}
                <Dialog open={archive !== null} onOpenChange={open => { if (!open && !busy) setArchive(null); }}>
                    <DialogContent onOpenAutoFocus={() => undefined}>
                        <DialogHeader><DialogTitle>{t("archiveNamed", { name: archive?.name ?? "" })}</DialogTitle><DialogDescription>{t("archiveDescription")}</DialogDescription></DialogHeader>
                        {actionError && <p role="alert" className="text-sm text-destructive">{actionError}</p>}
                        <div className="flex justify-end gap-2"><Button variant="outline" disabled={busy} onClick={() => setArchive(null)}>{t("cancel")}</Button>
                            <Button disabled={busy} onClick={async () => {
                                if (!archive) return;
                                setBusy(true); setActionError(null);
                                try {
                                    const result = await archiveProviderConnection({ path: { connection_uuid: archive.uuid } });
                                    if (result.error) throw new Error(detailFromError(result.error, t("unableToArchive")));
                                    setArchive(null); await refresh(); toast.success(t("archived"));
                                } catch (cause) { setActionError(cause instanceof Error ? cause.message : t("unableToArchive")); }
                                finally { setBusy(false); }
                            }}>{busy ? t("archiving") : t("archive")}</Button>
                        </div>
                    </DialogContent>
                </Dialog>
            </>}
        </PageSection>
    </PageLayout>;
}
