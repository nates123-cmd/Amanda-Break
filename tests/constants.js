// Stable identifiers mirrored from index.html (storage keys, expected shapes).
// These are NOT logic — the logic itself is always exercised live via
// page.evaluate against the real app realm, never re-implemented here.
export const KEY_API = 'apiKey';
export const KEY_BOOKMARKS = 'bookmarks';
export const dismissedKey = (slug) => `dismissed_${slug}`;
export const likedKey = (slug) => `liked_${slug}`;
export const dislikedKey = (slug) => `disliked_${slug}`;

// Home view category order (must match CATEGORIES in index.html).
export const EXPECTED_CATEGORIES = ['Today', 'Science', 'Home', 'Calm'];
