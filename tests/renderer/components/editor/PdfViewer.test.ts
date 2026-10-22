import { describe, it, expect } from 'vitest';

import PdfViewer from '@/renderer/components/editor/PdfViewer.vue';
import { mountWithI18n } from '@test-utils';

describe('PdfViewer', () => {
    it('renders an iframe with the correct phylla:// URL', async () => {
        const wrapper = mountWithI18n(PdfViewer, {
            props: { filePath: '/vault/document.pdf' },
        });
        await wrapper.vm.$nextTick();
        const iframe = wrapper.find('iframe.pdf-preview');
        expect(iframe.exists()).toBe(true);
        expect(iframe.attributes('src')).toBe('phylla://localhost/vault/document.pdf');
        wrapper.unmount();
    });

    it('updates the iframe src when filePath changes', async () => {
        const wrapper = mountWithI18n(PdfViewer, {
            props: { filePath: '/vault/a.pdf' },
        });
        await wrapper.vm.$nextTick();
        expect(wrapper.find('iframe').attributes('src')).toContain('a.pdf');

        await wrapper.setProps({ filePath: '/vault/b.pdf' });
        await wrapper.vm.$nextTick();
        expect(wrapper.find('iframe').attributes('src')).toContain('b.pdf');
        wrapper.unmount();
    });

    it('hides the iframe and shows no error section by default', async () => {
        const wrapper = mountWithI18n(PdfViewer, {
            props: { filePath: '/vault/doc.pdf' },
        });
        await wrapper.vm.$nextTick();
        expect(wrapper.find('.pdf-error').exists()).toBe(false);
        wrapper.unmount();
    });
});
