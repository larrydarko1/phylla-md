<script setup lang="ts">
import { watch, onMounted, onUnmounted } from 'vue';
import { useI18n } from 'vue-i18n';

import IconPause from '@/renderer/components/icons/IconPause.vue';
import IconPlay from '@/renderer/components/icons/IconPlay.vue';
import IconVolumeHigh from '@/renderer/components/icons/IconVolumeHigh.vue';
import IconVolumeLow from '@/renderer/components/icons/IconVolumeLow.vue';
import IconVolumeMute from '@/renderer/components/icons/IconVolumeMute.vue';
import { useVideoPlayer } from '@/renderer/composables/editor/useVideoPlayer';

type Props = {
    filePath: string;
};

const props = defineProps<Props>();

const { t } = useI18n();

const {
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
} = useVideoPlayer();

function onKeydown(e: KeyboardEvent): void {
    if (e.key !== ' ' || videoRef.value === null) return;
    const target = e.target;
    if (target instanceof HTMLElement && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
    e.preventDefault();
    toggleVideoPlayback();
}

function seekVideoBySeconds(seconds: number): void {
    if (videoRef.value === null) return;
    videoRef.value.currentTime = Math.max(0, videoRef.value.currentTime + seconds);
}

watch(
    () => props.filePath,
    (path) => {
        reset();
        videoUrl.value = `phylla://localhost${path}`;
    },
    { immediate: true },
);

onMounted(() => window.addEventListener('keydown', onKeydown));
onUnmounted(() => window.removeEventListener('keydown', onKeydown));
</script>

<template>
    <div class="video-viewer media-stage">
        <!-- Video player area -->
        <div
            v-if="videoUrl && !videoError"
            class="video-player-wrapper media-frame">
            <!-- eslint-disable-next-line a11y/media-has-caption a11y/click-events-have-key-events a11y/no-static-element-interactions -->
            <video
                ref="videoRef"
                :key="videoUrl"
                :src="videoUrl"
                class="video-preview"
                :aria-label="t('editor.video_player')"
                @error="onVideoError"
                @loadedmetadata="onVideoLoaded"
                @ended="onVideoEnded"
                @click="toggleVideoPlayback"></video>

            <!-- Control bar -->
            <div
                class="video-controls media-controls media-controls-joined"
                role="group"
                :aria-label="t('editor.video_player_controls')">
                <!-- Play/pause button -->
                <button
                    class="video-ctrl-btn media-ctrl-btn"
                    type="button"
                    :aria-label="videoPlaying ? t('editor.pause_video') : t('editor.play_video')"
                    :title="videoPlaying ? t('editor.pause') : t('editor.play')"
                    @click="toggleVideoPlayback">
                    <IconPlay
                        v-if="!videoPlaying"
                        width="16"
                        height="16" />
                    <IconPause
                        v-else
                        width="16"
                        height="16" />
                </button>

                <!-- Current time display -->
                <time
                    class="video-time media-time"
                    aria-live="polite"
                    aria-atomic="true"
                    >{{ formatTime(videoCurrentTime) }}</time
                >

                <!-- Progress bar -->
                <div
                    class="video-progress-wrapper media-progress"
                    role="slider"
                    :aria-label="t('editor.video_progress', { progress: videoProgressPercent })"
                    :aria-valuenow="videoProgressPercent"
                    aria-valuemin="0"
                    aria-valuemax="100"
                    :aria-valuetext="`${formatTime(videoCurrentTime)} of ${formatTime(videoDuration)}`"
                    tabindex="0"
                    @click="seekVideo"
                    @keydown.left="seekVideoBySeconds(-5)"
                    @keydown.right="seekVideoBySeconds(5)">
                    <div class="video-progress-track media-progress-track">
                        <div
                            class="video-progress-fill media-progress-fill"
                            :style="{ width: videoProgressPercent + '%' }"></div>
                    </div>
                </div>

                <!-- Total duration display -->
                <time
                    class="video-time media-time"
                    :aria-label="t('editor.total_duration')"
                    >{{ formatTime(videoDuration) }}</time
                >

                <!-- Volume control -->
                <fieldset class="video-volume-wrapper media-volume">
                    <button
                        class="video-volume-btn media-volume-btn"
                        type="button"
                        :aria-label="videoVolume === 0 ? t('editor.unmute_video') : t('editor.mute_video')"
                        :title="videoVolume === 0 ? t('editor.unmute') : t('editor.mute')"
                        @click="toggleVideoMute">
                        <IconVolumeMute
                            v-if="videoVolume === 0"
                            width="16"
                            height="16" />
                        <IconVolumeLow
                            v-else-if="videoVolume < 0.5"
                            width="16"
                            height="16" />
                        <IconVolumeHigh
                            v-else
                            width="16"
                            height="16" />
                    </button>
                    <input
                        id="volume-slider"
                        type="range"
                        class="video-volume-slider media-volume-slider"
                        min="0"
                        max="1"
                        step="0.01"
                        :value="videoVolume"
                        :style="{ '--volume': videoVolume }"
                        aria-label="Volume level"
                        @input="onVideoVolumeChange" />
                </fieldset>
            </div>
        </div>

        <!-- Error state fallback -->
        <section
            v-if="videoError"
            class="video-error media-message"
            role="alert">
            <h2 class="media-message-title">{{ t('editor.video_load_error') }}</h2>
            <p>{{ t('editor.failed_to_load_video') }}</p>
            <p class="video-error-hint hint">{{ t('editor.video_format_not_supported') }}</p>
        </section>
    </div>
</template>

<style lang="scss" scoped>
// The stage, the error block, the frame and its bar are all `media-*` classes. What is left is
// where the frame sits in the pane and how tall the picture may be.

// Above the stage's wash, and no wider than the video it holds.
.video-player-wrapper {
    align-items: center;
    max-width: 100%;
    max-height: 100%;
    position: relative;
    z-index: $z-normal;
}

// It leaves room for the bar rather than filling the pane. The corners are the
// frame's — it clips, so the video has none of its own.
.video-preview {
    max-width: 100%;
    max-height: calc(100% - $size-16);
    display: block;
    background: $base1;
    cursor: pointer;
}

// `<fieldset>` groups the volume controls for assistive tech, and arrives with a border, a margin
// and a min-width that have nothing to do with how it looks here.
fieldset {
    margin: 0;
    padding: 0;
    border: none;
    min-width: 0;
}
</style>
