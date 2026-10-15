"use client";

import Link from 'next/link';
import { useTranslations } from 'next-intl';

import { GitHubStarBadge } from '@/components/layout/GitHubStarBadge';
import { PageLayout } from '@/components/layout/PageLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/lib/auth';

export default function OverviewPage() {
    const t = useTranslations('Overview');
    const { user, provider } = useAuth();
    const isOSSMode = provider !== 'stack';

    return (
        <PageLayout
            title={isOSSMode
                ? t('welcomeOss')
                : user?.displayName
                    ? t('welcomeNamed', { name: user.displayName.split(' ')[0] })
                    : t('welcome')}
            description={isOSSMode ? t('descriptionOss') : t('descriptionCloud')}
            actions={isOSSMode && <GitHubStarBadge label={t('starUsOnGitHub')} showCount source="overview_page" />}>
            {/* Quick Actions */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card>
                    <CardHeader>
                        <CardTitle>{t('createManageTitle')}</CardTitle>
                        <CardDescription>
                            {t('createManageDescription')}
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <Button asChild>
                            <Link href="/workflow">
                                {t('goToAgents')}
                            </Link>
                        </Button>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>{t('configureServicesTitle')}</CardTitle>
                        <CardDescription>
                            {t('configureServicesDescription')}
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <Button asChild variant="outline">
                            <Link href="/model-configurations">
                                {t('configureModels')}
                            </Link>
                        </Button>
                    </CardContent>
                </Card>
            </div>

            {/* Resources Section */}
            <Card>
                <CardHeader>
                    <CardTitle>{t('resourcesTitle')}</CardTitle>
                    <CardDescription>
                        {t('resourcesDescription')}
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="flex flex-wrap gap-4">
                        <Button asChild variant="outline">
                            <a
                                href="https://docs.dograh.com"
                                target="_blank"
                                rel="noopener noreferrer"
                            >
                                {t('documentation')}
                            </a>
                        </Button>
                        <Button asChild variant="outline">
                            <a
                                href="https://github.com/dograh-hq/dograh/issues"
                                target="_blank"
                                rel="noopener noreferrer"
                            >
                                {t('reportIssue')}
                            </a>
                        </Button>
                    </div>
                </CardContent>
            </Card>
        </PageLayout>
    );
}
