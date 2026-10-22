import { shallowMount } from '@vue/test-utils';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ref, shallowRef, defineComponent, h } from 'vue';

import DrawingCanvas from '@/renderer/components/DrawingCanvas.vue';
import NoteEditor from '@/renderer/components/NoteEditor.vue';
import { useDictation } from '@/renderer/composables/editor/useDictation';
import { useEditorDrop } from '@/renderer/composables/editor/useEditorDrop';
import { useEmbedResolver } from '@/renderer/composables/editor/useEmbedResolver';
import { useNotePersistence } from '@/renderer/composables/editor/useNotePersistence';
import { i18n } from '@/renderer/i18n';
import type { FileInfo } from '@/schemas/vault';

vi.mock('@codemirror/view', () => ({
    keymap: { of: vi.fn().mockReturnValue([]) },
    EditorView: { domEventHandlers: vi.fn().mockReturnValue([]) },
}));

vi.mock('@/renderer/composables/editor/codemirror/cm-markdown-widgets', () => ({
    createMarkdownWidgetsPlugin: vi.fn().mockReturnValue([]),
    interactiveExtension: [],
}));

vi.mock('@/renderer/composables/editor/codemirror/cm-list-continuation', () => ({
    listContinuationKeymap: [],
}));

vi.mock('@/renderer/composables/editor/codemirror/cm-task-fold', () => ({
    taskFoldExtension: vi.fn().mockReturnValue([]),
}));

vi.mock('@/renderer/composables/editor/codemirror/cm-theme', () => ({
    phyllaEditorTheme: [],
}));

vi.mock('@/renderer/composables/editor/codemirror/cm-toolbar', () => ({
    useCodemirrorToolbar: vi.fn().mockReturnValue({
        mdFormatText: vi.fn(),
        mdInsertHeading: vi.fn(),
    }),
    markdownKeymap: vi.fn().mockReturnValue([]),
}));

vi.mock('@/renderer/composables/editor/codemirror/useCodemirror', () => ({
    useCodemirror: vi.fn().mockReturnValue({ view: shallowRef(null) }),
}));

vi.mock('@/renderer/composables/editor/codemirror/useCodeEditor', () => ({
    useCodeEditor: vi.fn(),
}));

vi.mock('@/renderer/composables/editor/useEmbedResolver', () => ({
    useEmbedResolver: vi.fn(() => ({
        embedCache: ref(new Map()),
        embedCacheVersion: ref(0),
        resolveEmbeds: vi.fn(),
        getEmbedMediaType: vi.fn().mockReturnValue(null),
        clearCache: vi.fn(),
    })),
}));

vi.mock('@/renderer/composables/editor/useEditorDrop', () => ({
    useEditorDrop: vi.fn(() => ({
        isDragOverEditor: ref(false),
        onEditorDragEnter: vi.fn(),
        onEditorDragOver: vi.fn(),
        onEditorDragLeave: vi.fn(),
        onFileDrop: vi.fn(),
    })),
}));

const mockContent = ref('');
const mockOriginalContent = ref('');
const mockHasUnsavedChanges = ref(false);
const mockLastLoadedPath = ref<string | null>(null);
const mockJustSaved = ref(false);
const mockOnContentChange = vi.fn();
const mockSaveFile = vi.fn().mockResolvedValue(undefined);
const mockLoadFile = vi.fn().mockResolvedValue(undefined);
const mockHandleDrawingSave = vi.fn();
const mockClearAutoSaveTimeout = vi.fn();

vi.mock('@/renderer/composables/editor/useNotePersistence', () => ({
    useNotePersistence: vi.fn(() => ({
        content: mockContent,
        originalContent: mockOriginalContent,
        hasUnsavedChanges: mockHasUnsavedChanges,
        lastLoadedPath: mockLastLoadedPath,
        justSaved: mockJustSaved,
        onContentChange: mockOnContentChange,
        saveFile: mockSaveFile,
        loadFile: mockLoadFile,
        handleDrawingSave: mockHandleDrawingSave,
        clearAutoSaveTimeout: mockClearAutoSaveTimeout,
    })),
}));

const mockStopDictation = vi.fn();

vi.mock('@/renderer/composables/editor/useDictation', () => ({
    useDictation: vi.fn(() => ({
        isDictating: ref(false),
        isDictationLoading: ref(false),
        toggleDictation: vi.fn(),
        stopDictation: mockStopDictation,
    })),
}));

const mockReadFile = vi.fn().mockResolvedValue({ success: false });

function makeFile(overrides: Partial<FileInfo> = {}): FileInfo {
    return {
        name: 'test.md',
        path: '/vault/test.md',
        relativePath: 'test.md',
        extension: '.md',
        size: 100,
        modified: new Date().toISOString(),
        folder: '/vault',
        ...overrides,
    };
}

function mountEditor(file: FileInfo | null, workspacePath: string | null = '/vault') {
    return shallowMount(NoteEditor, {
        props: { file, workspacePath },
        global: { plugins: [i18n] },
    });
}

Object.assign(window, {
    electronAPI: {
        ...window.electronAPI,
        readFile: mockReadFile,
    },
});

beforeEach(() => {
    vi.clearAllMocks();
    mockContent.value = '';
    mockOriginalContent.value = '';
    mockHasUnsavedChanges.value = false;
    mockLastLoadedPath.value = null;
    mockJustSaved.value = false;
    mockLoadFile.mockResolvedValue(undefined);
    mockSaveFile.mockResolvedValue(undefined);
    mockReadFile.mockResolvedValue({ success: false });
});

describe('NoteEditor', () => {
    describe('empty state (file is null)', () => {
        it('renders the note-editor root', () => {
            const wrapper = mountEditor(null);
            expect(wrapper.find('.note-editor').exists()).toBe(true);
            wrapper.unmount();
        });

        it('shows empty state section when file is null', () => {
            const wrapper = mountEditor(null);
            expect(wrapper.find('.editor-empty').exists()).toBe(true);
            wrapper.unmount();
        });

        it('hides all viewer/editor sections when file is null', () => {
            const wrapper = mountEditor(null);
            expect(
                wrapper.findAll('section').filter((s) => s.classes().includes('text-editor-container')),
            ).toHaveLength(0);
            wrapper.unmount();
        });
    });

    describe('image file', () => {
        it('renders image-viewer-stub for .png files', () => {
            const wrapper = mountEditor(makeFile({ name: 'photo.png', extension: '.png', path: '/v/photo.png' }));
            expect(wrapper.findComponent({ name: 'ImageViewer' }).exists()).toBe(true);
            wrapper.unmount();
        });

        it('renders image-viewer-stub for .jpg files', () => {
            const wrapper = mountEditor(makeFile({ name: 'photo.jpg', extension: '.jpg', path: '/v/photo.jpg' }));
            expect(wrapper.findComponent({ name: 'ImageViewer' }).exists()).toBe(true);
            wrapper.unmount();
        });
    });

    describe('video file', () => {
        it('renders video-viewer-stub for .mp4 files', () => {
            const wrapper = mountEditor(makeFile({ name: 'clip.mp4', extension: '.mp4', path: '/v/clip.mp4' }));
            expect(wrapper.findComponent({ name: 'VideoViewer' }).exists()).toBe(true);
            wrapper.unmount();
        });
    });

    describe('audio file', () => {
        it('renders audio-viewer-stub for .mp3 files', () => {
            const wrapper = mountEditor(makeFile({ name: 'song.mp3', extension: '.mp3', path: '/v/song.mp3' }));
            expect(wrapper.findComponent({ name: 'AudioViewer' }).exists()).toBe(true);
            wrapper.unmount();
        });
    });

    describe('PDF file', () => {
        it('renders pdf-viewer-stub for .pdf files', () => {
            const wrapper = mountEditor(makeFile({ name: 'doc.pdf', extension: '.pdf', path: '/v/doc.pdf' }));
            expect(wrapper.findComponent({ name: 'PdfViewer' }).exists()).toBe(true);
            wrapper.unmount();
        });
    });

    describe('drawing file', () => {
        it('renders drawing-canvas-stub for .drawing files', () => {
            const wrapper = mountEditor(
                makeFile({ name: 'art.drawing', extension: '.drawing', path: '/v/art.drawing' }),
            );
            expect(wrapper.findComponent(DrawingCanvas).exists()).toBe(true);
            wrapper.unmount();
        });
    });

    describe('markdown file', () => {
        it('renders text-editor-container for .md files', () => {
            const wrapper = mountEditor(makeFile({ name: 'note.md', extension: '.md', path: '/v/note.md' }));
            expect(wrapper.find('.text-editor-container').exists()).toBe(true);
            wrapper.unmount();
        });

        it('renders MarkdownToolbar for .md files', () => {
            const wrapper = mountEditor(makeFile({ name: 'note.md', extension: '.md', path: '/v/note.md' }));
            expect(wrapper.findComponent({ name: 'MarkdownToolbar' }).exists()).toBe(true);
            wrapper.unmount();
        });

        it('renders cm-editor-container for .md files', () => {
            const wrapper = mountEditor(makeFile({ name: 'note.md', extension: '.md', path: '/v/note.md' }));
            expect(wrapper.find('.cm-editor-container').exists()).toBe(true);
            wrapper.unmount();
        });

        it('shows dictation button for .md files', () => {
            const wrapper = mountEditor(makeFile({ name: 'note.md', extension: '.md', path: '/v/note.md' }));
            expect(wrapper.find('.dictation-btn').exists()).toBe(true);
            wrapper.unmount();
        });

        it('calls loadFile when a new .md file is provided', () => {
            const file = makeFile({ name: 'note.md', extension: '.md', path: '/v/note.md' });
            mountEditor(file);
            expect(mockLoadFile).toHaveBeenCalledWith(file);
        });
    });

    describe('plain text file (.txt)', () => {
        it('renders text-editor-container for .txt files', () => {
            const wrapper = mountEditor(makeFile({ name: 'notes.txt', extension: '.txt', path: '/v/notes.txt' }));
            expect(wrapper.find('.text-editor-container').exists()).toBe(true);
            wrapper.unmount();
        });

        it('renders textarea for .txt files (not markdown)', () => {
            const wrapper = mountEditor(makeFile({ name: 'notes.txt', extension: '.txt', path: '/v/notes.txt' }));
            expect(wrapper.find('textarea').exists()).toBe(true);
            wrapper.unmount();
        });

        it('shows dictation button for .txt files', () => {
            const wrapper = mountEditor(makeFile({ name: 'notes.txt', extension: '.txt', path: '/v/notes.txt' }));
            expect(wrapper.find('.dictation-btn').exists()).toBe(true);
            wrapper.unmount();
        });
    });

    describe('file change watch', () => {
        it('skips reload when justSaved is true and same file', async () => {
            const file = makeFile({ path: '/v/note.md' });
            mockLastLoadedPath.value = '/v/note.md';
            mockJustSaved.value = true;
            mockLoadFile.mockClear();

            const wrapper = mountEditor(file);
            await wrapper.vm.$nextTick();

            expect(mockReadFile).not.toHaveBeenCalled();
            expect(mockLoadFile).not.toHaveBeenCalled();
            wrapper.unmount();
        });

        it('calls readFile when same file, no unsaved changes, and not justSaved', async () => {
            const file = makeFile({ path: '/v/note.md' });
            mockLastLoadedPath.value = '/v/note.md';
            mockJustSaved.value = false;
            mockHasUnsavedChanges.value = false;
            mockReadFile.mockResolvedValue({ success: true, content: 'updated content' });

            const wrapper = mountEditor(file);
            await wrapper.vm.$nextTick();
            await new Promise((r) => setTimeout(r, 0));

            expect(mockReadFile).toHaveBeenCalledWith('/v/note.md');
            wrapper.unmount();
        });

        it('sets null content when file changes to null', async () => {
            const wrapper = mountEditor(null);
            expect(mockContent.value).toBe('');
            wrapper.unmount();
        });
    });

    describe('keyboard shortcut', () => {
        it('calls saveFile on Cmd+S', async () => {
            const file = makeFile();
            const wrapper = mountEditor(file);
            const event = new KeyboardEvent('keydown', { key: 's', metaKey: true, bubbles: true });
            window.dispatchEvent(event);
            await wrapper.vm.$nextTick();
            expect(mockSaveFile).toHaveBeenCalled();
            wrapper.unmount();
        });

        it('calls saveFile on Ctrl+S', async () => {
            const file = makeFile();
            const wrapper = mountEditor(file);
            const event = new KeyboardEvent('keydown', { key: 's', ctrlKey: true, bubbles: true });
            window.dispatchEvent(event);
            await wrapper.vm.$nextTick();
            expect(mockSaveFile).toHaveBeenCalled();
            wrapper.unmount();
        });

        it('does not call saveFile on other keys', async () => {
            const file = makeFile();
            const wrapper = mountEditor(file);
            const event = new KeyboardEvent('keydown', { key: 'a', metaKey: true, bubbles: true });
            window.dispatchEvent(event);
            await wrapper.vm.$nextTick();
            expect(mockSaveFile).not.toHaveBeenCalled();
            wrapper.unmount();
        });
    });

    describe('reloadContent (exposed)', () => {
        /** Mounts the editor the way App does — by template ref — and reloads it through that ref. */
        async function reloadThroughRef(file: FileInfo | null): Promise<void> {
            const editor = ref<InstanceType<typeof NoteEditor> | null>(null);
            const Host = defineComponent({
                setup: () => () => h(NoteEditor, { ref: editor, file, workspacePath: '/vault' }),
            });
            const wrapper = shallowMount(Host, { global: { plugins: [i18n], stubs: { NoteEditor: false } } });
            mockLoadFile.mockClear();
            await editor.value?.reloadContent();
            wrapper.unmount();
        }

        it('calls loadFile with the current file', async () => {
            const file = makeFile();
            await reloadThroughRef(file);
            expect(mockLoadFile).toHaveBeenCalledWith(file);
        });

        it('does nothing when file is null', async () => {
            await reloadThroughRef(null);
            expect(mockLoadFile).not.toHaveBeenCalled();
        });
    });

    describe('lifecycle', () => {
        it('calls clearAutoSaveTimeout on unmount', () => {
            const wrapper = mountEditor(makeFile());
            wrapper.unmount();
            expect(mockClearAutoSaveTimeout).toHaveBeenCalled();
        });

        it('stops dictation on unmount when actively dictating', () => {
            const stop = vi.fn();
            vi.mocked(useDictation).mockReturnValueOnce({
                isDictating: ref(true),
                isDictationLoading: ref(false),
                toggleDictation: vi.fn(),
                stopDictation: stop,
            });
            const wrapper = mountEditor(makeFile({ extension: '.md', path: '/v/n.md' }));
            wrapper.unmount();
            expect(stop).toHaveBeenCalled();
        });
    });

    describe('code file (.js)', () => {
        it('renders the code editor container and hides the dictation button', () => {
            const wrapper = mountEditor(makeFile({ name: 'script.js', extension: '.js', path: '/v/script.js' }));
            expect(wrapper.find('.code-editor-container').exists()).toBe(true);
            expect(wrapper.find('.dictation-btn').exists()).toBe(false);
            wrapper.unmount();
        });
    });

    describe('dictation button states', () => {
        it('shows the loading state and disables the button while the model loads', () => {
            vi.mocked(useDictation).mockReturnValueOnce({
                isDictating: ref(false),
                isDictationLoading: ref(true),
                toggleDictation: vi.fn(),
                stopDictation: vi.fn(),
            });
            const wrapper = mountEditor(makeFile({ extension: '.md', path: '/v/n.md' }));
            const btn = wrapper.find('.dictation-btn');
            expect(btn.classes()).toContain('loading');
            expect(btn.attributes('disabled')).toBeDefined();
            wrapper.unmount();
        });

        it('shows the active state while dictating', () => {
            vi.mocked(useDictation).mockReturnValueOnce({
                isDictating: ref(true),
                isDictationLoading: ref(false),
                toggleDictation: vi.fn(),
                stopDictation: vi.fn(),
            });
            const wrapper = mountEditor(makeFile({ extension: '.md', path: '/v/n.md' }));
            expect(wrapper.find('.dictation-btn').classes()).toContain('active');
            wrapper.unmount();
        });
    });

    describe('drawing canvas integration', () => {
        it('forwards drawing save to handleDrawingSave', () => {
            const wrapper = mountEditor(
                makeFile({ name: 'art.drawing', extension: '.drawing', path: '/v/art.drawing' }),
            );
            wrapper.findComponent(DrawingCanvas).vm.$emit('save', 'drawing-data');
            expect(mockHandleDrawingSave).toHaveBeenCalledWith('drawing-data');
            wrapper.unmount();
        });

        it('updates unsaved state when the drawing canvas reports changes', async () => {
            const wrapper = mountEditor(
                makeFile({ name: 'art.drawing', extension: '.drawing', path: '/v/art.drawing' }),
            );
            wrapper.findComponent(DrawingCanvas).vm.$emit('content-changed', true);
            await wrapper.vm.$nextTick();
            expect(mockHasUnsavedChanges.value).toBe(true);
            wrapper.unmount();
        });
    });

    describe('global drop prevention', () => {
        it('prevents default on document drop and dragover events', () => {
            const wrapper = mountEditor(makeFile());
            const dropEvt = new Event('drop', { bubbles: true, cancelable: true });
            const dragEvt = new Event('dragover', { bubbles: true, cancelable: true });
            document.dispatchEvent(dropEvt);
            document.dispatchEvent(dragEvt);
            expect(dropEvt.defaultPrevented).toBe(true);
            expect(dragEvt.defaultPrevented).toBe(true);
            wrapper.unmount();
        });
    });

    describe('plain textarea input', () => {
        it('calls onContentChange when typing in the textarea', async () => {
            const wrapper = mountEditor(makeFile({ name: 'notes.txt', extension: '.txt', path: '/v/notes.txt' }));
            await wrapper.find('textarea').trigger('input');
            expect(mockOnContentChange).toHaveBeenCalled();
            wrapper.unmount();
        });
    });

    describe('composable wiring', () => {
        it('wires persistence callbacks to component emits', () => {
            vi.useFakeTimers();
            const file = makeFile({ extension: '.md', path: '/v/n.md' });
            const wrapper = mountEditor(file);
            const [findFile, isMd, onLoad, onSave, onChanged] = vi.mocked(useNotePersistence).mock.calls.at(-1)!;

            expect(findFile()).toEqual(file);
            expect(isMd()).toBe(true);
            onLoad('body'); // resolveEmbeds wiring

            onSave('saved');
            expect(wrapper.emitted('save')?.at(-1)).toEqual(['saved']);

            onChanged(true);
            vi.advanceTimersByTime(200);
            expect(wrapper.emitted('contentChanged')?.at(-1)).toEqual([true]);

            vi.useRealTimers();
            wrapper.unmount();
        });

        it('wires the embed resolver file/workspace getters', () => {
            const file = makeFile({ extension: '.md', path: '/v/n.md' });
            const wrapper = mountEditor(file, '/ws');
            const [findFile, findWorkspace] = vi.mocked(useEmbedResolver).mock.calls.at(-1)!;
            expect(findFile()).toEqual(file);
            expect(findWorkspace()).toBe('/ws');
            wrapper.unmount();
        });

        it('wires the editor-drop file getter', () => {
            const file = makeFile({ extension: '.md', path: '/v/n.md' });
            const wrapper = mountEditor(file, '/ws');
            const options = vi.mocked(useEditorDrop).mock.calls.at(-1)?.[0];
            expect(options?.findFile()).toEqual(file);
            expect(options?.textareaRef).not.toBeInstanceOf(Function);
            wrapper.unmount();
        });
    });
});
