/**
 * cm-widgets — CodeMirror 6 WidgetType classes for markdown live-preview.
 */

import { WidgetType } from '@codemirror/view';

// ── Widget classes ────────────────────────────────────────────────────────────

export class HorizontalRuleWidget extends WidgetType {
    toDOM(): HTMLElement {
        const hr = document.createElement('hr');
        hr.className = 'cm-hr';
        return hr;
    }
}

// ── Table widget ──────────────────────────────────────────────────────────────

/**
 * Renders a GFM markdown table as an HTML <table> element.
 * Shown when the cursor is not on any line of the table (Obsidian-style live preview).
 */
export class TableWidget extends WidgetType {
    rawText: string;

    constructor(rawText: string) {
        super();
        this.rawText = rawText;
    }

    override eq(other: TableWidget): boolean {
        return this.rawText === other.rawText;
    }

    /** Safe HTML escape using the DOM (prevents XSS). */
    private escapeHtml(text: string): string {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * Render inline markdown within a cell (bold, italic, code, strikethrough, highlight).
     * Content is HTML-escaped first, so regex replacements are safe.
     */
    private renderInline(text: string): string {
        const escaped = this.escapeHtml(text);
        return escaped
            .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.+?)\*/g, '<em>$1</em>')
            .replace(/`(.+?)`/g, '<code>$1</code>')
            .replace(/~~(.+?)~~/g, '<del>$1</del>')
            .replace(/==(.+?)==/g, '<mark>$1</mark>');
    }

    /**
     * Split a raw table row into trimmed cell strings.
     * Handles both `| a | b |` and `a | b` forms.
     */
    private parseCells(line: string): string[] {
        const trimmed = line.trim();
        const inner = trimmed.startsWith('|') ? trimmed.slice(1) : trimmed;
        const stripped = inner.endsWith('|') ? inner.slice(0, -1) : inner;
        return stripped.split('|').map((c): string => c.trim());
    }

    /** Derive CSS text-align from a GFM delimiter cell (e.g. `:---:`, `---:`). */
    private parseAlignment(cell: string): string {
        const trimmed = cell.trim();
        const left = trimmed.startsWith(':');
        const right = trimmed.endsWith(':');
        if (left && right) return 'center';
        if (right) return 'right';
        if (left) return 'left';
        return '';
    }

    toDOM(): HTMLElement {
        const lines = this.rawText
            .split('\n')
            .map((l): string => l.trim())
            .filter(Boolean);

        const wrapper = document.createElement('div');
        wrapper.className = 'cm-table-wrapper';

        const table = document.createElement('table');
        table.className = 'cm-table';

        if (lines.length < 2) {
            // Malformed — render as plain text fallback
            table.textContent = this.rawText;
            wrapper.appendChild(table);
            return wrapper;
        }

        const headerCells = this.parseCells(lines[0] ?? '');
        const delimCells = this.parseCells(lines[1] ?? '');
        const aligns = delimCells.map((c): string => this.parseAlignment(c));

        // <thead>
        const thead = document.createElement('thead');
        const headerRow = document.createElement('tr');
        headerCells.forEach((cell, i): void => {
            const th = document.createElement('th');
            th.style.textAlign = aligns[i] ?? '';
            th.innerHTML = this.renderInline(cell);
            headerRow.appendChild(th);
        });
        thead.appendChild(headerRow);
        table.appendChild(thead);

        // <tbody>
        if (lines.length > 2) {
            const tbody = document.createElement('tbody');
            for (let row = 2; row < lines.length; row++) {
                const cells = this.parseCells(lines[row] ?? '');
                const tr = document.createElement('tr');
                cells.forEach((cell, i): void => {
                    const td = document.createElement('td');
                    td.style.textAlign = aligns[i] ?? '';
                    td.innerHTML = this.renderInline(cell);
                    tr.appendChild(td);
                });
                tbody.appendChild(tr);
            }
            table.appendChild(tbody);
        }

        wrapper.appendChild(table);
        return wrapper;
    }

    /** Let CM handle events so clicks place the cursor (triggering raw-edit mode). */
    override ignoreEvent(): boolean {
        return false;
    }
}

export class EmbedWidget extends WidgetType {
    fileName: string;
    resolvedPath: string | undefined;
    mediaType: string;
    displayOptions: string;

    constructor(fileName: string, resolvedPath: string | undefined, mediaType: string, displayOptions: string) {
        super();
        this.fileName = fileName;
        this.resolvedPath = resolvedPath;
        this.mediaType = mediaType;
        this.displayOptions = displayOptions;
    }

    override eq(other: EmbedWidget): boolean {
        return this.fileName === other.fileName && this.resolvedPath === other.resolvedPath;
    }

    toDOM(): HTMLElement {
        if (this.resolvedPath == null || this.resolvedPath === '') {
            const placeholder = document.createElement('div');
            placeholder.className = 'cm-embed-placeholder';
            placeholder.innerHTML = `<span class="embed-placeholder-icon">\u{1F4CE}</span> <span>${this.escapeHtml(this.fileName)}</span>`;
            return placeholder;
        }

        const fileUrl = `phylla://localhost${encodeURI(this.resolvedPath).replace(/#/g, '%23')}`;

        switch (this.mediaType) {
            case 'image': {
                const wrapper = document.createElement('div');
                wrapper.className = 'cm-embed-image-wrapper';
                const img = document.createElement('img');
                img.src = fileUrl;
                img.alt = this.fileName;
                img.className = 'cm-embed-image';
                img.loading = 'lazy';
                const dimMatch = this.displayOptions !== '' ? /^(\d+)(?:x(\d+))?$/.exec(this.displayOptions) : null;
                if (dimMatch !== null) {
                    img.width = parseInt(dimMatch[1] ?? '', 10);
                    if (dimMatch[2] !== undefined) img.height = parseInt(dimMatch[2], 10);
                }
                wrapper.appendChild(img);
                return wrapper;
            }
            case 'video':
            case 'audio': {
                const isVideo = this.mediaType === 'video';
                const el = (tag: string, className: string): HTMLElement =>
                    Object.assign(document.createElement(tag), { className });

                const wrapper = el('div', isVideo ? 'cm-embed-video-wrapper media-frame' : 'cm-embed-audio-wrapper');
                const media = isVideo
                    ? Object.assign(document.createElement('video'), {
                          src: fileUrl,
                          preload: 'auto',
                          className: 'cm-embed-video',
                      })
                    : Object.assign(document.createElement('audio'), { src: fileUrl, preload: 'auto' });

                // The app's shared `.media-*` transport; the `cm-embed-*` names stay as this file's hooks.
                const joined = isVideo ? ' media-controls-joined' : '';
                const ctrlBar = el('div', `cm-embed-controls media-controls${joined}`);

                const playBtn = el('button', 'cm-embed-play-btn media-ctrl-btn');
                const playSvg =
                    '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';
                const pauseSvg =
                    '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>';
                playBtn.innerHTML = playSvg;

                const timeEl = el('span', 'cm-embed-time media-time');
                timeEl.textContent = '0:00';

                const progressWrap = el('div', 'cm-embed-progress-wrapper media-progress');
                const progressTrack = el('div', 'cm-embed-progress-track media-progress-track');
                const progressFill = el('div', 'cm-embed-progress-fill media-progress-fill');
                progressTrack.appendChild(progressFill);
                progressWrap.appendChild(progressTrack);

                const durEl = el('span', 'cm-embed-time media-time');
                durEl.textContent = '0:00';

                const volIcon =
                    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">';
                const volSvg = `${volIcon}<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>`;
                const muteSvg = `${volIcon}<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><line x1="23" y1="9" x2="17" y2="15"></line><line x1="17" y1="9" x2="23" y2="15"></line></svg>`;

                const volWrap = el('div', 'cm-embed-vol-wrapper media-volume');
                const volBtn = el('button', 'cm-embed-vol-btn media-volume-btn');

                // A native range, so the level is reachable from the keyboard rather than by aiming at a bar.
                const volSlider = document.createElement('input');
                volSlider.type = 'range';
                volSlider.min = '0';
                volSlider.max = '1';
                volSlider.step = '0.01';
                volSlider.className = 'cm-embed-vol-slider media-volume-slider';
                volWrap.append(volBtn, volSlider);

                const setVolume = (volume: number): void => {
                    media.volume = volume;
                    volSlider.value = String(volume);
                    volSlider.style.setProperty('--volume', String(volume));
                    volBtn.innerHTML = volume === 0 ? muteSvg : volSvg;
                };
                setVolume(1);

                const fmt = (totalSeconds: number): string => {
                    if (!isFinite(totalSeconds) || isNaN(totalSeconds) || totalSeconds <= 0) return '0:00';
                    const minutes = Math.floor(totalSeconds / 60);
                    return `${minutes}:${Math.floor(totalSeconds % 60)
                        .toString()
                        .padStart(2, '0')}`;
                };

                // Some formats report Infinity over the custom protocol. Seeking to a huge value
                // makes Chromium clamp to the real end and fire durationchange with it.
                let realDuration = 0;
                let probing = false;

                const captureDuration = (): void => {
                    if (isFinite(media.duration) && media.duration > 0) {
                        realDuration = media.duration;
                        durEl.textContent = fmt(realDuration);
                        wrapper.dataset['realDuration'] = String(realDuration);
                    }
                };

                media.addEventListener('loadedmetadata', (): void => {
                    captureDuration();
                    if (realDuration === 0) {
                        probing = true;
                        media.currentTime = 1e10;
                    }
                });

                media.addEventListener('durationchange', captureDuration);

                media.addEventListener('seeked', (): void => {
                    if (probing) {
                        probing = false;
                        captureDuration();
                        media.currentTime = 0;
                    }
                });

                media.addEventListener('timeupdate', (): void => {
                    if (probing) return;
                    timeEl.textContent = fmt(media.currentTime);
                    if (realDuration !== 0) {
                        progressFill.style.width = `${(media.currentTime / realDuration) * 100}%`;
                    }
                });

                media.addEventListener('play', (): void => {
                    playBtn.innerHTML = pauseSvg;
                });
                media.addEventListener('pause', (): void => {
                    playBtn.innerHTML = playSvg;
                });
                media.addEventListener('ended', (): void => {
                    playBtn.innerHTML = playSvg;
                });

                playBtn.onclick = (e): void => {
                    e.stopPropagation();
                    if (media.paused) void media.play();
                    else media.pause();
                };
                if (isVideo)
                    media.onclick = (): void => {
                        if (media.paused) void media.play();
                        else media.pause();
                    };

                // Seek handler — uses realDuration from closure (set by probe)
                progressWrap.onclick = (e): void => {
                    e.stopPropagation();
                    const probedDuration = isFinite(media.duration) ? media.duration : 0;
                    const dur = realDuration !== 0 ? realDuration : probedDuration;
                    if (dur === 0) return;
                    const rect = progressTrack.getBoundingClientRect();
                    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                    media.currentTime = ratio * dur;
                };

                let savedVol = 1;
                volBtn.onclick = (e): void => {
                    e.stopPropagation();
                    if (media.volume > 0) {
                        savedVol = media.volume;
                        setVolume(0);
                    } else {
                        setVolume(savedVol);
                    }
                };
                // The editor owns mousedown on its content; without this the drag never
                // reaches the thumb.
                volSlider.onmousedown = (e): void => e.stopPropagation();
                volSlider.oninput = (e): void => {
                    e.stopPropagation();
                    setVolume(parseFloat(volSlider.value));
                };

                ctrlBar.append(playBtn, timeEl, progressWrap, durEl, volWrap);
                wrapper.append(media, ctrlBar);
                return wrapper;
            }
            case 'pdf': {
                const wrapper = document.createElement('div');
                wrapper.className = 'cm-embed-pdf-wrapper';
                const iframe = document.createElement('iframe');
                iframe.src = fileUrl;
                iframe.className = 'cm-embed-pdf';
                iframe.setAttribute('frameborder', '0');
                iframe.loading = 'lazy';
                wrapper.appendChild(iframe);
                return wrapper;
            }
            case 'note': {
                const wrapper = document.createElement('div');
                wrapper.className = 'cm-embed-note-link';
                wrapper.innerHTML = `\u{1F4C4} ${this.escapeHtml(this.fileName)}`;
                return wrapper;
            }
            default: {
                const wrapper = document.createElement('div');
                wrapper.className = 'cm-embed-placeholder';
                wrapper.innerHTML = `<span class="embed-placeholder-icon">\u{1F4CE}</span> <span>${this.escapeHtml(this.fileName)}</span>`;
                return wrapper;
            }
        }
    }

    private escapeHtml(text: string): string {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    override ignoreEvent(): boolean {
        return true;
    }
}

export class TaskCheckboxWidget extends WidgetType {
    checked: 'checked' | 'half' | 'unchecked';
    pos: number;

    constructor(checked: 'checked' | 'half' | 'unchecked', pos: number) {
        super();
        this.checked = checked;
        this.pos = pos;
    }

    override eq(other: TaskCheckboxWidget): boolean {
        return this.checked === other.checked && this.pos === other.pos;
    }

    toDOM(): HTMLElement {
        const label = document.createElement('label');
        label.className = 'cm-task-label';
        label.dataset['taskPos'] = String(this.pos);

        const input = document.createElement('input');
        input.type = 'checkbox';
        input.className = 'cm-task-checkbox-input';
        if (this.checked === 'checked') input.checked = true;
        if (this.checked === 'half') input.dataset['half'] = 'true';

        const span = document.createElement('span');
        span.className = 'cm-task-checkbox';
        if (this.checked === 'checked') span.classList.add('cm-task-checked');
        if (this.checked === 'half') span.classList.add('cm-task-half');

        label.appendChild(input);
        label.appendChild(span);
        return label;
    }

    override ignoreEvent(): boolean {
        return false;
    }
}
