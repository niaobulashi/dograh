'use client';

import { Bot, ChevronDown, LayoutTemplate, PlusIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';

import { createWorkflowApiV1WorkflowCreateDefinitionPost } from '@/client/sdk.gen';
import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from '@/lib/auth';
import logger from '@/lib/logger';
import { getRandomId } from '@/lib/utils';

function buildBlankWorkflowDefinition(copy: {
    greeting: string;
    prompt: string;
    name: string;
}) {
    return {
        nodes: [
            {
                id: "1",
                type: "startCall",
                position: { x: 175, y: 60 },
                data: {
                    greeting: copy.greeting,
                    prompt: copy.prompt,
                    name: copy.name,
                    allow_interrupt: true,
                    invalid: false,
                    validationMessage: null,
                    add_global_prompt: false,
                    delayed_start: false,
                    is_start: true,
                    selected_through_edge: false,
                    hovered_through_edge: false,
                    extraction_enabled: false,
                    selected: false,
                    dragging: false,
                },
            },
        ],
        edges: [],
        viewport: { x: 808, y: 269, zoom: 0.75 },
    };
}

export function CreateWorkflowButton() {
    const t = useTranslations("Workflow");
    const router = useRouter();
    const { user, getAccessToken } = useAuth();
    const [isCreating, setIsCreating] = useState(false);

    const handleAgentBuilder = () => {
        router.push('/workflow/create');
    };

    const handleBlankCanvas = async () => {
        if (isCreating || !user) return;
        setIsCreating(true);

        try {
            const accessToken = await getAccessToken();
            const name = `Workflow-${getRandomId()}`;
            const blankWorkflowDefinition = buildBlankWorkflowDefinition({
                greeting: t('blankWorkflowGreeting'),
                prompt: t('blankWorkflowPrompt'),
                name: t('blankWorkflowStartNodeName'),
            });
            const response = await createWorkflowApiV1WorkflowCreateDefinitionPost({
                body: {
                    name,
                    workflow_definition: blankWorkflowDefinition as unknown as { [key: string]: unknown },
                },
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                },
            });

            if (response.data?.id) {
                router.push(`/workflow/${response.data.id}`);
            }
        } catch (err) {
            logger.error(`Error creating blank workflow: ${err}`);
            toast.error(t('failedToCreateWorkflow'));
        } finally {
            setIsCreating(false);
        }
    };

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button disabled={isCreating}>
                    <PlusIcon className="w-4 h-4" />
                    {isCreating ? t('creating') : t('createAgent')}
                    <ChevronDown className="w-4 h-4" />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={handleAgentBuilder} className="cursor-pointer">
                    <Bot className="w-4 h-4 mr-2" />
                    <div>
                        <div className="font-medium">{t('useAgentBuilder')}</div>
                        <div className="text-xs text-muted-foreground">{t('useAgentBuilderHint')}</div>
                    </div>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleBlankCanvas} disabled={isCreating} className="cursor-pointer">
                    <LayoutTemplate className="w-4 h-4 mr-2" />
                    <div>
                        <div className="font-medium">{t('blankCanvas')}</div>
                        <div className="text-xs text-muted-foreground">{t('blankCanvasHint')}</div>
                    </div>
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
