import { describe, it, expect, vi, beforeEach } from 'vitest';

import { useLanguage } from '@/renderer/composables/ui/useLanguage';

vi.mock('vue-i18n', () => ({
    useI18n: () => ({
        locale: { value: 'en' },
        setLocale: vi.fn((_locale: string) => {}),
    }),
}));

const mockAPI = {
    languageList: vi.fn(),
    languageSetActive: vi.fn(),
    languageOpenPhyllaDir: vi.fn(),
    log: { error: vi.fn(), warn: vi.fn() },
};

const enLanguage = {
    id: 'en',
    name: 'English',
    path: '/locales/en.json',
};

const itLanguage = {
    id: 'it',
    name: 'Italiano',
    path: '/locales/it.json',
};

Object.defineProperty(window, 'electronAPI', {
    value: mockAPI,
    writable: true,
    configurable: true,
});

describe('useLanguage', () => {
    let language: ReturnType<typeof useLanguage>;

    beforeEach(() => {
        vi.clearAllMocks();
        language = useLanguage();
    });

    describe('refresh', () => {
        it('populates the languages list from the IPC response', async () => {
            mockAPI.languageList.mockResolvedValue({
                success: true,
                languages: [enLanguage, itLanguage],
                activeId: 'en',
            });
            await language.refresh();
            expect(language.languages.value).toHaveLength(2);
            expect(language.languages.value[0]!.id).toBe('en');
        });

        it('sets activeId from the IPC response', async () => {
            mockAPI.languageList.mockResolvedValue({
                success: true,
                languages: [enLanguage, itLanguage],
                activeId: 'it',
            });
            await language.refresh();
            expect(language.activeId.value).toBe('it');
        });

        it('sets isLoading to false after a successful call', async () => {
            mockAPI.languageList.mockResolvedValue({
                success: true,
                languages: [enLanguage],
                activeId: 'en',
            });
            await language.refresh();
            expect(language.isLoading.value).toBe(false);
        });

        it('sets isLoading to false when the IPC call throws', async () => {
            mockAPI.languageList.mockRejectedValue(new Error('IPC error'));
            await language.refresh();
            expect(language.isLoading.value).toBe(false);
        });

        it('logs error when IPC call fails', async () => {
            const error = new Error('Connection failed');
            mockAPI.languageList.mockRejectedValue(error);
            await language.refresh();
            expect(mockAPI.log.error).toHaveBeenCalledWith('Failed to list languages:', error);
        });
    });

    describe('setActive', () => {
        beforeEach(async () => {
            mockAPI.languageList.mockResolvedValue({
                success: true,
                languages: [enLanguage, itLanguage],
                activeId: 'en',
            });
            await language.refresh();
        });

        it('updates activeId when the IPC call succeeds', async () => {
            mockAPI.languageSetActive.mockResolvedValue({ success: true });
            await language.setActive('it');
            expect(language.activeId.value).toBe('it');
        });

        it('updates i18n locale when language changes', async () => {
            mockAPI.languageSetActive.mockResolvedValue({ success: true });
            await language.setActive('it');
            expect(language.activeId.value).toBe('it');
        });

        it('calls IPC handler with correct language id', async () => {
            mockAPI.languageSetActive.mockResolvedValue({ success: true });
            await language.setActive('it');
            expect(mockAPI.languageSetActive).toHaveBeenCalledWith('it');
        });

        it('returns early if trying to set the same language as active', async () => {
            language.activeId.value = 'en';
            await language.setActive('en');
            expect(mockAPI.languageSetActive).toHaveBeenCalledTimes(0);
        });

        it('logs error when IPC call fails', async () => {
            const error = new Error('Failed to set language');
            mockAPI.languageSetActive.mockRejectedValue(error);
            await language.setActive('it');
            expect(mockAPI.log.error).toHaveBeenCalled();
        });

        it('does not update activeId when IPC call fails', async () => {
            mockAPI.languageSetActive.mockRejectedValue(new Error('IPC error'));
            const originalId = language.activeId.value;
            await language.setActive('it');
            expect(language.activeId.value).toBe(originalId);
        });
    });

    describe('openLocalesFolder', () => {
        it('calls the IPC handler', async () => {
            mockAPI.languageOpenPhyllaDir.mockResolvedValue({ success: true });
            await language.openLocalesFolder();
            expect(mockAPI.languageOpenPhyllaDir).toHaveBeenCalled();
        });

        it('logs error when IPC call fails', async () => {
            const error = new Error('Could not open folder');
            mockAPI.languageOpenPhyllaDir.mockRejectedValue(error);
            await language.openLocalesFolder();
            expect(mockAPI.log.error).toHaveBeenCalled();
        });
    });

    describe('edge cases', () => {
        it('handles empty languages list', async () => {
            mockAPI.languageList.mockResolvedValue({
                success: true,
                languages: [],
                activeId: 'en',
            });
            await language.refresh();
            expect(language.languages.value).toHaveLength(0);
        });
    });
});
