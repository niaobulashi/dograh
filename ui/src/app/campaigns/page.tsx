"use client";

import { Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';

import { getCampaignsApiV1CampaignGet } from '@/client/sdk.gen';
import type { CampaignsResponse } from '@/client/types.gen';
import { PageLayout, PageSection } from '@/components/layout/PageLayout';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { useOrganizationTimezone } from '@/hooks/useOrganizationTimezone';
import { useAuth } from '@/lib/auth';
import { formatDate } from '@/lib/dateTime';

export default function CampaignsPage() {
    const t = useTranslations("Campaigns");
    const { user, getAccessToken, redirectToLogin, loading } = useAuth();
    const organizationTimezone = useOrganizationTimezone();
    const router = useRouter();

    const [campaignsData, setCampaignsData] = useState<CampaignsResponse | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const hasFetched = useRef(false);

    // Redirect if not authenticated
    useEffect(() => {
        if (!loading && !user) {
            redirectToLogin();
        }
    }, [loading, user, redirectToLogin]);

    // Fetch campaigns once when user is ready
    useEffect(() => {
        if (loading || !user || hasFetched.current) {
            return;
        }
        hasFetched.current = true;

        const fetchCampaigns = async () => {
            setIsLoading(true);
            try {
                const accessToken = await getAccessToken();
                const response = await getCampaignsApiV1CampaignGet({
                    headers: {
                        'Authorization': `Bearer ${accessToken}`,
                    }
                });

                if (response.data) {
                    setCampaignsData(response.data);
                }
            } catch (error) {
                console.error('Failed to fetch campaigns:', error);
            } finally {
                setIsLoading(false);
            }
        };

        fetchCampaigns();
    }, [loading, user, getAccessToken]);

    const handleRowClick = (campaignId: number) => {
        router.push(`/campaigns/${campaignId}`);
    };

    const handleCreateCampaign = () => {
        router.push('/campaigns/new');
    };

    const getStateBadgeVariant = (state: string) => {
        switch (state) {
            case 'created':
                return 'secondary';
            case 'running':
                return 'default';
            case 'paused':
                return 'outline';
            case 'completed':
                return 'secondary';
            case 'failed':
                return 'destructive';
            default:
                return 'secondary';
        }
    };

    return (
        <PageLayout title={t("title")} description={t("description")}>
            <PageSection title={t("list.allCampaigns")} description={t("list.description")}
                actions={<Button onClick={handleCreateCampaign}><Plus className="h-4 w-4" />{t("list.create")}</Button>}>

                {isLoading ? (
                    <div className="animate-pulse space-y-3">
                        {[...Array(5)].map((_, i) => (
                            <div key={i} className="h-12 bg-muted rounded"></div>
                        ))}
                    </div>
                ) : campaignsData && campaignsData.campaigns.length > 0 ? (
                    <div className="overflow-x-auto">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>ID</TableHead>
                                    <TableHead>{t("list.columnName")}</TableHead>
                                    <TableHead>{t("list.columnWorkflow")}</TableHead>
                                    <TableHead>{t("list.columnState")}</TableHead>
                                    <TableHead>{t("list.columnProgress")}</TableHead>
                                    <TableHead>{t("list.columnCreated")}</TableHead>
                                    <TableHead className="text-right">{t("list.columnAction")}</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {campaignsData.campaigns.map((campaign) => (
                                    <TableRow
                                        key={campaign.id}
                                        className="cursor-pointer hover:bg-muted/50"
                                        onClick={() => handleRowClick(campaign.id)}
                                    >
                                        <TableCell>{campaign.id}</TableCell>
                                        <TableCell className="font-medium">{campaign.name}</TableCell>
                                        <TableCell>{campaign.workflow_name}{(campaign.traffic_split?.variants.length ?? 1) > 1 && <span className="text-muted-foreground"> +{(campaign.traffic_split?.variants.length ?? 1) - 1}</span>}</TableCell>
                                        <TableCell>
                                            <Badge variant={getStateBadgeVariant(campaign.state)}>
                                                {campaign.state}
                                            </Badge>
                                        </TableCell>
                                        <TableCell>
                                            {campaign.executed_count} / {campaign.total_queued_count}
                                        </TableCell>
                                        <TableCell>
                                            {formatDate(campaign.created_at, organizationTimezone)}
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleRowClick(campaign.id);
                                                }}
                                            >
                                                {t("list.view")}
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                ) : (
                    <div className="text-center py-8">
                        <p className="mb-4">{t("list.empty")}</p>
                        <Button onClick={handleCreateCampaign} variant="outline">
                            <Plus className="h-4 w-4 mr-2" />
                            {t("list.createFirst")}
                        </Button>
                    </div>
                )}
            </PageSection>
        </PageLayout>
    );
}
