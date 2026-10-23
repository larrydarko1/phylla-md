import { describe, it, expect, vi, beforeEach } from 'vitest';

import ThemePicker from '@/renderer/components/ThemePicker.vue';
import { mountWithI18n } from '@test-utils';

const mockElectronAPI = {
    themeList: vi.fn(),
    themeSetActive: vi.fn(),
    themeOpenPhyllaDir: vi.fn(),
    log: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
};

const sampleThemes = [
    {
        id: 'dark',
        name: 'Dark',
        description: 'Dark theme',
        path: '/fake/themes/dark.json',
        colors: {
            'bg-primary': '#1a1a1a',
            'bg-secondary': '#2a2a2a',
            'text-primary': '#ffffff',
            'border-color': '#333',
        },
    },
    {
        id: 'light',
        name: 'Light',
        description: 'Light theme',
        path: '/fake/themes/light.json',
        colors: {
            'bg-primary': '#ffffff',
            'bg-secondary': '#f0f0f0',
            'text-primary': '#000000',
            'border-color': '#ccc',
        },
    },
];

Object.defineProperty(globalThis.window, 'electronAPI', {
    value: mockElectronAPI,
    writable: true,
    configurable: true,
});

beforeEach(() => {
    vi.clearAllMocks();
    mockElectronAPI.themeList.mockResolvedValue({
        success: true,
        themes: sampleThemes,
        activeId: 'dark',
    });
    mockElectronAPI.themeSetActive.mockResolvedValue({ success: true });
    mockElectronAPI.themeOpenPhyllaDir.mockResolvedValue({ success: true });
});

describe('ThemePicker', () => {
    it('calls themeList on mount and renders themes', async () => {
        const wrapper = mountWithI18n(ThemePicker, { props: {} });
        await new Promise((r) => setTimeout(r, 0));
        await wrapper.vm.$nextTick();
        expect(mockElectronAPI.themeList).toHaveBeenCalled();
        expect(wrapper.html()).toContain('Dark');
        wrapper.unmount();
    });

    it('emits "close" when the close button is clicked', async () => {
        const wrapper = mountWithI18n(ThemePicker, { props: {} });
        await new Promise((r) => setTimeout(r, 0));
        await wrapper.vm.$nextTick();

        const closeBtn = wrapper.find('[aria-label="Close theme panel"]');
        expect(closeBtn.exists()).toBe(true);

        await closeBtn.trigger('click');
        expect(wrapper.emitted('close')).toHaveLength(1);
        wrapper.unmount();
    });

    it('calls themeSetActive when a different theme is selected', async () => {
        const wrapper = mountWithI18n(ThemePicker, { props: {} });
        await new Promise((r) => setTimeout(r, 0));
        await wrapper.vm.$nextTick();
        const themeButtons = wrapper.findAll('button, [role="option"], .theme-item');
        for (const btn of themeButtons) {
            if (btn.text().includes('Light')) {
                await btn.trigger('click');
                await wrapper.vm.$nextTick();
                break;
            }
        }
        expect(mockElectronAPI.themeSetActive).toHaveBeenCalledWith('light');
        wrapper.unmount();
    });

    it('does not call themeSetActive when the active theme is re-selected', async () => {
        const wrapper = mountWithI18n(ThemePicker, { props: {} });
        await new Promise((r) => setTimeout(r, 0));
        await wrapper.vm.$nextTick();
        const themeButtons = wrapper.findAll('button, [role="option"], .theme-item');
        for (const btn of themeButtons) {
            if (btn.text().includes('Dark')) {
                await btn.trigger('click');
                await wrapper.vm.$nextTick();
                break;
            }
        }
        expect(mockElectronAPI.themeSetActive).not.toHaveBeenCalled();
        wrapper.unmount();
    });

    it('handles themeList failure gracefully', async () => {
        mockElectronAPI.themeList.mockResolvedValue({ success: false, themes: [], activeId: '' });
        const wrapper = mountWithI18n(ThemePicker, { props: {} });
        await new Promise((r) => setTimeout(r, 0));
        await wrapper.vm.$nextTick();
        expect(wrapper.exists()).toBe(true);
        wrapper.unmount();
    });
});
