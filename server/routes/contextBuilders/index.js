const SpotifyContextBuilder = require("./spotifyContextBuilder");

/**
 * Context builder registry
 * Add new context builders here for different data sources
 */
const contextBuilders = {
    spotify: new SpotifyContextBuilder(),
    // Future: appleMusic: new AppleMusicContextBuilder(),
    // Future: youtubeMusic: new YouTubeMusicContextBuilder(),
};

/**
 * Get a context builder for a specific data source
 * @param {string} sourceName - Data source name
 * @returns {Object|null} Context builder instance or null if not found
 */
function get(sourceName) {
    return contextBuilders[sourceName] || null;
}

/**
 * Register a new context builder
 * @param {string} name - Context builder name
 * @param {Object} builder - Context builder instance
 */
function register(name, builder) {
    contextBuilders[name] = builder;
}

module.exports = {
    get,
    register,
};

