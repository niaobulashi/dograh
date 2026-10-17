import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";

export const useDeviceInputs = () => {
    const t = useTranslations("Workflow");
    const [audioInputs, setAudioInputs] = useState<MediaDeviceInfo[]>([]);
    const [selectedAudioInput, setSelectedAudioInput] = useState('');
    const [permissionError, setPermissionError] = useState<string | null>(null);

    const getAudioInputDevices = useCallback(async () => {
        try {
            const devices = await navigator.mediaDevices.enumerateDevices();
            const audioDevices = devices.filter(device => device.kind === 'audioinput');
            setAudioInputs(audioDevices);

            const defaultAudioInput = audioDevices.find(device => device.deviceId === 'default');
            if (defaultAudioInput) {
                setSelectedAudioInput(defaultAudioInput.deviceId);
            }
        } catch {
            setPermissionError(t("couldNotEnumerateDevices"));
        }
    }, [t]);

    useEffect(() => {
        getAudioInputDevices();
    }, [getAudioInputDevices]);

    return {
        audioInputs,
        selectedAudioInput,
        setSelectedAudioInput,
        permissionError,
        setPermissionError,
        getAudioInputDevices
    };
};
