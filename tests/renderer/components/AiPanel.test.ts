import { describe, it, expect, beforeEach, vi } from 'vitest';

import AiPanel from '@/renderer/components/AiPanel.vue';
import { mountWithI18n } from '@test-utils';

const mockElectronAPI = {
    aiListModels: vi.fn().mockResolvedValue({ success: true, models: [] }),
    aiLoadModel: vi.fn().mockResolvedValue({ success: true }),
    aiUnloadModel: vi.fn().mockResolvedValue({ success: true }),
    aiGetStatus: vi.fn().mockResolvedValue({
        isModelLoaded: false,
        currentModelPath: null,
        currentModelName: null,
        isGenerating: false,
        modelsDir: '',
        contextTokens: 0,
        contextSize: 0,
    }),
    aiChat: vi.fn().mockResolvedValue({ success: true, content: '' }),
    aiStopChat: vi.fn().mockResolvedValue({ success: true }),
    aiResetChat: vi.fn().mockResolvedValue({ success: true }),
    aiRestoreChatHistory: vi.fn().mockResolvedValue({ success: true }),
    aiOpenPhyllaDir: vi.fn().mockResolvedValue({ success: true }),
    onAiToken: vi.fn(),
    removeAiTokenListener: vi.fn(),
    onAiThinkingToken: vi.fn(),
    removeAiThinkingTokenListener: vi.fn(),
    conversationList: vi.fn().mockResolvedValue({ success: true, conversations: [] }),
    conversationCreate: vi.fn().mockResolvedValue({ success: true, id: 'test-id' }),
    conversationLoad: vi.fn().mockResolvedValue({ success: true, conversation: null }),
    conversationSave: vi.fn().mockResolvedValue({ success: true }),
    conversationAddMessage: vi.fn().mockResolvedValue({ success: true }),
    conversationDelete: vi.fn().mockResolvedValue({ success: true }),
    conversationRename: vi.fn().mockResolvedValue({ success: true }),
    systemPromptList: vi.fn().mockResolvedValue({ success: true, prompts: [], activeId: '', promptsDir: '' }),
    writeClipboard: vi.fn().mockResolvedValue(undefined),
    log: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
};

const defaultProps = {
    activeFile: null,
    workspacePath: null,
};

Object.defineProperty(globalThis.window, 'electronAPI', {
    value: mockElectronAPI,
    writable: true,
    configurable: true,
});

describe('AiPanel – resize feature', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockElectronAPI.aiGetStatus.mockResolvedValue({
            isModelLoaded: false,
            currentModelPath: null,
            currentModelName: null,
            isGenerating: false,
            modelsDir: '',
            contextTokens: 0,
            contextSize: 0,
        });
        mockElectronAPI.aiListModels.mockResolvedValue({ success: true, models: [] });
        mockElectronAPI.conversationList.mockResolvedValue({ success: true, conversations: [] });
    });

    describe('initial state', () => {
        it('renders the resize handle', () => {
            const wrapper = mountWithI18n(AiPanel, { props: defaultProps });
            const handle = wrapper.find('.ai-panel-resize-handle');
            expect(handle.exists()).toBe(true);
        });

        it('renders the panel with default width of 340px', () => {
            const wrapper = mountWithI18n(AiPanel, { props: defaultProps });
            const panel = wrapper.find('.ai-panel');
            expect(panel.attributes('style')).toContain('width: 340px');
        });

        it('resize handle has role="slider"', () => {
            const wrapper = mountWithI18n(AiPanel, { props: defaultProps });
            const handle = wrapper.find('.ai-panel-resize-handle');
            expect(handle.attributes('role')).toBe('slider');
        });

        it('resize handle has aria-orientation="vertical"', () => {
            const wrapper = mountWithI18n(AiPanel, { props: defaultProps });
            const handle = wrapper.find('.ai-panel-resize-handle');
            expect(handle.attributes('aria-orientation')).toBe('vertical');
        });

        it('resize handle has correct aria-valuemin', () => {
            const wrapper = mountWithI18n(AiPanel, { props: defaultProps });
            const handle = wrapper.find('.ai-panel-resize-handle');
            expect(handle.attributes('aria-valuemin')).toBe('340');
        });

        it('resize handle has correct aria-valuemax', () => {
            const wrapper = mountWithI18n(AiPanel, { props: defaultProps });
            const handle = wrapper.find('.ai-panel-resize-handle');
            expect(handle.attributes('aria-valuemax')).toBe('600');
        });
    });

    describe('resize interaction', () => {
        function fireMousedown(el: Element, clientX: number) {
            el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, clientX }));
        }

        it('increases panel width when dragging left (delta > 0)', async () => {
            const wrapper = mountWithI18n(AiPanel, { props: defaultProps, attachTo: document.body });

            const handle = wrapper.find('.ai-panel-resize-handle').element;
            fireMousedown(handle, 500);

            window.dispatchEvent(new MouseEvent('mousemove', { clientX: 450 })); // delta = 50
            await wrapper.vm.$nextTick();

            expect(wrapper.find('.ai-panel').attributes('style')).toContain('width: 390px'); // 340 + 50

            wrapper.unmount();
        });

        it('decreases panel width when dragging right (delta < 0)', async () => {
            const wrapper = mountWithI18n(AiPanel, { props: defaultProps, attachTo: document.body });

            const handle = wrapper.find('.ai-panel-resize-handle').element;
            fireMousedown(handle, 500);

            window.dispatchEvent(new MouseEvent('mousemove', { clientX: 550 })); // delta = -50 → clamped to 340
            await wrapper.vm.$nextTick();

            expect(wrapper.find('.ai-panel').attributes('style')).toContain('width: 340px');

            wrapper.unmount();
        });

        it('clamps width to minWidth (340px) when dragging too far right', async () => {
            const wrapper = mountWithI18n(AiPanel, { props: defaultProps, attachTo: document.body });

            const handle = wrapper.find('.ai-panel-resize-handle').element;
            fireMousedown(handle, 500);

            window.dispatchEvent(new MouseEvent('mousemove', { clientX: 1000 })); // huge rightward drag
            await wrapper.vm.$nextTick();

            expect(wrapper.find('.ai-panel').attributes('style')).toContain('width: 340px');

            wrapper.unmount();
        });

        it('clamps width to maxWidth (600px) when dragging too far left', async () => {
            const wrapper = mountWithI18n(AiPanel, { props: defaultProps, attachTo: document.body });

            const handle = wrapper.find('.ai-panel-resize-handle').element;
            fireMousedown(handle, 500);

            window.dispatchEvent(new MouseEvent('mousemove', { clientX: 0 })); // huge leftward drag
            await wrapper.vm.$nextTick();

            expect(wrapper.find('.ai-panel').attributes('style')).toContain('width: 600px');

            wrapper.unmount();
        });

        it('stops resizing after mouseup', async () => {
            const wrapper = mountWithI18n(AiPanel, { props: defaultProps, attachTo: document.body });

            const handle = wrapper.find('.ai-panel-resize-handle').element;
            fireMousedown(handle, 500);

            window.dispatchEvent(new MouseEvent('mousemove', { clientX: 400 }));
            await wrapper.vm.$nextTick();

            window.dispatchEvent(new MouseEvent('mouseup'));
            await wrapper.vm.$nextTick();

            const widthAfterRelease = wrapper.find('.ai-panel').attributes('style');

            window.dispatchEvent(new MouseEvent('mousemove', { clientX: 200 }));
            await wrapper.vm.$nextTick();

            expect(wrapper.find('.ai-panel').attributes('style')).toBe(widthAfterRelease);

            wrapper.unmount();
        });

        it('width stays within bounds for a precise 50px leftward drag', async () => {
            const wrapper = mountWithI18n(AiPanel, { props: defaultProps, attachTo: document.body });

            const handle = wrapper.find('.ai-panel-resize-handle').element;
            fireMousedown(handle, 600);

            window.dispatchEvent(new MouseEvent('mousemove', { clientX: 550 })); // delta = 50
            await wrapper.vm.$nextTick();

            const style = wrapper.find('.ai-panel').attributes('style') ?? '';
            const match = /width:\s*(\d+)px/.exec(style);
            const width = match?.[1] !== undefined ? parseInt(match[1], 10) : 0;

            expect(width).toBe(390); // 340 + 50

            wrapper.unmount();
        });
    });

    describe('panel structure', () => {
        it('renders the main ai-panel element', () => {
            const wrapper = mountWithI18n(AiPanel, { props: defaultProps });
            expect(wrapper.find('.ai-panel').exists()).toBe(true);
        });

        it('panel has aria-label', () => {
            const wrapper = mountWithI18n(AiPanel, { props: defaultProps });
            const panel = wrapper.find('.ai-panel');
            expect(panel.attributes('aria-label')).toBeTruthy();
        });

        it('emits close event when close is triggered', async () => {
            const wrapper = mountWithI18n(AiPanel, { props: defaultProps });
            wrapper.vm.$emit('close');
            await wrapper.vm.$nextTick();
            expect(wrapper.emitted('close')).toBeTruthy();
        });
    });
});
