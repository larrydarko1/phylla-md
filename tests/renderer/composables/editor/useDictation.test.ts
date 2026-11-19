import { assert, describe, it, expect, vi, beforeEach } from 'vitest';
import { ref } from 'vue';

import { useDictation } from '@/renderer/composables/editor/useDictation';
import type { ElectronAPI } from '@/schemas/electron';

class FakeAudioWorkletNode {
    port: { onmessage: ((e: MessageEvent) => void) | null } = { onmessage: null };
    connected = false;
    disconnected = false;
    connect(_dest: unknown) {
        this.connected = true;
    }
    disconnect() {
        this.disconnected = true;
    }
}

class FakeMediaStreamSource {
    connect(_dest: unknown) {}
}

class FakeAudioContext {
    audioWorklet = fakeAudioWorklet;
    sampleRate = 44100;
    destination = {};
    closed = false;
    createMediaStreamSource(_stream: unknown): FakeMediaStreamSource {
        return new FakeMediaStreamSource();
    }
    close() {
        this.closed = true;
        return Promise.resolve();
    }
}

class MockAudioContext extends FakeAudioContext {}

class MockAudioWorkletNode extends FakeAudioWorkletNode {
    constructor(_ctx: unknown, _name: string) {
        super();
        // eslint-disable-next-line @typescript-eslint/no-this-alias -- the stub records the node the code under test constructs
        lastWorkletNode = this;
    }
}

const fakeAudioWorklet = { addModule: vi.fn().mockResolvedValue(undefined) };
let lastWorkletNode: FakeAudioWorkletNode | undefined;
const fakeTrack = { stop: vi.fn() };
const fakeStream = { getTracks: vi.fn().mockReturnValue([fakeTrack]) };
const mockGetUserMedia = vi
    .fn<(constraints: MediaStreamConstraints) => Promise<unknown>>()
    .mockResolvedValue(fakeStream);
let storedIntervalFn: (() => void) | null = null;
const mockSpeechGetStatus = vi.fn().mockResolvedValue({ isModelLoaded: true });
const mockSpeechInit = vi.fn().mockResolvedValue({ success: true });
const mockSpeechTranscribe = vi
    .fn<ElectronAPI['speechTranscribe']>()
    .mockResolvedValue({ success: true, text: 'hello world' });
const mockSpeechResetSession = vi.fn().mockResolvedValue({ success: true });
const mockLog = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };

function makeDictation() {
    const content = ref('');
    const onContentChange = vi.fn();
    const d = useDictation(content, onContentChange);
    return { content, onContentChange, ...d };
}

function sendChunk(data: Float32Array) {
    if (lastWorkletNode?.port.onmessage) lastWorkletNode.port.onmessage(new MessageEvent('message', { data }));
}

vi.stubGlobal('AudioContext', MockAudioContext);
vi.stubGlobal('AudioWorkletNode', MockAudioWorkletNode);

vi.stubGlobal(
    'Blob',
    // eslint-disable-next-line @typescript-eslint/no-extraneous-class -- Blob only has to be constructible; nothing here reads the encoded audio
    class FakeBlob {
        // eslint-disable-next-line @typescript-eslint/no-useless-constructor -- spells out the (parts, options) call the encoder makes
        constructor(_parts: unknown[], _opts?: unknown) {}
    },
);

vi.stubGlobal('URL', {
    createObjectURL: vi.fn().mockReturnValue('blob:fake-url'),
    revokeObjectURL: vi.fn(),
});

Object.defineProperty(globalThis, 'navigator', {
    value: { mediaDevices: { getUserMedia: mockGetUserMedia } },
    writable: true,
    configurable: true,
});

vi.stubGlobal(
    'setInterval',
    vi.fn((fn: () => void, _ms: number) => {
        storedIntervalFn = fn;
        return 999;
    }),
);

vi.stubGlobal('clearInterval', vi.fn());

Object.defineProperty(window, 'electronAPI', {
    value: {
        speechGetStatus: mockSpeechGetStatus,
        speechInit: mockSpeechInit,
        speechTranscribe: mockSpeechTranscribe,
        speechResetSession: mockSpeechResetSession,
        log: mockLog,
    },
    writable: true,
    configurable: true,
});

beforeEach(() => {
    vi.clearAllMocks();
    storedIntervalFn = null;
    mockSpeechGetStatus.mockResolvedValue({ isModelLoaded: true });
    mockSpeechInit.mockResolvedValue({ success: true });
    mockSpeechTranscribe.mockResolvedValue({ success: true, text: 'hello world' });
    mockGetUserMedia.mockResolvedValue(fakeStream);
    fakeAudioWorklet.addModule.mockResolvedValue(undefined);
    fakeTrack.stop.mockReset();
    vi.mocked(URL.createObjectURL).mockReturnValue('blob:fake-url');
});

describe('initial state', () => {
    it('starts not dictating', () => {
        const { isDictating } = makeDictation();
        expect(isDictating.value).toBe(false);
    });

    it('starts with loading false', () => {
        const { isDictationLoading } = makeDictation();
        expect(isDictationLoading.value).toBe(false);
    });
});

describe('toggleDictation (start)', () => {
    it('sets isDictating to true after start', async () => {
        const { isDictating, toggleDictation } = makeDictation();
        await toggleDictation();
        expect(isDictating.value).toBe(true);
    });

    it('requests microphone access', async () => {
        const { toggleDictation } = makeDictation();
        await toggleDictation();
        expect(mockGetUserMedia.mock.calls[0]?.[0]).toHaveProperty('audio');
    });

    it('checks speech status if whisper model not yet ready', async () => {
        const { toggleDictation } = makeDictation();
        await toggleDictation();
        expect(mockSpeechGetStatus).toHaveBeenCalled();
    });

    it('does not re-init whisper when already ready (second call)', async () => {
        const { toggleDictation, stopDictation } = makeDictation();
        await toggleDictation();
        stopDictation();
        mockSpeechGetStatus.mockClear();
        await toggleDictation();
        expect(mockSpeechGetStatus).not.toHaveBeenCalled();
        stopDictation();
    });

    it('loads the audio worklet module', async () => {
        const { toggleDictation } = makeDictation();
        await toggleDictation();
        expect(fakeAudioWorklet.addModule).toHaveBeenCalledWith('blob:fake-url');
    });

    it('calls speechInit when model is not loaded', async () => {
        mockSpeechGetStatus.mockResolvedValueOnce({ isModelLoaded: false });
        const { toggleDictation } = makeDictation();
        await toggleDictation();
        expect(mockSpeechInit).toHaveBeenCalled();
    });

    it('stays not dictating when speechInit fails', async () => {
        mockSpeechGetStatus.mockResolvedValueOnce({ isModelLoaded: false });
        mockSpeechInit.mockResolvedValueOnce({ success: false, error: 'UNKNOWN' });
        const { isDictating, toggleDictation } = makeDictation();
        await toggleDictation();
        expect(isDictating.value).toBe(false);
    });

    it('stays not dictating when getUserMedia throws', async () => {
        mockGetUserMedia.mockRejectedValueOnce(new Error('denied'));
        const { isDictating, toggleDictation } = makeDictation();
        await toggleDictation();
        expect(isDictating.value).toBe(false);
    });

    it('stays not dictating when audioWorklet.addModule throws', async () => {
        fakeAudioWorklet.addModule.mockRejectedValueOnce(new Error('worklet failed'));
        const { isDictating, toggleDictation } = makeDictation();
        await toggleDictation();
        expect(isDictating.value).toBe(false);
        expect(URL.revokeObjectURL).toHaveBeenCalled();
    });

    it('handles speechGetStatus throwing an error', async () => {
        mockSpeechGetStatus.mockRejectedValueOnce(new Error('network err'));
        const { isDictating, toggleDictation } = makeDictation();
        await toggleDictation();
        expect(isDictating.value).toBe(false);
        expect(mockLog.error).toHaveBeenCalled();
    });

    it('sets up a periodic interval for chunk processing', async () => {
        const { toggleDictation } = makeDictation();
        await toggleDictation();
        expect(window.setInterval).toHaveBeenCalledWith(expect.any(Function), 5000);
    });
});

describe('toggleDictation (stop)', () => {
    it('stops dictation when called while already dictating', async () => {
        const { isDictating, toggleDictation } = makeDictation();
        await toggleDictation();
        expect(isDictating.value).toBe(true);
        await toggleDictation();
        expect(isDictating.value).toBe(false);
    });
});

describe('stopDictation', () => {
    it('sets isDictating to false', async () => {
        const { isDictating, toggleDictation, stopDictation } = makeDictation();
        await toggleDictation();
        stopDictation();
        expect(isDictating.value).toBe(false);
    });

    it('stops all media tracks', async () => {
        const { toggleDictation, stopDictation } = makeDictation();
        await toggleDictation();
        stopDictation();
        expect(fakeTrack.stop).toHaveBeenCalled();
    });

    it('revokes the worklet blob URL', async () => {
        const { toggleDictation, stopDictation } = makeDictation();
        await toggleDictation();
        stopDictation();
        expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:fake-url');
    });

    it('disconnects the worklet node', async () => {
        const { toggleDictation, stopDictation } = makeDictation();
        await toggleDictation();
        const node = lastWorkletNode;
        stopDictation();
        expect(node?.disconnected).toBe(true);
    });

    it('does nothing when not dictating', () => {
        const { stopDictation } = makeDictation();
        expect(() => stopDictation()).not.toThrow();
    });

    it('transcribes buffered audio samples on stop', async () => {
        const { toggleDictation, stopDictation } = makeDictation();
        await toggleDictation();
        sendChunk(new Float32Array([0.1, 0.2, 0.3]));
        stopDictation();
        await new Promise((r) => setTimeout(r, 50));
        expect(mockSpeechTranscribe).toHaveBeenCalled();
    });

    it('appends transcribed text to content', async () => {
        const content = ref('existing');
        const onContentChange = vi.fn();
        mockSpeechTranscribe.mockResolvedValue({ success: true, text: 'more text' });
        const d = useDictation(content, onContentChange);
        await d.toggleDictation();
        sendChunk(new Float32Array([0.1]));
        d.stopDictation();
        await new Promise((r) => setTimeout(r, 50));
        expect(content.value).toContain('more text');
        expect(onContentChange).toHaveBeenCalled();
    });

    it('adds a space before text when content does not end with whitespace', async () => {
        const content = ref('word');
        const onContentChange = vi.fn();
        mockSpeechTranscribe.mockResolvedValue({ success: true, text: 'appended' });
        const d = useDictation(content, onContentChange);
        await d.toggleDictation();
        sendChunk(new Float32Array([0.1]));
        d.stopDictation();
        await new Promise((r) => setTimeout(r, 50));
        expect(content.value.length).toBeGreaterThan(4);
        expect(content.value).toMatch(/^word /);
    });

    it('does not add space when content already ends with whitespace', async () => {
        const content = ref('word ');
        const onContentChange = vi.fn();
        mockSpeechTranscribe.mockResolvedValue({ success: true, text: 'next' });
        const d = useDictation(content, onContentChange);
        await d.toggleDictation();
        sendChunk(new Float32Array([0.1]));
        d.stopDictation();
        await new Promise((r) => setTimeout(r, 50));
        expect(content.value.length).toBeGreaterThan(5);
        expect(content.value).not.toMatch(/^word {2}/);
    });

    it('handles transcription error silently on stop', async () => {
        mockSpeechTranscribe.mockRejectedValueOnce(new Error('transcription failed'));
        const { toggleDictation, stopDictation } = makeDictation();
        await toggleDictation();
        sendChunk(new Float32Array([0.1]));
        stopDictation();
        await new Promise((r) => setTimeout(r, 50));
        expect(true).toBe(true); // did not throw
    });

    it('does not call speechTranscribe when no samples were buffered', async () => {
        const { toggleDictation, stopDictation } = makeDictation();
        await toggleDictation();
        stopDictation();
        await new Promise((r) => setTimeout(r, 50));
        expect(mockSpeechTranscribe).not.toHaveBeenCalled();
    });

    it('skips empty transcription result', async () => {
        const content = ref('');
        const onContentChange = vi.fn();
        mockSpeechTranscribe.mockResolvedValue({ success: true, text: '   ' }); // whitespace only
        const d = useDictation(content, onContentChange);
        await d.toggleDictation();
        sendChunk(new Float32Array([0.1]));
        d.stopDictation();
        await new Promise((r) => setTimeout(r, 50));
        expect(content.value).toBe('');
        expect(onContentChange).not.toHaveBeenCalled();
    });

    it('skips a reply that carries no transcription text', async () => {
        const content = ref('');
        const onContentChange = vi.fn();
        mockSpeechTranscribe.mockResolvedValue({ success: true });
        const d = useDictation(content, onContentChange);
        await d.toggleDictation();
        sendChunk(new Float32Array([0.1]));
        d.stopDictation();
        await new Promise((r) => setTimeout(r, 50));
        expect(onContentChange).not.toHaveBeenCalled();
    });

    it('skips failed transcription result', async () => {
        const content = ref('');
        const onContentChange = vi.fn();
        mockSpeechTranscribe.mockResolvedValue({ success: false });
        const d = useDictation(content, onContentChange);
        await d.toggleDictation();
        sendChunk(new Float32Array([0.1]));
        d.stopDictation();
        await new Promise((r) => setTimeout(r, 50));
        expect(onContentChange).not.toHaveBeenCalled();
    });
});

describe('interval-based chunk processing', () => {
    it('fires processDictationChunk when interval triggers', async () => {
        const { toggleDictation, stopDictation } = makeDictation();
        await toggleDictation();
        sendChunk(new Float32Array([0.1, 0.2]));
        assert.exists(storedIntervalFn);
        storedIntervalFn();
        await new Promise((r) => setTimeout(r, 20));
        stopDictation();
        expect(mockSpeechTranscribe).toHaveBeenCalled();
    });

    it('does nothing in processDictationChunk when no samples', async () => {
        const { toggleDictation, stopDictation } = makeDictation();
        await toggleDictation();
        assert.exists(storedIntervalFn);
        storedIntervalFn();
        await new Promise((r) => setTimeout(r, 10));
        stopDictation();
        expect(mockSpeechTranscribe).not.toHaveBeenCalled();
    });

    it('handles transcription error in chunk processing', async () => {
        mockSpeechTranscribe.mockRejectedValueOnce(new Error('api error'));
        const { toggleDictation, stopDictation } = makeDictation();
        await toggleDictation();
        sendChunk(new Float32Array([0.1]));
        assert.exists(storedIntervalFn);
        storedIntervalFn();
        await new Promise((r) => setTimeout(r, 20));
        stopDictation();
        expect(mockLog.error).toHaveBeenCalled();
    });
});

describe('resampling', () => {
    it('passes audio array to speechTranscribe', async () => {
        const { toggleDictation, stopDictation } = makeDictation();
        await toggleDictation();
        const chunk = new Float32Array(4410).fill(0.5);
        sendChunk(chunk);
        stopDictation();
        await new Promise((r) => setTimeout(r, 50));
        const call = mockSpeechTranscribe.mock.calls[0]![0];
        expect(Array.isArray(call)).toBe(true);
        expect(call.length).toBeGreaterThan(0);
    });

    it('downsamples from 44100 to fewer samples', async () => {
        const { toggleDictation, stopDictation } = makeDictation();
        await toggleDictation();
        const chunk = new Float32Array(44100).fill(0.1);
        sendChunk(chunk);
        stopDictation();
        await new Promise((r) => setTimeout(r, 50));
        const call = mockSpeechTranscribe.mock.calls[0]![0];
        expect(call.length).toBeLessThan(44100);
        expect(call.length).toBeCloseTo(16000, -2);
    });
});
