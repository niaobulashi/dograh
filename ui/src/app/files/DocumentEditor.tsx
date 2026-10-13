'use client';

import { Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import {
  getDocumentContentApiV1KnowledgeBaseDocumentsDocumentUuidContentGet,
  saveDocumentContentApiV1KnowledgeBaseDocumentsDocumentUuidContentPut,
} from '@/client/sdk.gen';
import type { DocumentResponseSchema } from '@/client/types.gen';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { detailFromError } from '@/lib/apiError';
import logger from '@/lib/logger';

import ExternalProcessingNotice from './ExternalProcessingNotice';

const EDITABLE_EXTENSIONS = ['.txt', '.md'];

export function isEditableDocument(filename: string): boolean {
  const lower = filename.toLowerCase();
  return EDITABLE_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

interface DocumentEditorProps {
  doc: DocumentResponseSchema | null;
  onClose: () => void;
  onSaved: () => void;
}

export default function DocumentEditor({ doc, onClose, onSaved }: DocumentEditorProps) {
  const t = useTranslations('Files');
  const [content, setContent] = useState('');
  const [savedContent, setSavedContent] = useState('');
  const [fileHash, setFileHash] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const documentUuid = doc?.document_uuid;

  useEffect(() => {
    if (!documentUuid) return;
    let cancelled = false;

    const loadContent = async () => {
      setIsLoading(true);
      setLoadError(null);
      setSaveError(null);
      try {
        const response = await getDocumentContentApiV1KnowledgeBaseDocumentsDocumentUuidContentGet({
          path: { document_uuid: documentUuid },
        });
        if (cancelled) return;
        if (response.error || !response.data) {
          setLoadError(detailFromError(response.error, t('loadError')));
          return;
        }
        setContent(response.data.content);
        setSavedContent(response.data.content);
        setFileHash(response.data.file_hash);
      } catch (err) {
        if (cancelled) return;
        logger.error('Error loading document content:', err);
        setLoadError(t('loadError'));
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    loadContent();
    return () => {
      cancelled = true;
    };
  }, [documentUuid, t]);

  const isDirty = content !== savedContent;
  // Saving unchanged text re-runs processing, so it doubles as a retry.
  const canSave =
    !!doc && !isLoading && !loadError && !isSaving &&
    (isDirty || doc.processing_status === 'failed');
  const isChunked = doc?.retrieval_mode !== 'full_document';

  const handleOpenChange = (open: boolean) => {
    if (open || isSaving) return;
    if (isDirty && !confirm(t('discardConfirm'))) return;
    onClose();
  };

  const handleSave = async () => {
    if (!doc) return;
    setIsSaving(true);
    setSaveError(null);
    try {
      const response = await saveDocumentContentApiV1KnowledgeBaseDocumentsDocumentUuidContentPut({
        path: { document_uuid: doc.document_uuid },
        body: { content, expected_file_hash: fileHash },
      });
      if (response.error || !response.data) {
        setSaveError(detailFromError(response.error, t('saveError')));
        return;
      }
      toast.success(
        response.data.processing_status === 'pending'
          ? t('savedProcessing', { filename: doc.filename })
          : t('noChanges', { filename: doc.filename })
      );
      onSaved();
    } catch (err) {
      logger.error('Error saving document content:', err);
      setSaveError(t('saveError'));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={!!doc} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle className="truncate pr-6">{doc?.filename}</DialogTitle>
          <DialogDescription>
            {isChunked
              ? t('chunkedSaveHint')
              : t('fullDocumentSaveHint')}
          </DialogDescription>
        </DialogHeader>

        <ExternalProcessingNotice />

        {isLoading ? (
          <div
            role="status"
            className="flex h-[60vh] w-full flex-col items-center justify-center gap-2 rounded-md border border-input text-sm text-muted-foreground"
          >
            <Loader2 className="h-6 w-6 animate-spin" />
            <span>{t('loadingDocument')}</span>
          </div>
        ) : loadError ? (
          <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-lg text-destructive text-sm">
            {loadError}
          </div>
        ) : (
          <Textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            disabled={isSaving}
            spellCheck={false}
            className="h-[60vh] resize-none font-mono text-sm field-sizing-fixed"
          />
        )}

        {saveError && <p className="text-sm text-destructive">{saveError}</p>}

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={isSaving}>
            {t('cancel')}
          </Button>
          <Button onClick={handleSave} disabled={!canSave}>
            {isSaving ? t('saving') : isChunked ? t('saveAndReindex') : t('save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
