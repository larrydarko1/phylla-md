/**
 * Electron Main Process — Phylla note-taking app.
 *
 * Responsibilities:
 *   1. Create and manage the BrowserWindow
 *   2. Register a custom local-file protocol (phylla://) so the renderer can
 *      load images/audio/video without disabling webSecurity
 *   3. Grant microphone permission for audio recording
 *   4. Register IPC handlers by delegating to each service module
 *
 * IPC handler ownership:
 *   fs-service           → file:*, folder:*, files:scan, fs:*, vault:close, bookmarks:*, dialog:openFolder, dialog:showSaveDialog
 *   media-service        → audio:saveRecording
 *   ai-service           → ai:*
 *   conversation-service → conversations:*
 *   speech-service       → speech:*
 *   systemPrompt-service → systemPrompt:*
 *   theme-service        → theme:*
 *   language-service     → language:*
 *   log-service          → log:*
 *   main (inline)        → clipboard:write, shell:openExternal
 */

import path from 'path';
import { pathToFileURL } from 'url';

import { app, BrowserWindow, ipcMain, shell, Menu, screen, protocol, net, session, clipboard } from 'electron';

import { config } from '@/main/lib/config';
import { log } from '@/main/lib/logger';
import { migrateLegacyPaths, migrateLegacyUserData } from '@/main/lib/paths';
import { isInsideBoundary } from '@/main/lib/validation';
import * as aiService from '@/main/services/ai';
import * as conversationService from '@/main/services/conversation';
import * as fsService from '@/main/services/fs';
import * as languageService from '@/main/services/language';
import * as logService from '@/main/services/log';
import * as mediaService from '@/main/services/media';
import * as speechService from '@/main/services/speech';
import * as systemPromptService from '@/main/services/systemPrompt';
import * as themeService from '@/main/services/theme';

let mainWindow: BrowserWindow | null = null;

function findMainWindow(): BrowserWindow | null {
    return mainWindow;
}

function createWindow(): void {
    const iconPath = path.join(import.meta.dirname, '../../build/icon.png');

    const { width: sw, height: sh } = screen.getPrimaryDisplay().workAreaSize;

    mainWindow = new BrowserWindow({
        autoHideMenuBar: true,
        width: Math.round(sw * 0.75),
        height: Math.round(sh * 0.8),
        minWidth: Math.round(sw * 0.45),
        minHeight: Math.round(sh * 0.5),
        icon: iconPath,
        webPreferences: {
            // out/main/ → ../ → out/preload/index.cjs
            preload: path.join(import.meta.dirname, '../preload/index.cjs'),
            nodeIntegration: false, // never expose Node to the renderer
            contextIsolation: true, // keep renderer and preload worlds isolated
            sandbox: true, // requires the CommonJS preload built by electron.vite.config.ts
            // webSecurity stays at its default (true).
            // Local files (images, audio, video) are served through the
            // phylla:// custom protocol registered below — no need to disable
            // webSecurity for that.
            partition: 'persist:phylla',
            spellcheck: true,
        },
        backgroundColor: '#1a1a1a',
        title: '',
        show: false,
    });

    // Context menu: spellcheck suggestions + standard editing actions
    mainWindow.webContents.on('context-menu', (_event, params): void => {
        const win = mainWindow;
        if (win === null) return;

        const menu = Menu.buildFromTemplate([
            ...params.dictionarySuggestions.map((s): { label: string; click: () => void } => ({
                label: s,
                click: (): void => win.webContents.replaceMisspelling(s),
            })),
            ...(params.dictionarySuggestions.length > 0 ? [{ type: 'separator' as const }] : []),
            ...(params.misspelledWord !== ''
                ? [
                      {
                          label: 'Add to Dictionary',
                          click: (): boolean =>
                              win.webContents.session.addWordToSpellCheckerDictionary(params.misspelledWord),
                      },
                      { type: 'separator' as const },
                  ]
                : []),
            { role: 'cut' as const, visible: params.isEditable },
            { role: 'copy' as const, visible: params.selectionText.length > 0 },
            { role: 'paste' as const, visible: params.isEditable },
            { type: 'separator' as const, visible: params.isEditable || params.selectionText.length > 0 },
            { role: 'selectAll' as const },
        ]);
        menu.popup();
    });

    // Load the app, electron-vite sets the renderer URL in dev mode
    if (config.rendererUrl !== '') {
        void mainWindow.loadURL(config.rendererUrl);
        mainWindow.webContents.openDevTools();
    } else {
        void mainWindow.loadFile(path.join(import.meta.dirname, '../renderer/index.html'));
    }

    // Keep external links out of the app window
    mainWindow.webContents.setWindowOpenHandler(({ url }): { action: 'deny' } => {
        if (url.startsWith('http://') || url.startsWith('https://')) void shell.openExternal(url);
        return { action: 'deny' };
    });

    mainWindow.webContents.on('will-navigate', (event, url): void => {
        const isDevServer = config.rendererUrl !== '';
        const appOrigin = isDevServer ? config.rendererUrl : 'file://';
        if (!url.startsWith(appOrigin) && !url.startsWith('phylla://')) {
            event.preventDefault();
            if (url.startsWith('http://') || url.startsWith('https://')) void shell.openExternal(url);
        }
    });

    const win = mainWindow;
    mainWindow.once('ready-to-show', (): void => win.show());
    mainWindow.on('closed', (): void => {
        mainWindow = null;
    });
}

/**
 * ─── Custom protocol: phylla:// ───────────────────────────────────────────────
 */
function registerPhyllaProtocol(ses: Electron.Session): void {
    ses.protocol.handle('phylla', (request): Response | Promise<Response> => {
        // phylla://localhost/path/to/file  →  /path/to/file
        const filePath = decodeURIComponent(new URL(request.url).pathname);

        const root = fsService.findVaultRoot();
        if (root === null) {
            log.warn('[phylla://] Denied — no vault is open:', filePath);
            return new Response('No vault is open', { status: 403 });
        }
        if (!isInsideBoundary(filePath, root)) {
            log.warn('[phylla://] Denied — path is outside the vault:', filePath);
            return new Response('Forbidden', { status: 403 });
        }

        // Forward the original request headers (including Range for video seeking)
        // to net.fetch so that streaming/range responses work correctly.
        return net.fetch(pathToFileURL(path.resolve(filePath)).toString(), {
            method: request.method,
            headers: request.headers,
        });
    });
}

// Carry pre-rename (Leaf) data over before anything reads it; dev userData never held release data.
migrateLegacyPaths();
if (app.isPackaged) migrateLegacyUserData(path.join(app.getPath('appData'), 'leaf'), app.getPath('userData'));

/**
 * ─── Scheme privileges ───────────────────────────────────────────────────────
 * Must be called before app.whenReady(). Tells Chromium the phylla:// scheme
 * supports streaming (needed for video/audio playback with range requests),
 * is secure (needed for iframe PDF viewing), and supports fetch.
 * */
protocol.registerSchemesAsPrivileged([
    {
        scheme: 'phylla',
        privileges: {
            standard: true,
            secure: true,
            supportFetchAPI: true,
            stream: true,
        },
    },
]);

// ─── App lifecycle ────────────────────────────────────────────────────────────

void app.whenReady().then(async (): Promise<void> => {
    const phyllaSession = session.fromPartition('persist:phylla');
    await fsService.initVaultRoot();

    registerPhyllaProtocol(phyllaSession);
    createWindow();

    /**
     * Grant microphone access for audio recording.
     * In production (file:// origin) Electron denies all permission requests
     * by default, so we need an explicit handler.
     * Must target the partition session used by the BrowserWindow.
     * 'media' covers the camera too, so both handlers grant audio only.
     */
    phyllaSession.setPermissionRequestHandler((_webContents, permission, callback, details): void => {
        if (permission !== 'media') {
            callback(false);
            return;
        }
        // An absent list means Chromium did not say what is being requested — deny.
        if (!('mediaTypes' in details)) {
            callback(false);
            return;
        }
        const mediaTypes = details.mediaTypes ?? [];
        callback(mediaTypes.length > 0 && mediaTypes.every((type): type is 'audio' => type === 'audio'));
    });
    phyllaSession.setPermissionCheckHandler((_webContents, permission, _origin, details): boolean => {
        if (permission !== 'media') return false;
        // 'unknown' is what a generic navigator.permissions query reports, so it stays allowed.
        return details.mediaType !== 'video';
    });

    // ── Register IPC handlers ────────────────────────────────────────────────
    conversationService.init(app.getPath('userData'));

    fsService.register(ipcMain, findMainWindow);
    mediaService.register(ipcMain, fsService.findVaultRoot);
    aiService.register(ipcMain, findMainWindow);
    conversationService.register(ipcMain);
    speechService.register(ipcMain);
    systemPromptService.register(ipcMain);
    themeService.register(ipcMain);
    languageService.register(ipcMain);
    logService.register(ipcMain);

    // Clipboard
    ipcMain.handle('clipboard:write', async (_event, text: string): Promise<void> => {
        try {
            if (typeof text === 'string') await clipboard.writeText(text);
        } catch (err) {
            log.error({ err, op: 'clipboard:write' }, 'Failed to write to clipboard');
        }
    });

    // Shell — open external URLs safely (http/https only)
    ipcMain.handle('shell:openExternal', async (_event, url: string): Promise<boolean> => {
        if (typeof url === 'string' && (url.startsWith('http://') || url.startsWith('https://'))) {
            try {
                await shell.openExternal(url);
                return true;
            } catch (err) {
                log.error({ err, op: 'shell:openExternal' }, 'Failed to open external URL');
                return false;
            }
        }
        return false;
    });

    app.on('activate', (): void => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', (): void => {
    if (process.platform !== 'darwin') app.quit();
});

// ─── Graceful shutdown ────────────────────────────────────────────────────────
// Clean up resources held by services before the process exits.
app.on('before-quit', (): void => {
    void (async (): Promise<void> => {
        fsService.cleanup();
        await aiService.cleanup();
        speechService.cleanup();
    })();
});

process.on('uncaughtException', (error): void => {
    log.error('[main] Uncaught exception:', error);
});

// The app's startup and shutdown paths are `void`ed promise chains, so a rejection
// in one has nowhere to surface — without this it would take the process down with
// an empty log.
process.on('unhandledRejection', (reason): void => {
    log.error('[main] Unhandled rejection:', reason);
});
