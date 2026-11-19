/**
 * useTreeNodeDrag — handles drag-and-drop reordering of files and folders
 * within the vault tree.
 */

import { ref, type Ref } from 'vue';

import type { TreeNode, FileInfo } from '@/schemas/vault';

type UseTreeNodeDragReturn = {
    isDragging: Ref<boolean>;
    isDragOver: Ref<boolean>;
    handleDragStart: (event: DragEvent) => void;
    handleDragEnd: () => void;
    handleDragOver: (event: DragEvent) => void;
    handleDragLeave: () => void;
    handleDrop: (event: DragEvent) => void;
};

export function useTreeNodeDrag(
    getNode: () => TreeNode,
    getActiveFile: () => FileInfo | null,
    onMoveFile: (filePath: string, targetFolderPath: string) => void,
    onMoveFolder: (folderPath: string, targetFolderPath: string) => void,
): UseTreeNodeDragReturn {
    const isDragging = ref(false);
    const isDragOver = ref(false);

    function handleDragStart(event: DragEvent): void {
        const node = getNode();
        const dataTransfer = event.dataTransfer;

        if (dataTransfer === null) return;

        isDragging.value = true;
        dataTransfer.effectAllowed = 'move';
        dataTransfer.dropEffect = 'move';

        if (node.type === 'file' && node.file !== undefined) {
            dataTransfer.setData('text/plain', `file:${node.file.path}`);
        } else if (node.type === 'folder') {
            dataTransfer.setData('text/plain', `folder:${node.path}`);
        }
    }

    function handleDragEnd(): void {
        isDragging.value = false;
    }

    function handleDragOver(event: DragEvent): void {
        const node = getNode();

        if (node.type === 'folder') {
            event.preventDefault();
            isDragOver.value = true;

            const dataTransfer = event.dataTransfer;
            if (dataTransfer !== null) dataTransfer.dropEffect = 'move';
        }
    }

    function handleDragLeave(): void {
        isDragOver.value = false;
    }

    function handleDrop(event: DragEvent): void {
        isDragOver.value = false;
        const node = getNode();
        const dataTransfer = event.dataTransfer;

        if (node.type !== 'folder' || dataTransfer === null) return;

        const data = dataTransfer.getData('text/plain');

        if (data === '') return;

        if (data.startsWith('file:')) {
            const filePath = data.substring(5);
            const activeFile = getActiveFile();

            if (activeFile !== null && activeFile.path === filePath && activeFile.folder === node.path) return;

            onMoveFile(filePath, node.path);
        } else if (data.startsWith('folder:')) {
            const folderPath = data.substring(7);

            if (folderPath === node.path || node.path.startsWith(`${folderPath}/`)) return;

            onMoveFolder(folderPath, node.path);
        }
    }

    return { isDragging, isDragOver, handleDragStart, handleDragEnd, handleDragOver, handleDragLeave, handleDrop };
}
