const BaseIntentHandler = require("./baseHandler");

/**
 * Handler for popular_tracks intent (Phase 1)
 * Fetches popular tracks from available data sources
 */
class PopularTracksHandler extends BaseIntentHandler {
    getPhase() {
        return 1; // Phase 1: No parameters needed
    }

    async handle(intent, message, currentPlaylist, dataSources, contextBuilders, phase1Data = null, sessionId = null) {
        console.log("[PopularTracksHandler] Handling Phase 1: Fetching popular tracks...");

        const spotifySource = dataSources.spotify;
        if (!spotifySource || !spotifySource.isAvailable()) {
            console.log("[PopularTracksHandler] Spotify not available");
            return { context: "" };
        }

        // Get user's market if session is provided
        let market = "US";
        if (sessionId) {
            const { getUserCountry } = require("../spotify");
            market = getUserCountry(sessionId);
        }

        try {
            // Always use "popular" playlist (Today's Top Hits) for now
            // "new" playlist will be used for a future intent
            console.log(`[PopularTracksHandler] Fetching popular tracks from Spotify (market: ${market})...`);
            const popularTracks = await spotifySource.getPopularTracks(50, "popular", market);
            
            if (popularTracks.length > 0) {
                const builder = contextBuilders.get("spotify");
                const context = builder ? builder.buildPopularTracksContext(popularTracks, 50) : ""; // Use all 50 tracks
                console.log(`[PopularTracksHandler] Added ${popularTracks.length} popular tracks to context`);
                return { context };
            }
        } catch (error) {
            console.error("[PopularTracksHandler] Error fetching popular tracks:", error);
        }

        return { context: "" };
    }
}

module.exports = PopularTracksHandler;

