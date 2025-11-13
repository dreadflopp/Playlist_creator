/**
 * Validates and filters songs from OpenAI response
 * @param {Object} parsedResponse - Parsed JSON response from OpenAI
 * @returns {Array<Object>} Array of validated song objects with song and artist properties
 */
function validateAndFilterSongs(parsedResponse) {
    // Validate response structure
    if (!parsedResponse.songs || !Array.isArray(parsedResponse.songs)) {
        throw new Error("Invalid response: songs must be an array");
    }

    // Validate and filter songs, return as objects
    const songs = parsedResponse.songs
        .filter((song) => song && song.song && song.artist && typeof song.song === "string" && typeof song.artist === "string")
        .map((song) => ({
            song: song.song.trim(),
            artist: song.artist.trim(),
        }))
        .filter((song) => song.song.length > 0 && song.artist.length > 0);

    return songs;
}

module.exports = { validateAndFilterSongs };
