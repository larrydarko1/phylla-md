/**
 * MIME type maps — pure data, no dependencies.
 * Used by fs-service (file:readImage, file:readAudio); phylla:// lets net.fetch set its own Content-Type.
 */

export const IMAGE_MIMETYPES: Record<string, string> = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.bmp': 'image/bmp',
    '.ico': 'image/x-icon',
};

export const AUDIO_MIMETYPES: Record<string, string> = {
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.flac': 'audio/flac',
    '.aac': 'audio/aac',
    '.m4a': 'audio/mp4',
    '.ogg': 'audio/ogg',
    '.wma': 'audio/x-ms-wma',
    '.aiff': 'audio/aiff',
};
