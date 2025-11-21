const BaseIntentHandler = require("./baseHandler");

/**
 * Handler for popular_artists intent (Phase 1)
 * Fetches popular artists from available data sources
 */
class PopularArtistsHandler extends BaseIntentHandler {
    getPhase() {
        return 1; // Phase 1: No parameters needed
    }

    async handle(intent, message, currentPlaylist, dataSources, contextBuilders, phase1Data = null, sessionId = null) {
        console.log("[PopularArtistsHandler] Handling Phase 1: Fetching popular artists...");

        const spotifySource = dataSources.spotify;
        if (!spotifySource || !spotifySource.isAvailable()) {
            console.log("[PopularArtistsHandler] Spotify not available");
            return { context: "" };
        }

        // Get user's market if session is provided
        let market = "US";
        if (sessionId) {
            const { getUserCountry } = require("../spotify");
            market = getUserCountry(sessionId);
        }

        try {
            console.log(`[PopularArtistsHandler] Fetching popular artists from Spotify (market: ${market})...`);
            const popularArtists = await spotifySource.getPopularArtists(30, market);
            
            if (popularArtists.length > 0) {
                const builder = contextBuilders.get("spotify");
                const context = builder ? builder.buildPopularArtistsContext(popularArtists) : "";
                console.log(`[PopularArtistsHandler] Added ${popularArtists.length} popular artists to context`);
                return { context };
            }
        } catch (error) {
            console.error("[PopularArtistsHandler] Error fetching popular artists:", error);
        }

        return { context: "" };
    }
}

module.exports = PopularArtistsHandler;

