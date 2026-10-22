import { assert, describe, it, expect, vi, beforeEach } from 'vitest';

import type { ElectronAPI } from '@/schemas/electron';

type Listener = (event: unknown, ...args: unknown[]) => void;

const mockSend = vi.fn();
const mockInvoke = vi.fn().mockResolvedValue(undefined);
const mockOn = vi.fn<(channel: string, listener: Listener) => void>();
const mockRemoveAllListeners = vi.fn();

let capturedApi: ElectronAPI | null = null;

vi.mock('electron', () => ({
    contextBridge: {
        exposeInMainWorld: (_channel: string, api: ElectronAPI) => {
            capturedApi = api;
        },
    },
    ipcRenderer: {
        send: mockSend,
        invoke: mockInvoke,
        on: mockOn,
        removeAllListeners: mockRemoveAllListeners,
    },
}));

function bridge(): ElectronAPI {
    if (capturedApi === null) throw new Error('preload never called exposeInMainWorld');
    return capturedApi;
}

/** Each listener the preload handed `ipcRenderer.on`, by channel. */
function listenerFor(channel: string): Listener {
    const call = mockOn.mock.calls.find(([registered]) => registered === channel);
    if (call === undefined) throw new Error(`nothing listens on ${channel}`);
    return call[1];
}

await import('@/preload/index');

beforeEach(() => {
    vi.clearAllMocks();
});

describe('preload / electronAPI', () => {
    describe('log methods — route to ipcRenderer.send', () => {
        it('log.error sends "log:error"', () => {
            bridge().log.error('msg');
            expect(mockSend).toHaveBeenCalledWith('log:error', { message: 'msg', details: [] });
        });

        it('log.warn sends "log:warn"', () => {
            bridge().log.warn('warning');
            expect(mockSend).toHaveBeenCalledWith('log:warn', { message: 'warning', details: [] });
        });

        it('packs whatever follows the message into details', () => {
            const err = new Error('boom');
            bridge().log.error('Failed to save:', err, 3);
            expect(mockSend).toHaveBeenCalledWith('log:error', { message: 'Failed to save:', details: [err, 3] });
        });
    });

    describe('IPC invoke methods', () => {
        const invokeTests: [keyof ElectronAPI, string, unknown[]][] = [
            ['openExternal', 'shell:openExternal', ['https://example.com']],
            ['openFolderDialog', 'dialog:openFolder', []],
            ['showSaveDialog', 'dialog:showSaveDialog', [{ defaultPath: '/tmp' }]],
            ['writeBuffer', 'file:writeBuffer', ['/path/file.bin', 'base64data']],
            ['scanFolder', 'files:scan', []],
            ['closeVault', 'vault:close', []],
            ['readFile', 'file:read', ['/vault/note.md']],
            ['resolveEmbedPath', 'file:resolveEmbedPath', ['img.png', '/dir', '/root']],
            ['readImage', 'file:readImage', ['/vault/img.png']],
            ['readAudio', 'file:readAudio', ['/vault/audio.mp3']],
            ['writeFile', 'file:write', ['/vault/note.md', 'content']],
            ['createFile', 'file:create', ['/vault', 'note.md']],
            ['createFolder', 'folder:create', ['/vault', 'new-folder']],
            ['deleteFile', 'file:delete', ['/vault/note.md']],
            ['renameFile', 'file:rename', ['/vault/old.md', 'new.md']],
            ['updateEmbedRefs', 'file:updateEmbedRefs', ['old.md', 'new.md']],
            ['renameFolder', 'folder:rename', ['/vault/old', 'new-name']],
            ['deleteFolder', 'folder:delete', ['/vault/folder']],
            ['moveFile', 'file:move', ['/vault/note.md', '/vault/sub']],
            ['moveFolder', 'folder:move', ['/vault/folder', '/vault/sub']],
            ['saveAudioRecording', 'audio:saveRecording', ['/vault', 'rec.wav', 'base64']],
            ['aiListModels', 'ai:listModels', []],
            ['aiLoadModel', 'ai:loadModel', ['/models/model.gguf']],
            ['aiUnloadModel', 'ai:unloadModel', []],
            ['aiChat', 'ai:chat', ['hello', 'context']],
            ['aiStopChat', 'ai:stopChat', []],
            ['aiResetChat', 'ai:resetChat', []],
            ['aiRestoreChatHistory', 'ai:restoreChatHistory', [[{ role: 'user', content: 'hi' }]]],
            ['aiGetStatus', 'ai:getStatus', []],
            ['aiOpenPhyllaDir', 'ai:openPhyllaDir', []],
            ['systemPromptList', 'systemPrompt:list', []],
            ['systemPromptSetActive', 'systemPrompt:setActive', ['creative']],
            ['themeList', 'theme:list', []],
            ['themeSetActive', 'theme:setActive', ['dark']],
            ['themeOpenPhyllaDir', 'theme:openPhyllaDir', []],
            ['languageList', 'language:list', []],
            ['languageSetActive', 'language:setActive', ['fr']],
            ['languageLoad', 'language:load', ['fr']],
            ['languageOpenPhyllaDir', 'language:openPhyllaDir', []],
            ['conversationList', 'conversations:list', []],
            ['conversationCreate', 'conversations:create', ['model.gguf']],
            ['conversationLoad', 'conversations:load', ['conv-1']],
            ['conversationSave', 'conversations:save', [{ id: 'conv-1' }]],
            ['conversationAddMessage', 'conversations:addMessage', ['conv-1', { role: 'user' }]],
            ['conversationDelete', 'conversations:delete', ['conv-1']],
            ['conversationRename', 'conversations:rename', ['conv-1', 'New Title']],
            ['watchFolder', 'fs:watchFolder', []],
            ['unwatchFolder', 'fs:unwatchFolder', []],
            ['writeClipboard', 'clipboard:write', ['copied text']],
            ['bookmarksLoad', 'bookmarks:load', []],
            ['bookmarksSave', 'bookmarks:save', [['/vault/note.md']]],
            ['speechInit', 'speech:init', []],
            ['speechTranscribe', 'speech:transcribe', [[1, 2, 3]]],
            ['speechGetStatus', 'speech:getStatus', []],
        ];

        for (const [method, channel, args] of invokeTests) {
            it(`${method} invokes "${channel}"`, () => {
                const fn: unknown = bridge()[method];
                assert(typeof fn === 'function', `${method} is not a function`);
                Reflect.apply(fn, undefined, args);
                expect(mockInvoke).toHaveBeenCalledWith(channel, ...args);
            });
        }
    });

    describe('event listener methods', () => {
        it('onAiToken registers ipcRenderer.on handler for "ai:token"', () => {
            const cb = vi.fn();
            bridge().onAiToken(cb);
            expect(mockOn).toHaveBeenCalledWith('ai:token', expect.any(Function));
            listenerFor('ai:token')({}, 'hello');
            expect(cb).toHaveBeenCalledWith('hello');
        });

        it('removeAiTokenListener calls removeAllListeners("ai:token")', () => {
            bridge().removeAiTokenListener();
            expect(mockRemoveAllListeners).toHaveBeenCalledWith('ai:token');
        });

        it('onFsChanged registers handler for "fs:changed"', () => {
            const cb = vi.fn();
            bridge().onFsChanged(cb);
            expect(mockOn).toHaveBeenCalledWith('fs:changed', expect.any(Function));
            listenerFor('fs:changed')({}, { type: 'change' });
            expect(cb).toHaveBeenCalledWith({ type: 'change' });
        });

        it('removeFsChangedListener calls removeAllListeners("fs:changed")', () => {
            bridge().removeFsChangedListener();
            expect(mockRemoveAllListeners).toHaveBeenCalledWith('fs:changed');
        });
    });
});
