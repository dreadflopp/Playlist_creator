const BaseIntentHandler = require("./baseHandler");

/**
 * Handler for popular_tracks_from_artists intent
 * Uses two-phase approach: generate initial playlist, then refine with popular tracks
 */
class PopularTracksFromArtistsHandler extends BaseIntentHandler {
    requiresTwoPhase() {
        return true;
    }

    async handle(intent, message, currentPlaylist, model, previousResponseId, session_id, dataSources, contextBuilders) {
        console.log("[PopularTracksFromArtistsHandler] Handling popular tracks from artists intent...");
        
        // This handler requires special two-phase processing
        // Return metadata for the main route to handle
        return {
            context: "",
            requiresTwoPhase: true,
            handler: this, // Pass handler reference for two-phase processing
        };
    }

    /**
     * Execute the two-phase approach
     * This is called from the main route handler
     */
    async executeTwoPhase(message, currentPlaylist, model, previousResponseId, session_id, dataSources, contextBuilders, generateInitialPlaylist, refinePlaylistWithPopularTracks, extractUniqueArtists) {
        console.log("[PopularTracksFromArtistsHandler] Starting two-phase playlist generation...");

        let initialPlaylist;
        let artists = [];

        // Check if we already have a playlist - if so, skip Phase 1
        if (currentPlaylist && currentPlaylist.songs && currentPlaylist.songs.length > 0) {
            console.log("[PopularTracksFromArtistsHandler] Using existing playlist, skipping Phase 1");

            // Extract unique artists from existing playlist
            artists = extractUniqueArtists(currentPlaylist.songs);
            console.log(`[PopularTracksFromArtistsHandler] Extracted ${artists.length} unique artists from existing playlist:`, artists);

            // Create a mock initialPlaylist structure from current playlist
            // We only accept structured format: {song, artist}
            initialPlaylist = {
                songs: currentPlaylist.songs.map((s) => {
                    if (!s || typeof s !== "object" || !s.song || !s.artist) {
                        throw new Error(`Invalid song format in popularTracksFromArtistsHandler: expected {song, artist}, got ${JSON.stringify(s)}`);
                    }
                    return { song: s.song, artist: s.artist };
                }),
                reply: "Refining existing playlist with popular tracks",
                response_id: previousResponseId,
            };
        } else {
            // PHASE 1: Generate initial playlist (only if no existing playlist)
            console.log("[PopularTracksFromArtistsHandler] No existing playlist, generating initial playlist (Phase 1)");
            initialPlaylist = await generateInitialPlaylist(message, currentPlaylist, model, previousResponseId, session_id);

            // Extract unique artists from initial playlist
            artists = extractUniqueArtists(initialPlaylist.songs);
            console.log(`[PopularTracksFromArtistsHandler] Extracted ${artists.length} unique artists from initial playlist:`, artists);
        }

        if (artists.length > 0) {
            // Fetch popular tracks for those artists from available sources
            const spotifySource = dataSources.spotify;
            if (spotifySource && spotifySource.isAvailable()) {
                try {
                    console.log(`[PopularTracksFromArtistsHandler] Fetching top tracks for ${artists.length} artists from Spotify...`);
                    const topTracks = await spotifySource.getTopTracksForArtists(artists, 5);

                    if (topTracks.length > 0) {
                        console.log(`[PopularTracksFromArtistsHandler] Fetched ${topTracks.length} popular tracks for ${artists.length} artists`);

                        // PHASE 2: Refine playlist with popular tracks
                        const refinedPlaylist = await refinePlaylistWithPopularTracks(
                            initialPlaylist,
                            topTracks,
                            message,
                            currentPlaylist,
                            model,
                            initialPlaylist.response_id
                        );

                        // Map usage from Responses API structure to standard structure
                        const phase1UsageMapped = initialPlaylist.usage ? {
                            prompt_tokens: initialPlaylist.usage.input_tokens || initialPlaylist.usage.prompt_tokens || 0,
                            completion_tokens: initialPlaylist.usage.output_tokens || initialPlaylist.usage.completion_tokens || 0,
                            cached_tokens: initialPlaylist.usage.input_tokens_details?.cached_tokens || initialPlaylist.usage.cached_tokens || 0,
                            total_tokens: initialPlaylist.usage.total_tokens || 0,
                        } : {};

                        const phase2UsageMapped = refinedPlaylist.usage ? {
                            prompt_tokens: refinedPlaylist.usage.input_tokens || refinedPlaylist.usage.prompt_tokens || 0,
                            completion_tokens: refinedPlaylist.usage.output_tokens || refinedPlaylist.usage.completion_tokens || 0,
                            cached_tokens: refinedPlaylist.usage.input_tokens_details?.cached_tokens || refinedPlaylist.usage.cached_tokens || 0,
                            total_tokens: refinedPlaylist.usage.total_tokens || 0,
                        } : {};

                        return {
                            success: true,
                            playlist: refinedPlaylist,
                            skippedPhase1: currentPlaylist && currentPlaylist.songs && currentPlaylist.songs.length > 0,
                            phase1Usage: phase1UsageMapped,
                            phase2Usage: phase2UsageMapped,
                        };
                    }
                } catch (error) {
                    console.error("[PopularTracksFromArtistsHandler] Error fetching top tracks:", error);
                }
            }
        }

        // Fallback: return Phase 1 result or indicate fallback needed
        const skippedPhase1 = currentPlaylist && currentPlaylist.songs && currentPlaylist.songs.length > 0;
        
        // Map usage if we have Phase 1 result
        const phase1UsageMapped = (!skippedPhase1 && initialPlaylist.usage) ? {
            prompt_tokens: initialPlaylist.usage.input_tokens || initialPlaylist.usage.prompt_tokens || 0,
            completion_tokens: initialPlaylist.usage.output_tokens || initialPlaylist.usage.completion_tokens || 0,
            cached_tokens: initialPlaylist.usage.input_tokens_details?.cached_tokens || initialPlaylist.usage.cached_tokens || 0,
            total_tokens: initialPlaylist.usage.total_tokens || 0,
        } : {};

        return {
            success: false,
            playlist: skippedPhase1 ? null : initialPlaylist,
            skippedPhase1,
            fallbackToNormal: true,
            phase1Usage: phase1UsageMapped,
        };
    }
}

module.exports = PopularTracksFromArtistsHandler;

