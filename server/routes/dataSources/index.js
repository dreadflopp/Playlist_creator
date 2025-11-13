const SpotifyDataSource = require("./spotifyDataSource");

/**
 * Data source registry
 * Add new data sources here (e.g., Apple Music, YouTube Music)
 */
const dataSources = {
    spotify: new SpotifyDataSource(),
    // Future: appleMusic: new AppleMusicDataSource(),
    // Future: youtubeMusic: new YouTubeMusicDataSource(),
};

/**
 * Get available data sources
 * @returns {Array<string>} Array of available data source names
 */
function getAvailableSources() {
    return Object.keys(dataSources).filter(name => dataSources[name].isAvailable());
}

/**
 * Get a specific data source
 * @param {string} name - Data source name
 * @returns {BaseDataSource|null} Data source instance or null if not found
 */
function get(name) {
    return dataSources[name] || null;
}

/**
 * Register a new data source
 * @param {string} name - Data source name
 * @param {BaseDataSource} source - Data source instance
 */
function register(name, source) {
    dataSources[name] = source;
}

module.exports = {
    dataSources,
    getAvailableSources,
    get,
    register,
};

