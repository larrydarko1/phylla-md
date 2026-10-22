import type {
    AiListModelsResult,
    AiLoadResult,
    AiChatResult,
    AiStatus,
    AiSimpleResult,
    ConversationMessage,
    Conversation,
    ConversationListResult,
    ConversationCreateResult,
    ConversationLoadResult,
} from '@/schemas/ai';
import type { IpcErrorCode } from '@/schemas/errors';
import type {
    SpeechInitResult,
    SpeechTranscribeResult,
    SpeechResetSessionResult,
    SpeechStatus,
} from '@/schemas/speech';
import type {
    ScanResult,
    FileReadResult,
    ImageReadResult,
    AudioReadResult,
    EmbedResolveResult,
    FileWriteResult,
    FileCreateResult,
    FolderCreateResult,
    FileDeleteResult,
    FileRenameResult,
    FolderRenameResult,
    FolderDeleteResult,
    FileMoveResult,
    FolderMoveResult,
    AudioSaveResult,
} from '@/schemas/vault';

export type ElectronAPI = {
    log: {
        error: (message: string, ...details: unknown[]) => void;
        warn: (message: string, ...details: unknown[]) => void;
    };
    openExternal: (url: string) => Promise<boolean>;
    openFolderDialog: () => Promise<string | null>;
    showSaveDialog: (options: {
        defaultPath?: string;
        filters?: { name: string; extensions: string[] }[];
    }) => Promise<string | null>;
    writeBuffer: (filePath: string, base64Data: string) => Promise<FileWriteResult>;
    scanFolder: () => Promise<ScanResult>;
    closeVault: () => Promise<FileWriteResult>;
    readFile: (filePath: string) => Promise<FileReadResult>;
    readImage: (filePath: string) => Promise<ImageReadResult>;
    readAudio: (filePath: string) => Promise<AudioReadResult>;
    resolveEmbedPath: (fileName: string, noteDir: string, vaultRoot: string) => Promise<EmbedResolveResult>;
    createFolder: (parentPath: string, folderName: string) => Promise<FolderCreateResult>;
    writeFile: (filePath: string, content: string) => Promise<FileWriteResult>;
    createFile: (folderPath: string, fileName: string) => Promise<FileCreateResult>;
    deleteFile: (filePath: string) => Promise<FileDeleteResult>;
    renameFile: (filePath: string, newFileName: string) => Promise<FileRenameResult>;
    updateEmbedRefs: (
        oldFileName: string,
        newFileName: string,
    ) => Promise<{ success: boolean; updatedCount?: number; error?: IpcErrorCode }>;
    renameFolder: (folderPath: string, newFolderName: string) => Promise<FolderRenameResult>;
    deleteFolder: (folderPath: string) => Promise<FolderDeleteResult>;
    moveFile: (filePath: string, targetFolderPath: string) => Promise<FileMoveResult>;
    moveFolder: (folderPath: string, targetFolderPath: string) => Promise<FolderMoveResult>;
    saveAudioRecording: (folderPath: string, fileName: string, base64Data: string) => Promise<AudioSaveResult>;

    // AI / LLM operations
    aiListModels: () => Promise<AiListModelsResult>;
    aiLoadModel: (modelPath: string) => Promise<AiLoadResult>;
    aiUnloadModel: () => Promise<AiSimpleResult>;
    aiChat: (userMessage: string, noteContext?: string | null) => Promise<AiChatResult>;
    aiStopChat: () => Promise<AiSimpleResult>;
    aiResetChat: () => Promise<AiSimpleResult>;
    aiRestoreChatHistory: (messages: { role: string; content: string }[]) => Promise<AiSimpleResult>;
    aiGetStatus: () => Promise<AiStatus>;
    aiOpenPhyllaDir: () => Promise<AiSimpleResult>;
    systemPromptList: () => Promise<{
        success: boolean;
        prompts: { id: string; name: string; description: string; path: string }[];
        activeId: string;
        promptsDir: string;
        error?: IpcErrorCode;
    }>;
    systemPromptSetActive: (id: string) => Promise<AiSimpleResult>;

    // Theme presets (~/.phylla/themes/*.json)
    themeList: () => Promise<{
        success: boolean;
        themes: {
            id: string;
            name: string;
            description: string;
            colors: Record<string, string>;
            path: string;
        }[];
        activeId: string;
        themesDir: string;
        error?: IpcErrorCode;
    }>;
    themeSetActive: (id: string) => Promise<AiSimpleResult>;
    themeOpenPhyllaDir: () => Promise<AiSimpleResult>;

    // Language files (~/.phylla/locales/*.json)
    languageList: () => Promise<{
        success: boolean;
        languages: {
            id: string;
            name: string;
            path: string;
        }[];
        activeId: string;
        localesDir: string;
        error?: IpcErrorCode;
    }>;
    languageSetActive: (id: string) => Promise<AiSimpleResult>;
    languageLoad: (id: string) => Promise<{
        success: boolean;
        content?: Record<string, unknown>;
        error?: IpcErrorCode;
    }>;
    languageOpenPhyllaDir: () => Promise<AiSimpleResult>;

    onAiToken: (callback: (token: string) => void) => void;
    removeAiTokenListener: () => void;
    onAiThinkingToken: (callback: (token: string) => void) => void;
    removeAiThinkingTokenListener: () => void;

    // Conversation persistence
    conversationList: () => Promise<ConversationListResult>;
    conversationCreate: (modelName: string) => Promise<ConversationCreateResult>;
    conversationLoad: (id: string) => Promise<ConversationLoadResult>;
    conversationSave: (conversation: Conversation) => Promise<AiSimpleResult>;
    conversationAddMessage: (conversationId: string, message: ConversationMessage) => Promise<AiSimpleResult>;
    conversationDelete: (id: string) => Promise<AiSimpleResult>;
    conversationRename: (id: string, newTitle: string) => Promise<AiSimpleResult>;

    // File system watcher
    watchFolder: () => Promise<AiSimpleResult>;
    unwatchFolder: () => Promise<AiSimpleResult>;
    onFsChanged: (callback: (data: { eventType: string; filename: string }) => void) => void;
    removeFsChangedListener: () => void;

    // Clipboard
    writeClipboard: (text: string) => Promise<void>;

    // Bookmarks persistence
    bookmarksLoad: () => Promise<{ success: boolean; bookmarks?: string[]; error?: IpcErrorCode }>;
    bookmarksSave: (bookmarks: string[]) => Promise<{ success: boolean; error?: IpcErrorCode }>;

    // Speech-to-Text (Whisper) operations
    speechInit: () => Promise<SpeechInitResult>;
    speechTranscribe: (audioData: number[]) => Promise<SpeechTranscribeResult>;
    speechGetStatus: () => Promise<SpeechStatus>;
    speechResetSession: () => Promise<SpeechResetSessionResult>;
};

declare global {
    // eslint-disable-next-line @typescript-eslint/consistent-type-definitions -- only an interface merges into the global Window
    interface Window {
        electronAPI: ElectronAPI;
    }
}
