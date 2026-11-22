/**
 * useAudioPlayer — reactive audio playback state, seeking, and volume control.
 */

import { ref, computed, type ComputedRef, type Ref } from 'vue';

type UseAudioPlayerReturn = {
    audioUrl: Ref<string>;
    audioRef: Ref<HTMLAudioElement | null>;
    audioError: Ref<boolean>;
    isLoadingAudio: Ref<boolean>;
    audioPlaying: Ref<boolean>;
    audioDuration: Ref<number>;
    audioCurrentTime: Ref<number>;
    audioVolume: Ref<number>;
    audioProgressPercent: ComputedRef<number>;
    onAudioError: () => void;
    onAudioLoaded: () => void;
    onAudioEnded: () => void;
    toggleAudioPlayback: () => void;
    seekAudio: (event: MouseEvent) => void;
    onVolumeChange: (event: Event) => void;
    toggleMute: () => void;
    loadAudio: (filePath: string) => Promise<void>;
    reset: () => void;
};

export function useAudioPlayer(): UseAudioPlayerReturn {
    const audioUrl = ref('');
    const audioRef = ref<HTMLAudioElement | null>(null);
    const audioError = ref(false);
    const isLoadingAudio = ref(false);
    const audioPlaying = ref(false);
    const audioDuration = ref(0);
    const audioCurrentTime = ref(0);
    const audioVolume = ref(1);
    let audioRafId: number | null = null;

    function onAudioError(): void {
        audioError.value = true;
    }

    function onAudioLoaded(): void {
        if (audioRef.value !== null) audioDuration.value = audioRef.value.duration;
    }

    function onAudioEnded(): void {
        audioPlaying.value = false;
        if (audioRafId !== null) {
            cancelAnimationFrame(audioRafId);
            audioRafId = null;
        }
    }

    function updateAudioProgress(): void {
        if (audioRef.value !== null) audioCurrentTime.value = audioRef.value.currentTime;
        if (audioPlaying.value) audioRafId = requestAnimationFrame(updateAudioProgress);
    }

    function toggleAudioPlayback(): void {
        if (audioRef.value === null) return;
        if (audioPlaying.value) {
            audioRef.value.pause();
            audioPlaying.value = false;
            if (audioRafId !== null) {
                cancelAnimationFrame(audioRafId);
                audioRafId = null;
            }
        } else {
            void audioRef.value.play();
            audioPlaying.value = true;
            updateAudioProgress();
        }
    }

    const audioProgressPercent = computed((): number => {
        if (audioDuration.value === 0) return 0;
        return (audioCurrentTime.value / audioDuration.value) * 100;
    });

    function seekAudio(event: MouseEvent): void {
        if (audioRef.value === null || !(audioDuration.value > 0)) return;
        const wrapper = event.currentTarget;
        if (!(wrapper instanceof HTMLElement)) return;
        const rect = wrapper.getBoundingClientRect();
        const percent = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
        audioRef.value.currentTime = percent * audioDuration.value;
        audioCurrentTime.value = audioRef.value.currentTime;
    }

    function onVolumeChange(event: Event): void {
        if (!(event.target instanceof HTMLInputElement)) return;
        const value = parseFloat(event.target.value);
        audioVolume.value = value;
        if (audioRef.value !== null) audioRef.value.volume = value;
    }

    function toggleMute(): void {
        if (audioVolume.value > 0) audioVolume.value = 0;
        else audioVolume.value = 1;
        if (audioRef.value !== null) audioRef.value.volume = audioVolume.value;
    }

    async function loadAudio(filePath: string): Promise<void> {
        isLoadingAudio.value = true;
        audioError.value = false;
        audioUrl.value = '';

        try {
            const result = await window.electronAPI.readAudio(filePath);
            if (result.success && result.dataUrl !== undefined) {
                audioUrl.value = result.dataUrl;
            } else {
                window.electronAPI.log.error('Failed to load audio:', result.error);
                audioError.value = true;
            }
        } catch (error) {
            window.electronAPI.log.error('Error loading audio:', error);
            audioError.value = true;
        } finally {
            isLoadingAudio.value = false;
        }
    }

    function reset(): void {
        if (audioRafId !== null) {
            cancelAnimationFrame(audioRafId);
            audioRafId = null;
        }
        audioError.value = false;
        audioPlaying.value = false;
        audioCurrentTime.value = 0;
        audioDuration.value = 0;
        audioUrl.value = '';
    }

    return {
        audioUrl,
        audioRef,
        audioError,
        isLoadingAudio,
        audioPlaying,
        audioDuration,
        audioCurrentTime,
        audioVolume,
        audioProgressPercent,
        onAudioError,
        onAudioLoaded,
        onAudioEnded,
        toggleAudioPlayback,
        seekAudio,
        onVolumeChange,
        toggleMute,
        loadAudio,
        reset,
    };
}
