'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

import { useOrganizationTimezone } from '@/hooks/useOrganizationTimezone';
import { formatDate } from '@/lib/dateTime';

interface WorkflowCardProps {
    id: number;
    name: string;
    createdAt: string;
}

export function WorkflowCard({ id, name, createdAt }: WorkflowCardProps) {
    const t = useTranslations("Workflow");
    const router = useRouter();
    const organizationTimezone = useOrganizationTimezone();

    const handleClick = () => {
        router.push(`/workflow/${id}`);
    };

    return (
        <div
            className="bg-white border rounded-lg overflow-hidden shadow-sm hover:shadow-md transition-all duration-200 p-4 cursor-pointer transform hover:-translate-y-1"
            onClick={handleClick}
        >
            <div>
                <h3 className="text-lg font-semibold mb-2">{name}</h3>
                <p className="text-gray-600 mb-2">
                    {t("createdLabel", { date: formatDate(createdAt, organizationTimezone) })}
                </p>
            </div>
        </div>
    );
}
