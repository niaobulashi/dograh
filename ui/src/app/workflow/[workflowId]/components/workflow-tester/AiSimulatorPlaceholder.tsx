"use client";

import { Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

import { DisabledNotice } from "./shared";

export function AiSimulatorPlaceholder({
    disabledReason,
}: {
    disabledReason: string | null;
}) {
    const t = useTranslations("Workflow");
    const [simulatorPrompt, setSimulatorPrompt] = useState(
        t("aiSimulatorDefaultPrompt"),
    );

    return (
        <div className="flex min-h-0 flex-1 flex-col gap-3">
            {disabledReason ? <DisabledNotice reason={disabledReason} /> : null}
            <p className="text-sm text-muted-foreground">
                {t("aiSimulatorDescription")}
            </p>
            <Textarea
                value={simulatorPrompt}
                onChange={(event) => setSimulatorPrompt(event.target.value)}
                placeholder={t("aiSimulatorPlaceholder")}
                className="min-h-32 resize-none text-sm leading-6"
            />
            <Button size="sm" disabled className="self-start">
                <Sparkles className="h-4 w-4" />
                {t("comingSoon")}
            </Button>
        </div>
    );
}
