const BaseIntentHandler = require("./baseHandler");

/**
 * Handler for popular_tracks intent
 * Fetches popular tracks from available data sources
 */
class PopularTracksHandler extends BaseIntentHandler {
    async handle(intent, message, currentPlaylist, model, previousResponseId, session_id, dataSources, contextBuilders) {
        console.log("[PopularTracksHandler] Handling popular tracks intent...");

        // Try to get data from available sources
        const availableSources = Object.keys(dataSources).filter(name => dataSources[name].isAvailable());
        
        if (availableSources.length === 0) {
            console.log("[PopularTracksHandler] No data sources available");
            return { context: "", requiresTwoPhase: false };
        }

        // For now, use Spotify (can be extended to aggregate from multiple sources)
        const spotifySource = dataSources.spotify;
        if (!spotifySource || !spotifySource.isAvailable()) {
            console.log("[PopularTracksHandler] Spotify not available");
            return { context: "", requiresTwoPhase: false };
        }

        try {
            console.log("[PopularTracksHandler] Fetching popular tracks from Spotify...");
            const popularTracks = await spotifySource.getPopularTracks(50);
            
            if (popularTracks.length > 0) {
                const builder = contextBuilders.get("spotify");
                const context = builder ? builder.buildPopularTracksContext(popularTracks, 30) : "";
                console.log(`[PopularTracksHandler] Added ${popularTracks.length} popular tracks to context`);
                return { context, requiresTwoPhase: false };
            }
        } catch (error) {
            console.error("[PopularTracksHandler] Error fetching popular tracks:", error);
        }

        return { context: "", requiresTwoPhase: false };
    }
}

module.exports = PopularTracksHandler;

