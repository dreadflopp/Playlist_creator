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
        context += `Use this list as INSPIRATION for what's currently popular on Spotify. `;
        context += `You can prioritize songs from this list, but you're also free to suggest other relevant popular songs that aren't on this list. `;
        context += `The list is meant to guide you, not restrict you. `;
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
        context += `Use this list as INSPIRATION for creating a playlist. `;
        context += `You are free to choose songs from these artists, similar popular artists, or other relevant tracks that fit the user's request. `;
        context += `The list is meant to guide you, not restrict you. `;
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
        context += `You have an initial playlist below. Use these popular tracks as INSPIRATION when refining the playlist. `;
        context += `You can replace songs with more popular tracks from the same artists, but you're also free to keep existing songs or choose other tracks that better fit the playlist's theme. `;
        context += `The list is meant to guide you, not restrict you. `;
        context += `Maintain the playlist's overall theme and mood while using the popular tracks from Spotify. `;
        context += `When explaining your changes, mention that you used popular tracks from Spotify, not that the user provided them. For example, say "from Spotify" or "from Spotify's popularity data" rather than "you provided" or "the lists you provided".`;

        return context;
    }

    /**
     * Build context for genre/mood playlists
     * @param {Array} playlistData - Array of objects with playlist, description, and tracks
     * @returns {string} Context string
     */
    buildGenreMoodPlaylistsContext(playlistData) {
        if (!playlistData || playlistData.length === 0) {
            return "";
        }

        let context = `\n\nRELEVANT SPOTIFY PLAYLISTS (fetched from Spotify based on your request):\n\n`;

        playlistData.forEach(({ playlist, description, tracks }) => {
            context += `Playlist: "${playlist}"\n`;
            if (description) {
                context += `Description: ${description}\n`;
            }
            context += `Tracks (${tracks.length}):\n`;
            tracks.slice(0, 20).forEach((track, i) => {
                context += `  ${i + 1}. ${track.name} - ${track.artist}\n`;
            });
            context += `\n`;
        });

        context += `These playlists were automatically found from Spotify based on keywords in your request. `;
        context += `Use them as INSPIRATION when creating your playlist. `;
        context += `You can prioritize songs from these playlists, but you're also free to choose other tracks that better fit the user's request. `;
        context += `The playlists are meant to guide you, not restrict you. `;
        context += `If these playlists don't seem relevant, feel free to ignore them and create the playlist based on your understanding of the user's request. `;
        context += `When explaining your playlist, mention that you used relevant playlists from Spotify as inspiration, not that the user provided them.`;

        return context;
    }
}

module.exports = SpotifyContextBuilder;

