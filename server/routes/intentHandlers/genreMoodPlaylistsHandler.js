const BaseIntentHandler = require("./baseHandler");
const { extractKeywordsWithAI, flattenKeywords } = require("../utils/keywordExtractor");
const { getCachedPlaylists, needsRefresh, refreshCache, searchPlaylists } = require("../utils/playlistCache");

/**
 * Handler for genre_mood_playlists intent (Phase 1)
 * Finds relevant Spotify playlists based on AI-extracted keywords and fetches tracks
 */
class GenreMoodPlaylistsHandler extends BaseIntentHandler {
    getPhase() {
        return 1; // Phase 1: Can fetch directly
    }

    async handle(intent, message, currentPlaylist, dataSources, contextBuilders, phase1Data = null, sessionId = null) {
        console.log("[GenreMoodPlaylistsHandler] Handling Phase 1: Finding relevant playlists...");

        const spotifySource = dataSources.spotify;
        if (!spotifySource || !spotifySource.isAvailable()) {
            console.log("[GenreMoodPlaylistsHandler] Spotify not available");
            return { context: "" };
        }

        // Get OpenAI instance for keyword extraction
        const { openai: openaiInstance } = require("../openai");
        if (!openaiInstance) {
            console.log("[GenreMoodPlaylistsHandler] OpenAI not available");
            return { context: "" };
        }

        try {
            // Extract keywords using AI (includes synonyms)
            const keywordData = await extractKeywordsWithAI(message, openaiInstance);

            if (keywordData.length === 0) {
                console.log("[GenreMoodPlaylistsHandler] No keywords extracted by AI");
                return { context: "" };
            }

            // Log extracted keywords
            const keywordList = keywordData.map((k) => `${k.keyword} (${k.synonyms.join(", ")})`).join(", ");
            console.log(`[GenreMoodPlaylistsHandler] AI extracted keywords: ${keywordList}`);

            // Flatten keywords and synonyms for searching
            const searchKeywords = flattenKeywords(keywordData);
            console.log(`[GenreMoodPlaylistsHandler] Searching with ${searchKeywords.length} keywords/variations`);

            // Get cached playlists
            let playlists = await getCachedPlaylists();

            // Refresh cache if needed
            if (playlists.length === 0 || (await needsRefresh())) {
                console.log("[GenreMoodPlaylistsHandler] Refreshing playlist cache...");
                const { getSpotifyAccessToken } = require("../spotify");
                const token = await getSpotifyAccessToken();
                playlists = await refreshCache(token);
            }

            // Search for relevant playlists
            const relevantPlaylists = searchPlaylists(playlists, searchKeywords, 3);
            console.log(`[GenreMoodPlaylistsHandler] Found ${relevantPlaylists.length} relevant playlists`);

            if (relevantPlaylists.length === 0) {
                console.log("[GenreMoodPlaylistsHandler] No matching playlists found");
                return { context: "" };
            }

            // Get user's market if session is provided
            let market = "US";
            if (sessionId) {
                const { getUserCountry } = require("../spotify");
                market = getUserCountry(sessionId);
            }

            // Fetch tracks from relevant playlists
            const { getTracksFromPlaylist } = require("../spotify");
            const allTracks = [];

            for (const playlist of relevantPlaylists) {
                try {
                    console.log(`[GenreMoodPlaylistsHandler] Fetching tracks from "${playlist.name}"...`);
                    const tracks = await getTracksFromPlaylist(playlist.id, 20, market);
                    allTracks.push({
                        playlist: playlist.name,
                        description: playlist.description,
                        tracks: tracks,
                    });
                    console.log(`[GenreMoodPlaylistsHandler] Fetched ${tracks.length} tracks from "${playlist.name}"`);
                } catch (error) {
                    console.error(`[GenreMoodPlaylistsHandler] Error fetching tracks from ${playlist.name}:`, error);
                }
            }

            if (allTracks.length > 0) {
                const builder = contextBuilders.get("spotify");
                const context = builder ? builder.buildGenreMoodPlaylistsContext(allTracks) : "";
                console.log(`[GenreMoodPlaylistsHandler] Added ${allTracks.length} playlists with tracks to context`);
                return { context };
            }
        } catch (error) {
            console.error("[GenreMoodPlaylistsHandler] Error:", error);
        }

        return { context: "" };
    }
}

module.exports = GenreMoodPlaylistsHandler;

