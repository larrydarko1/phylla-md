/** Debounce helpers. */
import { getCurrentScope, onScopeDispose, watch } from 'vue';
import type { WatchSource } from 'vue';

type DebounceOptions = {
    ms?: number;
    maxWait?: number;
};

/**
 * Debounce `fn`: it runs `ms` after the last call. If `maxWait` is set, it also
 * runs at least once every `maxWait` while calls keep coming.
 */
export function useDebounceFn<TArgs extends unknown[]>(
    fn: (...args: TArgs) => void,
    options: DebounceOptions = {},
): ((...args: TArgs) => void) & { cancel: () => void } {
    const { ms = 200 } = options;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let maxTimer: ReturnType<typeof setTimeout> | undefined;
    let lastArgs: TArgs | undefined;

    const clearTimers = (): void => {
        if (timer !== undefined) {
            clearTimeout(timer);
            timer = undefined;
        }
        if (maxTimer !== undefined) {
            clearTimeout(maxTimer);
            maxTimer = undefined;
        }
    };

    const invoke = (): void => {
        clearTimers();
        const args = lastArgs;
        lastArgs = undefined;
        if (args !== undefined) fn(...args);
    };

    const cancel = (): void => {
        clearTimers();
        lastArgs = undefined;
    };

    const debounced = (...args: TArgs): void => {
        lastArgs = args;
        if (timer !== undefined) clearTimeout(timer);
        if (options.maxWait !== undefined && maxTimer === undefined) maxTimer = setTimeout(invoke, options.maxWait);
        timer = setTimeout(invoke, ms);
    };

    if (getCurrentScope() !== undefined) onScopeDispose(cancel);
    return Object.assign(debounced, { cancel });
}

/** Watch `source` and run `cb` debounced; stops with the owning scope. */
export function watchDebounced<T>(
    source: WatchSource<T>,
    cb: (value: T, oldValue: T | undefined) => void,
    options: { debounce?: number; maxWait?: number; immediate?: boolean } = {},
): void {
    const { debounce = 200, maxWait, immediate = false } = options;
    const run = useDebounceFn(cb, { ms: debounce, ...(maxWait === undefined ? {} : { maxWait }) });
    watch(source, (value, oldValue): void => run(value, oldValue), { immediate });
}
