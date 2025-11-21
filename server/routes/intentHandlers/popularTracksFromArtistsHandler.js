const BaseIntentHandler = require("./baseHandler");
const { extractArtists } = require("../utils/playlistExtractors");

/**
 * Handler for popular_tracks_from_artists intent (Phase 2)
 * Needs artists from Phase 1 playlist result
 */
class PopularTracksFromArtistsHandler extends BaseIntentHandler {
    getPhase() {
        return 2; // Phase 2: Needs artists from Phase 1 playlist
    }

    async handle(intent, message, currentPlaylist, dataSources, contextBuilders, phase1Data = null, sessionId = null) {
        console.log("[PopularTracksFromArtistsHandler] Handling Phase 2: Fetching popular tracks for artists...");

        // Extract artists from Phase 1 playlist
        if (!phase1Data || !phase1Data.playlist || !phase1Data.playlist.songs || phase1Data.playlist.songs.length === 0) {
            console.log("[PopularTracksFromArtistsHandler] No Phase 1 playlist available");
            return { context: "" };
        }

        const artists = extractArtists(phase1Data.playlist.songs);
        console.log(`[PopularTracksFromArtistsHandler] Extracted ${artists.length} unique artists from Phase 1 playlist`);

        if (artists.length === 0) {
            console.log("[PopularTracksFromArtistsHandler] No artists found in Phase 1 playlist");
            return { context: "" };
        }

        const spotifySource = dataSources.spotify;
        if (!spotifySource || !spotifySource.isAvailable()) {
            console.log("[PopularTracksFromArtistsHandler] Spotify not available");
            return { context: "" };
        }

        // Get user's market from sessionId
        let market = "US";
        if (sessionId) {
            const { getUserCountry } = require("../spotify");
            market = getUserCountry(sessionId);
        }

        try {
            console.log(`[PopularTracksFromArtistsHandler] Fetching top tracks for ${artists.length} artists from Spotify (market: ${market})...`);
            const topTracks = await spotifySource.getTopTracksForArtists(artists, 5, market);

            if (topTracks.length > 0) {
                const builder = contextBuilders.get("spotify");
                const context = builder ? builder.buildPopularTracksFromArtistsContext(topTracks) : "";
                console.log(`[PopularTracksFromArtistsHandler] Added ${topTracks.length} popular tracks to context`);
                return { context };
            }
        } catch (error) {
            console.error("[PopularTracksFromArtistsHandler] Error fetching top tracks:", error);
        }

        return { context: "" };
    }
}

module.exports = PopularTracksFromArtistsHandler;
