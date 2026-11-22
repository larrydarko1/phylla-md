/**
 * useNotePersistence — manages note content state, file loading/saving,
 * and auto-save scheduling.
 */

import { ref, type Ref } from 'vue';

import { notify } from '@/renderer/composables/ui/useNotifications';
import { i18n } from '@/renderer/i18n';
import { formatIpcError } from '@/renderer/utils/ipcError';
import type { FileInfo } from '@/schemas/vault';

type UseNotePersistenceReturn = {
    content: Ref<string>;
    originalContent: Ref<string>;
    hasUnsavedChanges: Ref<boolean>;
    isSaving: Ref<boolean>;
    lastLoadedPath: Ref<string | null>;
    justSaved: Ref<boolean>;
    onContentChange: () => void;
    saveFile: () => Promise<void>;
    loadFile: (file: FileInfo) => Promise<void>;
    handleDrawingSave: (drawingContent: string) => Promise<void>;
    clearAutoSaveTimeout: () => void;
};

const { t } = i18n.global;

export function useNotePersistence(
    findFile: () => FileInfo | null,
    isMarkdownFile: () => boolean,
    resolveEmbeds: (content: string) => void,
    onSave: (content: string) => void,
    onContentChanged: (hasChanges: boolean) => void,
): UseNotePersistenceReturn {
    const content = ref('');
    const originalContent = ref('');
    const hasUnsavedChanges = ref(false);
    const isSaving = ref(false);

    // Exposed as refs so the component's file-watcher can read/write them directly.
    const lastLoadedPath = ref<string | null>(null);
    const justSaved = ref(false);

    let autoSaveTimeout: number | null = null;
    let embedResolveTimeout: number | null = null;

    async function loadFile(file: FileInfo): Promise<void> {
        if (autoSaveTimeout !== null) {
            clearTimeout(autoSaveTimeout);
            autoSaveTimeout = null;
        }
        if (embedResolveTimeout !== null) {
            clearTimeout(embedResolveTimeout);
            embedResolveTimeout = null;
        }
        try {
            const result = await window.electronAPI.readFile(file.path);
            if (result.success && result.content !== undefined) {
                content.value = result.content;
                originalContent.value = result.content;
                hasUnsavedChanges.value = false;
                if (file.extension.toLowerCase() === '.md') resolveEmbeds(result.content);
            } else {
                window.electronAPI.log.error('Failed to read file:', result.error);
            }
        } catch (error) {
            window.electronAPI.log.error('Error loading file:', error);
        }
    }

    function onContentChange(): void {
        hasUnsavedChanges.value = content.value !== originalContent.value;
        onContentChanged(hasUnsavedChanges.value);

        if (autoSaveTimeout !== null) clearTimeout(autoSaveTimeout);

        // Debounce embed resolution — avoid IPC storms on every keystroke
        if (isMarkdownFile() && content.value.includes('![[')) {
            if (embedResolveTimeout !== null) clearTimeout(embedResolveTimeout);
            embedResolveTimeout = window.setTimeout((): void => {
                resolveEmbeds(content.value);
            }, 500);
        }

        if (hasUnsavedChanges.value) {
            autoSaveTimeout = window.setTimeout((): void => {
                void saveFile();
            }, 3000);
        }
    }

    async function saveFile(): Promise<void> {
        const file = findFile();
        if (file === null || !hasUnsavedChanges.value || isSaving.value) return;

        isSaving.value = true;
        try {
            const result = await window.electronAPI.writeFile(file.path, content.value);
            if (result.success) {
                originalContent.value = content.value;
                hasUnsavedChanges.value = false;
                justSaved.value = true;
                notify.dismiss(saveNoticeId(file.path));
                onContentChanged(false);
                onSave(content.value);
            } else {
                window.electronAPI.log.error('Failed to save file:', result.error);
                reportSaveFailure(file.path, formatIpcError(t, result.error));
            }
        } catch (error) {
            window.electronAPI.log.error('Error saving file:', error);
            reportSaveFailure(file.path, formatIpcError(t, 'UNKNOWN'));
        } finally {
            isSaving.value = false;
        }
    }

    async function handleDrawingSave(drawingContent: string): Promise<void> {
        const file = findFile();
        if (file === null) return;
        try {
            const result = await window.electronAPI.writeFile(file.path, drawingContent);
            if (result.success) {
                content.value = drawingContent;
                originalContent.value = drawingContent;
                hasUnsavedChanges.value = false;
                notify.dismiss(saveNoticeId(file.path));
                onContentChanged(false);
                onSave(drawingContent);
            } else {
                window.electronAPI.log.error('Failed to save drawing:', result.error);
                reportSaveFailure(file.path, formatIpcError(t, result.error));
            }
        } catch (error) {
            window.electronAPI.log.error('Error saving drawing:', error);
            reportSaveFailure(file.path, formatIpcError(t, 'UNKNOWN'));
        }
    }

    function clearAutoSaveTimeout(): void {
        if (autoSaveTimeout !== null) {
            clearTimeout(autoSaveTimeout);
            autoSaveTimeout = null;
        }
        if (embedResolveTimeout !== null) {
            clearTimeout(embedResolveTimeout);
            embedResolveTimeout = null;
        }
    }

    return {
        content,
        originalContent,
        hasUnsavedChanges,
        isSaving,
        lastLoadedPath,
        justSaved,
        onContentChange,
        saveFile,
        loadFile,
        handleDrawingSave,
        clearAutoSaveTimeout,
    };
}

// One notice per file, so an autosave that keeps failing updates it rather than stacking more.
function saveNoticeId(path: string): string {
    return `save-failed:${path}`;
}

function reportSaveFailure(path: string, reason: string): void {
    notify.error(t('errors.save_file_failed', { reason }), { id: saveNoticeId(path), persistent: true });
}
