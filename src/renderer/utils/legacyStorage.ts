/** Rename pre-rebrand `leaf-*` localStorage keys to `phylla-*`, keeping any value already stored under the new key. */
export function migrateLegacyStorageKeys(storage: Storage): void {
    for (const key of Object.keys(storage)) {
        if (!key.startsWith('leaf-')) continue;
        const renamed = `phylla-${key.slice('leaf-'.length)}`;
        const value = storage.getItem(key);
        if (value !== null && storage.getItem(renamed) === null) storage.setItem(renamed, value);
        storage.removeItem(key);
    }
}
