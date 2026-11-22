/**
 * useVideoPlayer — reactive video playback state, seeking, and volume control.
 */

import { ref, computed, type ComputedRef, type Ref } from 'vue';

type UseVideoPlayerReturn = {
    videoUrl: Ref<string>;
    videoRef: Ref<HTMLVideoElement | null>;
    videoError: Ref<boolean>;
    videoPlaying: Ref<boolean>;
    videoDuration: Ref<number>;
    videoCurrentTime: Ref<number>;
    videoVolume: Ref<number>;
    videoProgressPercent: ComputedRef<number>;
    formatTime: (seconds: number) => string;
    onVideoError: () => void;
    onVideoLoaded: () => void;
    onVideoEnded: () => void;
    toggleVideoPlayback: () => void;
    seekVideo: (event: MouseEvent) => void;
    onVideoVolumeChange: (event: Event) => void;
    toggleVideoMute: () => void;
    reset: () => void;
};

export function useVideoPlayer(): UseVideoPlayerReturn {
    const videoUrl = ref('');
    const videoRef = ref<HTMLVideoElement | null>(null);
    const videoError = ref(false);
    const videoPlaying = ref(false);
    const videoDuration = ref(0);
    const videoCurrentTime = ref(0);
    const videoVolume = ref(1);
    let videoRafId: number | null = null;

    function formatTime(seconds: number): string {
        if (isNaN(seconds) || !isFinite(seconds)) return '0:00';
        const minutes = Math.floor(seconds / 60);
        const wholeSeconds = Math.floor(seconds % 60);
        return `${minutes}:${wholeSeconds.toString().padStart(2, '0')}`;
    }

    function onVideoError(): void {
        videoError.value = true;
    }

    function onVideoLoaded(): void {
        if (videoRef.value !== null) videoDuration.value = videoRef.value.duration;
    }

    function onVideoEnded(): void {
        videoPlaying.value = false;
        if (videoRafId !== null) {
            cancelAnimationFrame(videoRafId);
            videoRafId = null;
        }
    }

    function updateVideoProgress(): void {
        if (videoRef.value !== null) videoCurrentTime.value = videoRef.value.currentTime;
        if (videoPlaying.value) videoRafId = requestAnimationFrame(updateVideoProgress);
    }

    function toggleVideoPlayback(): void {
        if (videoRef.value === null) return;
        if (videoPlaying.value) {
            videoRef.value.pause();
            videoPlaying.value = false;
            if (videoRafId !== null) {
                cancelAnimationFrame(videoRafId);
                videoRafId = null;
            }
        } else {
            void videoRef.value.play();
            videoPlaying.value = true;
            updateVideoProgress();
        }
    }

    const videoProgressPercent = computed((): number => {
        if (videoDuration.value === 0) return 0;
        return (videoCurrentTime.value / videoDuration.value) * 100;
    });

    function seekVideo(event: MouseEvent): void {
        if (videoRef.value === null || !(videoDuration.value > 0)) return;
        const wrapper = event.currentTarget;
        if (!(wrapper instanceof HTMLElement)) return;
        const rect = wrapper.getBoundingClientRect();
        const percent = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
        videoRef.value.currentTime = percent * videoDuration.value;
        videoCurrentTime.value = videoRef.value.currentTime;
    }

    function onVideoVolumeChange(event: Event): void {
        if (!(event.target instanceof HTMLInputElement)) return;
        const value = parseFloat(event.target.value);
        videoVolume.value = value;
        if (videoRef.value !== null) videoRef.value.volume = value;
    }

    function toggleVideoMute(): void {
        if (videoVolume.value > 0) videoVolume.value = 0;
        else videoVolume.value = 1;
        if (videoRef.value !== null) videoRef.value.volume = videoVolume.value;
    }

    function reset(): void {
        if (videoRafId !== null) {
            cancelAnimationFrame(videoRafId);
            videoRafId = null;
        }
        videoError.value = false;
        videoPlaying.value = false;
        videoCurrentTime.value = 0;
        videoDuration.value = 0;
        videoUrl.value = '';
    }

    return {
        videoUrl,
        videoRef,
        videoError,
        videoPlaying,
        videoDuration,
        videoCurrentTime,
        videoVolume,
        videoProgressPercent,
        formatTime,
        onVideoError,
        onVideoLoaded,
        onVideoEnded,
        toggleVideoPlayback,
        seekVideo,
        onVideoVolumeChange,
        toggleVideoMute,
        reset,
    };
}
