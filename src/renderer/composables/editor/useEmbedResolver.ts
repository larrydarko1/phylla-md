/**
 * useEmbedResolver — resolves vault-relative media paths to data URIs via IPC,
 * with in-memory caching.
 */

import { ref, type Ref } from 'vue';

import {
    isImageFile as checkImage,
    isVideoFile as checkVideo,
    isAudioFile as checkAudio,
} from '@/renderer/utils/fileTypes';
import type { EmbedResolveResult } from '@/schemas/vault';

type UseEmbedResolverReturn = {
    embedCache: Ref<Map<string, string>>;
    embedCacheVersion: Ref<number>;
    resolveEmbeds: (text: string) => Promise<void>;
    getEmbedMediaType: (fileName: string) => 'image' | 'video' | 'audio' | 'pdf' | 'note' | 'unknown';
    clearCache: () => void;
};

export function useEmbedResolver(
    findFile: () => { path: string } | null,
    getWorkspacePath: () => string | null,
): UseEmbedResolverReturn {
    const embedCache = ref<Map<string, string>>(new Map());
    const embedCacheVersion = ref(0);

    async function resolveEmbeds(text: string): Promise<void> {
        const file = findFile();
        const workspacePath = getWorkspacePath();
        if (file === null || workspacePath === null) return;

        const embedRegex = /!\[\[([^\]]+)\]\]/g;
        const matches = [...text.matchAll(embedRegex)];
        if (matches.length === 0) return;

        const noteDir = file.path.substring(0, file.path.lastIndexOf('/'));

        // Collect unique unresolved filenames
        const fileNames = new Set<string>();
        for (const match of matches) {
            const inner = match[1] ?? '';
            const fileName = (inner.split('|')[0]?.split('#')[0] ?? '').trim();
            if (fileName !== '' && !embedCache.value.has(fileName)) fileNames.add(fileName);
        }
        if (fileNames.size === 0) return;

        // Resolve all embeds in parallel — single cache version bump at the end
        const results = await Promise.all(
            [...fileNames].map(async (fileName): Promise<{ fileName: string; result: EmbedResolveResult } | null> => {
                try {
                    const result = await window.electronAPI.resolveEmbedPath(fileName, noteDir, workspacePath);
                    return { fileName, result };
                } catch (err) {
                    window.electronAPI.log.error('Failed to resolve embed:', fileName, err);
                    return null;
                }
            }),
        );

        let changed = false;
        for (const entry of results) {
            if (
                entry !== null &&
                entry.result.success &&
                typeof entry.result.path === 'string' &&
                entry.result.path !== ''
            ) {
                embedCache.value.set(entry.fileName, entry.result.path);
                changed = true;
            } else if (entry !== null) {
                // Cache negative results so we don't re-resolve on every keystroke
                embedCache.value.set(entry.fileName, '');
                changed = true;
            }
        }

        if (changed) embedCacheVersion.value++;
    }

    function getEmbedMediaType(fileName: string): 'image' | 'video' | 'audio' | 'pdf' | 'note' | 'unknown' {
        const lastPart = fileName.split('.').pop() ?? 'unknown';
        const ext = `.${lastPart.toLowerCase()}`;
        if (checkImage(ext)) return 'image';
        if (checkVideo(ext)) return 'video';
        if (checkAudio(ext)) return 'audio';
        if (ext === '.pdf') return 'pdf';
        if (ext === '.md' || ext === '.txt') return 'note';
        return 'unknown';
    }

    function clearCache(): void {
        embedCache.value.clear();
        embedCacheVersion.value++;
    }

    return { embedCache, embedCacheVersion, resolveEmbeds, getEmbedMediaType, clearCache };
}
