<script setup lang="ts">
import { ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';

type Props = {
    filePath: string;
    fileName: string;
};

const props = defineProps<Props>();

const { t } = useI18n();

const imageUrl = ref('');
const isLoading = ref(false);
const hasError = ref(false);

async function loadImage(path: string): Promise<void> {
    isLoading.value = true;
    hasError.value = false;
    imageUrl.value = '';
    try {
        const result = await window.electronAPI.readImage(path);
        if (result.success && result.dataUrl !== undefined) imageUrl.value = result.dataUrl;
        else hasError.value = true;
    } catch {
        hasError.value = true;
    } finally {
        isLoading.value = false;
    }
}

watch(
    () => props.filePath,
    (path) => loadImage(path),
    { immediate: true },
);
</script>

<template>
    <div
        class="image-viewer media-stage"
        role="region"
        :aria-label="t('editor.image_viewer')">
        <!-- Loading state -->
        <div
            v-if="isLoading"
            class="image-loading media-message"
            aria-live="polite"
            aria-busy="true">
            <p>{{ t('editor.loading_image') }}</p>
        </div>

        <!-- Image preview -->
        <img
            v-else-if="imageUrl && !hasError"
            :src="imageUrl"
            :alt="props.fileName"
            class="image-preview"
            @load="hasError = false"
            @error="hasError = true" />

        <!-- Error state fallback -->
        <section
            v-if="hasError"
            class="image-error media-message"
            role="alert"
            aria-live="polite">
            <h2 class="media-message-title">{{ t('editor.image_load_error') }}</h2>
            <p>{{ t('editor.failed_to_load_image') }}</p>
        </section>
    </div>
</template>

<style lang="scss" scoped>
// The stage and the messages are `media-*` classes. What is left is the image itself: it fits the
// pane rather than filling it.
.image-preview {
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
    border-radius: $border-radius-lg;
    position: relative;
    z-index: $z-normal;
}
</style>
