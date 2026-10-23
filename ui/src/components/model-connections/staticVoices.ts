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

// DashScope CosyVoice-V2 system voices (help.aliyun.com/document_detail/2920817.html).
const DASHSCOPE_VOICE_NAMES: Record<string, { name: string; gender?: string; language?: string }> = {
    "longxiaochun_v2": { name: "龙小淳（温柔姐姐）", gender: "female", language: "zh" },
    "longwan_v2": { name: "龙婉（普通话女声）", gender: "female", language: "zh" },
    "longxiaoxia_v2": { name: "龙小夏（温柔女声）", gender: "female", language: "zh" },
    "loongbella_v2": { name: "Bella2.0（新闻女声）", gender: "female", language: "zh" },
    "longcheng_v2": { name: "龙橙（阳光男声）", gender: "male", language: "zh" },
    "longshu_v2": { name: "龙书（新闻男声）", gender: "male", language: "zh" },
    "longnan_v2": { name: "龙楠（睿智青年男）", gender: "male", language: "zh" },
    "longyuan_v2": { name: "龙媛（温暖治愈女）", gender: "female", language: "zh" },
    "longmiao_v2": { name: "龙妙（抑扬顿挫女）", gender: "female", language: "zh" },
    "longhua_v2": { name: "龙华（活泼女童）", gender: "female", language: "zh" },
    "longjielidou_v2": { name: "龙杰力豆（阳光顽皮男）", gender: "male", language: "zh" },
    "longlaotie_v2": { name: "龙老铁（东北直率男）", gender: "male", language: "zh" },
    // Qwen-Audio-TTS 3.1 voices (qwen-audio-*-tts models only).
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
        // Voice ids are model-specific: the v3.1 set only works on
        // qwen-audio-*-tts, the *_v2 set only on cosyvoice.
        const isQwenAudioTts = Boolean(model?.startsWith("qwen-audio-"));
        const filtered = options.filter((id) =>
            isQwenAudioTts ? id.endsWith("_v3.1") : !id.endsWith("_v3.1"),
        );
        return (filtered.length ? filtered : options).map((id) => {
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
