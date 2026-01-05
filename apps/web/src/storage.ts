import type { AvatarBaseMap, AvatarFavMap, AvatarTagMap, BodyBase, FavFolder } from "./types";

const API = (window as any).VAM_API_URL || "http://localhost:8787";

type Settings = {
    bodyBases: BodyBase[];
    avatarBaseMap: AvatarBaseMap;
    favFolders: FavFolder[];
    avatarFavMap: AvatarFavMap;
    avatarTags: AvatarTagMap;
    confirmAvatarChange: boolean;
};

let cache: Settings = {
    bodyBases: [],
    avatarBaseMap: {},
    favFolders: [],
    avatarFavMap: {},
    avatarTags: {},
    confirmAvatarChange: false,
};

// Async load from API (called by App.tsx on mount)
export async function fetchSettings() {
    try {
        const res = await fetch(`${API}/settings`);
        if (res.ok) {
            const data = await res.json();
            // Merge with defaults
            cache = { ...cache, ...data };
        }
    } catch (e) {
        console.error("Failed to load settings", e);
    }
    return cache;
}

// Sync save to API (fire and forget or await if needed)
async function pushSettings() {
    try {
        await fetch(`${API}/settings`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(cache),
        });
    } catch (e) {
        console.error("Failed to save settings", e);
    }
}

// Getters (Sync, read from cache)
export function getBodyBases(): BodyBase[] { return cache.bodyBases; }
export function getAvatarBaseMap(): AvatarBaseMap { return cache.avatarBaseMap; }
export function getFavFolders(): FavFolder[] { return cache.favFolders; }
export function getAvatarFavMap(): AvatarFavMap { return cache.avatarFavMap; }
export function getAvatarTags(): AvatarTagMap { return cache.avatarTags; }
export function getConfirmAvatarChange(): boolean { return cache.confirmAvatarChange; }

// Setters (Update cache & push)
export function saveBodyBases(list: BodyBase[]) {
    cache.bodyBases = list;
    pushSettings();
}
export function saveAvatarBaseMap(map: AvatarBaseMap) {
    cache.avatarBaseMap = map;
    pushSettings();
}
export function saveFavFolders(list: FavFolder[]) {
    cache.favFolders = list;
    pushSettings();
}
export function saveAvatarFavMap(map: AvatarFavMap) {
    cache.avatarFavMap = map;
    pushSettings();
}
export function saveAvatarTags(map: AvatarTagMap) {
    cache.avatarTags = map;
    pushSettings();
}
export function saveConfirmAvatarChange(enabled: boolean) {
    cache.confirmAvatarChange = enabled;
    pushSettings();
}

// Backward compatibility (deprecated names in App.tsx imports)
export {
    getBodyBases as loadBodyBases,
    getAvatarBaseMap as loadAvatarBaseMap,
    getFavFolders as loadFavFolders,
    getAvatarFavMap as loadAvatarFavMap,
    getAvatarTags as loadAvatarTags,
    getConfirmAvatarChange as loadConfirmAvatarChange
};
