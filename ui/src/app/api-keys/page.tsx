"use client";

import { Copy, Eye, EyeOff, Key, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';

import {
    archiveApiKeyApiV1UserApiKeysApiKeyIdDelete,
    archiveServiceKeyApiV1UserServiceKeysServiceKeyIdDelete,
    createApiKeyApiV1UserApiKeysPost,
    createServiceKeyApiV1UserServiceKeysPost,
    getApiKeysApiV1UserApiKeysGet,
    getServiceKeysApiV1UserServiceKeysGet,
    reactivateApiKeyApiV1UserApiKeysApiKeyIdReactivatePut
} from '@/client/sdk.gen';
import type { ApiKeyResponse, CreateApiKeyResponse, CreateServiceKeyResponse,ServiceKeyResponse } from '@/client/types.gen';
import { PageLayout, PageSection } from '@/components/layout/PageLayout';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { useAppConfig } from '@/context/AppConfigContext';
import { useOrganizationTimezone } from '@/hooks/useOrganizationTimezone';
import { useAuth } from '@/lib/auth';
import { copyTextToClipboard } from '@/lib/clipboard';
import { formatDateTime } from '@/lib/dateTime';
import logger from '@/lib/logger';

export default function APIKeysPage() {
    const t = useTranslations('ApiKeys');
    const { user, getAccessToken, redirectToLogin, loading } = useAuth();
    const { config } = useAppConfig();
    const organizationTimezone = useOrganizationTimezone();
    const isOSS = config?.deploymentMode === 'oss';

    logger.debug('[APIKeysPage] Component render', {
        loading,
        hasUser: !!user,
        userId: user?.id,
        timestamp: new Date().toISOString()
    });

    const [apiKeys, setApiKeys] = useState<ApiKeyResponse[]>([]);
    const [serviceKeys, setServiceKeys] = useState<ServiceKeyResponse[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isServiceKeysLoading, setIsServiceKeysLoading] = useState(true);
    const [showArchived, setShowArchived] = useState(false);
    const [showServiceArchived, setShowServiceArchived] = useState(false);
    const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
    const [isCreateServiceDialogOpen, setIsCreateServiceDialogOpen] = useState(false);
    const [newKeyName, setNewKeyName] = useState('');
    const [newServiceKeyName, setNewServiceKeyName] = useState('');
    const [createdKey, setCreatedKey] = useState<CreateApiKeyResponse | null>(null);
    const [createdServiceKey, setCreatedServiceKey] = useState<CreateServiceKeyResponse | null>(null);
    const [showCreatedKeyDialog, setShowCreatedKeyDialog] = useState(false);
    const [showCreatedServiceKeyDialog, setShowCreatedServiceKeyDialog] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Redirect if not authenticated
    useEffect(() => {
        if (!loading && !user) {
            redirectToLogin();
        }
    }, [loading, user, redirectToLogin]);

    const fetchApiKeys = useCallback(async () => {
        logger.debug('[APIKeysPage] fetchApiKeys called', {
            loading,
            hasUser: !!user,
            userId: user?.id
        });

        // Follow the pattern from UserConfigContext - check both loading and user
        if (loading || !user) {
            logger.debug('[APIKeysPage] fetchApiKeys - skipping due to loading or no user');
            return;
        }

        try {
            setIsLoading(true);
            setError(null);
            logger.debug('[APIKeysPage] fetchApiKeys - calling getAccessToken...');
            const accessToken = await getAccessToken();
            logger.debug('[APIKeysPage] fetchApiKeys - got access token');

            const response = await getApiKeysApiV1UserApiKeysGet({
                query: {

                        include_archived: showArchived

                },
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                }
            });

            if (response.data) {
                setApiKeys(response.data);
            }
        } catch (err) {
            setError(t('fetchApiKeysError'));
            console.error('Error fetching API keys:', err);
        } finally {
            setIsLoading(false);
        }
    }, [loading, user, getAccessToken, showArchived, t]);

    const fetchServiceKeys = useCallback(async () => {
        logger.debug('[APIKeysPage] fetchServiceKeys called', {
            loading,
            hasUser: !!user,
            userId: user?.id
        });

        // Follow the pattern from UserConfigContext - check both loading and user
        if (loading || !user) {
            logger.debug('[APIKeysPage] fetchServiceKeys - skipping due to loading or no user');
            return;
        }

        try {
            setIsServiceKeysLoading(true);
            setError(null);
            logger.debug('[APIKeysPage] fetchServiceKeys - calling getAccessToken...');
            const accessToken = await getAccessToken();
            logger.debug('[APIKeysPage] fetchServiceKeys - got access token');

            const response = await getServiceKeysApiV1UserServiceKeysGet({
                query: {
                    include_archived: showServiceArchived
                },
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                }
            });

            if (response.data) {
                setServiceKeys(response.data);
            }
        } catch (err) {
            setError(t('fetchServiceKeysError'));
            console.error('Error fetching service keys:', err);
        } finally {
            setIsServiceKeysLoading(false);
        }
    }, [loading, user, getAccessToken, showServiceArchived, t]);

    useEffect(() => {
        logger.debug('[APIKeysPage] useEffect for fetchApiKeys triggered');
        fetchApiKeys();
    }, [fetchApiKeys]);

    useEffect(() => {
        logger.debug('[APIKeysPage] useEffect for fetchServiceKeys triggered');
        fetchServiceKeys();
    }, [fetchServiceKeys]);

    const handleCreateKey = async () => {
        if (!newKeyName.trim()) {
            setError(t('nameRequired'));
            return;
        }

        try {
            setError(null);
            const accessToken = await getAccessToken();

            const response = await createApiKeyApiV1UserApiKeysPost({
                body: {
                    name: newKeyName
                },
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                }
            });

            if (response.data) {
                setCreatedKey(response.data);
                setIsCreateDialogOpen(false);
                setShowCreatedKeyDialog(true);
                setNewKeyName('');
                fetchApiKeys();
            }
        } catch (err) {
            setError(t('createApiKeyError'));
            console.error('Error creating API key:', err);
        }
    };

    const handleCreateServiceKey = async () => {
        if (!newServiceKeyName.trim()) {
            setError(t('serviceNameRequired'));
            return;
        }

        try {
            setError(null);
            const accessToken = await getAccessToken();

            const response = await createServiceKeyApiV1UserServiceKeysPost({
                body: {
                    name: newServiceKeyName,
                    expires_in_days: 90
                },
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                }
            });

            if (response.data) {
                setCreatedServiceKey(response.data);
                setIsCreateServiceDialogOpen(false);
                setShowCreatedServiceKeyDialog(true);
                setNewServiceKeyName('');
                fetchServiceKeys();
            }
        } catch (err) {
            setError(t('createServiceKeyError'));
            console.error('Error creating service key:', err);
        }
    };

    const handleArchiveKey = async (keyId: number) => {
        try {
            setError(null);
            const accessToken = await getAccessToken();

            await archiveApiKeyApiV1UserApiKeysApiKeyIdDelete({
                path: {
                    api_key_id: keyId
                },
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                }
            });

            fetchApiKeys();
        } catch (err) {
            setError(t('archiveApiKeyError'));
            console.error('Error archiving API key:', err);
        }
    };

    const handleArchiveServiceKey = async (keyId: string) => {
        try {
            setError(null);
            const accessToken = await getAccessToken();

            await archiveServiceKeyApiV1UserServiceKeysServiceKeyIdDelete({
                path: {
                    service_key_id: keyId
                },
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                }
            });

            fetchServiceKeys();
        } catch (err) {
            setError(t('archiveServiceKeyError'));
            console.error('Error archiving service key:', err);
        }
    };

    const handleReactivateKey = async (keyId: number) => {
        try {
            setError(null);
            const accessToken = await getAccessToken();

            await reactivateApiKeyApiV1UserApiKeysApiKeyIdReactivatePut({
                path: {

                        api_key_id: keyId

                },
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                }
            });

            fetchApiKeys();
        } catch (err) {
            setError(t('reactivateApiKeyError'));
            console.error('Error reactivating API key:', err);
        }
    };


    const copyToClipboard = async (text: string) => {
        try {
            await copyTextToClipboard(text);
            toast.success(t('keyCopied'));
        } catch (err) {
            console.error('Failed to copy to clipboard:', err);
            toast.error(t('copyFailed'));
        }
    };

    const formatDate = (dateString: string | null) => {
        if (!dateString) return t('never');
        return formatDateTime(dateString, organizationTimezone);
    };

    // Don't render content until auth is loaded
    if (loading || !user) {
        return (
            <PageLayout title={t('title')}>
                <div className="space-y-4">
                    <Skeleton className="h-12 w-64" />
                    <Skeleton className="h-64 w-full" />
                </div>
            </PageLayout>
        );
    }

    // In OSS mode, check if there's already an active service key
    const activeServiceKeys = serviceKeys.filter(key => !key.archived_at);
    const canCreateServiceKey = !isOSS || activeServiceKeys.length === 0;
    const showServiceKeyArchiveControls = !isOSS;

    return (
        <>
            <PageLayout title={t('title')} description={t('description')}>

                {error && (
                    <div className="mb-4 p-4 bg-destructive/10 border border-destructive/20 rounded-lg text-destructive">
                        {error}
                    </div>
                )}

                <PageSection title={t('apiKeysTitle')}
                    description={t('apiKeysDescription')}
                    actions={<><Button
                        variant="outline"
                        size="sm"
                        onClick={() => setShowArchived(!showArchived)}
                    >
                        {showArchived ? <Eye className="w-4 h-4 mr-2" /> : <EyeOff className="w-4 h-4 mr-2" />}
                        {t(showArchived ? 'hideArchived' : 'showArchived')}
                    </Button>
                        <Button
                            onClick={() => setIsCreateDialogOpen(true)}
                            size="sm"
                        >
                            <Plus className="w-4 h-4 mr-2" />
                            {t('createNewKey')}
                        </Button></>}>
                    {isLoading ? (
                        <div className="space-y-4">
                            {[1, 2, 3].map((i) => (
                                <div key={i} className="flex items-center justify-between p-4 border rounded-lg">
                                    <div className="space-y-2">
                                        <Skeleton className="h-4 w-32" />
                                        <Skeleton className="h-3 w-24" />
                                    </div>
                                    <Skeleton className="h-8 w-20" />
                                </div>
                            ))}
                        </div>
                    ) : apiKeys.length === 0 ? (
                        <div className="text-center py-12">
                            <Key className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                            <p className="text-muted-foreground mb-4">{t('noApiKeys')}</p>
                            <Button onClick={() => setIsCreateDialogOpen(true)}>
                                {t('createFirstApiKey')}
                            </Button>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {apiKeys.map((key) => (
                                <div
                                    key={key.id}
                                    className={`flex items-center justify-between p-4 border rounded-lg ${key.archived_at ? 'bg-muted opacity-60' : 'bg-card'
                                        }`}
                                >
                                    <div className="flex-1">
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className="font-medium">{key.name}</span>
                                            {key.archived_at ? (
                                                <Badge variant="secondary">{t('statusArchived')}</Badge>
                                            ) : key.is_active ? (
                                                <Badge variant="default">{t('statusActive')}</Badge>
                                            ) : (
                                                <Badge variant="destructive">{t('statusInactive')}</Badge>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                            <span className="font-mono bg-muted px-2 py-1 rounded">{key.key_prefix}...</span>
                                            <span className="text-xs text-muted-foreground/70">
                                                {t('keyHidden')}
                                            </span>
                                        </div>
                                        <div className="mt-2 text-xs text-muted-foreground">
                                            {t('createdLastUsed', { created: formatDate(key.created_at), lastUsed: formatDate(key.last_used_at ?? null) })}
                                        </div>
                                    </div>
                                    <div className="flex gap-2">
                                        {key.archived_at ? (
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => handleReactivateKey(key.id)}
                                            >
                                                <RefreshCw className="w-4 h-4 mr-1" />
                                                {t('reactivate')}
                                            </Button>
                                        ) : (
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => handleArchiveKey(key.id)}
                                                className="text-destructive hover:text-destructive/90"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </Button>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </PageSection>

                {/* Dograh Service Keys Section */}
                <PageSection title={t('serviceKeysTitle')}
                    description={t('serviceKeysDescription')}
                    actions={<>{showServiceKeyArchiveControls && (
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setShowServiceArchived(!showServiceArchived)}
                        >
                            {showServiceArchived ? <Eye className="w-4 h-4 mr-2" /> : <EyeOff className="w-4 h-4 mr-2" />}
                            {t(showServiceArchived ? 'hideArchived' : 'showArchived')}
                        </Button>
                    )}
                        {canCreateServiceKey ? (
                            <Button
                                onClick={() => setIsCreateServiceDialogOpen(true)}
                                size="sm"
                            >
                                <Plus className="w-4 h-4 mr-2" />
                                {t('createServiceKey')}
                            </Button>
                        ) : (
                            <span className="text">
                                {t('serviceKeyLimitPrefix')} <a href="https://app.dograh.com" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">{t('signUpLink')}</a>
                            </span>
                        )}</>}>
                    {isServiceKeysLoading ? (
                        <div className="space-y-4">
                            {[1, 2].map((i) => (
                                <div key={i} className="flex items-center justify-between p-4 border rounded-lg">
                                    <div className="space-y-2">
                                        <Skeleton className="h-4 w-32" />
                                        <Skeleton className="h-3 w-24" />
                                    </div>
                                    <Skeleton className="h-8 w-20" />
                                </div>
                            ))}
                        </div>
                    ) : serviceKeys.length === 0 ? (
                        <div className="text-center py-12">
                            <Key className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                            <p className="text-muted-foreground mb-4">{t('noServiceKeys')}</p>
                            {canCreateServiceKey && (
                                <Button onClick={() => setIsCreateServiceDialogOpen(true)}>
                                    {t('createFirstServiceKey')}
                                </Button>
                            )}
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {serviceKeys.map((key) => (
                                <div
                                    key={key.id}
                                    className={`flex items-center justify-between p-4 border rounded-lg ${key.archived_at ? 'bg-muted opacity-60' : 'bg-card'
                                        }`}
                                >
                                    <div className="flex-1">
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className="font-medium">{key.name}</span>
                                            {key.archived_at ? (
                                                <Badge variant="secondary">{t('statusArchived')}</Badge>
                                            ) : key.is_active ? (
                                                <Badge variant="default">{t('statusActive')}</Badge>
                                            ) : (
                                                <Badge variant="destructive">{t('statusInactive')}</Badge>
                                            )}
                                            {key.expires_at && new Date(key.expires_at) > new Date() && (
                                                <Badge variant="outline">
                                                    {t('expires', { date: formatDate(key.expires_at) })}
                                                </Badge>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                            <span className="font-mono bg-muted px-2 py-1 rounded">{key.key_prefix}...</span>
                                            <span className="text-xs text-muted-foreground/70">
                                                {t('keyHidden')}
                                            </span>
                                        </div>
                                        <div className="mt-2 text-xs text-muted-foreground">
                                            {t('createdLastUsed', { created: formatDate(key.created_at), lastUsed: formatDate(key.last_used_at ?? null) })}
                                        </div>
                                    </div>
                                    <div className="flex gap-2">
                                        {!key.archived_at && showServiceKeyArchiveControls && (
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => handleArchiveServiceKey(String(key.id))}
                                                className="text-destructive hover:text-destructive/90"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </Button>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </PageSection>

                <div className="p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
                    <p className="text-sm text-yellow-600 dark:text-yellow-500">
                        <strong>{t('importantLabel')}</strong> {t('importantBody')}
                    </p>
                </div>
            </PageLayout>

            {/* Create API Key Dialog */}
            <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{t('createApiKeyDialogTitle')}</DialogTitle>
                        <DialogDescription>
                            {t('createApiKeyDialogDescription')}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="grid gap-2">
                            <Label htmlFor="name">{t('keyName')}</Label>
                            <Input
                                id="name"
                                value={newKeyName}
                                onChange={(e) => setNewKeyName(e.target.value)}
                                placeholder={t('keyNamePlaceholder')}
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                            {t('cancel')}
                        </Button>
                        <Button onClick={handleCreateKey}>
                            {t('createKey')}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Show Created Key Dialog */}
            <Dialog open={showCreatedKeyDialog} onOpenChange={setShowCreatedKeyDialog}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{t('apiKeyCreatedTitle')}</DialogTitle>
                        <DialogDescription>
                            {t('apiKeyCreatedDescription')}
                        </DialogDescription>
                    </DialogHeader>
                    {createdKey && (
                        <div className="space-y-4">
                            <div className="p-4 bg-muted rounded-lg">
                                <p className="text-sm text-muted-foreground mb-2">{t('yourApiKey')}</p>
                                <div className="flex items-center gap-2">
                                    <code className="flex-1 p-2 bg-background rounded text-sm font-mono break-all">
                                        {createdKey.api_key}
                                    </code>
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => copyToClipboard(createdKey.api_key)}
                                    >
                                        <Copy className="w-4 h-4" />
                                    </Button>
                                </div>
                            </div>
                            <div className="p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
                                <p className="text-sm text-yellow-600 dark:text-yellow-500">
                                    {t('storeKeySecurely')}
                                </p>
                            </div>
                        </div>
                    )}
                    <DialogFooter>
                        <Button onClick={() => {
                            setShowCreatedKeyDialog(false);
                            setCreatedKey(null);
                        }}>
                            {t('done')}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Create Service Key Dialog */}
            <Dialog open={isCreateServiceDialogOpen} onOpenChange={setIsCreateServiceDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{t('createServiceKeyDialogTitle')}</DialogTitle>
                        <DialogDescription>
                            {t('createServiceKeyDialogDescription')}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="grid gap-2">
                            <Label htmlFor="service-name">{t('serviceKeyName')}</Label>
                            <Input
                                id="service-name"
                                value={newServiceKeyName}
                                onChange={(e) => setNewServiceKeyName(e.target.value)}
                                placeholder={t('serviceKeyNamePlaceholder')}
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsCreateServiceDialogOpen(false)}>
                            {t('cancel')}
                        </Button>
                        <Button onClick={handleCreateServiceKey}>
                            {t('createServiceKey')}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Show Created Service Key Dialog */}
            <Dialog open={showCreatedServiceKeyDialog} onOpenChange={setShowCreatedServiceKeyDialog}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{t('serviceKeyCreatedTitle')}</DialogTitle>
                        <DialogDescription>
                            {t('serviceKeyCreatedDescription')}
                        </DialogDescription>
                    </DialogHeader>
                    {createdServiceKey && (
                        <div className="space-y-4">
                            <div className="p-4 bg-muted rounded-lg">
                                <p className="text-sm text-muted-foreground mb-2">{t('yourServiceKey')}</p>
                                <div className="flex items-center gap-2">
                                    <code className="flex-1 p-2 bg-background rounded text-sm font-mono break-all">
                                        {createdServiceKey.service_key}
                                    </code>
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => copyToClipboard(createdServiceKey.service_key)}
                                    >
                                        <Copy className="w-4 h-4" />
                                    </Button>
                                </div>
                            </div>
                            <div className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-lg">
                                <p className="text-sm text-blue-600 dark:text-blue-500">
                                    {t('serviceKeyAccess')}
                                    {createdServiceKey.expires_at && (
                                        <span className="block mt-1">
                                            {t('expiresOn', { date: formatDate(createdServiceKey.expires_at) })}
                                        </span>
                                    )}
                                </p>
                            </div>
                            <div className="p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
                                <p className="text-sm text-yellow-600 dark:text-yellow-500">
                                    {t('storeKeySecurely')}
                                </p>
                            </div>
                        </div>
                    )}
                    <DialogFooter>
                        <Button onClick={() => {
                            setShowCreatedServiceKeyDialog(false);
                            setCreatedServiceKey(null);
                        }}>
                            {t('done')}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}
