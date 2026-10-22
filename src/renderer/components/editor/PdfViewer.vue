<script setup lang="ts">
import { ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';

type Props = {
    filePath: string;
};

const props = defineProps<Props>();

const { t } = useI18n();

const hasError = ref(false);
const pdfUrl = ref('');

watch(
    () => props.filePath,
    (path) => {
        hasError.value = false;
        pdfUrl.value = `phylla://localhost${path}`;
    },
    { immediate: true },
);
</script>

<template>
    <div
        class="pdf-viewer media-stage"
        role="region"
        :aria-label="t('editor.pdf_viewer')">
        <!-- PDF preview area -->
        <iframe
            v-if="pdfUrl && !hasError"
            :src="pdfUrl"
            class="pdf-preview"
            title="PDF document"
            :aria-label="t('editor.pdf_viewer')"
            @error="hasError = true" />

        <!-- Error state fallback -->
        <section
            v-if="hasError"
            class="pdf-error media-message"
            role="alert"
            aria-live="polite">
            <h2 class="media-message-title">{{ t('editor.pdf_load_error') }}</h2>
            <p>{{ t('editor.failed_to_load_pdf') }}</p>
            <p class="pdf-error-hint hint">{{ t('editor.pdf_format_not_supported') }}</p>
        </section>
    </div>
</template>

<style lang="scss" scoped>
// The stage is `.media-stage`; this one fills it rather than sitting on it, because
// the iframe is the whole page and there is nothing to centre around it.
.pdf-viewer {
    padding: 0;
    overflow: hidden;
}

// Above the stage's wash, like everything else the stage holds.
.pdf-preview {
    width: 100%;
    height: 100%;
    border: none;
    position: relative;
    z-index: $z-normal;
}
</style>
