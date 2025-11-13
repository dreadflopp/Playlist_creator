/**
 * Abstract base class for data sources
 * All data sources must implement these methods
 */
class BaseDataSource {
    constructor(name) {
        this.name = name;
    }

    /**
     * Get popular/trending tracks
     * @param {number} limit - Maximum number of tracks to return
     * @returns {Promise<Array>} Array of track objects with name and artist
     */
    async getPopularTracks(limit) {
        throw new Error("getPopularTracks() must be implemented by subclass");
    }

    /**
     * Get popular artists
     * @param {number} limit - Maximum number of artists to return
     * @returns {Promise<Array>} Array of artist objects with name
     */
    async getPopularArtists(limit) {
        throw new Error("getPopularArtists() must be implemented by subclass");
    }

    /**
     * Get top tracks for specific artists
     * @param {Array<string>} artists - Array of artist names
     * @param {number} perArtist - Number of top tracks per artist
     * @returns {Promise<Array>} Array of track objects with name, artist, and source info
     */
    async getTopTracksForArtists(artists, perArtist) {
        throw new Error("getTopTracksForArtists() must be implemented by subclass");
    }

    /**
     * Check if this data source is available/configured
     * @returns {boolean}
     */
    isAvailable() {
        throw new Error("isAvailable() must be implemented by subclass");
    }
}

module.exports = BaseDataSource;

