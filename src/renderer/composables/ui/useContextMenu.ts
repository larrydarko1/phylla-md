/**
 * useContextMenu — positions a context menu within viewport bounds
 * and manages click-outside dismissal.
 */

import { ref, watch, nextTick, onUnmounted, type Ref, type ShallowRef } from 'vue';

export function useContextMenu(
    menuRef: Readonly<ShallowRef<HTMLElement | null>>,
    getVisible: () => boolean,
    getPosition: () => { x: number; y: number },
    onClose: () => void,
): {
    adjustedPosition: Ref<{ x: number; y: number }>;
} {
    const adjustedPosition = ref({ x: 0, y: 0 });

    function handleClickOutside(event: MouseEvent): void {
        if (menuRef.value !== null && !(event.target instanceof Node && menuRef.value.contains(event.target))) {
            onClose();
        }
    }

    function handleEscape(event: KeyboardEvent): void {
        if (event.key === 'Escape') onClose();
    }

    function removeListeners(): void {
        document.removeEventListener('click', handleClickOutside);
        document.removeEventListener('contextmenu', handleClickOutside);
        document.removeEventListener('keydown', handleEscape);
    }

    watch(getVisible, (visible): void => {
        if (visible) {
            adjustedPosition.value = { ...getPosition() };
            void nextTick((): void => {
                if (menuRef.value !== null) {
                    const rect = menuRef.value.getBoundingClientRect();
                    let { x, y } = getPosition();
                    if (y + rect.height > window.innerHeight) y = Math.max(0, window.innerHeight - rect.height - 4);
                    if (x + rect.width > window.innerWidth) x = Math.max(0, window.innerWidth - rect.width - 4);
                    adjustedPosition.value = { x, y };
                }
            });
            setTimeout((): void => {
                document.addEventListener('click', handleClickOutside);
                document.addEventListener('contextmenu', handleClickOutside);
                document.addEventListener('keydown', handleEscape);
            }, 0);
        } else {
            removeListeners();
        }
    });

    onUnmounted(removeListeners);

    return { adjustedPosition };
}
