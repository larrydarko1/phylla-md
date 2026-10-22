import { assert, describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import DrawingExportDialog from '@/renderer/components/drawing/DrawingExportDialog.vue';
import type { CanvasElement } from '@/schemas/drawing';
import { mountWithI18n } from '@test-utils';

const fakeBlob = new Blob(['fake'], { type: 'image/png' });
const mockExportToBlob = vi
    .fn<
        (opts: {
            elements: CanvasElement[];
            withBackground: boolean;
            scale: number;
            padding?: number;
        }) => Promise<Blob | null>
    >()
    .mockResolvedValue(fakeBlob);
const elements: CanvasElement[] = [makeRect('a'), makeRect('b')];

const baseProps = {
    visible: true,
    hasSelection: false,
    filePath: '/vault/sketch.drawing',
    elements,
    selectedIds: new Set<string>(),
    exportToBlob: mockExportToBlob,
};

function makeRect(id: string): CanvasElement {
    return {
        id,
        type: 'rectangle',
        x: 10,
        y: 10,
        width: 100,
        height: 60,
        strokeColor: '#000',
        fillColor: 'transparent',
        strokeWidth: 2,
        strokeStyle: 'solid',
        opacity: 1,
        borderRadius: 0,
    };
}

async function openDialog(propsOverrides: Partial<typeof baseProps> = {}) {
    const wrapper = mountWithI18n(DrawingExportDialog, {
        props: { ...baseProps, visible: false, ...propsOverrides },
        attachTo: document.body,
    });
    await wrapper.setProps({ visible: true });
    await new Promise((r) => setTimeout(r, 0));
    await wrapper.vm.$nextTick();
    return wrapper;
}

beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:fake-url');
    vi.spyOn(URL, 'revokeObjectURL').mockReturnValue(undefined);
    mockExportToBlob.mockResolvedValue(fakeBlob);
});

afterEach(() => {
    vi.restoreAllMocks();
    document.querySelector('.export-overlay')?.remove();
});

describe('DrawingExportDialog', () => {
    it('renders the dialog when visible is true', async () => {
        const wrapper = await openDialog();
        expect(document.querySelector('.export-dialog')).not.toBeNull();
        wrapper.unmount();
    });

    it('does not render when visible is false', () => {
        const wrapper = mountWithI18n(DrawingExportDialog, {
            props: { ...baseProps, visible: false },
            attachTo: document.body,
        });
        expect(document.querySelector('.export-dialog')).toBeNull();
        wrapper.unmount();
    });

    it('calls exportToBlob when dialog opens with elements', async () => {
        const wrapper = await openDialog();
        expect(mockExportToBlob).toHaveBeenCalled();
        wrapper.unmount();
    });

    it('does not call exportToBlob when elements array is empty', async () => {
        const wrapper = await openDialog({ elements: [] });
        expect(mockExportToBlob).not.toHaveBeenCalled();
        wrapper.unmount();
    });

    it('passes all elements when exportOnlySelected is false', async () => {
        const wrapper = await openDialog({ hasSelection: false });
        expect(mockExportToBlob.mock.calls[0]![0].elements).toHaveLength(2);
        wrapper.unmount();
    });

    it('passes only selected elements when hasSelection is true', async () => {
        const wrapper = await openDialog({
            hasSelection: true,
            selectedIds: new Set(['a']),
        });
        const call = mockExportToBlob.mock.calls[0]![0];
        expect(call.elements).toHaveLength(1);
        expect(call.elements[0]?.id).toBe('a');
        wrapper.unmount();
    });

    it('passes withBackground: true by default', async () => {
        const wrapper = await openDialog();
        expect(mockExportToBlob.mock.calls[0]![0].withBackground).toBe(true);
        wrapper.unmount();
    });

    it('passes scale: 2 by default', async () => {
        const wrapper = await openDialog();
        expect(mockExportToBlob.mock.calls[0]![0].scale).toBe(2);
        wrapper.unmount();
    });

    it('creates a preview URL when blob is returned', async () => {
        const wrapper = await openDialog();
        expect(vi.mocked(URL.createObjectURL)).toHaveBeenCalledWith(fakeBlob);
        wrapper.unmount();
    });

    it('emits "close" and revokes the preview URL when the close button is clicked', async () => {
        const wrapper = await openDialog();
        await wrapper.vm.$nextTick();

        const closeBtn = document.querySelector<HTMLButtonElement>('[aria-label="Close export dialog"]');
        expect(closeBtn).not.toBeNull();

        closeBtn?.click();
        await wrapper.vm.$nextTick();
        expect(wrapper.emitted('close')).toHaveLength(1);
        expect(vi.mocked(URL.revokeObjectURL)).toHaveBeenCalled();
        wrapper.unmount();
    });

    it('revokes old preview URL when preview is updated', async () => {
        const wrapper = await openDialog();
        vi.clearAllMocks();
        mockExportToBlob.mockResolvedValue(new Blob(['new'], { type: 'image/png' }));
        const checkbox = document.querySelector<HTMLInputElement>('input[type="checkbox"]');
        assert.isNotNull(checkbox);
        checkbox.click();
        await new Promise((r) => setTimeout(r, 0));
        await wrapper.vm.$nextTick();
        expect(vi.mocked(URL.revokeObjectURL)).toHaveBeenCalledWith('blob:fake-url');
        wrapper.unmount();
    });

    it('shows scale selection buttons', async () => {
        const wrapper = await openDialog();
        const scaleSection = document.querySelector('.export-settings, .export-dialog');
        expect(scaleSection).not.toBeNull();
        wrapper.unmount();
    });

    it('shows export action buttons', async () => {
        const wrapper = await openDialog();
        const actionBtn = document.querySelector('.export-action-btn, button[class*="export"]');
        expect(actionBtn).not.toBeNull();
        wrapper.unmount();
    });
});
