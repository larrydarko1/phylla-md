/**
 * useListKeyboardNavigation — adds arrow-key and Enter navigation
 * to a filterable list panel.
 */

import { ref, onMounted, onUnmounted, type Ref } from 'vue';

export function useListKeyboardNavigation<T>(
    getList: () => T[],
    callbacks: {
        onSelect: (item: T, index: number) => void;
        onOpen: (item: T, index: number) => void;
        onEscape?: () => void;
    },
    options: {
        /** Wrap around at list boundaries (default: true). Set false to clamp. */
        wrap?: boolean;
        /**
         * Provide this when selection state lives outside the composable (e.g. driven
         * by a parent prop). When omitted, the composable tracks the index internally
         * and exposes it via the returned `selectedIndex` ref.
         */
        getExternalIndex?: () => number;
        /** CSS selector to scrollIntoView after each navigation step. */
        scrollSelector?: string;
        /**
         * Return true to ignore the keyboard event for the given target element.
         * Default: ignores INPUT, TEXTAREA, and contentEditable elements.
         */
        ignoreWhen?: (target: HTMLElement) => boolean;
    } = {},
): { selectedIndex: Ref<number>; resetIndex: () => void } {
    const {
        wrap = true,
        getExternalIndex,
        scrollSelector,
        ignoreWhen = (target): boolean =>
            target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable,
    } = options;

    const selectedIndex = ref(-1);

    function resetIndex(): void {
        selectedIndex.value = -1;
    }

    function getCurrentIndex(): number {
        return getExternalIndex !== undefined ? getExternalIndex() : selectedIndex.value;
    }

    function navigate(direction: 1 | -1): void {
        const list = getList();
        if (list.length === 0) return;
        const current = getCurrentIndex();
        let next: number;
        if (wrap) {
            if (direction === 1) next = current === -1 || current === list.length - 1 ? 0 : current + 1;
            else next = current === -1 || current === 0 ? list.length - 1 : current - 1;
        } else {
            if (direction === 1) next = current < 0 ? 0 : Math.min(current + 1, list.length - 1);
            else next = current < 0 ? 0 : Math.max(current - 1, 0);
        }
        const item = list[next];
        if (item === undefined) return;
        if (getExternalIndex === undefined) selectedIndex.value = next;
        callbacks.onSelect(item, next);
        if (scrollSelector !== undefined) {
            setTimeout((): void => {
                document.querySelector(scrollSelector)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }, 0);
        }
    }

    function handleKeyDown(e: KeyboardEvent): void {
        const target = e.target;
        if (target instanceof HTMLElement && ignoreWhen(target)) return;

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            navigate(1);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            navigate(-1);
        } else if (e.key === 'Enter') {
            const list = getList();
            const idx = getCurrentIndex();
            const item = list[idx];
            if (item !== undefined) {
                e.preventDefault();
                callbacks.onOpen(item, idx);
            }
        } else if (e.key === 'Escape' && callbacks.onEscape !== undefined) {
            callbacks.onEscape();
        }
    }

    onMounted((): void => window.addEventListener('keydown', handleKeyDown));
    onUnmounted((): void => window.removeEventListener('keydown', handleKeyDown));

    return { selectedIndex, resetIndex };
}
