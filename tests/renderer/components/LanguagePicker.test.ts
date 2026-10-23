import { describe, it, expect, vi, beforeEach } from 'vitest';

import LanguagePicker from '@/renderer/components/LanguagePicker.vue';
import { mountWithI18n } from '@test-utils';

const mockElectronAPI = {
    languageList: vi.fn(),
    languageSetActive: vi.fn(),
    languageOpenPhyllaDir: vi.fn(),
    languageLoad: vi.fn(),
    log: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
};

const sampleLanguages = [
    { id: 'en', name: 'English', nativeName: 'English' },
    { id: 'fr', name: 'French', nativeName: 'Français' },
];

Object.defineProperty(globalThis.window, 'electronAPI', {
    value: mockElectronAPI,
    writable: true,
    configurable: true,
});

beforeEach(() => {
    vi.clearAllMocks();
    mockElectronAPI.languageList.mockResolvedValue({
        success: true,
        languages: sampleLanguages,
        activeId: 'en',
    });
    mockElectronAPI.languageSetActive.mockResolvedValue({ success: true });
    mockElectronAPI.languageLoad.mockResolvedValue({ success: true, messages: {} });
    mockElectronAPI.languageOpenPhyllaDir.mockResolvedValue({ success: true });
});

describe('LanguagePicker', () => {
    it('calls languageList on mount', async () => {
        const wrapper = mountWithI18n(LanguagePicker, { props: {} });
        await new Promise((r) => setTimeout(r, 0));
        await wrapper.vm.$nextTick();
        expect(mockElectronAPI.languageList).toHaveBeenCalled();
        wrapper.unmount();
    });

    it('renders language entries after loading', async () => {
        const wrapper = mountWithI18n(LanguagePicker, { props: {} });
        await new Promise((r) => setTimeout(r, 0));
        await wrapper.vm.$nextTick();
        expect(wrapper.html()).toContain('English');
        wrapper.unmount();
    });

    it('calls languageSetActive when a different language is selected', async () => {
        const wrapper = mountWithI18n(LanguagePicker, { props: {} });
        await new Promise((r) => setTimeout(r, 0));
        await wrapper.vm.$nextTick();
        const btns = wrapper.findAll('button, [role="option"], .language-item');
        for (const btn of btns) {
            if (btn.text().includes('French') || btn.text().includes('Français')) {
                await btn.trigger('click');
                await new Promise((r) => setTimeout(r, 0));
                await wrapper.vm.$nextTick();
                break;
            }
        }
        expect(mockElectronAPI.languageSetActive).toHaveBeenCalledWith('fr');
        wrapper.unmount();
    });

    it('does not call languageSetActive when the active language is re-selected', async () => {
        const wrapper = mountWithI18n(LanguagePicker, { props: {} });
        await new Promise((r) => setTimeout(r, 0));
        await wrapper.vm.$nextTick();
        const btns = wrapper.findAll('button, [role="option"], .language-item');
        for (const btn of btns) {
            if (btn.text().includes('English')) {
                await btn.trigger('click');
                await wrapper.vm.$nextTick();
                break;
            }
        }
        expect(mockElectronAPI.languageSetActive).not.toHaveBeenCalled();
        wrapper.unmount();
    });

    it('handles languageList failure gracefully', async () => {
        mockElectronAPI.languageList.mockResolvedValue({ success: false, languages: [], activeId: '' });
        const wrapper = mountWithI18n(LanguagePicker, { props: {} });
        await new Promise((r) => setTimeout(r, 0));
        await wrapper.vm.$nextTick();
        expect(wrapper.exists()).toBe(true);
        wrapper.unmount();
    });
});
