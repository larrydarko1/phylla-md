<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue';
import { useI18n } from 'vue-i18n';

import AiPanel from '@/renderer/components/AiPanel.vue';
import AudioRecorder from '@/renderer/components/AudioRecorder.vue';
import BookmarksPanel from '@/renderer/components/BookmarksPanel.vue';
import FileExplorer from '@/renderer/components/FileExplorer.vue';
import IconDoorOpen from '@/renderer/components/icons/IconDoorOpen.vue';
import IconFilePlus from '@/renderer/components/icons/IconFilePlus.vue';
import IconFolderPlus from '@/renderer/components/icons/IconFolderPlus.vue';
import IconLanguage from '@/renderer/components/icons/IconLanguage.vue';
import IconLightbulb from '@/renderer/components/icons/IconLightbulb.vue';
import IconPalette from '@/renderer/components/icons/IconPalette.vue';
import IconPenTool from '@/renderer/components/icons/IconPenTool.vue';
import IconSearch from '@/renderer/components/icons/IconSearch.vue';
import IconStar from '@/renderer/components/icons/IconStar.vue';
import LanguagePicker from '@/renderer/components/LanguagePicker.vue';
import NoteEditor from '@/renderer/components/NoteEditor.vue';
import NotificationCenter from '@/renderer/components/NotificationCenter.vue';
import SearchPanel from '@/renderer/components/SearchPanel.vue';
import TabBar from '@/renderer/components/TabBar.vue';
import ThemePicker from '@/renderer/components/ThemePicker.vue';
import { useEditorTabs } from '@/renderer/composables/editor/useEditorTabs';
import { useLanguage } from '@/renderer/composables/ui/useLanguage';
import { useTheme } from '@/renderer/composables/ui/useTheme';
import { useBookmarks } from '@/renderer/composables/vault/useBookmarks';
import { useFileSelection } from '@/renderer/composables/vault/useFileSelection';
import { useVault } from '@/renderer/composables/vault/useVault';
import type { FileInfo } from '@/schemas/vault';

const { t } = useI18n();

const vault = useVault();
const selection = useFileSelection();
const bookmarks = useBookmarks(() => vault.currentFolder.value);
const editorTabs = useEditorTabs();
const theme = useTheme();
const language = useLanguage();
const { currentFolder, files, folders } = vault;
const { selectedFiles, selectedFolder } = selection;
const activeFile = editorTabs.activeFile;
const { bookmarkedFiles, toggleBookmark, removeBookmark, relocateBookmark } = bookmarks;
const renamingFile = ref<FileInfo | null>(null);
const renamingFolder = ref<string | null>(null);
const showSearchPanel = ref(false);
const showBookmarksPanel = ref(false);
const showAiPanel = ref(false);
const showThemePanel = ref(false);
const showLanguagePanel = ref(false);

function handleExternalLinkClick(e: MouseEvent): void {
    const closest = e.target instanceof Element ? e.target.closest('a') : null;
    const target = closest instanceof HTMLAnchorElement ? closest : null;
    if (target === null) return;
    const href = target.getAttribute('href');
    if (href !== null && href !== '' && (href.startsWith('http://') || href.startsWith('https://'))) {
        e.preventDefault();
        e.stopPropagation();
        void window.electronAPI.openExternal(href);
    }
}

async function refreshFiles(): Promise<void> {
    await vault.refreshFiles();
    selection.syncAfterRefresh(vault.files.value);
    editorTabs.syncTabFiles(vault.files.value);
}

async function selectFolder(): Promise<void> {
    const folderPath = await vault.openFolderDialog();
    if (folderPath !== null && folderPath !== '') {
        editorTabs.clearTabs();
        await restoreSession(folderPath);
    }
}

async function restoreVault(): Promise<void> {
    const loaded = await vault.loadVault();
    const folderPath = vault.currentFolder.value;
    if (loaded === null || folderPath === null) return;
    await restoreSession(folderPath);
}

async function restoreSession(folderPath: string): Promise<void> {
    const restored = editorTabs.restoreTabs(folderPath, vault.files.value);
    if (!restored) {
        selection.restoreFromStorage(vault.files.value);
        const restoredFile = selection.activeFile.value;
        if (restoredFile !== null) editorTabs.openTab(restoredFile);
    } else {
        // Sync file selection with the restored active tab
        const activeTabFile = editorTabs.activeFile.value;
        if (activeTabFile !== null) selection.openFile(activeTabFile);
    }
    await bookmarks.loadBookmarks();
}

function changeFolder(): void {
    vault.closeVault();
    selection.clearSelection();
    editorTabs.clearTabs();
    editorTabs.setFolderPath(null);
}

function handleKeydown(e: KeyboardEvent): void {
    if (e.key === 'F2') {
        e.preventDefault();
        if (activeFile.value !== null && renamingFile.value === null) {
            startRenameFile(activeFile.value);
        } else if (
            selectedFolder.value !== null &&
            selectedFolder.value !== '' &&
            (renamingFolder.value === null || renamingFolder.value === '')
        ) {
            startRenameFolder(selectedFolder.value);
        }
    }
}

function handleFileSelect(file: FileInfo, options: { event?: MouseEvent; visibleFiles?: FileInfo[] } = {}): void {
    selection.selectFile(file, options);
    // Open/activate a tab for the single active file (ignore multi-select)
    if (options.event?.shiftKey !== true) {
        editorTabs.openTab(file);
    }
}

function handleFolderSelect(folderPath: string): void {
    selection.selectFolder(folderPath);
}

function handleFileSave(): void {
    // Mark the active tab as saved
    if (activeFile.value !== null) {
        const tab = editorTabs.tabs.value.find((t) => t.file.path === activeFile.value?.path);
        if (tab !== undefined && tab.content !== null) {
            editorTabs.markTabSaved(activeFile.value.path, tab.content);
        }
    }
    void refreshFiles();
}

function handleContentChanged(hasChanges: boolean): void {
    if (activeFile.value !== null) {
        const tab = editorTabs.tabs.value.find((t) => t.file.path === activeFile.value?.path);
        if (tab !== undefined) tab.hasUnsavedChanges = hasChanges;
    }
}

async function handleRecordingSaved(filePath: string): Promise<void> {
    await refreshFiles();
    const recordingFile = vault.files.value.find((f: FileInfo) => f.path === filePath);
    if (recordingFile !== undefined) {
        selection.openFile(recordingFile);
        editorTabs.openTab(recordingFile);
    }
}

async function createNewFile(): Promise<void> {
    const newFile = await vault.createFile();
    if (newFile !== null) {
        selection.openFile(newFile);
        editorTabs.openTab(newFile);
    }
}

async function createNewDrawing(): Promise<void> {
    const newFile = await vault.createDrawing();
    if (newFile !== null) {
        selection.openFile(newFile);
        editorTabs.openTab(newFile);
    }
}

async function createNewFolder(): Promise<void> {
    await vault.createFolder();
}

function startRenameFile(file: FileInfo): void {
    selection.openFile(file);
    editorTabs.openTab(file);
    renamingFile.value = file;
}

function startRenameFolder(folderPath: string): void {
    selection.selectFolder(folderPath);
    renamingFolder.value = folderPath;
}

function cancelRename(): void {
    renamingFile.value = null;
    renamingFolder.value = null;
}

async function handleFileRename(file: FileInfo, newName: string): Promise<void> {
    const renamed = await vault.renameFile(file, newName);
    renamingFile.value = null;
    if (renamed !== null) {
        editorTabs.renameTabFile(file.path, renamed);
        selection.openFile(renamed);
        relocateBookmark(file.path, renamed.path);
    }
}

async function handleFolderRename(folderPath: string, newName: string): Promise<void> {
    const newRelativePath = await vault.renameFolder(folderPath, newName);
    renamingFolder.value = null;
    if (newRelativePath !== null && newRelativePath !== '') {
        relocateFolderBookmarks(folderPath, newRelativePath);
        selectedFolder.value = newRelativePath;
    }
}

async function handleFolderDelete(folderPath: string): Promise<void> {
    const deleted = await vault.deleteFolder(folderPath);
    if (deleted) selectedFolder.value = null;
}

async function handleFileDelete(file: FileInfo): Promise<void> {
    const filesToDelete = selectedFiles.value.length > 1 ? selectedFiles.value : [file];
    const deletedPaths = filesToDelete.map((f) => f.path);
    await vault.deleteFile(filesToDelete);
    // Close deleted tabs (iterate in reverse so indices stay valid)
    const indicesToClose = deletedPaths
        .map((p) => editorTabs.tabs.value.findIndex((t) => t.file.path === p))
        .filter((i) => i !== -1)
        .sort((a, b) => b - a);
    indicesToClose.forEach((idx) => editorTabs.closeTab(idx));
    selection.clearSelection();
    const [next] = vault.files.value;
    if (next !== undefined) {
        selection.openFile(next);
        editorTabs.openTab(next);
    }
}

async function handleFileMove(filePath: string, targetFolderPath: string): Promise<void> {
    const filePaths = selectedFiles.value.length > 1 ? selectedFiles.value.map((f: FileInfo) => f.path) : [filePath];
    const moves = await vault.moveFiles(filePaths, targetFolderPath);
    moves.forEach((move) => relocateBookmark(move.from, move.to));
    const movedPaths = moves.map((move) => move.to);
    const movedFiles = vault.files.value.filter((f: FileInfo) => movedPaths.includes(f.path));
    const [firstMoved] = movedFiles;
    if (firstMoved !== undefined) {
        selectedFiles.value = movedFiles;
        selection.openFile(firstMoved);
        editorTabs.openTab(firstMoved);
    }
}

async function handleFolderMove(folderPath: string, targetFolderPath: string): Promise<void> {
    const newRelativePath = await vault.moveFolder(folderPath, targetFolderPath);
    if (newRelativePath !== null) {
        relocateFolderBookmarks(folderPath, newRelativePath);
        selectedFolder.value = null;
    }
}

/** Folder paths are vault-relative; bookmarks are absolute, so anchor both to the vault root. */
function relocateFolderBookmarks(oldRelativePath: string, newRelativePath: string): void {
    const vaultRoot = vault.currentFolder.value;
    if (vaultRoot === null || vaultRoot === '') return;
    relocateBookmark(`${vaultRoot}/${oldRelativePath}`, `${vaultRoot}/${newRelativePath}`);
}

function toggleSearch(): void {
    showSearchPanel.value = !showSearchPanel.value;
    if (showSearchPanel.value) showBookmarksPanel.value = false;
}

function closeSearch(): void {
    showSearchPanel.value = false;
}

function handleSearchFileSelect(file: FileInfo, event?: MouseEvent | KeyboardEvent): void {
    selection.selectFile(file, event instanceof MouseEvent ? { event } : {});
    editorTabs.openTab(file);
}

function handleSearchFileOpen(file: FileInfo): void {
    selection.openFile(file);
    editorTabs.openTab(file);
    showSearchPanel.value = false;
}

function handleTabSwitch(index: number): void {
    editorTabs.switchTab(index);
    const file = editorTabs.activeFile.value;
    if (file !== null) {
        selection.openFile(file);
    }
}

function toggleBookmarks(): void {
    showBookmarksPanel.value = !showBookmarksPanel.value;
    if (showBookmarksPanel.value) showSearchPanel.value = false;
}

function toggleAiPanel(): void {
    showAiPanel.value = !showAiPanel.value;
    if (showAiPanel.value) {
        showThemePanel.value = false;
        showLanguagePanel.value = false;
    }
}

function toggleThemePanel(): void {
    showThemePanel.value = !showThemePanel.value;
    if (showThemePanel.value) {
        showAiPanel.value = false;
        showLanguagePanel.value = false;
    }
}

function toggleLanguagePanel(): void {
    showLanguagePanel.value = !showLanguagePanel.value;
    if (showLanguagePanel.value) {
        showAiPanel.value = false;
        showThemePanel.value = false;
    }
}

onMounted(() => {
    void theme.refresh();
    void language.refresh();

    void restoreVault();

    vault.setExternalChangeCallback(() => {
        void refreshFiles();
    });
    window.addEventListener('keydown', handleKeydown);
    document.addEventListener('click', handleExternalLinkClick, true);
});

onBeforeUnmount(() => {
    vault.closeVault();
    window.removeEventListener('keydown', handleKeydown);
    document.removeEventListener('click', handleExternalLinkClick, true);
});
</script>

<template>
    <div class="phylla-app stack">
        <!-- Welcome screen when no folder is selected -->
        <div
            v-if="!currentFolder"
            class="welcome-screen hero">
            <div class="welcome-content hero-content">
                <div class="welcome-logo hero-brand">
                    <img
                        draggable="false"
                        src="./assets/icons/icon.png"
                        alt="Phylla logo"
                        class="welcome-logo-icon hero-brand-icon" />
                    <!-- eslint-disable-next-line @intlify/vue-i18n/no-raw-text -- brand name, not translated -->
                    <span class="welcome-logo-text hero-brand-text">phylla.</span>
                </div>

                <button
                    class="welcome-action btn-secondary"
                    :aria-label="t('app.select_folder_description')"
                    @click="selectFolder">
                    {{ t('app.select_folder') }}
                </button>
            </div>
        </div>

        <!-- Main app interface -->
        <div
            v-else
            class="app-layout">
            <div class="left-column stack">
                <nav
                    class="sidebar-menu stack"
                    :aria-label="t('app.main_navigation')">
                    <!-- Workspace pill -->
                    <div class="menu-pill well stack">
                        <button
                            class="icon-btn icon-btn-lg icon-btn-toggle"
                            :aria-label="t('app.change_folder')"
                            @click="changeFolder">
                            <IconDoorOpen
                                width="14"
                                height="14" />
                        </button>
                    </div>

                    <!-- Create actions pill -->
                    <div class="menu-pill well stack">
                        <button
                            class="icon-btn icon-btn-lg icon-btn-toggle"
                            :aria-label="t('app.create_new_note')"
                            @click="createNewFile">
                            <IconFilePlus
                                width="14"
                                height="14" />
                        </button>
                        <button
                            class="icon-btn icon-btn-lg icon-btn-toggle"
                            :aria-label="t('app.create_new_folder')"
                            @click="createNewFolder">
                            <IconFolderPlus
                                width="14"
                                height="14" />
                        </button>
                    </div>

                    <!-- Tools pill -->
                    <div class="menu-pill well stack">
                        <button
                            class="icon-btn icon-btn-lg icon-btn-toggle"
                            :class="{ active: showSearchPanel }"
                            :aria-label="t('app.search_files')"
                            :aria-pressed="showSearchPanel"
                            @click="toggleSearch">
                            <IconSearch
                                width="14"
                                height="14" />
                        </button>
                        <button
                            class="icon-btn icon-btn-lg icon-btn-toggle"
                            :class="{ active: showBookmarksPanel }"
                            :aria-label="t('app.view_bookmarks')"
                            :aria-pressed="showBookmarksPanel"
                            @click="toggleBookmarks">
                            <IconStar
                                width="14"
                                height="14" />
                        </button>
                        <button
                            class="icon-btn icon-btn-lg icon-btn-toggle"
                            :aria-label="t('app.create_new_drawing')"
                            @click="createNewDrawing">
                            <IconPenTool
                                width="14"
                                height="14" />
                        </button>
                        <AudioRecorder
                            :current-folder="currentFolder"
                            :aria-label="t('app.audio_recorder')"
                            @recording-saved="handleRecordingSaved" />
                    </div>

                    <!-- Bottom pill: AI + Theme -->
                    <div class="menu-spacer"></div>
                    <div class="menu-pill well stack">
                        <button
                            class="icon-btn icon-btn-lg icon-btn-toggle"
                            :class="{ active: showAiPanel }"
                            :aria-label="t('app.ai_assistant')"
                            :aria-pressed="showAiPanel"
                            @click="toggleAiPanel">
                            <IconLightbulb
                                width="14"
                                height="14" />
                        </button>
                        <button
                            class="icon-btn icon-btn-lg icon-btn-toggle"
                            :class="{ active: showThemePanel }"
                            :aria-label="t('app.theme_selector')"
                            :aria-pressed="showThemePanel"
                            @click="toggleThemePanel">
                            <IconPalette
                                width="14"
                                height="14" />
                        </button>
                        <button
                            class="icon-btn icon-btn-lg icon-btn-toggle"
                            :class="{ active: showLanguagePanel }"
                            :aria-label="t('app.language_selector')"
                            :aria-pressed="showLanguagePanel"
                            @click="toggleLanguagePanel">
                            <IconLanguage
                                width="14"
                                height="14" />
                        </button>
                    </div>
                </nav>
            </div>
            <aside
                class="sidebar stack"
                :aria-label="t('app.file_explorer_and_panels')">
                <FileExplorer
                    v-if="!showSearchPanel && !showBookmarksPanel"
                    :aria-label="t('app.file_explorer')"
                    :files="files"
                    :folders="folders"
                    :current-folder="currentFolder"
                    :selected-files="selectedFiles"
                    :active-file="activeFile"
                    :renaming-file="renamingFile"
                    :selected-folder="selectedFolder"
                    :renaming-folder="renamingFolder"
                    :bookmarked-files="bookmarkedFiles"
                    @select-file="handleFileSelect"
                    @select-folder="handleFolderSelect"
                    @start-rename-file="startRenameFile"
                    @start-rename-folder="startRenameFolder"
                    @rename-file="handleFileRename"
                    @rename-folder="handleFolderRename"
                    @delete-file="handleFileDelete"
                    @delete-folder="handleFolderDelete"
                    @cancel-rename="cancelRename"
                    @move-file="handleFileMove"
                    @move-folder="handleFolderMove"
                    @toggle-bookmark="toggleBookmark" />
                <SearchPanel
                    v-else-if="showSearchPanel"
                    :files="files"
                    :selected-files="selectedFiles"
                    :active-file="activeFile"
                    :aria-label="t('app.search_results')"
                    @select-file="handleSearchFileSelect"
                    @open-file="handleSearchFileOpen"
                    @close="closeSearch" />
                <BookmarksPanel
                    v-else-if="showBookmarksPanel"
                    :files="files"
                    :bookmarked-paths="bookmarkedFiles"
                    :selected-files="selectedFiles"
                    :active-file="activeFile"
                    :aria-label="t('app.bookmarked_files')"
                    @select-file="handleSearchFileSelect"
                    @open-file="handleSearchFileOpen"
                    @remove-bookmark="removeBookmark" />
            </aside>
            <main
                class="main-content stack fill"
                :aria-label="t('app.editor')">
                <TabBar
                    :tabs="editorTabs.tabs.value"
                    :active-index="editorTabs.activeIndex.value"
                    :aria-label="t('app.open_files')"
                    @switch="handleTabSwitch"
                    @close="editorTabs.closeTab"
                    @reorder="editorTabs.reorderTab" />
                <NoteEditor
                    :file="activeFile"
                    :workspace-path="currentFolder"
                    :aria-label="t('app.note_editor')"
                    @save="handleFileSave"
                    @content-changed="handleContentChanged" />
            </main>
            <AiPanel
                v-if="showAiPanel"
                :files="files"
                :aria-label="t('app.ai_assistant_panel')"
                @close="showAiPanel = false" />
            <ThemePicker
                v-if="showThemePanel"
                :aria-label="t('app.theme_picker')"
                @close="showThemePanel = false" />
            <LanguagePicker
                v-if="showLanguagePanel"
                :aria-label="t('app.language_picker')"
                @close="showLanguagePanel = false" />
        </div>

        <NotificationCenter />
    </div>
</template>

<style scoped lang="scss">
// –– Shell ––––––––––––––––––––

.phylla-app {
    height: 100%;
    background: $base1;
    color: $text1;
}

.app-layout {
    display: flex;
    height: 100%;
    overflow: hidden;
}

.left-column {
    flex-shrink: 0;
}

.main-content {
    overflow: hidden;
}

.sidebar {
    width: $size-26;
    border-right: $border-width-thin $text3;
    overflow: hidden;
}

// –– Rail ––––––––––––––––––––

// The rail scrolls when its pills outgrow the window height, which is the only
// reason it is a column in its own right rather than part of `.left-column`.
.sidebar-menu {
    flex: 1;
    align-items: center;
    gap: $space-2;
    padding: $space-2 $space-1;
    overflow-y: auto;
}

// A group of rail buttons that belong together, on a `.well` of its own — blurred, because the
// rail's pills are the one place this surface floats over content.
.menu-pill {
    align-items: center;
    gap: $space-0;
    padding: $space-0;
    border-color: color-mix(in srgb, $border-color 20%, transparent);
    border-radius: $border-radius-xl;
    backdrop-filter: blur($backdrop-blur-sm);
}

// What holds the bottom pill against the bottom of the rail.
.menu-spacer {
    flex: 1;
}

// –– Welcome ––––––––––––––––––––

// The hero's only control, so it is scaled up from `.btn-secondary` and filled
// with the panel surface — an outline alone on an empty screen reads as disabled.
.welcome-action {
    padding: $space-3 $space-6;
    background: $bg-primary;
    color: $text1;
    border-radius: $border-radius-lg;
    font-weight: $font-weight-medium;
    backdrop-filter: blur($backdrop-blur-sm);

    &:hover {
        background: $bg-hover;
        transform: scale($scale-hover);
    }

    &:active {
        transform: scale($scale-hover-sm);
    }
}
</style>
