const express = require("express");
const router = express.Router();
const { OpenAI } = require("openai");

// Initialize OpenAI client - API key is required
let openai = null;
if (process.env.OPENAI_API_KEY) {
    openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    console.log("OpenAI API initialized with API key");
} else {
    console.error("ERROR: OPENAI_API_KEY not found in environment variables");
}

// In-memory store for conversation state (response IDs)
// In production, you might want to use Redis or a database
// Key: sessionId or userId, Value: last response_id
const conversationState = new Map();

// JSON Schema for structured output
const playlistResponseSchema = {
    type: "object",
    properties: {
        reply: {
            type: "string",
            description: "A friendly message explaining the playlist theme or mood",
        },
        songs: {
            type: "array",
            description: "Array of songs for the playlist",
            items: {
                type: "object",
                properties: {
                    song: {
                        type: "string",
                        description: "The name of the song",
                    },
                    artist: {
                        type: "string",
                        description: "The name of the artist who performs the song",
                    },
                },
                required: ["song", "artist"],
                additionalProperties: false,
            },
            minItems: 1,
            maxItems: 20, // Allow more songs for editing scenarios
        },
    },
    required: ["reply", "songs"],
    additionalProperties: false,
};

// Intent detection schema for analyzing user prompts
const intentDetectionSchema = {
    type: "object",
    properties: {
        intentType: {
            type: "string",
            enum: ["popular_tracks", "popular_artists", "popular_tracks_from_artists", "none"],
            description: "The type of intent: general popular tracks, popular artists list, or popular tracks from specific artists",
        },
        confidence: {
            type: "number",
            minimum: 0,
            maximum: 1,
            description: "Confidence level in the intent detection",
        },
    },
    required: ["intentType", "confidence"],
    additionalProperties: false,
};

// Artist extraction schema for determining which artists to get popular tracks from
const artistExtractionSchema = {
    type: "object",
    properties: {
        artists: {
            type: "array",
            items: { type: "string" },
            description: "List of artist names to get popular tracks from",
        },
        source: {
            type: "string",
            enum: ["playlist", "message", "both"],
            description: "Where the artists were identified from",
        },
    },
    required: ["artists", "source"],
    additionalProperties: false,
};

// Function to detect if user wants popular tracks/artists
async function detectPopularIntent(message, currentPlaylist, recentMessages = []) {
    if (!openai) return { intentType: "none", confidence: 0 };

    try {
        let context = message;

        // Add conversation history if available
        if (recentMessages && recentMessages.length > 0) {
            const conversationHistory = recentMessages.map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`).join("\n");
            context = `Previous conversation:\n${conversationHistory}\n\nCurrent message: ${context}`;
        }

        if (currentPlaylist && currentPlaylist.songs && currentPlaylist.songs.length > 0) {
            const playlistInfo = currentPlaylist.songs
                .map((s) => {
                    if (typeof s === "string") return s;
                    return s.name;
                })
                .join(", ");
            context += `\n\nCurrent playlist: ${playlistInfo}`;
        }

        const response = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                {
                    role: "system",
                    content: `Analyze if the user explicitly wants: 1) general popular/trending tracks (e.g., "popular songs", "trending tracks", "what's hot"), 2) a list of popular artists (e.g., "popular artists", "top artists"), or 3) popular tracks from specific artists (e.g., "popular songs by X", "hit tracks from X", "top songs by X", "most popular tracks from X").

IMPORTANT: Only detect intent if the user EXPLICITLY mentions wanting "popular", "trending", "hit", "top", "best", "most popular", or similar terms. Simply mentioning an artist name or asking for a playlist does NOT mean they want popular tracks. 

Examples:
- "create a metallica playlist" → intentType: "none" (no mention of popular/trending)
- "popular metallica songs" → intentType: "popular_tracks_from_artists" (explicitly mentions "popular")
- "metallica hits" → intentType: "popular_tracks_from_artists" (explicitly mentions "hits")
- "top songs by metallica" → intentType: "popular_tracks_from_artists" (explicitly mentions "top")
- "metallica playlist with master of puppets" → intentType: "none" (no mention of popular/trending)

Consider the conversation history context when determining intent. Respond with intent type and confidence.`,
                },
                {
                    role: "user",
                    content: context,
                },
            ],
            response_format: {
                type: "json_schema",
                json_schema: {
                    name: "intent_detection",
                    schema: intentDetectionSchema,
                },
            },
            temperature: 0.3,
            max_tokens: 100,
        });

        const content = response.choices[0].message.content;
        return JSON.parse(content);
    } catch (error) {
        console.error("[Intent Detection Error]", error);
        return { intentType: "none", confidence: 0 };
    }
}

// Helper function to extract unique artists from a playlist
function extractUniqueArtists(songs) {
    const artists = new Set();
    songs.forEach((song) => {
        const songStr = typeof song === "string" ? song : song.name;
        const parts = songStr.split(" - ");
        if (parts.length > 1) {
            const artist = parts.slice(1).join(" - ").trim();
            if (artist) {
                artists.add(artist);
            }
        }
    });
    return Array.from(artists);
}

// Helper function to generate initial playlist (Phase 1)
async function generateInitialPlaylist(message, currentPlaylist, model, previousResponseId, session_id) {
    // Build system prompt without popular tracks context
    let systemPrompt = `You are a helpful AI assistant that creates and edits music playlists. `;

    if (currentPlaylist && currentPlaylist.songs && currentPlaylist.songs.length > 0) {
        const songList = currentPlaylist.songs.map((s, i) => `${i + 1}. ${s}`).join("\n");
        systemPrompt += `\n\nCURRENT PLAYLIST:\n${songList}\n\n`;
        systemPrompt += `The user may ask you to:\n`;
        systemPrompt += `- Add new songs to the existing playlist\n`;
        systemPrompt += `- Remove specific songs from the playlist\n`;
        systemPrompt += `- Replace the entire playlist with new songs\n`;
        systemPrompt += `- Modify the playlist based on their request\n\n`;
        systemPrompt += `If the user asks you to modify the playlist, the probably wants to remove existing songs and add new ones, unless they state that songs should be added or similar.`;
        systemPrompt += `When editing, return the COMPLETE updated playlist (including any songs you're keeping from the current playlist plus any new ones you're adding).`;
    } else {
        systemPrompt += `When a user asks for a playlist, provide a friendly response and suggest songs that match their request. If the user don't specify how many songs they want, suggest 10 songs.`;
    }

    systemPrompt += `\n\nReturn the response as structured JSON with a reply message and an array of songs, where each song has a "song" and "artist" property.`;
    systemPrompt += `\n\nExplain your thinking process in a friendly and engaging manner.`;

    const inputText = `${systemPrompt}\n\nUser: ${message}`;

    const validModels = ["gpt-4o", "gpt-5-mini", "gpt-5"];
    const modelToUse = validModels.includes(model) ? model : "gpt-4o";

    const requestParams = {
        model: modelToUse,
        input: inputText,
        store: true,
        text: {
            format: {
                type: "json_schema",
                name: "playlist_response",
                schema: playlistResponseSchema,
            },
            // GPT-4o only supports "medium", GPT-5 models support "low"
            verbosity: modelToUse === "gpt-4o" ? "medium" : "low",
        },
    };

    // Only add reasoning.effort for GPT-5 models (not supported by GPT-4o)
    if (modelToUse === "gpt-5" || modelToUse === "gpt-5-mini") {
        requestParams.reasoning = {
            effort: "high",
        };
    }

    if (previousResponseId) {
        requestParams.previous_response_id = previousResponseId;
    }

    console.log("[Phase 1] Generating initial playlist...");
    const completion = await openai.responses.create(requestParams);

    const content = completion.output_text || completion.text?.output_text || completion.choices?.[0]?.message?.content || completion.content || completion.message?.content;

    if (!content || (typeof content === "string" && content.trim() === "")) {
        throw new Error("Empty response from OpenAI Responses API");
    }

    let parsedResponse;
    if (typeof content === "string") {
        parsedResponse = JSON.parse(content);
    } else if (typeof content === "object") {
        parsedResponse = content;
    } else {
        throw new Error(`Unexpected content type: ${typeof content}`);
    }

    // Convert song objects to "Song - Artist" format
    const songs = parsedResponse.songs.map((song) => `${song.song} - ${song.artist}`);

    console.log(`[Phase 1] Generated initial playlist with ${songs.length} songs`);

    // Extract usage information
    const usage = completion.usage || {};
    const inputTokens = usage.input_tokens || 0;
    const outputTokens = usage.output_tokens || 0;
    const totalTokens = usage.total_tokens || 0;
    const cachedTokens = usage.input_tokens_details?.cached_tokens || 0;
    const reasoningTokens = usage.output_tokens_details?.reasoning_tokens || 0;

    return {
        reply: parsedResponse.reply,
        songs: songs,
        response_id: completion.id,
        parsedResponse: parsedResponse, // Keep original for refinement
        usage: {
            prompt_tokens: inputTokens,
            completion_tokens: outputTokens,
            total_tokens: totalTokens,
            cached_tokens: cachedTokens,
            reasoning_tokens: reasoningTokens,
        },
    };
}

// Helper function to refine playlist with popular tracks (Phase 2)
async function refinePlaylistWithPopularTracks(initialPlaylist, popularTracks, message, currentPlaylist, model, previousResponseId) {
    // Build system prompt with popular tracks context
    let systemPrompt = `You are a helpful AI assistant that creates and edits music playlists. `;

    // Add popular tracks context
    if (popularTracks.length > 0) {
        const tracksByArtist = {};
        popularTracks.forEach((track) => {
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

        systemPrompt += `\n\nPOPULAR TRACKS FROM ARTISTS IN THE PLAYLIST (fetched from Spotify):\n${tracksList}\n\n`;
        systemPrompt += `The user wants popular tracks from the artists in their playlist. `;
        systemPrompt += `The popular tracks listed above were automatically fetched from Spotify's API based on the artists in the playlist. `;
        systemPrompt += `You have an initial playlist below. Please refine it by replacing songs with more popular tracks from the same artists when available. `;
        systemPrompt += `Keep the same artists but prioritize their most popular songs from Spotify. `;
        systemPrompt += `Maintain the playlist's overall theme and mood while using the popular tracks from Spotify. `;
        systemPrompt += `When explaining your changes, mention that you used popular tracks from Spotify, not that the user provided them. For example, say "from Spotify" or "from Spotify's popularity data" rather than "you provided" or "the lists you provided".`;
    }

    // Add initial playlist context
    if (initialPlaylist.songs && initialPlaylist.songs.length > 0) {
        const songList = initialPlaylist.songs.map((s, i) => `${i + 1}. ${s}`).join("\n");
        systemPrompt += `\n\nINITIAL PLAYLIST (to refine):\n${songList}\n\n`;
    }

    // Add current playlist if exists (for editing scenarios)
    if (currentPlaylist && currentPlaylist.songs && currentPlaylist.songs.length > 0) {
        const songList = currentPlaylist.songs.map((s, i) => `${i + 1}. ${s}`).join("\n");
        systemPrompt += `\n\nCURRENT PLAYLIST:\n${songList}\n\n`;
    }

    systemPrompt += `\n\nReturn the response as structured JSON with a reply message and an array of songs, where each song has a "song" and "artist" property.`;
    systemPrompt += `\n\nReturn the COMPLETE refined playlist. Explain what changes you made and why.`;

    const inputText = `${systemPrompt}\n\nUser: ${message}`;

    const validModels = ["gpt-4o", "gpt-5-mini", "gpt-5"];
    const modelToUse = validModels.includes(model) ? model : "gpt-4o";

    const requestParams = {
        model: modelToUse,
        input: inputText,
        store: true,
        text: {
            format: {
                type: "json_schema",
                name: "playlist_response",
                schema: playlistResponseSchema,
            },
            // GPT-4o only supports "medium", GPT-5 models support "low"
            verbosity: modelToUse === "gpt-4o" ? "medium" : "low",
        },
    };

    // Only add reasoning.effort for GPT-5 models (not supported by GPT-4o)
    if (modelToUse === "gpt-5" || modelToUse === "gpt-5-mini") {
        requestParams.reasoning = {
            effort: "high",
        };
    }

    // Use the previous response ID from Phase 1 for continuity
    if (previousResponseId) {
        requestParams.previous_response_id = previousResponseId;
    }

    console.log("[Phase 2] Refining playlist with popular tracks...");
    const completion = await openai.responses.create(requestParams);

    const content = completion.output_text || completion.text?.output_text || completion.choices?.[0]?.message?.content || completion.content || completion.message?.content;

    if (!content || (typeof content === "string" && content.trim() === "")) {
        throw new Error("Empty response from OpenAI Responses API");
    }

    let parsedResponse;
    if (typeof content === "string") {
        parsedResponse = JSON.parse(content);
    } else if (typeof content === "object") {
        parsedResponse = content;
    } else {
        throw new Error(`Unexpected content type: ${typeof content}`);
    }

    // Convert song objects to "Song - Artist" format
    const songs = parsedResponse.songs.map((song) => `${song.song} - ${song.artist}`);

    console.log(`[Phase 2] Refined playlist with ${songs.length} songs`);

    // Extract usage information
    const usage = completion.usage || {};
    const inputTokens = usage.input_tokens || 0;
    const outputTokens = usage.output_tokens || 0;
    const totalTokens = usage.total_tokens || 0;
    const cachedTokens = usage.input_tokens_details?.cached_tokens || 0;
    const reasoningTokens = usage.output_tokens_details?.reasoning_tokens || 0;

    return {
        reply: parsedResponse.reply,
        songs: songs,
        response_id: completion.id,
        usage: {
            prompt_tokens: inputTokens,
            completion_tokens: outputTokens,
            total_tokens: totalTokens,
            cached_tokens: cachedTokens,
            reasoning_tokens: reasoningTokens,
        },
    };
}

// Function to extract artists for popular tracks (deprecated - kept for backwards compatibility)
async function extractArtistsForPopularTracks(message, currentPlaylist) {
    if (!openai) return { artists: [], source: "none" };

    try {
        let context = `User message: ${message}\n\n`;

        // Extract artists from current playlist
        const playlistArtists = [];
        if (currentPlaylist && currentPlaylist.songs) {
            currentPlaylist.songs.forEach((song) => {
                const songStr = typeof song === "string" ? song : song.name;
                const parts = songStr.split(" - ");
                if (parts.length > 1) {
                    const artist = parts.slice(1).join(" - ").trim();
                    if (artist && !playlistArtists.includes(artist)) {
                        playlistArtists.push(artist);
                    }
                }
            });
        }

        if (playlistArtists.length > 0) {
            context += `Artists in current playlist: ${playlistArtists.join(", ")}\n\n`;
        }

        context += `Extract which artists the user wants popular tracks from. Include artists from the playlist if relevant, or artists mentioned in the message.`;

        const response = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                {
                    role: "system",
                    content: "Extract artist names that the user wants popular tracks from. Return a JSON object with artist names array and source (playlist/message/both).",
                },
                {
                    role: "user",
                    content: context,
                },
            ],
            response_format: {
                type: "json_schema",
                json_schema: {
                    name: "artist_extraction",
                    schema: artistExtractionSchema,
                },
            },
            temperature: 0.3,
            max_tokens: 200,
        });

        const content = response.choices[0].message.content;
        return JSON.parse(content);
    } catch (error) {
        console.error("[Artist Extraction Error]", error);
        // Fallback: extract from playlist if available
        const playlistArtists = [];
        if (currentPlaylist && currentPlaylist.songs) {
            currentPlaylist.songs.forEach((song) => {
                const songStr = typeof song === "string" ? song : song.name;
                const parts = songStr.split(" - ");
                if (parts.length > 1) {
                    const artist = parts.slice(1).join(" - ").trim();
                    if (artist && !playlistArtists.includes(artist)) {
                        playlistArtists.push(artist);
                    }
                }
            });
        }
        return { artists: playlistArtists, source: "playlist" };
    }
}

router.post("/chat", async (req, res) => {
    const { message, currentPlaylist = null, model = "gpt-4o", previous_response_id = null, session_id = null, recentMessages = [] } = req.body;

    // Validate input
    if (!message || typeof message !== "string") {
        return res.status(400).json({ error: "Message is required" });
    }

    // Check if OpenAI is configured
    if (!openai) {
        return res.status(500).json({
            error: "OpenAI API is not configured. Please set OPENAI_API_KEY in your environment variables.",
        });
    }

    try {
        // Get previous response ID from either the request or stored state
        let previousResponseId = previous_response_id;
        if (!previousResponseId && session_id) {
            previousResponseId = conversationState.get(session_id);
        }

        // STEP 1: Detect intent for popular tracks/artists
        console.log("[Intent Detection] Analyzing user message...");
        console.log(`[Intent Detection] Recent messages: ${recentMessages?.length || 0} messages`);
        const intent = await detectPopularIntent(message, currentPlaylist, recentMessages);
        console.log("[Intent Detection] Result:", intent);

        let spotifyContext = "";

        // STEP 2: Handle different intent types and fetch Spotify data if needed
        if (intent.intentType !== "none" && intent.confidence > 0.5) {
            const { getPopularTracks, getPopularArtists, getTopTracksForArtists } = require("./spotify");

            if (intent.intentType === "popular_tracks") {
                // Get general popular tracks
                console.log("[Spotify] Fetching popular tracks...");
                const popularTracks = await getPopularTracks(50);
                if (popularTracks.length > 0) {
                    const tracksList = popularTracks
                        .slice(0, 30)
                        .map((track, i) => `${i + 1}. ${track.name} - ${track.artist}`)
                        .join("\n");

                    spotifyContext = `\n\nCURRENT POPULAR TRACKS ON SPOTIFY (fetched from Spotify):\n${tracksList}\n\n`;
                    spotifyContext += `The user wants popular/trending tracks. The tracks listed above were automatically fetched from Spotify's API. `;
                    spotifyContext += `Use this list as reference for what's currently popular on Spotify. `;
                    spotifyContext += `Prioritize songs from this list, but you can also suggest other relevant popular songs. `;
                    spotifyContext += `When explaining your playlist, mention that you used popular tracks from Spotify, not that the user provided them.`;
                    console.log(`[Spotify] Added ${popularTracks.length} popular tracks to context`);
                }
            } else if (intent.intentType === "popular_artists") {
                // Get popular artists list
                console.log("[Spotify] Fetching popular artists...");
                const popularArtists = await getPopularArtists(30);
                if (popularArtists.length > 0) {
                    const artistsList = popularArtists.map((artist, i) => `${i + 1}. ${artist.name}`).join("\n");

                    spotifyContext = `\n\nCURRENT POPULAR ARTISTS ON SPOTIFY (fetched from Spotify):\n${artistsList}\n\n`;
                    spotifyContext += `The user wants popular artists. The artists listed above were automatically fetched from Spotify's API. `;
                    spotifyContext += `Use this list to create a playlist with popular artists from Spotify. `;
                    spotifyContext += `You can suggest songs from these artists or similar popular artists. `;
                    spotifyContext += `When explaining your playlist, mention that you used popular artists from Spotify, not that the user provided them.`;
                    console.log(`[Spotify] Added ${popularArtists.length} popular artists to context`);
                }
            } else if (intent.intentType === "popular_tracks_from_artists") {
                // TWO-PHASE APPROACH: Generate initial playlist OR use existing, then refine with popular tracks
                console.log("[Two-Phase] Starting two-phase playlist generation...");

                let initialPlaylist;
                let artists = [];

                // Check if we already have a playlist - if so, skip Phase 1
                if (currentPlaylist && currentPlaylist.songs && currentPlaylist.songs.length > 0) {
                    console.log("[Two-Phase] Using existing playlist, skipping Phase 1");

                    // Extract unique artists from existing playlist
                    artists = extractUniqueArtists(currentPlaylist.songs);
                    console.log(`[Two-Phase] Extracted ${artists.length} unique artists from existing playlist:`, artists);

                    // Create a mock initialPlaylist structure from current playlist
                    initialPlaylist = {
                        songs: currentPlaylist.songs.map((s) => {
                            if (typeof s === "string") return s;
                            return s.name;
                        }),
                        reply: "Refining existing playlist with popular tracks",
                        response_id: previousResponseId, // Use existing response ID for continuity
                    };
                } else {
                    // PHASE 1: Generate initial playlist (only if no existing playlist)
                    console.log("[Two-Phase] No existing playlist, generating initial playlist (Phase 1)");
                    initialPlaylist = await generateInitialPlaylist(message, currentPlaylist, model, previousResponseId, session_id);

                    // Extract unique artists from initial playlist
                    artists = extractUniqueArtists(initialPlaylist.songs);
                    console.log(`[Two-Phase] Extracted ${artists.length} unique artists from initial playlist:`, artists);
                }

                if (artists.length > 0) {
                    // Fetch popular tracks for those artists
                    const { getTopTracksForArtists } = require("./spotify");
                    console.log(`[Spotify] Fetching top tracks for ${artists.length} artists...`);
                    const topTracks = await getTopTracksForArtists(artists, 5);

                    if (topTracks.length > 0) {
                        console.log(`[Spotify] Fetched ${topTracks.length} popular tracks for ${artists.length} artists`);

                        // PHASE 2: Refine playlist with popular tracks
                        const refinedPlaylist = await refinePlaylistWithPopularTracks(
                            initialPlaylist,
                            topTracks,
                            message,
                            currentPlaylist,
                            model,
                            initialPlaylist.response_id // Use Phase 1 response ID for continuity (or existing if no Phase 1)
                        );

                        // Store the response_id for stateful conversations
                        const sessionId = session_id || "default";
                        if (refinedPlaylist.response_id) {
                            conversationState.set(sessionId, refinedPlaylist.response_id);
                            console.log(`[OpenAI Debug] Stored response_id ${refinedPlaylist.response_id} for session ${sessionId}`);
                        }

                        // Calculate cost (Phase 1 + Phase 2, or just Phase 2 if we used existing playlist)
                        const pricing = {
                            "gpt-4o": {
                                input: 2.5 / 1000000,
                                cached: 0.25 / 1000000,
                                output: 10.0 / 1000000,
                            },
                            "gpt-5": {
                                input: 1.25 / 1000000,
                                cached: 0.125 / 1000000,
                                output: 10.0 / 1000000,
                            },
                            "gpt-5-mini": {
                                input: 0.25 / 1000000,
                                cached: 0.025 / 1000000,
                                output: 2.0 / 1000000,
                            },
                        };

                        const modelPricing = pricing[model] || pricing["gpt-4o"];

                        // Check if we skipped Phase 1 (used existing playlist)
                        const skippedPhase1 = currentPlaylist && currentPlaylist.songs && currentPlaylist.songs.length > 0;
                        const phase1Usage = skippedPhase1 ? {} : initialPlaylist.usage || {};
                        const phase2Usage = refinedPlaylist.usage || {};

                        const totalPromptTokens = (phase1Usage.prompt_tokens || 0) + (phase2Usage.prompt_tokens || 0);
                        const totalCompletionTokens = (phase1Usage.completion_tokens || 0) + (phase2Usage.completion_tokens || 0);
                        const totalCachedTokens = (phase1Usage.cached_tokens || 0) + (phase2Usage.cached_tokens || 0);
                        const totalUncachedInputTokens = totalPromptTokens - totalCachedTokens;
                        const totalTokens = (phase1Usage.total_tokens || 0) + (phase2Usage.total_tokens || 0);

                        // Calculate cost: uncached input + cached input + output
                        const cost = totalUncachedInputTokens * modelPricing.input + totalCachedTokens * modelPricing.cached + totalCompletionTokens * modelPricing.output;

                        const usage = {
                            prompt_tokens: totalPromptTokens,
                            completion_tokens: totalCompletionTokens,
                            total_tokens: totalTokens,
                            cost_usd: cost,
                            phases: skippedPhase1 ? 1 : 2, // 1 phase if we skipped Phase 1, 2 if we did both
                            phase1_tokens: phase1Usage.total_tokens || 0,
                            phase2_tokens: phase2Usage.total_tokens || 0,
                            skipped_phase1: skippedPhase1, // Indicate if Phase 1 was skipped
                        };

                        return res.json({
                            reply: refinedPlaylist.reply,
                            songs: refinedPlaylist.songs,
                            response_id: refinedPlaylist.response_id,
                            usage: usage,
                            model: model,
                        });
                    } else {
                        console.log("[Two-Phase] No popular tracks found");

                        // Check if we skipped Phase 1 (used existing playlist)
                        const skippedPhase1 = currentPlaylist && currentPlaylist.songs && currentPlaylist.songs.length > 0;

                        if (skippedPhase1) {
                            console.log("[Two-Phase] No popular tracks found, falling back to normal flow (no Phase 1 was done)");
                            // Fall back to normal flow - no cost incurred since we didn't do Phase 1
                            // Continue to normal flow below
                        } else {
                            console.log("[Two-Phase] No popular tracks found, returning initial playlist from Phase 1");
                            // Return initial playlist from Phase 1
                            const sessionId = session_id || "default";
                            if (initialPlaylist.response_id) {
                                conversationState.set(sessionId, initialPlaylist.response_id);
                            }

                            // Calculate cost for Phase 1 only
                            const pricing = {
                                "gpt-4o": {
                                    input: 2.5 / 1000000,
                                    cached: 0.25 / 1000000,
                                    output: 10.0 / 1000000,
                                },
                                "gpt-5": {
                                    input: 1.25 / 1000000,
                                    cached: 0.125 / 1000000,
                                    output: 10.0 / 1000000,
                                },
                                "gpt-5-mini": {
                                    input: 0.25 / 1000000,
                                    cached: 0.025 / 1000000,
                                    output: 2.0 / 1000000,
                                },
                            };

                            const modelPricing = pricing[model] || pricing["gpt-4o"];
                            const phase1Usage = initialPlaylist.usage || {};

                            const promptTokens = phase1Usage.prompt_tokens || 0;
                            const completionTokens = phase1Usage.completion_tokens || 0;
                            const cachedTokens = phase1Usage.cached_tokens || 0;
                            const uncachedInputTokens = promptTokens - cachedTokens;
                            const totalTokens = phase1Usage.total_tokens || 0;

                            const cost = uncachedInputTokens * modelPricing.input + cachedTokens * modelPricing.cached + completionTokens * modelPricing.output;

                            return res.json({
                                reply: initialPlaylist.reply,
                                songs: initialPlaylist.songs,
                                response_id: initialPlaylist.response_id,
                                usage: {
                                    prompt_tokens: promptTokens,
                                    completion_tokens: completionTokens,
                                    total_tokens: totalTokens,
                                    cost_usd: cost,
                                    phases: 1,
                                },
                                model: model,
                            });
                        }
                    }
                } else {
                    console.log("[Two-Phase] No artists found, falling back to normal flow");
                    // Fall back to normal flow if no artists found
                }
            }
        }

        // Build system prompt with context
        let systemPrompt = `You are a helpful AI assistant that creates and edits music playlists. `;

        // Add Spotify context if available
        if (spotifyContext) {
            systemPrompt += spotifyContext;
        }

        if (currentPlaylist && currentPlaylist.songs && currentPlaylist.songs.length > 0) {
            const songList = currentPlaylist.songs.map((s, i) => `${i + 1}. ${s}`).join("\n");
            systemPrompt += `\n\nCURRENT PLAYLIST:\n${songList}\n\n`;
            systemPrompt += `The user may ask you to:\n`;
            systemPrompt += `- Add new songs to the existing playlist\n`;
            systemPrompt += `- Remove specific songs from the playlist\n`;
            systemPrompt += `- Replace the entire playlist with new songs\n`;
            systemPrompt += `- Modify the playlist based on their request\n\n`;
            systemPrompt += `When editing, return the COMPLETE updated playlist (including any songs you're keeping from the current playlist plus any new ones you're adding).`;
        } else {
            systemPrompt += `When a user asks for a playlist, provide a friendly response and suggest songs that match their request. If the user don't specify how many songs they want, suggest 10 songs.`;
        }

        systemPrompt += `\n\nReturn the response as structured JSON with a reply message and an array of songs, where each song has a "song" and "artist" property.`;
        systemPrompt += `\n\nExplain your thinking process in a friendly and engaging manner.`;

        // Responses API uses 'input' (string) instead of 'messages' (array)
        // We combine system prompt and user message into a single input string
        // The Responses API manages conversation history automatically via previous_response_id
        //
        // NOTE: We always include the playlist context because the user can manually edit
        // the playlist (add/remove songs), and this state is not part of the conversation
        // history managed by the Responses API. Each request needs the current playlist state.
        const inputText = `${systemPrompt}\n\nUser: ${message}`;

        // Validate model name - supports GPT-4o and GPT-5 models
        const validModels = ["gpt-4o", "gpt-5-mini", "gpt-5"];
        const modelToUse = validModels.includes(model) ? model : "gpt-4o";

        // Responses API parameters:
        // - Uses 'input' (string) instead of 'messages' (array)
        // - Uses stateful conversations (automatically manages history via previous_response_id)
        // - store: true enables stateful mode, API manages conversation history
        // - Don't support custom temperature (only default value of 1)
        // - Support reasoning_effort and verbosity parameters for creativity control
        // - No max_completion_tokens limit (let OpenAI use defaults)
        // - response_format has moved to text.format in Responses API
        const requestParams = {
            model: modelToUse,
            input: inputText, // Responses API uses 'input' instead of 'messages'
            store: true, // Enable stateful conversations - API manages history
            text: {
                format: {
                    type: "json_schema",
                    name: "playlist_response", // Required: name at format level
                    schema: playlistResponseSchema, // Required: schema at format level
                },
                // GPT-4o only supports "medium", GPT-5 models support "low"
                verbosity: modelToUse === "gpt-4o" ? "medium" : "low",
            },
        };

        // Only add reasoning.effort for GPT-5 models (not supported by GPT-4o)
        // GPT-5 creativity parameters (Responses API structure):
        // - reasoning.effort: controls depth of reasoning (minimal, low, medium, high)
        //   'high' uses more reasoning tokens but ensures better accuracy and real song selection
        //   Needed to prevent the model from making up songs that don't exist
        if (modelToUse === "gpt-5" || modelToUse === "gpt-5-mini") {
            requestParams.reasoning = {
                effort: "high", // High reasoning to ensure real, accurate song suggestions
            };
        }

        // If this is a continuation of a conversation, reference the previous response
        if (previousResponseId) {
            requestParams.previous_response_id = previousResponseId;
        }

        // Debug: Log request details
        console.log("\n[OpenAI Debug] === Responses API Request ===");
        console.log(`Model: ${requestParams.model}`);
        console.log(`Input length: ${requestParams.input.length} characters`);
        console.log(`Store (stateful): ${requestParams.store}`);
        console.log(`Previous response ID: ${requestParams.previous_response_id || "None (first message)"}`);
        console.log(`Input preview: ${requestParams.input.substring(0, 200)}...`);
        console.log(
            `Request params:`,
            JSON.stringify(
                {
                    model: requestParams.model,
                    store: requestParams.store,
                    previous_response_id: requestParams.previous_response_id,
                    hasTextFormat: !!requestParams.text?.format,
                    hasTextVerbosity: !!requestParams.text?.verbosity,
                    reasoning_effort: requestParams.reasoning?.effort,
                },
                null,
                2
            )
        );

        // Use Responses API instead of Chat Completions API
        // Note: Responses API is available directly on the client (not under beta)
        const completion = await openai.responses.create(requestParams);

        // Debug: Log response details
        console.log("\n[OpenAI Debug] === Responses API Response ===");
        console.log(`Response ID: ${completion.id}`);
        console.log(`Model used: ${completion.model}`);
        console.log(`Full usage object:`, JSON.stringify(completion.usage || {}, null, 2));
        console.log(`Usage keys:`, Object.keys(completion.usage || {}));
        console.log(`Usage - Prompt tokens: ${completion.usage?.prompt_tokens || "N/A"}, Completion tokens: ${completion.usage?.completion_tokens || "N/A"}, Total: ${completion.usage?.total_tokens || "N/A"}`);
        console.log(`Usage - Input tokens: ${completion.usage?.input_tokens || "N/A"}, Output tokens: ${completion.usage?.output_tokens || "N/A"}`);

        // Responses API structure: output_text contains the response
        // According to the API, responses are returned in completion.output_text
        const content = completion.output_text || completion.text?.output_text || completion.choices?.[0]?.message?.content || completion.content || completion.message?.content;
        console.log(`Content type: ${typeof content}`);
        console.log(`Content length: ${typeof content === "string" ? content.length : JSON.stringify(content).length} characters`);
        console.log(`Content preview: ${typeof content === "string" ? content.substring(0, 200) : JSON.stringify(content).substring(0, 200)}...`);

        // Parse the structured response (should be valid JSON from structured output)
        if (!content || (typeof content === "string" && content.trim() === "")) {
            console.error("[OpenAI Debug] ERROR: Empty response content");
            console.error("[OpenAI Debug] Full response object:", JSON.stringify(completion, null, 2));
            throw new Error("Empty response from OpenAI Responses API");
        }

        let parsedResponse;
        try {
            // Content might already be parsed if Responses API returns structured output differently
            if (typeof content === "string") {
                parsedResponse = JSON.parse(content);
            } else if (typeof content === "object") {
                parsedResponse = content;
            } else {
                throw new Error(`Unexpected content type: ${typeof content}`);
            }
            console.log("[OpenAI Debug] ✅ JSON parsed successfully");
            console.log(`[OpenAI Debug] Parsed response keys: ${Object.keys(parsedResponse).join(", ")}`);
        } catch (parseError) {
            console.error("[OpenAI Debug] ❌ JSON Parse Error:", parseError.message);
            console.error("[OpenAI Debug] Full response content:", content);
            console.error("[OpenAI Debug] Content type:", typeof content);
            throw new Error(`Failed to parse JSON response from Responses API: ${parseError.message}`);
        }

        // Convert song objects to "Song - Artist" format for compatibility
        const songs = parsedResponse.songs.map((song) => `${song.song} - ${song.artist}`);

        // Store the response_id for stateful conversations
        // Use session_id if provided, otherwise use a default
        const sessionId = session_id || "default";
        if (completion.id) {
            conversationState.set(sessionId, completion.id);
            console.log(`[OpenAI Debug] Stored response_id ${completion.id} for session ${sessionId}`);
        }

        // Calculate cost based on model pricing
        // Prices from OpenAI pricing page: https://openai.com/api/pricing/
        // GPT-4o (per 1M tokens): Input: $2.50, Cached: $0.25, Output: $10.00
        // GPT-5 (per 1M tokens): Input: $1.25, Cached: $0.125, Output: $10.00
        // GPT-5-mini (per 1M tokens): Input: $0.25, Cached: $0.025, Output: $2.00
        const pricing = {
            "gpt-4o": {
                input: 2.5 / 1000000,
                cached: 0.25 / 1000000,
                output: 10.0 / 1000000,
            },
            "gpt-5": {
                input: 1.25 / 1000000,
                cached: 0.125 / 1000000,
                output: 10.0 / 1000000,
            },
            "gpt-5-mini": {
                input: 0.25 / 1000000,
                cached: 0.025 / 1000000,
                output: 2.0 / 1000000,
            },
        };

        // Responses API uses: input_tokens, output_tokens (not prompt_tokens/completion_tokens)
        // Structure: usage.input_tokens, usage.output_tokens, usage.total_tokens
        // Details: usage.input_tokens_details.cached_tokens, usage.output_tokens_details.reasoning_tokens
        const usage = completion.usage || {};

        // Extract token counts (Responses API structure)
        const inputTokens = usage.input_tokens || 0;
        const outputTokens = usage.output_tokens || 0;
        const totalTokens = usage.total_tokens || 0;

        // Extract detailed token counts
        const cachedTokens = usage.input_tokens_details?.cached_tokens || 0;
        const reasoningTokens = usage.output_tokens_details?.reasoning_tokens || 0;

        // Calculate uncached input tokens (input - cached)
        const uncachedInputTokens = inputTokens - cachedTokens;

        // Debug: Log extracted values
        console.log(`[OpenAI Debug] Extracted usage - Input: ${inputTokens} (cached: ${cachedTokens}, uncached: ${uncachedInputTokens}), Output: ${outputTokens} (reasoning: ${reasoningTokens}), Total: ${totalTokens}`);

        const modelPricing = pricing[modelToUse] || pricing["gpt-4o"];

        // Calculate cost: uncached input + cached input + output
        // Reasoning tokens are part of output_tokens and billed at output rate
        const cost = uncachedInputTokens * modelPricing.input + cachedTokens * modelPricing.cached + outputTokens * modelPricing.output;

        // For display purposes, map to prompt/completion terminology
        // Input tokens = prompt tokens, Output tokens = completion tokens
        const finalPromptTokens = inputTokens;
        const finalCompletionTokens = outputTokens;

        return res.json({
            reply: parsedResponse.reply,
            songs: songs,
            response_id: completion.id, // Return response_id for frontend to use in next request
            usage: {
                prompt_tokens: finalPromptTokens,
                completion_tokens: finalCompletionTokens,
                total_tokens: totalTokens,
                cost_usd: cost,
            },
            model: modelToUse,
        });
    } catch (error) {
        console.error("OpenAI Responses API Error:", error);

        // Return appropriate error based on error type
        if (error.status === 401) {
            return res.status(401).json({
                error: "Invalid OpenAI API key. Please check your OPENAI_API_KEY environment variable.",
            });
        } else if (error.status === 429) {
            return res.status(429).json({
                error: "Rate limit exceeded. Please try again later.",
            });
        } else if (error.status >= 500) {
            return res.status(503).json({
                error: "OpenAI service is temporarily unavailable. Please try again later.",
            });
        } else {
            return res.status(500).json({
                error: "Failed to process request with OpenAI Responses API.",
                details: error.message,
            });
        }
    }
});

module.exports = router;
