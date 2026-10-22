/**
 * useSystemPrompt — manages the active system-prompt template selection.
 *
 * The library of templates lives at ~/.phylla/prompts/*.md and is hand-edited
 * by the user in their preferred editor. This composable only handles
 * listing them, displaying the active one, and switching active.
 */

import { ref, type Ref } from 'vue';

import type { PromptInfo } from '@/schemas/ai';

type UseSystemPromptReturn = {
    prompts: Ref<PromptInfo[]>;
    activeId: Ref<string>;
    isLoading: Ref<boolean>;
    refresh: () => Promise<void>;
    setActive: (id: string) => Promise<boolean>;
};

export function useSystemPrompt(): UseSystemPromptReturn {
    const prompts = ref<PromptInfo[]>([]);
    const activeId = ref<string>('default');
    const isLoading = ref(false);

    async function refresh(): Promise<void> {
        isLoading.value = true;
        try {
            const result = await window.electronAPI.systemPromptList();
            if (result.success) {
                prompts.value = result.prompts;
                activeId.value = result.activeId;
            }
        } catch (err) {
            window.electronAPI.log.error('Failed to list system prompts:', err);
        } finally {
            isLoading.value = false;
        }
    }

    async function setActive(id: string): Promise<boolean> {
        try {
            const result = await window.electronAPI.systemPromptSetActive(id);
            if (result.success) {
                activeId.value = id;
                return true;
            }
            window.electronAPI.log.warn('setActive failed:', result.error);
        } catch (err) {
            window.electronAPI.log.error('setActive error:', err);
        }
        return false;
    }

    return {
        prompts,
        activeId,
        isLoading,
        refresh,
        setActive,
    };
}
