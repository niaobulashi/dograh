"use client";

import { Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId } from "react";

import type { RecordingResponseSchema } from "@/client/types.gen";
import { StaticTextWarning, TextOrAudioInput } from "@/components/flow/TextOrAudioInput";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

import { type MessageVariant, toolMessagesErrorKeys, type ToolMessagesForm, validateToolMessages } from "./toolMessages";

type Props = {
    value: ToolMessagesForm;
    onChange: (value: ToolMessagesForm) => void;
    recordings: RecordingResponseSchema[];
    timeoutMs?: number;
};

function Variants({ value, onChange, recordings, label }: {
    value: MessageVariant[];
    onChange: (value: MessageVariant[]) => void;
    recordings: RecordingResponseSchema[];
    /** Already translated group name, e.g. "start" or "delayed 1". */
    label: string;
}) {
    const t = useTranslations("Tools");
    const id = useId();
    const update = (index: number, next: MessageVariant) => onChange(value.map((item, i) => i === index ? next : item));
    return (
        <div className="space-y-3">
            {value.map((variant, index) => (
                <div key={index} className="rounded-md border p-3 space-y-2">
                    <div className="flex items-center justify-between">
                        <Label htmlFor={`${id}-${index}`}>{t("messages.variantLabel", { index: index + 1 })}</Label>
                        <Button type="button" variant="ghost" size="sm" aria-label={t("messages.removeVariant", { label, index: index + 1 })}
                            onClick={() => onChange(value.filter((_, i) => i !== index))}>
                            <Trash2 className="size-4" />
                        </Button>
                    </div>
                    <TextOrAudioInput
                        type={variant.type}
                        onTypeChange={(type) => update(index, type === "text" ? { type, text: "" } : { type, recording_id: 0 })}
                        recordingId={variant.type === "audio" && variant.recording_id ? String(variant.recording_id) : ""}
                        onRecordingIdChange={(recordingId) => update(index, { type: "audio", recording_id: Number(recordingId) })}
                        recordings={recordings}
                    >
                        <Textarea id={`${id}-${index}`} aria-label={t("messages.variantInputAria", { label, index: index + 1 })}
                            value={variant.type === "text" ? variant.text : ""} rows={2}
                            placeholder={t("messages.variantPlaceholder")}
                            onChange={(event) => update(index, { type: "text", text: event.target.value })} />
                    </TextOrAudioInput>
                </div>
            ))}
            <Button type="button" variant="outline" size="sm" disabled={value.length >= 20}
                onClick={() => onChange([...value, { type: "text", text: "" }])}>
                <Plus className="mr-2 size-4" />{t("messages.addVariant", { label })}
            </Button>
        </div>
    );
}

export function ToolMessagesEditor({ value, onChange, recordings, timeoutMs }: Props) {
    const t = useTranslations("Tools");
    const id = useId();
    const delayed = value.delayed ?? [];
    const error = validateToolMessages(value);
    return (
        <Card className="mt-6">
            <CardHeader>
                <CardTitle>{t("messages.title")}</CardTitle>
                <CardDescription>
                    {t("messages.description")}
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
                <StaticTextWarning />
                <section className="space-y-3" aria-labelledby={`${id}-start`}>
                    <h3 id={`${id}-start`} className="font-medium">{t("messages.whenToolStarts")}</h3>
                    {!value.start && <p className="text-sm text-muted-foreground">{t("messages.noStartMessage")}</p>}
                    <Variants value={value.start?.variants ?? []} recordings={recordings} label={t("messages.groupStart")}
                        onChange={(variants) => onChange({ ...value, start: variants.length ? { variants } : null })} />
                </section>
                <section className="space-y-3 border-t pt-5" aria-labelledby={`${id}-delayed`}>
                    <h3 id={`${id}-delayed`} className="font-medium">{t("messages.whileRunning")}</h3>
                    <p className="text-sm text-muted-foreground">
                        {t("messages.whileRunningHint")}
                    </p>
                    {delayed.map((message, index) => (
                        <div key={index} className="rounded-lg border p-4 space-y-3">
                            <div className="flex items-center justify-between gap-3">
                                <div className="flex items-center gap-2">
                                    <Label htmlFor={`${id}-delay-${index}`}>{t("messages.afterLabel")}</Label>
                                    <Input id={`${id}-delay-${index}`} aria-label={t("messages.delayAria", { index: index + 1 })}
                                        type="number" min={1} max={120000} step={1} className="w-28" value={message.after_ms || ""}
                                        onChange={(event) => onChange({ ...value, delayed: delayed.map((item, i) => i === index ? { ...item, after_ms: Number(event.target.value) } : item) })} />
                                    <span className="text-sm text-muted-foreground">{t("messages.milliseconds")}</span>
                                </div>
                                <Button type="button" variant="ghost" size="sm" aria-label={t("messages.removeDelayed", { index: index + 1 })}
                                    onClick={() => onChange({ ...value, delayed: delayed.filter((_, i) => i !== index) })}>
                                    <Trash2 className="size-4" />
                                </Button>
                            </div>
                            {timeoutMs != null && message.after_ms >= timeoutMs && (
                                <p className="text-sm text-amber-700">{t("messages.beyondTimeout")}</p>
                            )}
                            <Variants value={message.variants} recordings={recordings} label={t("messages.groupDelayed", { index: index + 1 })}
                                onChange={(variants) => onChange({ ...value, delayed: delayed.map((item, i) => i === index ? { ...item, variants } : item) })} />
                        </div>
                    ))}
                    <Button type="button" variant="outline" size="sm" disabled={delayed.length >= 10}
                        onClick={() => {
                            const timings = new Set(delayed.map((item) => item.after_ms));
                            let after_ms = Math.min(120000, Math.max(0, ...timings) + 3000);
                            if (timings.has(after_ms)) {
                                after_ms = 3000;
                                while (timings.has(after_ms)) after_ms += 3000;
                            }
                            onChange({ ...value, delayed: [...delayed, { after_ms, variants: [{ type: "text", text: "" }] }] });
                        }}>
                        <Plus className="mr-2 size-4" />{t("messages.addDelayed")}
                    </Button>
                </section>
                {error && <p role="alert" className="text-sm text-destructive">{t(toolMessagesErrorKeys[error])}</p>}
                <p className="text-sm text-muted-foreground">{t("messages.afterFinish")}</p>
            </CardContent>
        </Card>
    );
}
