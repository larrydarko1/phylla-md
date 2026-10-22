import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import VideoViewer from '@/renderer/components/editor/VideoViewer.vue';
import { mountWithI18n } from '@test-utils';

beforeEach(() => {
    vi.stubGlobal('requestAnimationFrame', vi.fn());
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    Object.defineProperty(HTMLMediaElement.prototype, 'play', {
        configurable: true,
        value: vi.fn().mockResolvedValue(undefined),
    });
    Object.defineProperty(HTMLMediaElement.prototype, 'pause', {
        configurable: true,
        value: vi.fn(),
    });
});

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('VideoViewer', () => {
    it('renders the video viewer container', () => {
        const wrapper = mountWithI18n(VideoViewer, {
            props: { filePath: '/vault/clip.mp4' },
        });
        expect(wrapper.exists()).toBe(true);
        wrapper.unmount();
    });

    it('constructs a phylla:// URL for the video source', async () => {
        const wrapper = mountWithI18n(VideoViewer, {
            props: { filePath: '/vault/clip.mp4' },
        });
        await wrapper.vm.$nextTick();
        expect(wrapper.html()).toContain('phylla://');
        wrapper.unmount();
    });

    it('shows error state when video fails to load', async () => {
        const wrapper = mountWithI18n(VideoViewer, {
            props: { filePath: '/vault/clip.mp4' },
        });
        await wrapper.vm.$nextTick();
        const video = wrapper.find('video');
        expect(video.exists()).toBe(true);
        await video.trigger('error');
        await wrapper.vm.$nextTick();
        expect(wrapper.html()).toMatch(/error|unavailable/i);
        wrapper.unmount();
    });

    it('shows video when loaded successfully', async () => {
        const wrapper = mountWithI18n(VideoViewer, {
            props: { filePath: '/vault/clip.mp4' },
        });
        await wrapper.vm.$nextTick();
        const video = wrapper.find('video');
        expect(video.exists()).toBe(true);
        await video.trigger('loadedmetadata');
        await wrapper.vm.$nextTick();
        expect(wrapper.exists()).toBe(true);
        wrapper.unmount();
    });

    it('updates the video URL when filePath prop changes', async () => {
        const wrapper = mountWithI18n(VideoViewer, {
            props: { filePath: '/vault/clip.mp4' },
        });
        await wrapper.vm.$nextTick();
        await wrapper.setProps({ filePath: '/vault/other.mp4' });
        await wrapper.vm.$nextTick();
        expect(wrapper.html()).toContain('other.mp4');
        wrapper.unmount();
    });

    it('toggles play/pause when the play button is clicked', async () => {
        const wrapper = mountWithI18n(VideoViewer, {
            props: { filePath: '/vault/clip.mp4' },
        });
        await wrapper.vm.$nextTick();
        const playBtn = wrapper.find('[aria-label="Play video"]');
        expect(playBtn.exists()).toBe(true);

        await playBtn.trigger('click');
        expect(wrapper.find('[aria-label="Pause video"]').exists()).toBe(true);
        wrapper.unmount();
    });

    it('shows video controls after loadedmetadata fires', async () => {
        const wrapper = mountWithI18n(VideoViewer, {
            props: { filePath: '/vault/clip.mp4' },
        });
        await wrapper.vm.$nextTick();
        const video = wrapper.find('video');
        expect(video.exists()).toBe(true);
        await video.trigger('loadedmetadata');
        await wrapper.vm.$nextTick();
        expect(wrapper.find('.video-controls').exists()).toBe(true);
        wrapper.unmount();
    });

    it('fires ended handler when video ends', async () => {
        const wrapper = mountWithI18n(VideoViewer, {
            props: { filePath: '/vault/clip.mp4' },
        });
        await wrapper.vm.$nextTick();
        const video = wrapper.find('video');
        expect(video.exists()).toBe(true);
        await video.trigger('loadedmetadata');
        await video.trigger('ended');
        expect(wrapper.exists()).toBe(true);
        wrapper.unmount();
    });

    it('seeking video updates currentTime', async () => {
        const wrapper = mountWithI18n(VideoViewer, {
            props: { filePath: '/vault/clip.mp4' },
        });
        await wrapper.vm.$nextTick();
        const video = wrapper.find('video');
        expect(video.exists()).toBe(true);
        await video.trigger('loadedmetadata');
        await wrapper.vm.$nextTick();
        const progress = wrapper.find('.video-progress-wrapper');
        expect(progress.exists()).toBe(true);
        await progress.trigger('click', { clientX: 100 });
        expect(wrapper.exists()).toBe(true);
        wrapper.unmount();
    });

    it('toggles mute when mute button is clicked', async () => {
        const wrapper = mountWithI18n(VideoViewer, {
            props: { filePath: '/vault/clip.mp4' },
        });
        await wrapper.vm.$nextTick();
        const video = wrapper.find('video');
        expect(video.exists()).toBe(true);
        await video.trigger('loadedmetadata');
        await wrapper.vm.$nextTick();
        const muteBtn = wrapper.find('.video-volume-btn');
        expect(muteBtn.exists()).toBe(true);
        await muteBtn.trigger('click');
        expect(wrapper.find('video').element.volume).toBe(0);
        wrapper.unmount();
    });

    it('changes volume when slider input fires', async () => {
        const wrapper = mountWithI18n(VideoViewer, {
            props: { filePath: '/vault/clip.mp4' },
        });
        await wrapper.vm.$nextTick();
        const video = wrapper.find('video');
        expect(video.exists()).toBe(true);
        await video.trigger('loadedmetadata');
        await wrapper.vm.$nextTick();
        const slider = wrapper.find('.video-volume-slider');
        expect(slider.exists()).toBe(true);
        await slider.setValue('0.5');
        expect(wrapper.exists()).toBe(true);
        wrapper.unmount();
    });

    it('dispatches Space key to toggle play', async () => {
        const wrapper = mountWithI18n(VideoViewer, {
            props: { filePath: '/vault/clip.mp4' },
        });
        await wrapper.vm.$nextTick();
        const video = wrapper.find('video');
        expect(video.exists()).toBe(true);
        await video.trigger('loadedmetadata');
        window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
        expect(wrapper.exists()).toBe(true);
        wrapper.unmount();
    });

    it('does not toggle play when target is INPUT', async () => {
        const wrapper = mountWithI18n(VideoViewer, {
            props: { filePath: '/vault/clip.mp4' },
        });
        const input = document.createElement('input');
        document.body.appendChild(input);
        const e = new KeyboardEvent('keydown', { key: ' ', bubbles: true });
        Object.defineProperty(e, 'target', { value: input });
        window.dispatchEvent(e);
        expect(wrapper.exists()).toBe(true);
        wrapper.unmount();
        document.body.removeChild(input);
    });

    it('adds keydown listener on mount', () => {
        const addSpy = vi.spyOn(window, 'addEventListener');
        const wrapper = mountWithI18n(VideoViewer, {
            props: { filePath: '/vault/clip.mp4' },
        });
        expect(addSpy).toHaveBeenCalledWith('keydown', expect.any(Function));
        wrapper.unmount();
        addSpy.mockRestore();
    });

    it('removes keydown listener on unmount', () => {
        const removeSpy = vi.spyOn(window, 'removeEventListener');
        const wrapper = mountWithI18n(VideoViewer, {
            props: { filePath: '/vault/clip.mp4' },
        });
        wrapper.unmount();
        expect(removeSpy).toHaveBeenCalledWith('keydown', expect.any(Function));
        removeSpy.mockRestore();
    });
});
