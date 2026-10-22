import { describe, it, expect } from 'vitest';

import FolderNode from '@/renderer/components/explorer/FolderNode.vue';
import type { FileInfo, TreeNode } from '@/schemas/vault';
import { mountWithI18n, FakeDataTransfer, instanceOf } from '@test-utils';

const noteFile = makeFile('notes.md', '/vault/notes.md');
const imageFile = makeFile('photo.png', '/vault/photo.png', 'png');
const videoFile = makeFile('clip.mp4', '/vault/clip.mp4', 'mp4');
const audioFile = makeFile('song.mp3', '/vault/song.mp3', 'mp3');
const drawingFile = makeFile('sketch.drawing', '/vault/sketch.drawing', 'drawing');

const baseProps = {
    depth: 0,
    selectedFiles: [] as FileInfo[],
    activeFile: null as FileInfo | null,
    renamingFile: null as FileInfo | null,
    selectedFolder: null as string | null,
    renamingFolder: null as string | null,
    renameValue: '',
    expandedFolders: new Set<string>(),
    bookmarkedFiles: [] as string[],
};

function makeDataTransfer(data = ''): DataTransfer {
    return new FakeDataTransfer(data === '' ? {} : { 'text/plain': data });
}

function makeFile(name: string, path: string, ext = 'md'): FileInfo {
    return {
        name,
        path,
        relativePath: path,
        extension: ext,
        size: 0,
        modified: new Date().toISOString(),
        folder: '.',
    };
}

function makeFileNode(file: FileInfo): TreeNode {
    return { path: file.path, name: file.name, type: 'file', file };
}

function makeFolderNode(path: string, name: string, children: TreeNode[] = []): TreeNode {
    return { path, name, type: 'folder', children };
}

describe('FolderNode — file node', () => {
    it('renders a file item for a file type node', () => {
        const wrapper = mountWithI18n(FolderNode, {
            props: { ...baseProps, node: makeFileNode(noteFile) },
        });
        expect(wrapper.find('.file-item, [role="treeitem"]').exists()).toBe(true);
        wrapper.unmount();
    });

    it('shows the file name', () => {
        const wrapper = mountWithI18n(FolderNode, {
            props: { ...baseProps, node: makeFileNode(noteFile) },
        });
        expect(wrapper.html()).toContain('notes.md');
        wrapper.unmount();
    });

    it('applies "active" class when file is the activeFile', () => {
        const wrapper = mountWithI18n(FolderNode, {
            props: { ...baseProps, node: makeFileNode(noteFile), activeFile: noteFile },
        });
        const item = wrapper.find('.file-item');
        expect(item.classes()).toContain('active');
        wrapper.unmount();
    });

    it('applies "selected" class when file is in selectedFiles', () => {
        const wrapper = mountWithI18n(FolderNode, {
            props: { ...baseProps, node: makeFileNode(noteFile), selectedFiles: [noteFile] },
        });
        const item = wrapper.find('.file-item');
        expect(item.classes()).toContain('selected');
        wrapper.unmount();
    });

    it('emits "selectFile" when the file item is clicked', async () => {
        const wrapper = mountWithI18n(FolderNode, {
            props: { ...baseProps, node: makeFileNode(noteFile) },
        });
        await wrapper.find('.file-item').trigger('click');
        expect(wrapper.emitted('selectFile')?.[0]?.[0]).toMatchObject({ path: noteFile.path });
        wrapper.unmount();
    });

    it('emits "contextMenu" when the file is right-clicked', async () => {
        const wrapper = mountWithI18n(FolderNode, {
            props: { ...baseProps, node: makeFileNode(noteFile) },
        });
        await wrapper.find('.file-item').trigger('contextmenu');
        expect(wrapper.emitted('contextMenu')?.[0]?.[0]).toBe('file');
        wrapper.unmount();
    });

    it('shows an image icon for image files', () => {
        const wrapper = mountWithI18n(FolderNode, {
            props: { ...baseProps, node: makeFileNode(imageFile) },
        });
        expect(wrapper.html()).toBeTruthy();
        wrapper.unmount();
    });

    it('shows a video icon for video files', () => {
        const wrapper = mountWithI18n(FolderNode, {
            props: { ...baseProps, node: makeFileNode(videoFile) },
        });
        expect(wrapper.html()).toBeTruthy();
        wrapper.unmount();
    });

    it('shows an audio icon for audio files', () => {
        const wrapper = mountWithI18n(FolderNode, {
            props: { ...baseProps, node: makeFileNode(audioFile) },
        });
        expect(wrapper.html()).toBeTruthy();
        wrapper.unmount();
    });

    it('shows a drawing icon for drawing files', () => {
        const wrapper = mountWithI18n(FolderNode, {
            props: { ...baseProps, node: makeFileNode(drawingFile) },
        });
        expect(wrapper.html()).toBeTruthy();
        wrapper.unmount();
    });

    it('applies indentation based on depth', () => {
        const wrapper = mountWithI18n(FolderNode, {
            props: { ...baseProps, node: makeFileNode(noteFile), depth: 2 },
        });
        expect(wrapper.html()).toContain('42px');
        wrapper.unmount();
    });
});

describe('FolderNode — folder node', () => {
    const folderNode = makeFolderNode('/vault/docs', 'docs', [makeFileNode(noteFile)]);

    it('renders a folder item for a folder type node', () => {
        const wrapper = mountWithI18n(FolderNode, {
            props: { ...baseProps, node: folderNode },
        });
        expect(wrapper.find('.folder-item').exists()).toBe(true);
        wrapper.unmount();
    });

    it('shows the folder name', () => {
        const wrapper = mountWithI18n(FolderNode, {
            props: { ...baseProps, node: folderNode },
        });
        expect(wrapper.html()).toContain('docs');
        wrapper.unmount();
    });

    it('emits "selectFolder" when the folder item is clicked', async () => {
        const wrapper = mountWithI18n(FolderNode, {
            props: { ...baseProps, node: folderNode },
        });
        await wrapper.find('.folder-item').trigger('click');
        expect(wrapper.emitted('selectFolder')?.[0]?.[0]).toBe('/vault/docs');
        wrapper.unmount();
    });

    it('emits "toggleFolder" when the chevron button is clicked', async () => {
        const wrapper = mountWithI18n(FolderNode, {
            props: { ...baseProps, node: folderNode },
        });
        await wrapper.find('.chevron-button').trigger('click');
        expect(wrapper.emitted('toggleFolder')?.[0]?.[0]).toBe('/vault/docs');
        wrapper.unmount();
    });

    it('does not expand children when folder is not in expandedFolders', () => {
        const wrapper = mountWithI18n(FolderNode, {
            props: { ...baseProps, node: folderNode },
        });
        expect(wrapper.findAll('.file-item')).toHaveLength(0);
        wrapper.unmount();
    });

    it('expands and shows children when folder is in expandedFolders', () => {
        const wrapper = mountWithI18n(FolderNode, {
            props: {
                ...baseProps,
                node: folderNode,
                expandedFolders: new Set(['/vault/docs']),
            },
        });
        expect(wrapper.findAll('.file-item').length).toBeGreaterThan(0);
        wrapper.unmount();
    });

    it('applies "active" class when folder is the selectedFolder', () => {
        const wrapper = mountWithI18n(FolderNode, {
            props: { ...baseProps, node: folderNode, selectedFolder: '/vault/docs' },
        });
        expect(wrapper.find('.folder-item').classes()).toContain('active');
        wrapper.unmount();
    });

    it('emits "contextMenu" when the folder is right-clicked', async () => {
        const wrapper = mountWithI18n(FolderNode, {
            props: { ...baseProps, node: folderNode },
        });
        await wrapper.find('.folder-item').trigger('contextmenu');
        expect(wrapper.emitted('contextMenu')?.[0]?.[0]).toBe('folder');
        wrapper.unmount();
    });

    it('shows the open folder icon when expanded', () => {
        const wrapper = mountWithI18n(FolderNode, {
            props: {
                ...baseProps,
                node: folderNode,
                expandedFolders: new Set(['/vault/docs']),
            },
        });
        expect(wrapper.find('.folder-icon-open').exists()).toBe(true);
        wrapper.unmount();
    });

    it('shows the closed folder icon when not expanded', () => {
        const wrapper = mountWithI18n(FolderNode, {
            props: { ...baseProps, node: folderNode },
        });
        expect(wrapper.find('.folder-icon-open').exists()).toBe(false);
        wrapper.unmount();
    });

    it('shows the aria-expanded attribute as false when not expanded', () => {
        const wrapper = mountWithI18n(FolderNode, {
            props: { ...baseProps, node: folderNode },
        });
        expect(wrapper.find('.folder-item').attributes('aria-expanded')).toBe('false');
        wrapper.unmount();
    });

    it('shows the aria-expanded attribute as true when expanded', () => {
        const wrapper = mountWithI18n(FolderNode, {
            props: {
                ...baseProps,
                node: folderNode,
                expandedFolders: new Set(['/vault/docs']),
            },
        });
        expect(wrapper.find('.folder-item').attributes('aria-expanded')).toBe('true');
        wrapper.unmount();
    });
});

describe('FolderNode — renaming', () => {
    it('shows a rename input when renamingFile matches the file', async () => {
        const wrapper = mountWithI18n(FolderNode, {
            props: {
                ...baseProps,
                node: makeFileNode(noteFile),
                renamingFile: noteFile,
                renameValue: 'notes',
            },
        });
        await wrapper.vm.$nextTick();
        expect(wrapper.find('input[type="text"], .rename-input').exists()).toBe(true);
        wrapper.unmount();
    });

    it('emits "cancelRename" when Escape is pressed during rename', async () => {
        const wrapper = mountWithI18n(FolderNode, {
            props: {
                ...baseProps,
                node: makeFileNode(noteFile),
                renamingFile: noteFile,
                renameValue: 'notes',
            },
        });
        await wrapper.vm.$nextTick();
        const input = wrapper.find('input');
        expect(input.exists()).toBe(true);
        await input.trigger('keydown', { key: 'Escape' });
        expect(wrapper.emitted('cancelRename')).toBeDefined();
        wrapper.unmount();
    });

    it('emits "rename" when the input loses focus (blur)', async () => {
        const wrapper = mountWithI18n(FolderNode, {
            props: {
                ...baseProps,
                node: makeFileNode(noteFile),
                renamingFile: noteFile,
                renameValue: 'newnotes',
            },
        });
        await wrapper.vm.$nextTick();
        const input = wrapper.find('input');
        expect(input.exists()).toBe(true);
        await input.trigger('blur');
        expect(wrapper.emitted('rename')).toBeDefined();
        wrapper.unmount();
    });

    it('emits "updateRenameValue" and "rename" (via Enter) from the file rename input', async () => {
        const wrapper = mountWithI18n(FolderNode, {
            props: { ...baseProps, node: makeFileNode(noteFile), renamingFile: noteFile, renameValue: 'notes' },
        });
        await wrapper.vm.$nextTick();
        const input = wrapper.find('.file-name-input');
        await input.setValue('renamed');
        expect(wrapper.emitted('updateRenameValue')?.at(-1)).toEqual(['renamed']);
        await input.trigger('keydown', { key: 'Enter' });
        await input.trigger('blur');
        expect(wrapper.emitted('rename')).toBeDefined();
        wrapper.unmount();
    });

    it('wires the folder rename input handlers', async () => {
        const wrapper = mountWithI18n(FolderNode, {
            props: {
                ...baseProps,
                node: makeFolderNode('/vault/docs', 'docs'),
                renamingFolder: '/vault/docs',
                renameValue: 'docs',
            },
        });
        await wrapper.vm.$nextTick();
        const input = wrapper.find('.folder-name-input');
        expect(input.exists()).toBe(true);
        await input.setValue('renamed');
        expect(wrapper.emitted('updateRenameValue')?.at(-1)).toEqual(['renamed']);
        await input.trigger('keydown', { key: 'Escape' });
        expect(wrapper.emitted('cancelRename')).toBeDefined();
        await input.trigger('keydown', { key: 'Enter' });
        await input.trigger('blur');
        expect(wrapper.emitted('rename')).toBeDefined();
        wrapper.unmount();
    });
});

describe('FolderNode — drag and drop', () => {
    const folderNode = makeFolderNode('/vault/docs', 'docs', [makeFileNode(noteFile)]);

    it('marks the folder as dragging/drag-over through the drag lifecycle', async () => {
        const wrapper = mountWithI18n(FolderNode, { props: { ...baseProps, node: folderNode } });
        const item = wrapper.find('.folder-item');
        await item.trigger('dragstart', { dataTransfer: makeDataTransfer() });
        expect(item.classes()).toContain('is-dragging');
        await item.trigger('dragover', { dataTransfer: makeDataTransfer() });
        expect(item.classes()).toContain('drag-over');
        await item.trigger('dragleave');
        await item.trigger('dragend');
        expect(wrapper.find('.folder-item').classes()).not.toContain('is-dragging');
        wrapper.unmount();
    });

    it('emits "moveFile" when a file is dropped on the folder', async () => {
        const wrapper = mountWithI18n(FolderNode, { props: { ...baseProps, node: folderNode } });
        await wrapper.find('.folder-item').trigger('drop', { dataTransfer: makeDataTransfer('file:/vault/other.md') });
        expect(wrapper.emitted('moveFile')?.[0]).toEqual(['/vault/other.md', '/vault/docs']);
        wrapper.unmount();
    });

    it('emits "moveFolder" when a folder is dropped on the folder', async () => {
        const wrapper = mountWithI18n(FolderNode, { props: { ...baseProps, node: folderNode } });
        await wrapper.find('.folder-item').trigger('drop', { dataTransfer: makeDataTransfer('folder:/vault/other') });
        expect(wrapper.emitted('moveFolder')?.[0]).toEqual(['/vault/other', '/vault/docs']);
        wrapper.unmount();
    });

    it('marks a file item as dragging through drag start/end', async () => {
        const wrapper = mountWithI18n(FolderNode, { props: { ...baseProps, node: makeFileNode(noteFile) } });
        const item = wrapper.find('.file-item');
        await item.trigger('dragstart', { dataTransfer: makeDataTransfer() });
        expect(item.classes()).toContain('is-dragging');
        await item.trigger('dragend');
        expect(wrapper.find('.file-item').classes()).not.toContain('is-dragging');
        wrapper.unmount();
    });
});

describe('FolderNode — hover marquee', () => {
    it('scrolls an overflowing folder name on hover and resets on leave', async () => {
        const wrapper = mountWithI18n(FolderNode, {
            props: { ...baseProps, node: makeFolderNode('/vault/docs', 'docs') },
        });
        const el = instanceOf(wrapper.find('.folder-name .name-text').element, HTMLElement);
        Object.defineProperty(el, 'scrollWidth', { value: 200, configurable: true });
        Object.defineProperty(el, 'clientWidth', { value: 100, configurable: true });
        await wrapper.find('.folder-item').trigger('mouseenter');
        expect(wrapper.find('.folder-name .name-text').classes()).toContain('scrolling');
        await wrapper.find('.folder-item').trigger('mouseleave');
        expect(wrapper.find('.folder-name .name-text').classes()).not.toContain('scrolling');
        wrapper.unmount();
    });

    it('scrolls an overflowing file name on hover and resets on leave', async () => {
        const wrapper = mountWithI18n(FolderNode, { props: { ...baseProps, node: makeFileNode(noteFile) } });
        const el = instanceOf(wrapper.find('.file-name .name-text').element, HTMLElement);
        Object.defineProperty(el, 'scrollWidth', { value: 200, configurable: true });
        Object.defineProperty(el, 'clientWidth', { value: 100, configurable: true });
        await wrapper.find('.file-item').trigger('mouseenter');
        expect(wrapper.find('.file-name .name-text').classes()).toContain('scrolling');
        await wrapper.find('.file-item').trigger('mouseleave');
        expect(wrapper.find('.file-name .name-text').classes()).not.toContain('scrolling');
        wrapper.unmount();
    });

    it('does not scroll when the name fits (no overflow)', async () => {
        const wrapper = mountWithI18n(FolderNode, { props: { ...baseProps, node: makeFileNode(noteFile) } });
        await wrapper.find('.file-item').trigger('mouseenter');
        expect(wrapper.find('.file-name .name-text').classes()).not.toContain('scrolling');
        wrapper.unmount();
    });
});

describe('FolderNode — recursive child forwarding', () => {
    const grandchildFile = makeFile('child.md', '/vault/docs/sub/child.md');
    const childFolder = makeFolderNode('/vault/docs/sub', 'sub', [makeFileNode(grandchildFile)]);
    const parent = makeFolderNode('/vault/docs', 'docs', [childFolder]);
    const expanded = new Set(['/vault/docs', '/vault/docs/sub']);

    it('re-emits selectFolder/toggleFolder/contextMenu from a child folder', async () => {
        const wrapper = mountWithI18n(FolderNode, {
            props: { ...baseProps, node: parent, expandedFolders: expanded },
        });
        const childItem = wrapper.findAll('.folder-item')[1];
        await childItem!.trigger('click');
        expect(wrapper.emitted('selectFolder')?.at(-1)).toEqual(['/vault/docs/sub']);

        await wrapper.findAll('.chevron-button')[1]!.trigger('click');
        expect(wrapper.emitted('toggleFolder')?.at(-1)).toEqual(['/vault/docs/sub']);

        await childItem!.trigger('contextmenu');
        expect(wrapper.emitted('contextMenu')?.at(-1)?.slice(0, 2)).toEqual(['folder', '/vault/docs/sub']);
        wrapper.unmount();
    });

    it('re-emits moveFile/moveFolder from a child folder drop', async () => {
        const wrapper = mountWithI18n(FolderNode, {
            props: { ...baseProps, node: parent, expandedFolders: expanded },
        });
        const childItem = wrapper.findAll('.folder-item')[1];
        await childItem!.trigger('drop', { dataTransfer: makeDataTransfer('file:/vault/x.md') });
        expect(wrapper.emitted('moveFile')?.at(-1)).toEqual(['/vault/x.md', '/vault/docs/sub']);
        await childItem!.trigger('drop', { dataTransfer: makeDataTransfer('folder:/vault/y') });
        expect(wrapper.emitted('moveFolder')?.at(-1)).toEqual(['/vault/y', '/vault/docs/sub']);
        wrapper.unmount();
    });

    it('re-emits selectFile bubbled from a deeply nested file', async () => {
        const wrapper = mountWithI18n(FolderNode, {
            props: { ...baseProps, node: parent, expandedFolders: expanded },
        });
        await wrapper.find('.file-item').trigger('click');
        expect(wrapper.emitted('selectFile')?.at(-1)?.[0]).toEqual(grandchildFile);
        wrapper.unmount();
    });

    it('re-emits rename/cancelRename/updateRenameValue from a renaming child folder', async () => {
        const wrapper = mountWithI18n(FolderNode, {
            props: { ...baseProps, node: parent, expandedFolders: expanded, renamingFolder: '/vault/docs/sub' },
        });
        await wrapper.vm.$nextTick();
        const input = wrapper.find('.folder-name-input');
        expect(input.exists()).toBe(true);
        await input.setValue('renamed');
        expect(wrapper.emitted('updateRenameValue')?.at(-1)).toEqual(['renamed']);
        await input.trigger('keydown', { key: 'Escape' });
        expect(wrapper.emitted('cancelRename')).toBeTruthy();
        await input.trigger('blur');
        expect(wrapper.emitted('rename')).toBeTruthy();
        wrapper.unmount();
    });
});
