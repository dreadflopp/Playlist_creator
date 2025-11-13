/**
 * Builds context strings for Spotify data
 */
class SpotifyContextBuilder {
    /**
     * Build context for popular tracks
     * @param {Array} tracks - Array of track objects
     * @param {number} maxTracks - Maximum number of tracks to include
     * @returns {string} Context string
     */
    buildPopularTracksContext(tracks, maxTracks = 30) {
        if (!tracks || tracks.length === 0) {
            return "";
        }

        const tracksList = tracks
            .slice(0, maxTracks)
            .map((track, i) => `${i + 1}. ${track.name} - ${track.artist}`)
            .join("\n");

        let context = `\n\nCURRENT POPULAR TRACKS ON SPOTIFY (fetched from Spotify):\n${tracksList}\n\n`;
        context += `The user wants popular/trending tracks. The tracks listed above were automatically fetched from Spotify's API. `;
        context += `Use this list as reference for what's currently popular on Spotify. `;
        context += `Prioritize songs from this list, but you can also suggest other relevant popular songs. `;
        context += `When explaining your playlist, mention that you used popular tracks from Spotify, not that the user provided them.`;

        return context;
    }

    /**
     * Build context for popular artists
     * @param {Array} artists - Array of artist objects
     * @returns {string} Context string
     */
    buildPopularArtistsContext(artists) {
        if (!artists || artists.length === 0) {
            return "";
        }

        const artistsList = artists.map((artist, i) => `${i + 1}. ${artist.name}`).join("\n");

        let context = `\n\nCURRENT POPULAR ARTISTS ON SPOTIFY (fetched from Spotify):\n${artistsList}\n\n`;
        context += `The user wants popular artists. The artists listed above were automatically fetched from Spotify's API. `;
        context += `Use this list to create a playlist with popular artists from Spotify. `;
        context += `You can suggest songs from these artists or similar popular artists. `;
        context += `When explaining your playlist, mention that you used popular artists from Spotify, not that the user provided them.`;

        return context;
    }

    /**
     * Build context for popular tracks from specific artists
     * @param {Array} tracks - Array of track objects grouped by artist
     * @returns {string} Context string
     */
    buildPopularTracksFromArtistsContext(tracks) {
        if (!tracks || tracks.length === 0) {
            return "";
        }

        // Group tracks by artist
        const tracksByArtist = {};
        tracks.forEach((track) => {
            const artist = track.artist.split(",")[0].trim(); // Primary artist
            if (!tracksByArtist[artist]) {
                tracksByArtist[artist] = [];
            }
            tracksByArtist[artist].push(track);
        });

        let tracksList = "";
        Object.keys(tracksByArtist).forEach((artist) => {
            tracksList += `\n${artist}:\n`;
            tracksByArtist[artist].forEach((track, i) => {
                tracksList += `  ${i + 1}. ${track.name}\n`;
            });
        });

        let context = `\n\nPOPULAR TRACKS FROM ARTISTS IN THE PLAYLIST (fetched from Spotify):\n${tracksList}\n\n`;
        context += `The user wants popular tracks from the artists in their playlist. `;
        context += `The popular tracks listed above were automatically fetched from Spotify's API based on the artists in the playlist. `;
        context += `You have an initial playlist below. Please refine it by replacing songs with more popular tracks from the same artists when available. `;
        context += `Keep the same artists but prioritize their most popular songs from Spotify. `;
        context += `Maintain the playlist's overall theme and mood while using the popular tracks from Spotify. `;
        context += `When explaining your changes, mention that you used popular tracks from Spotify, not that the user provided them. For example, say "from Spotify" or "from Spotify's popularity data" rather than "you provided" or "the lists you provided".`;

        return context;
    }
}

module.exports = SpotifyContextBuilder;

