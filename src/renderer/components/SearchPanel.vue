<script setup lang="ts">
import { ref, watch, onMounted, useTemplateRef } from 'vue';
import { useI18n } from 'vue-i18n';

import IconClose from '@/renderer/components/icons/IconClose.vue';
import IconFile from '@/renderer/components/icons/IconFile.vue';
import IconSearch from '@/renderer/components/icons/IconSearch.vue';
import { useListKeyboardNavigation } from '@/renderer/composables/ui/useListKeyboardNavigation';
import { watchDebounced } from '@/renderer/composables/useDebounce';
import type { FileInfo, HighlightPart } from '@/schemas/vault';

type Props = {
    files: FileInfo[];
    selectedFiles: FileInfo[];
    activeFile: FileInfo | null;
};

const props = defineProps<Props>();

const emit = defineEmits<{
    selectFile: [file: FileInfo, event?: MouseEvent];
    openFile: [file: FileInfo];
    close: [];
}>();

const { t } = useI18n();

const searchInput = useTemplateRef<HTMLInputElement>('searchInput');
const searchQuery = ref('');
const searchResults = ref<FileInfo[]>([]);

const { selectedIndex, resetIndex } = useListKeyboardNavigation<FileInfo>(
    () => searchResults.value,
    {
        onSelect: (file: FileInfo): void => emit('selectFile', file),
        onOpen: openSelectedResult,
        onEscape: (): void => {
            if (searchQuery.value.trim() !== '') clearSearch();
            else emit('close');
        },
    },
    {
        wrap: false,
        scrollSelector: '.search-result-item.keyboard-selected',
        ignoreWhen: (target: HTMLElement): boolean =>
            (target.tagName === 'TEXTAREA' || target.isContentEditable) &&
            target !== (searchInput.value as HTMLElement | null),
    },
);

function runSearch(): void {
    if (searchQuery.value.trim() === '') {
        searchResults.value = [];
        return;
    }

    const query = searchQuery.value.toLowerCase();
    searchResults.value = props.files
        .map((file) => {
            const fileName = file.name.toLowerCase();
            const folderPath = file.folder.toLowerCase();

            // Calculate match score (simple fuzzy matching)
            let score = 0;
            if (fileName.includes(query)) {
                score += 100;
                // Bonus for exact match at start
                if (fileName.startsWith(query)) score += 50;
            }

            // Also search in folder path
            if (folderPath.includes(query)) score += 30;

            // Fuzzy match: check if all characters in query appear in order
            let queryIndex = 0;
            for (let i = 0; i < fileName.length && queryIndex < query.length; i++) {
                if (fileName[i] === query[queryIndex]) {
                    queryIndex++;
                    score += 1;
                }
            }

            return { file, score, matched: score > 0 };
        })
        .filter((result) => result.matched)
        .sort((a, b) => b.score - a.score)
        .map((result) => result.file);
}

function isFileSelected(file: FileInfo): boolean {
    return props.selectedFiles.some((f) => f.path === file.path);
}

function selectFile(file: FileInfo, event?: MouseEvent): void {
    const index = searchResults.value.findIndex((f) => f.path === file.path);
    if (index >= 0) selectedIndex.value = index;
    emit('selectFile', file, event);
}

function openFile(file: FileInfo): void {
    emit('openFile', file);
}

function clearSearch(): void {
    searchQuery.value = '';
    searchResults.value = [];
    resetIndex();
    searchInput.value?.focus();
}

function openSelectedResult(): void {
    // Flush any pending debounce so results are current before opening
    runSearch();
    const result = searchResults.value[selectedIndex.value];
    if (result !== undefined) openFile(result);
}

function splitHighlightedText(text: string): HighlightPart[] {
    if (searchQuery.value.trim() === '') return [{ text, highlighted: false }];

    const escaped = searchQuery.value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(${escaped})`, 'gi');
    const parts: HighlightPart[] = [];
    let lastIndex = 0;
    let match;

    // Reset regex for global search
    regex.lastIndex = 0;
    while ((match = regex.exec(text)) !== null) {
        // Non-highlighted part before match
        if (match.index > lastIndex) parts.push({ text: text.slice(lastIndex, match.index), highlighted: false });
        // Highlighted match
        parts.push({ text: match[0], highlighted: true });
        lastIndex = match.index + match[0].length;
    }

    // Remaining non-highlighted text
    if (lastIndex < text.length) parts.push({ text: text.slice(lastIndex), highlighted: false });

    return parts.length > 0 ? parts : [{ text, highlighted: false }];
}

// Debounce the search — watchDebounced auto-stops on component unmount
watchDebounced(searchQuery, runSearch, { debounce: 150, maxWait: 600 });

watch(searchResults, resetIndex);
onMounted(() => {
    searchInput.value?.focus();
});
</script>

<template>
    <section
        class="search-panel panel"
        :aria-label="t('search.search_panel')">
        <header class="panel-header search-header">
            <div class="search-input-wrapper field-well field-well-single">
                <IconSearch
                    class="search-icon"
                    width="16"
                    height="16" />
                <input
                    ref="searchInput"
                    v-model="searchQuery"
                    type="text"
                    :placeholder="t('search.search_placeholder')"
                    class="search-input field-bare"
                    :aria-label="t('search.search_placeholder')"
                    aria-describedby="search-results-count"
                    @keydown.escape="clearSearch"
                    @keydown.enter="openSelectedResult" />
                <button
                    v-if="searchQuery"
                    class="clear-button icon-btn-subtle"
                    :title="t('search.clear_search')"
                    :aria-label="t('search.clear_search')"
                    @click="clearSearch">
                    <IconClose
                        width="14"
                        height="14" />
                </button>
            </div>
            <div
                v-if="searchQuery"
                id="search-results-count"
                class="hint"
                aria-live="polite"
                aria-atomic="true">
                {{ searchResults.length }} {{ searchResults.length === 1 ? t('search.result') : t('search.results') }}
            </div>
        </header>

        <main class="search-results scroll-y">
            <div
                v-if="!searchQuery"
                class="search-empty-state empty-state"
                role="status"
                :aria-label="t('search.clear_search')">
                <p>{{ t('search.clear_search') }}</p>
            </div>
            <div
                v-else-if="searchResults.length === 0"
                class="search-empty-state empty-state"
                role="status"
                :aria-label="t('search.no_results')">
                <p>{{ t('search.no_results') }}</p>
            </div>
            <ul
                v-else
                class="search-results-list list-body"
                role="listbox"
                :aria-label="t('search.search_results')">
                <!-- eslint-disable-next-line a11y/click-events-have-key-events a11y/interactive-supports-focus -->
                <li
                    v-for="(file, index) in searchResults"
                    :key="file.path"
                    v-memo="[file.path, selectedIndex === index, activeFile?.path === file.path]"
                    class="search-result-item result-item"
                    :class="{
                        'active': activeFile?.path === file.path,
                        'selected': isFileSelected(file),
                        'keyboard-selected': selectedIndex === index,
                    }"
                    role="option"
                    :aria-selected="selectedIndex === index"
                    :aria-current="activeFile?.path === file.path ? 'true' : undefined"
                    @click="selectFile(file, $event)"
                    @dblclick="openFile(file)">
                    <div class="file-info">
                        <IconFile
                            class="file-icon"
                            width="16"
                            height="16" />
                        <div class="file-details">
                            <div class="file-name truncate">
                                <span
                                    v-for="(part, idx) in splitHighlightedText(file.name)"
                                    :key="idx"
                                    :class="{ highlighted: part.highlighted }">
                                    {{ part.text }}
                                </span>
                            </div>
                            <div class="file-path truncate">{{ file.folder === '.' ? '' : file.folder }}</div>
                        </div>
                    </div>
                </li>
            </ul>
        </main>
    </section>
</template>

<style scoped lang="scss">
/* ––– Search Header ––– */

// Holds a field, not a title row — back to normal flow.
.search-header {
    display: block;
}

/* ––– Search Field ––– */

// `.field-well .field-well-single`, shared with the AI composer — inset only.
.search-input-wrapper {
    padding: $space-2 $space-3;
}

.search-icon {
    color: $text2;
    flex-shrink: 0;
    margin-right: $space-2;
}

// `.field-bare` minus its inset: the well is already padded.
.search-input {
    flex: 1;
    padding: 0;
}

/* ––– Search Results ––– */

.search-results {
    flex: 1;
}

// The matched substring inside a result's name.
.file-name :deep(mark),
.highlighted {
    background: $accent-color-alpha;
    color: $accent-color;
    padding: $space-0 $space-1;
    border-radius: $border-radius-xs;
    font-weight: $font-weight-semibold;
}
</style>
