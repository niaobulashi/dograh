"use client";

import { Zap } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { PageLayout } from '@/components/layout/PageLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function AutomationPage() {
    const t = useTranslations('Automation');
    return (
        <PageLayout title={t('title')} description={t('description')}>

            <Card>
                <CardHeader>
                    <CardTitle>{t('comingSoon')}</CardTitle>
                    <CardDescription>
                        {t('underDevelopment')}
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="text-center py-12">
                        <Zap className="w-16 h-16 mx-auto mb-6" />
                        <p className="text-lg mb-4">
                            {t('body1')}
                        </p>
                        <p>
                            {t('body2')}
                        </p>
                        <p className="mt-4">
                            {t('body3')}
                        </p>
                    </div>
                </CardContent>
            </Card>
        </PageLayout>
    );
}
