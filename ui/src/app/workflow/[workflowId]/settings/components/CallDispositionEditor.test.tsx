import { fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { useState } from "react";
import { describe, expect, it } from "vitest";

import {
    CallDispositionEditor,
    type CallDispositionRow,
    MAX_CALL_DISPOSITION_CODE_LENGTH,
    MAX_CALL_DISPOSITION_DESCRIPTION_LENGTH,
    MAX_CALL_DISPOSITION_DESCRIPTIONS_TOTAL_LENGTH,
    normalizeCallDispositions,
    validateCallDispositionRows,
} from "./CallDispositionEditor";

// Minimal messages so the component's useTranslations calls resolve in tests.
// Values are English to keep the existing text assertions stable.
const messages = {
    Workflow: {
        cancel: "Cancel",
        extractCallDisposition: "Extract call disposition at the end of the call",
        dispositionConfigured:
            "{count, plural, =1 {# outcome configured. Dograh will classify the completed conversation into one of them.} other {# outcomes configured. Dograh will classify the completed conversation into one of them.}}",
        dispositionDisabled:
            "Disabled. Dograh will keep the disposition recorded by the call-ending event.",
        configureOptions: "Configure options",
        callDispositionExtraction: "Call disposition extraction",
        callDispositionExtractionDescription:
            "Configure the code and description pairs the model can choose from. Codes are recorded before organization-level disposition mapping is applied.",
        saveOptions: "Save options",
        enableExtraction: "Enable extraction",
        dispositionOptions: "Disposition options",
        addCustomDisposition: "Add custom disposition",
        dispositionN: "Disposition {n}",
        dispositionCode: "Disposition Code",
        dispositionDescription: "Description",
        dispositionDescriptionPlaceholder:
            "Use when the customer meets the qualification criteria and wants to proceed.",
        removeDisposition: "Remove disposition {n}",
        addAtLeastOneDisposition: "Add at least one disposition",
        extractionNeedsClosedList: "Extraction needs a closed list of outcomes to choose from.",
        descriptionCharacters: "{current} / {max} description characters",
        dispositionCodeRequired: "Disposition code is required.",
        dispositionCodeMaxLength: "Disposition code must be at most 64 characters.",
        dispositionCodePattern:
            "Start with a letter and use only letters, numbers, underscores, or hyphens.",
        dispositionCodesUnique: "Disposition codes must be unique.",
        descriptionRequired: "Description is required.",
        descriptionMaxLength: "Description must be at most 1,000 characters.",
        descriptionsTotalMaxLength: "Descriptions must total at most 4,000 characters.",
    },
};

const DEFAULT_DISPOSITIONS = [
    { code: "qualified", description: "The call achieved its goal." },
    { code: "not_interested", description: "The person declined the offer." },
];

function Harness({
    initialRows = [],
    defaultDispositions = DEFAULT_DISPOSITIONS,
}: {
    initialRows?: CallDispositionRow[];
    defaultDispositions?: typeof DEFAULT_DISPOSITIONS;
}) {
    const [rows, setRows] = useState(initialRows);
    return (
        <NextIntlClientProvider locale="en" messages={messages}>
            <CallDispositionEditor
                rows={rows}
                onChange={setRows}
                defaultDispositions={defaultDispositions}
            />
        </NextIntlClientProvider>
    );
}

describe("CallDispositionEditor", () => {
    it("starts disabled, then seeds the configuration dialog with backend defaults", () => {
        render(<Harness />);

        const toggle = screen.getByRole("switch", {
            name: "Extract call disposition at the end of the call",
        });
        expect(toggle.getAttribute("aria-checked")).toBe("false");

        fireEvent.click(toggle);

        expect(screen.getByRole("dialog", { name: "Call disposition extraction" })).toBeTruthy();
        expect(
            screen.getAllByLabelText("Disposition Code").map((input) => (
                (input as HTMLInputElement).value
            )),
        ).toEqual(["qualified", "not_interested"]);

        fireEvent.click(screen.getByRole("button", { name: "Enable extraction" }));

        expect(toggle.getAttribute("aria-checked")).toBe("true");
        expect(screen.getByText(/2 outcomes configured/i)).toBeTruthy();
    });

    it("allows custom code and description pairs when no suggestions are available", () => {
        render(<Harness defaultDispositions={[]} />);

        fireEvent.click(screen.getByRole("switch", {
            name: "Extract call disposition at the end of the call",
        }));

        expect(screen.getByText("Add at least one disposition")).toBeTruthy();
        fireEvent.click(screen.getByRole("button", { name: "Add custom disposition" }));

        const code = screen.getByLabelText("Disposition Code") as HTMLInputElement;
        const description = screen.getByLabelText("Description") as HTMLTextAreaElement;
        expect(code.maxLength).toBe(MAX_CALL_DISPOSITION_CODE_LENGTH);
        expect(description.maxLength).toBe(MAX_CALL_DISPOSITION_DESCRIPTION_LENGTH);
        expect(screen.getByText("Disposition code is required.")).toBeTruthy();
        expect(screen.getByText("Description is required.")).toBeTruthy();
    });

    it("keeps the focused dialog row mounted when an earlier row is removed", () => {
        render(
            <Harness
                initialRows={[
                    { id: "first", code: "qualified", description: "Qualified." },
                    { id: "second", code: "callback", description: "Callback." },
                ]}
            />,
        );

        fireEvent.click(screen.getByRole("button", { name: "Configure options" }));
        const secondDescription = screen.getAllByLabelText("Description")[1];
        secondDescription.focus();
        fireEvent.click(screen.getByRole("button", { name: "Remove disposition 1" }));

        expect(screen.getByLabelText("Description")).toBe(secondDescription);
        expect(document.activeElement).toBe(secondDescription);
    });

    it("remembers configured options when extraction is toggled off and back on", () => {
        render(
            <Harness
                initialRows={[
                    { id: "custom", code: "call_rescheduled", description: "A new time was booked." },
                ]}
            />,
        );

        const toggle = screen.getByRole("switch", {
            name: "Extract call disposition at the end of the call",
        });
        fireEvent.click(toggle);
        expect(toggle.getAttribute("aria-checked")).toBe("false");

        fireEvent.click(toggle);
        expect((screen.getByLabelText("Disposition Code") as HTMLInputElement).value)
            .toBe("call_rescheduled");
    });

    it("reports duplicate codes case-insensitively", () => {
        const validation = validateCallDispositionRows([
            { id: "first", code: "qualified", description: "Qualified." },
            { id: "second", code: "QUALIFIED", description: "Also qualified." },
        ]);

        expect(validation.isValid).toBe(false);
        expect(validation.rowErrors.first.code).toMatch(/unique/i);
        expect(validation.rowErrors.second.code).toMatch(/unique/i);
    });

    it("rejects unsafe codes and descriptions over the shared prompt budget", () => {
        const validation = validateCallDispositionRows([
            {
                id: "unsafe",
                code: "not interested",
                description: "x".repeat(MAX_CALL_DISPOSITION_DESCRIPTIONS_TOTAL_LENGTH),
            },
            {
                id: "overflow",
                code: "callback_requested",
                description: "x",
            },
        ]);

        expect(validation.isValid).toBe(false);
        expect(validation.rowErrors.unsafe.code).toBe("dispositionCodePattern");
        expect(validation.rowErrors.unsafe.description).toBe("descriptionMaxLength");
        expect(validation.totalError).toBe("descriptionsTotalMaxLength");
    });

    it("normalizes only persisted fields", () => {
        expect(normalizeCallDispositions([
            {
                id: "ui-only-id",
                code: "  callback_requested  ",
                description: "  The customer asks to be called later.  ",
            },
        ])).toEqual([
            {
                code: "callback_requested",
                description: "The customer asks to be called later.",
            },
        ]);
    });
});
