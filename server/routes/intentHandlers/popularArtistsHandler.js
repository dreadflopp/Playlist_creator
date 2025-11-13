const BaseIntentHandler = require("./baseHandler");

/**
 * Handler for popular_artists intent
 * Fetches popular artists from available data sources
 */
class PopularArtistsHandler extends BaseIntentHandler {
    async handle(intent, message, currentPlaylist, model, previousResponseId, session_id, dataSources, contextBuilders) {
        console.log("[PopularArtistsHandler] Handling popular artists intent...");

        // Try to get data from available sources
        const spotifySource = dataSources.spotify;
        if (!spotifySource || !spotifySource.isAvailable()) {
            console.log("[PopularArtistsHandler] Spotify not available");
            return { context: "", requiresTwoPhase: false };
        }

        try {
            console.log("[PopularArtistsHandler] Fetching popular artists from Spotify...");
            const popularArtists = await spotifySource.getPopularArtists(30);
            
            if (popularArtists.length > 0) {
                const builder = contextBuilders.get("spotify");
                const context = builder ? builder.buildPopularArtistsContext(popularArtists) : "";
                console.log(`[PopularArtistsHandler] Added ${popularArtists.length} popular artists to context`);
                return { context, requiresTwoPhase: false };
            }
        } catch (error) {
            console.error("[PopularArtistsHandler] Error fetching popular artists:", error);
        }

        return { context: "", requiresTwoPhase: false };
    }
}

module.exports = PopularArtistsHandler;

