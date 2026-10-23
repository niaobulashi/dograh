import type { VoiceInfo } from "@/client/types.gen";

const SARVAM_LANG_NAMES: Record<string, [string, string]> = {
    as: ["Assamese", "as"],
    bn: ["Bengali", "bn"],
    en: ["English", "en"],
    enhi: ["English-Hindi", "en-hi"],
    gu: ["Gujarati", "gu"],
    hi: ["Hindi", "hi"],
    kn: ["Kannada", "kn"],
    mr: ["Marathi", "mr"],
    pa: ["Punjabi", "pa"],
    ta: ["Tamil", "ta"],
    te: ["Telugu", "te"],
};

function capitalize(value: string): string {
    return value.charAt(0).toUpperCase() + value.slice(1);
}

function sarvamStyleName(styleKey: string): string {
    if (styleKey.toLowerCase() === "kyc") return "KYC";
    return styleKey.replaceAll("_", " ").split(" ").map(capitalize).join(" ");
}

// DashScope Qwen-Audio-TTS system voices. The cosyvoice *_v2 voices are gone:
// DashScope serves no /audio/speech endpoint, so every speech model now runs on
// the realtime websocket and uses the v3.1 voice set.
const DASHSCOPE_VOICE_NAMES: Record<string, { name: string; gender?: string; language?: string }> = {
    "longanlingxin_v3.1": { name: "龙安灵心（温柔女声）", gender: "female", language: "zh" },
    "xunanchuan_v3.1": { name: "许南川（磁性男声）", gender: "male", language: "zh" },
    "longanhuan_v3.1": { name: "龙安欢（活力女声）", gender: "female", language: "zh" },
    "longanfengyue_v3.1": { name: "龙安风悦（清朗女声）", gender: "female", language: "zh" },
};

/**
 * For providers with a static voice list (Sarvam, DashScope), parse the schema
 * options directly on the client to provide 0 ms instant loading, rich metadata,
 * and search without unnecessary network calls. DashScope voice IDs are shown as
 * localized names instead of raw vendor identifiers. MiniMax pulls its voices
 * live from its voice catalog (with previews), so it is not handled here.
 */
export function getStaticVoices(provider: string, options?: string[], model?: string): VoiceInfo[] | undefined {
    if (provider === "dashscope") {
        if (!options?.length) return undefined;
        return options.map((id) => {
            const meta = DASHSCOPE_VOICE_NAMES[id];
            return {
                voice_id: id,
                name: meta?.name || capitalize(id),
                description: meta ? id : undefined,
                gender: meta?.gender,
                language: meta?.language,
            };
        });
    }
    if (provider !== "sarvam" || !options?.length) return undefined;

    if (model === "bulbul:v3") {
        return options.map((name) => ({
            voice_id: name,
            name: capitalize(name),
            description: "Multilingual",
            language: "multilingual",
        }));
    }

    return options.map((voiceId) => {
        const parts = voiceId.split("_");
        if (parts.length >= 3) {
            const rawName = parts[0];
            const langCode = parts[1];
            const styleKey = parts.slice(2).join("_");
            const [langName, langTag] = SARVAM_LANG_NAMES[langCode] || [capitalize(langCode), langCode];
            const styleName = sarvamStyleName(styleKey);
            const speakerName = capitalize(rawName);
            return {
                voice_id: voiceId,
                name: speakerName,
                description: `${langName} • ${styleName} • ${voiceId}`,
                accent: styleName,
                language: langTag,
            };
        }
        return {
            voice_id: voiceId,
            name: capitalize(voiceId.replaceAll("_", " ")),
            description: voiceId,
        };
    });
}
