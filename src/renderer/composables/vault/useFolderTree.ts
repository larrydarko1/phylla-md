/**
 * useFolderTree – builds a recursive tree structure from flat file/folder lists
 * and manages expand/collapse state.
 */

import { ref, computed, watch, type ComputedRef, type Ref } from 'vue';
import { z } from 'zod';

import type { FileInfo, FolderInfo, TreeNode } from '@/schemas/vault';

type UseFolderTreeReturn = {
    expandedFolders: Ref<Set<string>>;
    folderTree: ComputedRef<TreeNode[]>;
    flattenedItems: ComputedRef<{ type: 'file' | 'folder'; file?: FileInfo; folderPath?: string }[]>;
    visibleFiles: ComputedRef<FileInfo[]>;
    toggleFolder: (folderPath: string) => void;
    getFileNameWithoutExtension: (fileName: string) => string;
};

export function useFolderTree(
    getFiles: () => FileInfo[],
    getFolders: () => FolderInfo[] | undefined,
    getCurrentFolder: () => string | null,
): UseFolderTreeReturn {
    const expandedFolders = ref<Set<string>>(new Set());

    function getFileNameWithoutExtension(fileName: string): string {
        const lastDotIndex = fileName.lastIndexOf('.');
        return lastDotIndex > 0 ? fileName.substring(0, lastDotIndex) : fileName;
    }

    const folderTree = computed((): TreeNode[] => {
        const files = getFiles();
        const folders = getFolders();
        const root: TreeNode[] = [];
        const folderMap = new Map<string, TreeNode>();

        // First pass: create folder nodes from explicit folders list
        if (folders !== undefined) {
            folders.forEach((folder): void => {
                if (!folderMap.has(folder.relativePath)) {
                    folderMap.set(folder.relativePath, {
                        path: folder.relativePath,
                        name: folder.name,
                        type: 'folder',
                        children: [],
                    });
                }
            });
        }

        // Second pass: create folder nodes from file paths (backwards compatibility)
        files.forEach((file): void => {
            if (file.folder === '.') return;
            const parts = file.folder.split('/');
            let currentPath = '';
            parts.forEach((part): void => {
                currentPath = currentPath !== '' ? `${currentPath}/${part}` : part;
                if (!folderMap.has(currentPath)) {
                    folderMap.set(currentPath, {
                        path: currentPath,
                        name: part,
                        type: 'folder',
                        children: [],
                    });
                }
            });
        });

        // Third pass: build the tree hierarchy
        folderMap.forEach((node, path): void => {
            const lastSlashIndex = path.lastIndexOf('/');
            const parentPath = lastSlashIndex > 0 ? path.substring(0, lastSlashIndex) : '';
            if (parentPath === '') {
                root.push(node);
            } else {
                const parent = folderMap.get(parentPath);
                if (parent !== undefined && Array.isArray(parent.children)) {
                    parent.children.push(node);
                }
            }
        });

        // Fourth pass: add files to their folders and root
        files.forEach((file): void => {
            const fileNode: TreeNode = {
                path: file.path,
                name: getFileNameWithoutExtension(file.name),
                type: 'file',
                file,
            };
            if (file.folder === '.') {
                root.push(fileNode);
            } else {
                const parent = folderMap.get(file.folder);
                if (parent !== undefined && Array.isArray(parent.children)) {
                    parent.children.push(fileNode);
                }
            }
        });

        // Sort: folders first, then alphabetical within each group
        const sortNodes = (nodes: TreeNode[]): void => {
            nodes.sort((a, b): number => {
                if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
                return a.name.localeCompare(b.name);
            });
            nodes.forEach((node): void => {
                if (node.children !== undefined && Array.isArray(node.children)) {
                    sortNodes(node.children);
                }
            });
        };
        sortNodes(root);
        return root;
    });

    const flattenedItems = computed((): { type: 'file' | 'folder'; file?: FileInfo; folderPath?: string }[] => {
        const items: { type: 'file' | 'folder'; file?: FileInfo; folderPath?: string }[] = [];

        function traverse(nodes: TreeNode[]): void {
            for (const node of nodes) {
                if (node.type === 'folder') {
                    items.push({ type: 'folder', folderPath: node.path });
                    const hasExpandedFolder = expandedFolders.value.has(node.path);
                    if (hasExpandedFolder && node.children !== undefined && Array.isArray(node.children)) {
                        traverse(node.children);
                    }
                } else if (node.file !== undefined) {
                    items.push({ type: 'file', file: node.file });
                }
            }
        }

        traverse(folderTree.value);
        return items;
    });

    const visibleFiles = computed(
        (): {
            name: string;
            path: string;
            relativePath: string;
            extension: string;
            size: number;
            modified: string;
            folder: string;
        }[] =>
            flattenedItems.value.flatMap((item): FileInfo[] =>
                item.type === 'file' && item.file !== undefined ? [item.file] : [],
            ),
    );

    function toggleFolder(folderPath: string): void {
        if (expandedFolders.value.has(folderPath)) {
            expandedFolders.value.delete(folderPath);
        } else {
            expandedFolders.value.add(folderPath);
        }
        expandedFolders.value = new Set(expandedFolders.value);
    }

    // Load expanded folders state from localStorage when vault changes
    watch(
        getCurrentFolder,
        (newFolder): void => {
            if (newFolder !== null && newFolder !== '') {
                const saved = localStorage.getItem(`phylla-expanded-folders-${newFolder}`);
                if (saved !== null && saved !== '') {
                    try {
                        const result = z.array(z.string()).safeParse(JSON.parse(saved));
                        expandedFolders.value = result.success ? new Set(result.data) : new Set();
                    } catch {
                        expandedFolders.value = new Set();
                    }
                } else {
                    expandedFolders.value = new Set();
                }
            }
        },
        { immediate: true },
    );

    // Persist expanded folders state to localStorage
    watch(
        expandedFolders,
        (newExpanded): void => {
            const currentFolder = getCurrentFolder();
            if (currentFolder !== null && currentFolder !== '') {
                localStorage.setItem(
                    `phylla-expanded-folders-${currentFolder}`,
                    JSON.stringify(Array.from(newExpanded)),
                );
            }
        },
        { deep: true },
    );

    return { expandedFolders, folderTree, flattenedItems, visibleFiles, toggleFolder, getFileNameWithoutExtension };
}
