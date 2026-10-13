"use client";

import { ExternalLink, Upload } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { PageLayout, PageSection } from "@/components/layout/PageLayout";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/lib/auth";

import DocumentList from "./DocumentList";
import DocumentUpload from "./DocumentUpload";

export default function FilesPage() {
    const t = useTranslations("Files");
    const { user, redirectToLogin, loading } = useAuth();
    const [refreshKey, setRefreshKey] = useState(0);
    const [isUploadOpen, setIsUploadOpen] = useState(false);

    // Redirect if not authenticated
    useEffect(() => {
        if (!loading && !user) {
            redirectToLogin();
        }
    }, [loading, user, redirectToLogin]);

    const handleUploadSuccess = () => {
        setRefreshKey(prev => prev + 1);
        setIsUploadOpen(false);
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
        <PageLayout title={t("title")} description={<>{t("description")}{" "}
            <a href="https://docs.dograh.com/voice-agent/knowledge-base" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 underline">
                {t("learnMore")} <ExternalLink className="h-3 w-3" />
            </a></>}>

            <PageSection title={t("yourDocuments")}
                description={t("yourDocumentsDescription")}
                actions={<Button onClick={() => setIsUploadOpen(true)}>
                    <Upload className="w-4 h-4 mr-2" />
                    {t("uploadDocument")}
                </Button>}>
                <DocumentList refreshTrigger={refreshKey} />
            </PageSection>

            <Dialog open={isUploadOpen} onOpenChange={setIsUploadOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{t("uploadDocument")}</DialogTitle>
                        <DialogDescription>
                            {t("uploadDialogDescription")}
                        </DialogDescription>
                    </DialogHeader>
                    <DocumentUpload onUploadSuccess={handleUploadSuccess} />
                </DialogContent>
            </Dialog>
        </PageLayout>
    );
}
