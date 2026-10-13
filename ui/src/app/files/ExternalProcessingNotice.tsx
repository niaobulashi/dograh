'use client';

import { Info } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { useAppConfig } from '@/context/AppConfigContext';

export default function ExternalProcessingNotice() {
  const t = useTranslations('Files');
  const { config } = useAppConfig();
  if (config?.deploymentMode !== 'oss') return null;

  return (
    <div className="flex gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-900/50 dark:bg-amber-950/30">
      <Info className="h-4 w-4 flex-shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
      <div className="text-xs text-amber-900 dark:text-amber-200">
        <p className="font-medium">{t('externalProcessingTitle')}</p>
        <p className="mt-1">
          {t('externalProcessingBody')}
        </p>
      </div>
    </div>
  );
}
