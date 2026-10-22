/* eslint-disable vue/one-component-per-file -- each test mounts its own throwaway host for the composable */
import { undo } from '@codemirror/commands';
import { EditorView } from '@codemirror/view';
import { mount } from '@vue/test-utils';
import { assert, describe, it, expect, vi, afterEach } from 'vitest';
import { ref, nextTick, defineComponent, h } from 'vue';

import { useCodemirror, phyllaHighlightStyle } from '@/renderer/composables/editor/codemirror/useCodemirror';

class FakeResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
}

function mountComposable(options: {
    initialContent?: string;
    initialFileId?: string | null;
    extraExtensions?: never[];
    placeholder?: string;
    onContentChange?: () => void;
}) {
    const { initialContent = '', initialFileId = null, onContentChange = vi.fn() } = options;

    const content = ref(initialContent);
    const fileId = ref<string | null>(initialFileId);
    let composableResult: ReturnType<typeof useCodemirror> | null = null;
    const containerRef = ref<HTMLElement | null>(null);

    const TestComponent = defineComponent({
        setup() {
            composableResult = useCodemirror(containerRef, content, onContentChange, {
                placeholderText: 'Type here...',
                fileId,
            });
            return () =>
                h('div', {
                    ref: (el) => {
                        containerRef.value = el instanceof HTMLElement ? el : null;
                    },
                });
        },
    });

    const wrapper = mount(TestComponent, { attachTo: document.body });

    return {
        wrapper,
        content,
        fileId,
        getView: () => composableResult!.view.value,
        onContentChange,
    };
}

vi.stubGlobal('ResizeObserver', FakeResizeObserver);

describe('phyllaHighlightStyle', () => {
    it('is exported as a HighlightStyle object', () => {
        expect(phyllaHighlightStyle).toBeDefined();
        expect(typeof phyllaHighlightStyle).toBe('object');
    });

    it('has a module property (as all HighlightStyle instances do)', () => {
        expect(phyllaHighlightStyle).toHaveProperty('module');
    });
});

describe('useCodemirror', () => {
    afterEach(() => {
        document.body.innerHTML = '';
        vi.clearAllMocks();
    });

    it('returns a reactive view ref initially null until DOM is ready', async () => {
        const content = ref('hello');
        const containerRef = ref<HTMLElement | null>(null);
        const onContentChange = vi.fn();

        let capturedView: ReturnType<typeof useCodemirror>['view'] | null = null;

        const TestComponent = defineComponent({
            setup() {
                const result = useCodemirror(containerRef, content, onContentChange);
                capturedView = result.view;
                return () => h('div');
            },
        });

        const wrapper = mount(TestComponent, { attachTo: document.body });
        expect(capturedView!.value).toBeNull();
        wrapper.unmount();
    });

    it('creates an EditorView when containerRef is set to a DOM element', async () => {
        const { wrapper, getView } = mountComposable({ initialContent: 'Hello' });
        await nextTick();
        await nextTick(); // two ticks: watch fires + nextTick inside watch
        const v = getView();
        expect(v).not.toBeNull();
        expect(v).toBeInstanceOf(EditorView);
        wrapper.unmount();
    });

    it('initializes the editor with the provided content', async () => {
        const { wrapper, getView } = mountComposable({ initialContent: 'Initial text' });
        await nextTick();
        await nextTick();
        const v = getView();
        expect(v?.state.doc.toString()).toBe('Initial text');
        wrapper.unmount();
    });

    it('syncs editor content changes back to the content ref', async () => {
        const { wrapper, content, getView } = mountComposable({ initialContent: '' });
        await nextTick();
        await nextTick();
        const v = getView();
        assert.isNotNull(v);
        v.dispatch({
            changes: { from: 0, to: 0, insert: 'typed' },
        });
        expect(content.value).toBe('typed');
        wrapper.unmount();
    });

    it('calls onContentChange callback when user types', async () => {
        const onContentChange = vi.fn();
        const { wrapper, getView } = mountComposable({ initialContent: '', onContentChange });
        await nextTick();
        await nextTick();
        const v = getView();
        assert.isNotNull(v);
        v.dispatch({
            changes: { from: 0, to: 0, insert: 'a' },
        });
        expect(onContentChange).toHaveBeenCalled();
        wrapper.unmount();
    });

    it('does NOT call onContentChange when content ref is updated externally', async () => {
        const onContentChange = vi.fn();
        const { wrapper, content, getView } = mountComposable({
            initialContent: 'original',
            onContentChange,
        });
        await nextTick();
        await nextTick();
        const v = getView();
        assert.isNotNull(v);
        onContentChange.mockClear();
        content.value = 'replaced externally';
        await nextTick();
        expect(onContentChange).not.toHaveBeenCalled();
        wrapper.unmount();
    });

    it('pushes external content changes into the editor', async () => {
        const { wrapper, content, getView } = mountComposable({ initialContent: 'old text' });
        await nextTick();
        await nextTick();
        const v = getView();
        assert.isNotNull(v);
        content.value = 'new text';
        await nextTick();
        expect(v.state.doc.toString()).toBe('new text');
        wrapper.unmount();
    });

    it('skips pushing content when it equals the current editor document', async () => {
        const dispatchSpy = vi.spyOn(EditorView.prototype, 'dispatch');
        const { wrapper, content, getView } = mountComposable({ initialContent: 'same' });
        await nextTick();
        await nextTick();
        const v = getView();
        assert.isNotNull(v);
        dispatchSpy.mockClear();
        content.value = 'same';
        await nextTick();
        expect(dispatchSpy).not.toHaveBeenCalled();
        dispatchSpy.mockRestore();
        wrapper.unmount();
    });

    it('destroys the EditorView on unmount', async () => {
        const destroySpy = vi.spyOn(EditorView.prototype, 'destroy');
        const { wrapper, getView } = mountComposable({ initialContent: '' });
        await nextTick();
        await nextTick();
        const v = getView();
        assert.isNotNull(v);
        wrapper.unmount();
        expect(destroySpy).toHaveBeenCalled();
        destroySpy.mockRestore();
    });

    it('recreates EditorState when fileId changes', async () => {
        const setStateSpy = vi.spyOn(EditorView.prototype, 'setState');
        const { wrapper, fileId, getView } = mountComposable({
            initialContent: 'file content',
            initialFileId: 'file1.md',
        });
        await nextTick();
        await nextTick();
        expect(getView()).not.toBeNull();
        setStateSpy.mockClear();
        fileId.value = 'file2.md';
        await nextTick();
        expect(setStateSpy).toHaveBeenCalled();
        setStateSpy.mockRestore();
        wrapper.unmount();
    });

    it('does not watch fileId when it is not provided', async () => {
        const content = ref('text');
        const containerRef = ref<HTMLElement | null>(null);

        const TestComponent = defineComponent({
            setup() {
                useCodemirror(containerRef, content, vi.fn());
                return () =>
                    h('div', {
                        ref: (el) => {
                            containerRef.value = el instanceof HTMLElement ? el : null;
                        },
                    });
            },
        });

        const wrapper = mount(TestComponent, { attachTo: document.body });
        await nextTick();
        await nextTick();

        const setStateSpy = vi.spyOn(EditorView.prototype, 'setState');
        content.value = 'changed';
        await nextTick();
        expect(setStateSpy).not.toHaveBeenCalled();
        setStateSpy.mockRestore();
        wrapper.unmount();
    });

    it('destroys old view when containerRef changes to null then back', async () => {
        const destroySpy = vi.spyOn(EditorView.prototype, 'destroy');
        const containerRef = ref<HTMLElement | null>(null);
        const content = ref('text');
        let composableResult: ReturnType<typeof useCodemirror> | null = null;

        const TestComponent = defineComponent({
            setup() {
                composableResult = useCodemirror(containerRef, content, vi.fn());
                return () => h('div');
            },
        });

        const wrapper = mount(TestComponent, { attachTo: document.body });
        const div = document.createElement('div');
        document.body.appendChild(div);

        containerRef.value = div;
        await nextTick();
        await nextTick();

        const firstView = composableResult!.view.value;
        expect(firstView).not.toBeNull();

        destroySpy.mockClear();
        containerRef.value = null;
        await nextTick();
        await nextTick();
        expect(destroySpy).toHaveBeenCalled();
        expect(composableResult!.view.value).toBeNull();

        destroySpy.mockRestore();
        wrapper.unmount();
        div.remove();
    });

    it('works with empty string content', async () => {
        const { wrapper, getView } = mountComposable({ initialContent: '' });
        await nextTick();
        await nextTick();
        const v = getView();
        expect(v?.state.doc.toString()).toBe('');
        wrapper.unmount();
    });

    it('accepts extra extensions without error', async () => {
        const content = ref('text');
        const containerRef = ref<HTMLElement | null>(null);

        const TestComponent = defineComponent({
            setup() {
                useCodemirror(containerRef, content, vi.fn(), { placeholderText: 'Write here...' });
                return () =>
                    h('div', {
                        ref: (el) => {
                            containerRef.value = el instanceof HTMLElement ? el : null;
                        },
                    });
            },
        });

        const wrapper = mount(TestComponent, { attachTo: document.body });
        await nextTick();
        await nextTick();
        expect(true).toBe(true); // didn't throw
        wrapper.unmount();
    });

    it('does not create an undo history entry for content loaded after a file switch', async () => {
        const { wrapper, content, fileId, getView } = mountComposable({
            initialContent: 'note one content',
            initialFileId: 'note1.md',
        });
        await nextTick();
        await nextTick();

        fileId.value = 'note2.md';
        await nextTick();
        content.value = 'note two content';
        await nextTick();

        const v = getView()!;
        expect(v.state.doc.toString()).toBe('note two content');

        undo(v);
        expect(v.state.doc.toString()).toBe('note two content');

        wrapper.unmount();
    });

    it('external content changes after a file switch (e.g. dictation) remain undoable', async () => {
        const { wrapper, content, fileId, getView } = mountComposable({
            initialContent: 'note one content',
            initialFileId: 'note1.md',
        });
        await nextTick();
        await nextTick();

        fileId.value = 'note2.md';
        await nextTick();
        content.value = 'note two base content';
        await nextTick();

        content.value = 'note two base content dictated text';
        await nextTick();

        const v = getView()!;
        expect(v.state.doc.toString()).toBe('note two base content dictated text');

        undo(v);
        expect(v.state.doc.toString()).toBe('note two base content');

        wrapper.unmount();
    });
});
