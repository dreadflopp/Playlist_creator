const PopularTracksHandler = require("./popularTracksHandler");
const PopularArtistsHandler = require("./popularArtistsHandler");
const PopularTracksFromArtistsHandler = require("./popularTracksFromArtistsHandler");
const GenreMoodPlaylistsHandler = require("./genreMoodPlaylistsHandler");

/**
 * Intent handler registry
 * Register new intent handlers here
 */
const handlers = new Map([
    ["popular_tracks", new PopularTracksHandler()],
    ["popular_artists", new PopularArtistsHandler()],
    ["popular_tracks_from_artists", new PopularTracksFromArtistsHandler()],
    ["genre_mood_playlists", new GenreMoodPlaylistsHandler()],
]);

/**
 * Get handler for a specific intent type
 * @param {string} intentType - Intent type
 * @returns {BaseIntentHandler|null} Handler instance or null if not found
 */
function get(intentType) {
    return handlers.get(intentType) || null;
}

/**
 * Register a new intent handler
 * @param {string} intentType - Intent type
 * @param {BaseIntentHandler} handler - Handler instance
 */
function register(intentType, handler) {
    handlers.set(intentType, handler);
}

/**
 * Get all registered intent types
 * @returns {Array<string>} Array of intent type strings
 */
function getRegisteredIntents() {
    return Array.from(handlers.keys());
}

module.exports = {
    get,
    register,
    getRegisteredIntents,
};

