"use client";

import { useTranslations } from "next-intl";
import { useId } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface VersionMetadataFieldsProps {
    versionName: string;
    description: string;
    onVersionNameChange: (value: string) => void;
    onDescriptionChange: (value: string) => void;
    disabled: boolean;
}

export function VersionMetadataFields({ versionName, description, onVersionNameChange, onDescriptionChange, disabled }: VersionMetadataFieldsProps) {
    const t = useTranslations("Workflow");
    const id = useId();

    return (
        <>
            <div className="space-y-1.5">
                <Label htmlFor={`${id}-name`} className="text-xs">
                    {t("versionName")} <span className="font-normal text-gray-400">{t("optional")}</span>
                </Label>
                <Input
                    id={`${id}-name`}
                    value={versionName}
                    onChange={(event) => onVersionNameChange(event.target.value)}
                    placeholder={t("versionNamePlaceholder")}
                    maxLength={100}
                    disabled={disabled}
                    className="h-8 border-[#3a3a3a] bg-[#222]"
                />
            </div>
            <div className="space-y-1.5">
                <Label htmlFor={`${id}-description`} className="text-xs">
                    {t("changeDescription")} <span className="font-normal text-gray-400">{t("optional")}</span>
                </Label>
                <Textarea
                    id={`${id}-description`}
                    value={description}
                    onChange={(event) => onDescriptionChange(event.target.value)}
                    placeholder={t("changeDescriptionPlaceholder")}
                    maxLength={500}
                    rows={2}
                    disabled={disabled}
                    aria-describedby={`${id}-count`}
                    className="min-h-16 max-h-28 resize-none border-[#3a3a3a] bg-[#222]"
                />
                <p id={`${id}-count`} className="text-right text-xs text-gray-500">{t("versionNotesCount", { count: description.length })}</p>
            </div>
        </>
    );
}
