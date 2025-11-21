const fs = require("fs").promises;
const path = require("path");
const axios = require("axios");

const SPOTIFY_API_URL = "https://api.spotify.com/v1";
const CACHE_FILE = path.join(__dirname, "../../data/playlist_cache.json");
const CACHE_DIR = path.join(__dirname, "../../data");

// Allowed playlist owners (add more as needed)
const ALLOWED_OWNERS = ["spotify"]; // Add other users: "user2", "user3", etc.

/**
 * Fetch all playlists from a specific user
 */
async function fetchUserPlaylists(userId, accessToken, limit = 50) {
    const allPlaylists = [];
    let offset = 0;
    let hasMore = true;

    while (hasMore) {
        try {
            const response = await axios.get(`${SPOTIFY_API_URL}/users/${userId}/playlists`, {
                headers: { Authorization: `Bearer ${accessToken}` },
                params: { limit, offset },
            });

            const playlists = response.data.items || [];
            allPlaylists.push(...playlists);

            hasMore = response.data.next !== null;
            offset += limit;

            console.log(`[Playlist Cache] Fetched ${playlists.length} playlists from ${userId} (total: ${allPlaylists.length})`);
        } catch (error) {
            console.error(`[Playlist Cache] Error fetching playlists from ${userId}:`, error.response?.status || error.message);
            if (error.response?.status === 404) {
                console.error(`[Playlist Cache] User ${userId} not found or has no public playlists`);
            }
            hasMore = false;
        }
    }

    return allPlaylists;
}

/**
 * Fetch all playlists from all allowed owners
 */
async function fetchAllPlaylists(accessToken) {
    const allPlaylists = [];

    for (const owner of ALLOWED_OWNERS) {
        console.log(`[Playlist Cache] Fetching playlists from ${owner}...`);
        const playlists = await fetchUserPlaylists(owner, accessToken);

        // Transform to our format
        const formattedPlaylists = playlists.map((p) => ({
            id: p.id,
            name: p.name,
            description: p.description || "",
            owner: p.owner.id,
            trackCount: p.tracks?.total || 0,
            image: p.images?.[0]?.url || null,
            externalUrl: p.external_urls?.spotify || null,
        }));

        allPlaylists.push(...formattedPlaylists);
    }

    return allPlaylists;
}

/**
 * Load cached playlists
 */
async function loadCache() {
    try {
        const data = await fs.readFile(CACHE_FILE, "utf8");
        return JSON.parse(data);
    } catch (error) {
        if (error.code === "ENOENT") {
            return { playlists: [], lastCacheUpdate: null };
        }
        throw error;
    }
}

/**
 * Save playlists to cache
 */
async function saveCache(playlists) {
    // Ensure data directory exists
    await fs.mkdir(CACHE_DIR, { recursive: true });

    const cacheData = {
        playlists,
        lastCacheUpdate: new Date().toISOString(),
    };

    await fs.writeFile(CACHE_FILE, JSON.stringify(cacheData, null, 2), "utf8");
    console.log(`[Playlist Cache] Saved ${playlists.length} playlists to cache`);
}

/**
 * Refresh playlist cache
 */
async function refreshCache(accessToken) {
    console.log("[Playlist Cache] Starting cache refresh...");
    const playlists = await fetchAllPlaylists(accessToken);
    await saveCache(playlists);
    console.log(`[Playlist Cache] Cache refresh complete: ${playlists.length} playlists`);
    return playlists;
}

/**
 * Get cached playlists
 */
async function getCachedPlaylists() {
    const cache = await loadCache();
    return cache.playlists || [];
}

/**
 * Check if cache needs refresh (older than 24 hours)
 */
async function needsRefresh() {
    try {
        const cache = await loadCache();
        if (!cache.lastCacheUpdate) return true;

        const lastUpdate = new Date(cache.lastCacheUpdate);
        const now = new Date();
        const hoursSinceUpdate = (now - lastUpdate) / (1000 * 60 * 60);

        return hoursSinceUpdate > 24; // Refresh if older than 24 hours
    } catch (error) {
        return true;
    }
}

/**
 * Search playlists by keywords (flattened array from AI extraction)
 */
function searchPlaylists(playlists, keywords, limit = 3) {
    if (!keywords || keywords.length === 0) {
        return [];
    }

    const scores = new Map();

    playlists.forEach((playlist) => {
        let score = 0;
        const playlistName = playlist.name.toLowerCase();
        const playlistDesc = (playlist.description || "").toLowerCase();

        keywords.forEach((keyword) => {
            const keywordLower = keyword.toLowerCase();
            // Escape special regex characters
            const escapedKeyword = keywordLower.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

            // Word boundary match in name (highest weight)
            const wordBoundaryRegex = new RegExp(`\\b${escapedKeyword}\\b`, "i");
            if (wordBoundaryRegex.test(playlistName)) {
                score += 15;
            }

            // Exact match in name (high weight)
            if (playlistName.includes(keywordLower)) {
                score += 10;
            }

            // Word boundary match in description
            if (wordBoundaryRegex.test(playlistDesc)) {
                score += 8;
            }

            // Exact match in description
            if (playlistDesc.includes(keywordLower)) {
                score += 5;
            }
        });

        if (score > 0) {
            scores.set(playlist, score);
        }
    });

    // Sort by score and return top N
    return Array.from(scores.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, limit)
        .map(([playlist]) => playlist);
}

module.exports = {
    refreshCache,
    getCachedPlaylists,
    needsRefresh,
    searchPlaylists,
    ALLOWED_OWNERS,
};

