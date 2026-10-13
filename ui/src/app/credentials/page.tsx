"use client";

import { Loader2, Pencil, Plus, Search, ShieldCheck, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { deleteCredentialApiV1CredentialsCredentialUuidDelete, listCredentialsApiV1CredentialsGet } from "@/client";
import type { CredentialResponse, WebhookCredentialType } from "@/client/types.gen";
import { CreateCredentialDialog } from "@/components/http/create-credential-dialog";
import { LIST_ROW_ACTIONS_CLASS, LIST_ROW_CLASS, LIST_ROW_TARGET_CLASS } from "@/components/layout/ListRow";
import { PageLayout, PageSection } from "@/components/layout/PageLayout";
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { detailFromError } from "@/lib/apiError";
import { useAuth } from "@/lib/auth";

const TYPE_LABELS: Record<WebhookCredentialType, string> = {
    none: "typeNone",
    api_key: "typeApiKey",
    bearer_token: "typeBearerToken",
    basic_auth: "typeBasicAuth",
    custom_header: "typeCustomHeader",
};

export default function CredentialsPage() {
    const t = useTranslations("Credentials");
    const typeLabel = (type: string) => {
        const key = TYPE_LABELS[type as WebhookCredentialType];
        return key ? t(key) : type;
    };
    const { user, loading: authLoading, getAccessToken, redirectToLogin } = useAuth();
    const [credentials, setCredentials] = useState<CredentialResponse[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [reload, setReload] = useState(0);
    const [search, setSearch] = useState("");
    const [createOpen, setCreateOpen] = useState(false);
    const [editTarget, setEditTarget] = useState<CredentialResponse | null>(null);
    const [deleteTarget, setDeleteTarget] = useState<CredentialResponse | null>(null);
    const [deleting, setDeleting] = useState(false);
    const [deleteError, setDeleteError] = useState<string | null>(null);

    useEffect(() => {
        if (!authLoading && !user) redirectToLogin();
    }, [authLoading, user, redirectToLogin]);

    useEffect(() => {
        if (authLoading || !user) return;
        let cancelled = false;
        const fetchCredentials = async () => {
            setLoading(true);
            setError(null);
            try {
                const token = await getAccessToken();
                const response = await listCredentialsApiV1CredentialsGet({
                    headers: { Authorization: `Bearer ${token}` },
                });
                if (response.error) throw new Error(detailFromError(response.error, t("loadError")));
                if (!cancelled) setCredentials(response.data ?? []);
            } catch (cause) {
                if (!cancelled) setError(cause instanceof Error ? cause.message : t("loadError"));
            } finally {
                if (!cancelled) setLoading(false);
            }
        };
        void fetchCredentials();
        return () => { cancelled = true; };
    }, [authLoading, user, getAccessToken, reload, t]);

    const deleteCredential = async () => {
        if (!deleteTarget || deleting) return;
        setDeleting(true);
        setDeleteError(null);
        try {
            const token = await getAccessToken();
            const response = await deleteCredentialApiV1CredentialsCredentialUuidDelete({
                headers: { Authorization: `Bearer ${token}` },
                path: { credential_uuid: deleteTarget.uuid },
            });
            if (response.error) throw new Error(detailFromError(response.error, t("deleteError")));
            setCredentials((current) => current.filter((item) => item.uuid !== deleteTarget.uuid));
            setDeleteTarget(null);
            toast.success(t("deleteSuccess"));
        } catch (cause) {
            setDeleteError(cause instanceof Error ? cause.message : t("deleteError"));
        } finally {
            setDeleting(false);
        }
    };

    const query = search.trim().toLowerCase();
    const filtered = credentials.filter((item) =>
        [item.name, item.description, typeLabel(item.credential_type)].some((value) => value?.toLowerCase().includes(query))
    );

    return (
        <>
            <PageLayout title={t("title")} description={t("description")}>
                <PageSection title={t("yourCredentials")}
                    description={t("yourCredentialsDescription")}
                    actions={<Button onClick={() => setCreateOpen(true)} disabled={authLoading || !user || loading || !!error}>
                        <Plus className="h-4 w-4" />{t("addCredential")}
                    </Button>}
                    toolbar={<div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input aria-label={t("searchAria")} placeholder={t("searchPlaceholder")} value={search} onChange={(event) => setSearch(event.target.value)} className="pl-10" />
                    </div>}>

                    {authLoading || !user || loading ? (
                        <div className="space-y-4" role="status" aria-label={t("loadingAria")}>
                            {[1, 2, 3].map((item) => <Skeleton key={item} className="h-24 w-full rounded-lg" />)}
                        </div>
                    ) : error ? (
                        <div role="alert" className="rounded-lg border border-destructive/20 bg-destructive/10 p-4 text-sm text-destructive">
                            <p>{error}</p>
                            <Button variant="outline" size="sm" className="mt-3" onClick={() => setReload((value) => value + 1)}>{t("retry")}</Button>
                        </div>
                    ) : filtered.length === 0 ? (
                        <div className="py-12 text-center">
                            <ShieldCheck className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
                            <p className="mb-4 text-muted-foreground">{query ? t("noMatch") : t("empty")}</p>
                            {query ? (
                                <Button variant="outline" onClick={() => setSearch("")}>{t("clearSearch")}</Button>
                            ) : (
                                <Button onClick={() => setCreateOpen(true)}>{t("addFirstCredential")}</Button>
                            )}
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {filtered.map((item) => (
                                <div key={item.uuid} className={LIST_ROW_CLASS}>
                                    <div className="min-w-0 space-y-1">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <h3 className="break-words font-medium">
                                                <button type="button" className={LIST_ROW_TARGET_CLASS} onClick={() => setEditTarget(item)}>{item.name}</button>
                                            </h3>
                                            <Badge variant="secondary">{typeLabel(item.credential_type)}</Badge>
                                        </div>
                                        {item.description && <p className="break-words text-sm text-muted-foreground">{item.description}</p>}
                                        <p className="text-xs text-muted-foreground">{t("created", { date: new Date(item.created_at).toLocaleDateString() })}</p>
                                    </div>
                                    <div className={`${LIST_ROW_ACTIONS_CLASS} shrink-0 self-end sm:self-auto`}>
                                        <Button variant="ghost" size="sm" aria-label={t("editAria", { name: item.name })} onClick={() => setEditTarget(item)}>
                                            <Pencil className="h-4 w-4" />{t("edit")}
                                        </Button>
                                        <Button variant="ghost" size="icon" aria-label={t("deleteAria", { name: item.name })} className="text-destructive hover:text-destructive" onClick={() => { setDeleteError(null); setDeleteTarget(item); }}>
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </PageSection>
            </PageLayout>
            <CreateCredentialDialog open={createOpen} onOpenChange={setCreateOpen} onCreated={(credential) => {
                setCredentials((current) => [credential, ...current]);
                setSearch("");
                toast.success(t("createdToast"));
            }} />
            <CreateCredentialDialog open={!!editTarget} credential={editTarget ?? undefined} onOpenChange={(open) => { if (!open) setEditTarget(null); }} onUpdated={(credential) => {
                setCredentials((current) => current.map((item) => item.uuid === credential.uuid ? credential : item));
                toast.success(t("updatedToast"));
            }} />
            <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open && !deleting) setDeleteTarget(null); }}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>{t("deleteTitle")}</AlertDialogTitle>
                        <AlertDialogDescription>
                            {t("deleteDescription", { name: deleteTarget?.name ?? "" })}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    {deleteError && <p role="alert" className="text-sm text-destructive">{deleteError}</p>}
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={deleting}>{t("cancel")}</AlertDialogCancel>
                        <Button variant="destructive" disabled={deleting} onClick={deleteCredential}>
                            {deleting && <Loader2 className="h-4 w-4 animate-spin" />}
                            {deleting ? t("deleting") : t("delete")}
                        </Button>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}
