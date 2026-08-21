import { defineStore } from 'pinia';
import { ref, watch } from 'vue';

const GUEST_ID_KEY = 'kicker:guestId';
const DISPLAY_NAME_KEY = 'kicker:displayName';

/**
 * crypto.randomUUID() only exists in a secure context (HTTPS, or literally `localhost`) — it's
 * undefined when the app is opened over plain HTTP via a LAN IP or a proxied dev URL, which this
 * project's dev setup does. The guestId isn't security-sensitive (just a client-generated identity
 * key), so a Math.random-based fallback is fine here.
 */
function generateGuestId(): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        const v = c === 'x' ? r : (r & 0x3) | 0x8;
        return v.toString(16);
    });
}

/** guestId is the entire identity model for MVP (PLAN.md §3) — no accounts, just a UUID persisted in localStorage. */
export const useUserStore = defineStore('user', () => {
    const guestId = ref(localStorage.getItem(GUEST_ID_KEY) || generateGuestId());
    const displayName = ref(localStorage.getItem(DISPLAY_NAME_KEY) || '');

    localStorage.setItem(GUEST_ID_KEY, guestId.value);
    watch(displayName, (value) => localStorage.setItem(DISPLAY_NAME_KEY, value));

    function setDisplayName(name: string) {
        displayName.value = name.trim();
    }

    return { guestId, displayName, setDisplayName };
});
