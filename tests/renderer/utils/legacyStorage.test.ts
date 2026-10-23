import { describe, it, expect, beforeEach } from 'vitest';

import { migrateLegacyStorageKeys } from '@/renderer/utils/legacyStorage';

describe('migrateLegacyStorageKeys', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    it('renames leaf-* keys to phylla-*', () => {
        localStorage.setItem('leaf-theme-id', 'light');
        localStorage.setItem('leaf-tabs-/vault', '{"tabs":[]}');
        migrateLegacyStorageKeys(localStorage);
        expect(localStorage.getItem('phylla-theme-id')).toBe('light');
        expect(localStorage.getItem('phylla-tabs-/vault')).toBe('{"tabs":[]}');
        expect(localStorage.getItem('leaf-theme-id')).toBeNull();
        expect(localStorage.getItem('leaf-tabs-/vault')).toBeNull();
    });

    it('keeps an existing phylla-* value and drops the legacy one', () => {
        localStorage.setItem('leaf-theme-id', 'light');
        localStorage.setItem('phylla-theme-id', 'dark');
        migrateLegacyStorageKeys(localStorage);
        expect(localStorage.getItem('phylla-theme-id')).toBe('dark');
        expect(localStorage.getItem('leaf-theme-id')).toBeNull();
    });

    it('leaves unrelated keys alone', () => {
        localStorage.setItem('other', 'x');
        migrateLegacyStorageKeys(localStorage);
        expect(localStorage.getItem('other')).toBe('x');
    });
});
