/**
 * Pure audio encoding utilities — no Vue, no Electron, no side effects.
 * Can be unit-tested with plain Node/jsdom.
 */

/**
 * Decode a WebM/Opus Blob and re-encode it as a 16-bit PCM WAV ArrayBuffer.
 */
export async function convertWebMToWav(webmBlob: Blob): Promise<ArrayBuffer> {
    const audioContext = new AudioContext();
    try {
        const arrayBuffer = await webmBlob.arrayBuffer();
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
        return audioBufferToWav(audioBuffer);
    } finally {
        await audioContext.close();
    }
}

/** Encode an ArrayBuffer as a base64 string. */
export function arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary);
}

/**
 * Encode an AudioBuffer as a WAV ArrayBuffer (16-bit PCM, mono or stereo).
 */
function audioBufferToWav(audioBuffer: AudioBuffer): ArrayBuffer {
    const numChannels = audioBuffer.numberOfChannels;
    const sampleRate = audioBuffer.sampleRate;
    const bitDepth = 16;
    const bytesPerSample = bitDepth / 8;
    const blockAlign = numChannels * bytesPerSample;
    const byteRate = sampleRate * blockAlign;

    // Interleave channels for stereo; pass through for mono
    let samples: Float32Array;
    if (numChannels === 2) {
        const left = audioBuffer.getChannelData(0);
        const right = audioBuffer.getChannelData(1);
        samples = new Float32Array(left.length * 2);
        for (const [i, sample] of left.entries()) {
            samples[i * 2] = sample;
            samples[i * 2 + 1] = right[i] ?? 0;
        }
    } else {
        samples = audioBuffer.getChannelData(0);
    }

    const dataSize = samples.length * bytesPerSample;
    const buffer = new ArrayBuffer(44 + dataSize);
    const view = new DataView(buffer);

    // RIFF header
    writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + dataSize, true);
    writeString(view, 8, 'WAVE');

    // fmt chunk
    writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true); // chunk size
    view.setUint16(20, 1, true); // PCM format
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitDepth, true);

    // data chunk
    writeString(view, 36, 'data');
    view.setUint32(40, dataSize, true);

    for (const [i, sample] of samples.entries()) {
        const clamped = Math.max(-1, Math.min(1, sample));
        const intSample = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
        view.setInt16(44 + i * 2, intSample, true);
    }

    return buffer;
}

function writeString(view: DataView, offset: number, str: string): void {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
}
