<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, useTemplateRef } from 'vue';
import { useI18n } from 'vue-i18n';

import IconChevronDown from '@/renderer/components/icons/IconChevronDown.vue';
import IconClock from '@/renderer/components/icons/IconClock.vue';
import IconClose from '@/renderer/components/icons/IconClose.vue';
import IconComment from '@/renderer/components/icons/IconComment.vue';
import IconFolder from '@/renderer/components/icons/IconFolder.vue';
import IconPlus from '@/renderer/components/icons/IconPlus.vue';
import IconRefresh from '@/renderer/components/icons/IconRefresh.vue';
import IconSquare from '@/renderer/components/icons/IconSquare.vue';
import { useSystemPrompt } from '@/renderer/composables/ai/useSystemPrompt';
import type { AiModelInfo, AiStatus } from '@/schemas/ai';

type Props = {
    status: AiStatus;
    availableModels: AiModelInfo[];
    isLoading: boolean;
    selectedModelPath: string | null;
    selectedModelLabel: string;
    showHistory: boolean;
};

defineProps<Props>();

const emit = defineEmits<{
    'select-model': [model: AiModelInfo];
    'load-model': [];
    'unload-model': [];
    'open-models-folder': [];
    'refresh-models': [];
    'toggle-history': [];
    'new-conversation': [];
    'close': [];
}>();

const { t } = useI18n();

const dropdownRef = useTemplateRef<HTMLElement>('dropdownRef');
const showDropdown = ref(false);
const dropdownPosition = ref<Record<string, string>>({});
const { prompts, activeId, refresh: refreshPrompts, setActive } = useSystemPrompt();
const promptDropdownRef = useTemplateRef<HTMLElement>('promptDropdownRef');
const showPromptDropdown = ref(false);
const promptDropdownPosition = ref<Record<string, string>>({});
const activePromptName = computed(() => {
    const found = prompts.value.find((p) => p.id === activeId.value);
    return (
        (found?.name !== undefined && found.name !== '' ? found.name : null) ??
        (activeId.value !== '' ? activeId.value : 'default')
    );
});

function toggleDropdown(): void {
    if (showDropdown.value) {
        showDropdown.value = false;
        return;
    }
    if (dropdownRef.value !== null) {
        const rect = dropdownRef.value.getBoundingClientRect();
        const menuWidth = Math.min(rect.width + 60, window.innerWidth - rect.left - 12);
        dropdownPosition.value = {
            top: `${rect.bottom + 4}px`,
            left: `${rect.left}px`,
            minWidth: `${menuWidth}px`,
        };
    }
    showDropdown.value = true;
}

function handleSelectModel(model: AiModelInfo): void {
    showDropdown.value = false;
    emit('select-model', model);
}

function handleClickOutside(event: MouseEvent): void {
    const target = event.target instanceof Node ? event.target : null;
    if (dropdownRef.value !== null && !dropdownRef.value.contains(target)) showDropdown.value = false;
    if (promptDropdownRef.value !== null && !promptDropdownRef.value.contains(target)) showPromptDropdown.value = false;
}

function togglePromptDropdown(): void {
    if (showPromptDropdown.value) {
        showPromptDropdown.value = false;
        return;
    }
    if (promptDropdownRef.value !== null) {
        const rect = promptDropdownRef.value.getBoundingClientRect();
        promptDropdownPosition.value = {
            top: `${rect.bottom + 4}px`,
            right: `${Math.max(12, window.innerWidth - rect.right)}px`,
            minWidth: '220px',
            maxWidth: '300px',
        };
    }
    showPromptDropdown.value = true;
}

async function handleSelectPrompt(id: string): Promise<void> {
    showPromptDropdown.value = false;
    await setActive(id);
}

function handleRefresh(): void {
    emit('refresh-models');
    void refreshPrompts();
}

function truncate(str: string, len: number): string {
    return str.length > len ? `${str.slice(0, len)}…` : str;
}

onMounted(() => {
    document.addEventListener('click', handleClickOutside);
    void refreshPrompts();
});
onUnmounted(() => document.removeEventListener('click', handleClickOutside));
</script>

<template>
    <div
        class="ai-model-bar row"
        role="toolbar"
        :aria-label="t('ai.model_controls')">
        <!-- Model selection and status pill -->
        <div class="ai-model-pill well row fill">
            <!-- Model selector (when not loaded) -->
            <div
                v-if="!status.isModelLoaded"
                class="ai-model-selector row fill">
                <div
                    ref="dropdownRef"
                    class="ai-dropdown fill">
                    <button
                        class="ai-dropdown-trigger menu-trigger"
                        :disabled="isLoading"
                        aria-haspopup="listbox"
                        :aria-expanded="showDropdown"
                        @click="toggleDropdown()">
                        <span class="ai-dropdown-label menu-trigger-label">{{ selectedModelLabel }}</span>
                        <IconChevronDown
                            class="ai-dropdown-chevron menu-chevron"
                            :class="{ open: showDropdown }"
                            width="10"
                            height="10"
                            stroke-width="2.5" />
                    </button>
                    <Teleport to="body">
                        <div
                            v-if="showDropdown"
                            class="ai-dropdown-menu menu"
                            role="listbox"
                            :style="dropdownPosition">
                            <div
                                v-if="availableModels.length === 0"
                                class="ai-dropdown-empty menu-empty">
                                {{ t('ai.no_models_found') }}
                            </div>
                            <!-- eslint-disable-next-line a11y/click-events-have-key-events a11y/interactive-supports-focus -->
                            <div
                                v-for="model in availableModels"
                                :key="model.path"
                                v-memo="[model.path, selectedModelPath]"
                                class="ai-dropdown-item menu-item"
                                :class="{ selected: selectedModelPath === model.path }"
                                role="option"
                                :aria-selected="selectedModelPath === model.path"
                                @click="handleSelectModel(model)">
                                <span class="ai-dropdown-item-name menu-item-name">{{ truncate(model.name, 30) }}</span>
                                <span class="ai-dropdown-item-size menu-item-meta">{{ model.sizeFormatted }}</span>
                            </div>
                        </div>
                    </Teleport>
                </div>
                <button
                    class="ai-btn-small btn-accent"
                    :disabled="selectedModelPath === null || selectedModelPath === '' || isLoading"
                    @click="$emit('load-model')">
                    {{ isLoading ? t('ai.loading') : t('ai.load') }}
                </button>
            </div>

            <!-- Model status (when loaded) -->
            <div
                v-else
                class="ai-model-status row fill">
                <span
                    class="ai-model-indicator"
                    aria-hidden="true"></span>
                <span class="ai-model-name truncate">{{ status.currentModelName }}</span>
                <button
                    class="ai-btn-icon ai-btn-danger icon-btn icon-btn-lg icon-btn-danger"
                    :title="t('ai.unload_model')"
                    :aria-label="t('ai.unload_current_model')"
                    :disabled="status.isGenerating"
                    @click="$emit('unload-model')">
                    <IconSquare
                        width="10"
                        height="10"
                        stroke-width="2.5" />
                </button>
            </div>
        </div>

        <!-- Action buttons -->
        <div class="ai-bar-actions well row">
            <!-- Open models folder -->
            <button
                class="ai-btn-icon icon-btn icon-btn-lg"
                :title="t('ai.open_models_folder')"
                :aria-label="t('ai.open_models_folder')"
                @click="$emit('open-models-folder')">
                <IconFolder
                    width="11"
                    height="11" />
            </button>

            <!-- System prompt picker -->
            <div
                ref="promptDropdownRef"
                class="ai-prompt-picker row">
                <button
                    class="ai-btn-icon icon-btn icon-btn-lg"
                    :class="{ 'ai-btn-active icon-btn-accent': showPromptDropdown }"
                    :title="`${t('ai.system_prompt')}: ${activePromptName}`"
                    :aria-label="`${t('ai.system_prompt')}: ${activePromptName}`"
                    aria-haspopup="listbox"
                    :aria-expanded="showPromptDropdown"
                    @click="togglePromptDropdown()">
                    <IconComment
                        width="11"
                        height="11"
                        stroke-width="2.5" />
                </button>
                <Teleport to="body">
                    <div
                        v-if="showPromptDropdown"
                        class="ai-dropdown-menu ai-prompt-menu menu"
                        role="listbox"
                        :style="promptDropdownPosition">
                        <div class="ai-prompt-menu-header menu-header">{{ t('ai.system_prompt') }}</div>
                        <div
                            v-if="prompts.length === 0"
                            class="ai-dropdown-empty menu-empty">
                            {{ t('ai.no_prompts_found') }}
                        </div>
                        <!-- eslint-disable-next-line a11y/click-events-have-key-events a11y/interactive-supports-focus -->
                        <div
                            v-for="prompt in prompts"
                            :key="prompt.id"
                            v-memo="[prompt.id, activeId]"
                            class="ai-dropdown-item ai-prompt-item menu-item menu-item-stacked"
                            :class="{ selected: prompt.id === activeId }"
                            role="option"
                            :aria-selected="prompt.id === activeId"
                            @click="handleSelectPrompt(prompt.id)">
                            <div class="ai-prompt-item-main stack fill">
                                <span class="ai-prompt-item-name menu-item-name">{{ prompt.name }}</span>
                                <span
                                    v-if="prompt.description"
                                    class="ai-prompt-item-desc menu-item-desc">
                                    {{ prompt.description }}
                                </span>
                            </div>
                        </div>
                    </div>
                </Teleport>
            </div>

            <!-- Refresh models folder -->
            <button
                class="ai-btn-icon icon-btn icon-btn-lg"
                :title="t('ai.refresh_models_folder')"
                :aria-label="t('ai.refresh_models_folder')"
                @click="handleRefresh()">
                <IconRefresh
                    width="11"
                    height="11"
                    stroke-width="2.5" />
            </button>

            <!-- Conversation history -->
            <button
                class="ai-btn-icon icon-btn icon-btn-lg"
                :class="{ 'ai-btn-active icon-btn-accent': showHistory }"
                :title="t('ai.conversation_history')"
                :aria-label="t('ai.conversation_history')"
                :aria-pressed="showHistory"
                @click="$emit('toggle-history')">
                <IconClock
                    width="11"
                    height="11"
                    stroke-width="2.5" />
            </button>

            <!-- New conversation -->
            <button
                class="ai-btn-icon icon-btn icon-btn-lg"
                :title="t('ai.new_conversation')"
                :aria-label="t('ai.new_conversation')"
                @click="$emit('new-conversation')">
                <IconPlus
                    width="11"
                    height="11"
                    stroke-width="2.5" />
            </button>

            <!-- Close -->
            <button
                class="ai-btn-icon icon-btn icon-btn-lg"
                :title="t('ai.close')"
                :aria-label="t('ai.close')"
                @click="$emit('close')">
                <IconClose
                    width="11"
                    height="11"
                    stroke-width="2.5" />
            </button>
        </div>
    </div>
</template>

<style lang="scss" scoped>
.ai-model-bar {
    flex-shrink: 0;
    gap: $space-2;
    padding: $space-2 $space-3;
}

// The model name and its status share one `.well`, so the bar reads as two objects
// — what is loaded, and what can be done — rather than as six loose controls.
.ai-model-pill {
    padding: $space-1 $space-2;
    border-radius: $border-radius-lg;
}

.ai-model-selector {
    gap: $space-2;
}

// Flex, not block: the trigger is an inline-flex button, and a block wrapper gives
// it a line box whose descender space made the trigger sit high of the Load button.
.ai-dropdown {
    display: flex;
    position: relative;
}

// Teleported to the body and positioned against the trigger by script, so unlike the other menus it
// is fixed rather than absolute, and must clear the editor's stacking contexts.
.ai-dropdown-menu {
    position: fixed;
    z-index: $z-extreme;
}

.ai-model-status {
    padding: 0 $space-1;
}

// The lit dot that says a model is resident. The glow is what separates "loaded"
// from "selected" at this size.
.ai-model-indicator {
    flex-shrink: 0;
    width: $size-4;
    height: $size-4;
    background: $accent-color;
    border-radius: $border-radius-round;
    box-shadow: $accent-shadow;
    margin-right: $space-2;
}

.ai-model-name {
    color: $text2;
    font-size: $font-size-xs;
}

// The action cluster is the bar's second `.well`, tighter than `.panel-actions`
// because the buttons are the row rather than trailing a title.
.ai-bar-actions {
    flex-shrink: 0;
    gap: $space-0;
    padding: $space-0 $space-1;
    border-radius: $border-radius-xl;
}

// –– System prompt picker ––––––––––––––––––––

.ai-prompt-picker {
    position: relative;
}

// Held open to a minimum height so the list does not resize under the pointer as
// the descriptions wrap.
.ai-prompt-menu {
    min-height: $size-26;
}

.ai-prompt-item {
    margin-bottom: $space-1;
}

// The column holding the two lines, which are `.menu-item-name` over
// `.menu-item-desc` — the same pair the context-file picker uses.
.ai-prompt-item-main {
    gap: $space-0;
}
</style>
