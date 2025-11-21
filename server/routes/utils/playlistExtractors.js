/**
 * Utility functions for extracting data from playlists
 */

/**
 * Extract unique artists from a playlist
 * @param {Array} songs - Array of song objects with {song, artist} structure
 * @returns {Array<string>} Array of unique artist names
 */
function extractArtists(songs) {
    if (!songs || !Array.isArray(songs)) {
        return [];
    }

    const artists = new Set();
    songs.forEach((song) => {
        // Only accept structured format: {song: "...", artist: "..."}
        if (!song || typeof song !== "object" || !song.artist) {
            throw new Error(`Invalid song format in extractArtists: expected {song, artist}, got ${JSON.stringify(song)}`);
        }
        const artist = song.artist.trim();
        if (artist) {
            artists.add(artist);
        }
    });
    return Array.from(artists);
}

/**
 * Extract unique genres from a playlist (for future use)
 * @param {Array} songs - Array of song objects
 * @returns {Array<string>} Array of unique genre names
 */
function extractGenres(songs) {
    // TODO: Implement when genre data is available
    return [];
}

module.exports = {
    extractArtists,
    extractGenres,
};

