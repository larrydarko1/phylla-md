/**
 * Application logger — thin wrapper over electron-log.
 *
 * Main process:  import log from './lib/logger'
 * Preload:       exposed via electronAPI.log.*
 * Renderer:      window.electronAPI.log.*
 *
 * Logs are written to rotating files in the OS-standard location:
 *   macOS  — ~/Library/Logs/Phylla/main.log
 *   Win    — %USERPROFILE%\AppData\Roaming\Phylla\logs\main.log
 *   Linux  — ~/.config/Phylla/logs/main.log
 */

import baseLog from 'electron-log/main';

export const log = baseLog;

// Keep log files small — 1 MB max, 1 rotated backup
baseLog.transports.file.maxSize = 1024 * 1024;
