const express = require("express");
const router = express.Router();
const { OpenAI } = require("openai");

// Import refactored modules
const intentHandlers = require("./intentHandlers");
const dataSources = require("./dataSources");
const contextBuilders = require("./contextBuilders");
const { calculateCost, calculateTotalCost, getPricing } = require("./utils/pricing");
const { validateAndFilterSongs } = require("./utils/responseValidator");

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
            minItems: 0, // Allow 0 to prevent hallucinations when artist/songs don't exist
            maxItems: 20, // Allow more songs for editing scenarios
        },
    },
    required: ["reply", "songs"],
    additionalProperties: false,
};

// Intent detection schema for analyzing user prompts - now returns array of intents
const intentDetectionSchema = {
    type: "object",
    properties: {
        intents: {
            type: "array",
            items: {
                type: "object",
                properties: {
                    intentType: {
                        type: "string",
                        enum: ["popular_tracks", "popular_artists", "popular_genres", "popular_tracks_from_artists", "genre_mood_playlists"],
                        description: "The type of intent detected",
                    },
                    confidence: {
                        type: "number",
                        minimum: 0,
                        maximum: 1,
                        description: "Confidence level for this specific intent",
                    },
                },
                required: ["intentType", "confidence"],
                additionalProperties: false,
            },
            minItems: 0,
            maxItems: 5,
            description: "Array of detected intents (can be empty or contain multiple)",
        },
    },
    required: ["intents"],
    additionalProperties: false,
};

// Function to detect if user wants popular tracks/artists
async function detectPopularIntent(message, currentPlaylist, recentMessages = []) {
    if (!openai) return { intents: [] };

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
                    // Only accept structured format: {song, artist}
                    if (!s || typeof s !== "object" || !s.song || !s.artist) {
                        throw new Error(`Invalid song format in detectPopularIntent: expected {song, artist}, got ${JSON.stringify(s)}`);
                    }
                    return `${s.song} - ${s.artist}`;
                })
                .join(", ");
            context += `\n\nCurrent playlist: ${playlistInfo}`;
        }

        const response = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                {
                    role: "system",
                    content: `Analyze if the user explicitly wants any combination of:
1) general popular/trending tracks (e.g., "popular songs", "trending tracks", "what's hot")
2) a list of popular artists (e.g., "popular artists", "top artists")
3) popular genres (e.g., "popular genres", "trending genres")
4) popular tracks from specific artists (e.g., "popular songs by X", "hit tracks from X", "top songs by X", "most popular tracks from X")
5) genre/mood/activity-based playlists (e.g., "workout playlist", "chill music", "rock songs", "jazz playlist", "party music", "focus music", "sleep playlist", "80s music")

IMPORTANT: 
- Only detect intents if the user EXPLICITLY mentions wanting "popular", "trending", "hit", "top", "best", "most popular", or similar terms
- For genre_mood_playlists: detect when user mentions genres (rock, pop, jazz, etc.), moods (chill, happy, sad, etc.), activities (workout, party, study, etc.), or decades (80s, 90s, etc.)
- You can detect MULTIPLE intents if the user asks for both (e.g., "give me popular artists and popular tracks from them")
- Simply mentioning an artist name or asking for a playlist does NOT mean they want popular tracks

Examples:
- "create a metallica playlist" → intents: [] (no mention of popular/trending/genre)
- "popular metallica songs" → intents: [{intentType: "popular_tracks_from_artists", confidence: 0.9}]
- "create a workout playlist" → intents: [{intentType: "genre_mood_playlists", confidence: 0.9}]
- "I want rock music" → intents: [{intentType: "genre_mood_playlists", confidence: 0.9}]
- "chill jazz playlist" → intents: [{intentType: "genre_mood_playlists", confidence: 0.9}]
- "popular artists" → intents: [{intentType: "popular_artists", confidence: 0.9}]
- "give me some popular artists and some popular tracks from them" → intents: [
    {intentType: "popular_artists", confidence: 0.9},
    {intentType: "popular_tracks_from_artists", confidence: 0.9}
  ]

Consider the conversation history context when determining intents. Return an array of intents with their confidence scores.`,
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
            max_tokens: 200,
        });

        const content = response.choices[0].message.content;
        return JSON.parse(content);
    } catch (error) {
        console.error("[Intent Detection Error]", error);
        return { intents: [] };
    }
}

// Note: extractUniqueArtists moved to utils/playlistExtractors.js
// Import it when needed: const { extractArtists } = require("./utils/playlistExtractors");

// Helper function to generate initial playlist (Phase 1)
async function generateInitialPlaylist(message, currentPlaylist, model, previousResponseId, session_id) {
    // Build system prompt without popular tracks context
    let systemPrompt = `You are a helpful AI assistant that creates and edits music playlists. `;

    if (currentPlaylist && currentPlaylist.songs && currentPlaylist.songs.length > 0) {
        const songList = currentPlaylist.songs
            .map((s, i) => {
                // Only accept structured format: {song, artist}
                if (!s || typeof s !== "object" || !s.song || !s.artist) {
                    throw new Error(`Invalid song format in generateInitialPlaylist: expected {song, artist}, got ${JSON.stringify(s)}`);
                }
                return `${i + 1}. ${s.song} - ${s.artist}`;
            })
            .join("\n");
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

    // Validate and filter songs using utility function
    const songs = validateAndFilterSongs(parsedResponse);
    console.log(`[Phase 1] Generated initial playlist with ${songs.length} songs (${parsedResponse.songs.length} total, ${parsedResponse.songs.length - songs.length} filtered out)`);

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
        const songList = initialPlaylist.songs
            .map((s, i) => {
                // Only accept structured format: {song, artist}
                if (!s || typeof s !== "object" || !s.song || !s.artist) {
                    throw new Error(`Invalid song format in refinePlaylistWithPopularTracks: expected {song, artist}, got ${JSON.stringify(s)}`);
                }
                return `${i + 1}. ${s.song} - ${s.artist}`;
            })
            .join("\n");
        systemPrompt += `\n\nINITIAL PLAYLIST (to refine):\n${songList}\n\n`;
    }

    // Add current playlist if exists (for editing scenarios)
    if (currentPlaylist && currentPlaylist.songs && currentPlaylist.songs.length > 0) {
        const songList = currentPlaylist.songs
            .map((s, i) => {
                // Only accept structured format: {song, artist}
                if (!s || typeof s !== "object" || !s.song || !s.artist) {
                    throw new Error(`Invalid song format in refinePlaylistWithPopularTracks: expected {song, artist}, got ${JSON.stringify(s)}`);
                }
                return `${i + 1}. ${s.song} - ${s.artist}`;
            })
            .join("\n");
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

    // Validate and filter songs using utility function
    const songs = validateAndFilterSongs(parsedResponse);
    console.log(`[Phase 2] Refined playlist with ${songs.length} songs (${parsedResponse.songs.length} total, ${parsedResponse.songs.length - songs.length} filtered out)`);

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

        // STEP 1: Detect intents (works even without currentPlaylist)
        console.log("[Intent Detection] Analyzing user message...");
        console.log(`[Intent Detection] Recent messages: ${recentMessages?.length || 0} messages`);
        console.log(`[Intent Detection] Current playlist: ${currentPlaylist ? `${currentPlaylist.songs?.length || 0} songs` : "none"}`);
        const intentResult = await detectPopularIntent(message, currentPlaylist, recentMessages);
        console.log("[Intent Detection] Result:", intentResult);

        const detectedIntents = intentResult.intents || [];
        const validIntents = detectedIntents.filter((i) => i.confidence > 0.5);

        // Separate intents by phase
        const phase1Intents = [];
        const phase2Intents = [];

        for (const intent of validIntents) {
            const handler = intentHandlers.get(intent.intentType);
            if (handler) {
                const phase = handler.getPhase();
                if (phase === 1) {
                    phase1Intents.push({ intent, handler });
                } else if (phase === 2) {
                    phase2Intents.push({ intent, handler });
                }
            }
        }

        console.log(`[Phase Orchestration] Phase 1 intents: ${phase1Intents.length}, Phase 2 intents: ${phase2Intents.length}`);

        let phase1Context = "";
        let phase1Playlist = null;
        let phase1Usage = {};

        // PHASE 1: Execute all Phase 1 handlers and generate playlist
        // We need Phase 1 if there are Phase 1 intents OR Phase 2 intents (which need Phase 1 results)
        if (phase1Intents.length > 0 || phase2Intents.length > 0) {
            // Execute all Phase 1 handlers in parallel
            if (phase1Intents.length > 0) {
                console.log("[Phase 1] Executing Phase 1 handlers...");
                // Get sessionId from request (we'll add it to the route handler)
                const sessionId = req.body.spotifySessionId || null;
                const phase1Results = await Promise.all(phase1Intents.map(({ intent, handler }) => handler.handle(intent, message, currentPlaylist, dataSources.dataSources, contextBuilders, null, sessionId)));

                // Combine all Phase 1 contexts
                phase1Context = phase1Results
                    .map((r) => r.context || "")
                    .filter((c) => c)
                    .join("\n");
                console.log(`[Phase 1] Combined context length: ${phase1Context.length} characters`);
            } else {
                // No Phase 1 intents, but we have Phase 2 intents - generate playlist without Phase 1 context
                console.log("[Phase 1] No Phase 1 intents, generating playlist for Phase 2...");
            }

            // Build Phase 1 system prompt
            let systemPrompt = `You are a helpful AI assistant that creates and edits music playlists. `;

            if (phase1Context) {
                systemPrompt += phase1Context;
            }

            if (currentPlaylist && currentPlaylist.songs && currentPlaylist.songs.length > 0) {
                const songList = currentPlaylist.songs
                    .map((s, i) => {
                        if (!s || typeof s !== "object" || !s.song || !s.artist) {
                            throw new Error(`Invalid song format: expected {song, artist}, got ${JSON.stringify(s)}`);
                        }
                        return `${i + 1}. ${s.song} - ${s.artist}`;
                    })
                    .join("\n");
                systemPrompt += `\n\nCURRENT PLAYLIST:\n${songList}\n\n`;
                systemPrompt += `The user may ask you to modify the playlist. When editing, return the COMPLETE updated playlist.`;
            } else {
                systemPrompt += `When a user asks for a playlist, provide a friendly response and suggest songs that match their request. If the user doesn't specify how many songs they want, suggest 10 songs.`;
            }

            systemPrompt += `\n\nReturn the response as structured JSON with a reply message and an array of songs, where each song has a "song" and "artist" property.`;
            systemPrompt += `\n\nUse the provided lists as INSPIRATION - you are free to choose other tracks, artists, or genres that fit the theme. The lists are meant to guide you, not restrict you.`;

            const inputText = `${systemPrompt}\n\nUser: ${message}`;

            // Call OpenAI for Phase 1
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
                    verbosity: modelToUse === "gpt-4o" ? "medium" : "low",
                },
            };

            if (previousResponseId) {
                requestParams.previous_response_id = previousResponseId;
            }

            if (modelToUse === "gpt-5" || modelToUse === "gpt-5-mini") {
                requestParams.reasoning = { effort: "high" };
            }

            console.log("[Phase 1] Generating playlist with Phase 1 intents...");
            const phase1Response = await openai.responses.create(requestParams);

            const phase1Content = phase1Response.output_text || phase1Response.text?.output_text || phase1Response.choices?.[0]?.message?.content || phase1Response.content || phase1Response.message?.content;
            const phase1Parsed = typeof phase1Content === "string" ? JSON.parse(phase1Content) : phase1Content;

            // Ensure parsed response has songs array
            if (!phase1Parsed.songs) {
                phase1Parsed.songs = [];
            }
            const validatedSongs = validateAndFilterSongs(phase1Parsed);

            phase1Playlist = {
                songs: validatedSongs,
                reply: phase1Parsed.reply || "Created playlist",
                response_id: phase1Response.id,
                usage: phase1Response.usage,
            };

            phase1Usage = phase1Playlist.usage
                ? {
                      prompt_tokens: phase1Playlist.usage.input_tokens || phase1Playlist.usage.prompt_tokens || 0,
                      completion_tokens: phase1Playlist.usage.output_tokens || phase1Playlist.usage.completion_tokens || 0,
                      cached_tokens: phase1Playlist.usage.input_tokens_details?.cached_tokens || phase1Playlist.usage.cached_tokens || 0,
                      total_tokens: phase1Playlist.usage.total_tokens || 0,
                  }
                : {};

            console.log(`[Phase 1] Generated playlist with ${validatedSongs.length} songs`);
        }

        // PHASE 2: Execute all Phase 2 handlers and refine playlist
        if (phase2Intents.length > 0 && phase1Playlist) {
            const sessionId = req.body.spotifySessionId || null;

            // Phase 2 intents require user login for market-based searches
            if (!sessionId) {
                return res.status(401).json({
                    error: "User must be logged in to Spotify for this request. Phase 2 intents require user market data.",
                });
            }

            console.log("[Phase 2] Executing Phase 2 handlers...");
            let phase2Context = "";

            // Execute all Phase 2 handlers
            const phase2Results = await Promise.all(phase2Intents.map(({ intent, handler }) => handler.handle(intent, message, currentPlaylist, dataSources.dataSources, contextBuilders, { playlist: phase1Playlist }, sessionId)));

            // Combine all Phase 2 contexts
            phase2Context = phase2Results
                .map((r) => r.context || "")
                .filter((c) => c)
                .join("\n");
            console.log(`[Phase 2] Combined context length: ${phase2Context.length} characters`);

            if (phase2Context) {
                // Build Phase 2 system prompt
                let systemPrompt = `You are a helpful AI assistant that creates and edits music playlists. `;
                systemPrompt += phase2Context;

                // Add Phase 1 playlist
                const songList = phase1Playlist.songs
                    .map((s, i) => {
                        if (!s || typeof s !== "object" || !s.song || !s.artist) {
                            throw new Error(`Invalid song format: expected {song, artist}, got ${JSON.stringify(s)}`);
                        }
                        return `${i + 1}. ${s.song} - ${s.artist}`;
                    })
                    .join("\n");
                systemPrompt += `\n\nINITIAL PLAYLIST (to refine):\n${songList}\n\n`;

                systemPrompt += `Return the response as structured JSON with a reply message and an array of songs, where each song has a "song" and "artist" property.`;
                systemPrompt += `\n\nReturn the COMPLETE refined playlist. Explain what changes you made and why.`;
                systemPrompt += `\n\nUse the provided popular tracks as INSPIRATION - you can replace songs with more popular tracks, but you're also free to keep existing songs or choose other tracks that better fit the playlist's theme.`;

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
                        verbosity: modelToUse === "gpt-4o" ? "medium" : "low",
                    },
                    previous_response_id: phase1Playlist.response_id,
                };

                if (modelToUse === "gpt-5" || modelToUse === "gpt-5-mini") {
                    requestParams.reasoning = { effort: "high" };
                }

                console.log("[Phase 2] Refining playlist with Phase 2 intents...");
                const phase2Response = await openai.responses.create(requestParams);

                const phase2Content = phase2Response.output_text || phase2Response.text?.output_text || phase2Response.choices?.[0]?.message?.content || phase2Response.content || phase2Response.message?.content;
                const phase2Parsed = typeof phase2Content === "string" ? JSON.parse(phase2Content) : phase2Content;

                // Ensure parsed response has songs array
                if (!phase2Parsed.songs) {
                    phase2Parsed.songs = [];
                }
                const validatedSongs = validateAndFilterSongs(phase2Parsed);

                const phase2Playlist = {
                    songs: validatedSongs,
                    reply: phase2Parsed.reply || "Refined playlist",
                    response_id: phase2Response.id,
                    usage: phase2Response.usage,
                };

                const phase2Usage = phase2Playlist.usage
                    ? {
                          prompt_tokens: phase2Playlist.usage.input_tokens || phase2Playlist.usage.prompt_tokens || 0,
                          completion_tokens: phase2Playlist.usage.output_tokens || phase2Playlist.usage.completion_tokens || 0,
                          cached_tokens: phase2Playlist.usage.input_tokens_details?.cached_tokens || phase2Playlist.usage.cached_tokens || 0,
                          total_tokens: phase2Playlist.usage.total_tokens || 0,
                      }
                    : {};

                // Calculate total cost
                const cost = calculateTotalCost(
                    [phase1Usage, phase2Usage].filter((u) => Object.keys(u).length > 0),
                    model
                );

                // Store response_id
                const sessionId = session_id || "default";
                if (phase2Playlist.response_id) {
                    conversationState.set(sessionId, phase2Playlist.response_id);
                }

                return res.json({
                    reply: phase2Playlist.reply,
                    songs: phase2Playlist.songs,
                    response_id: phase2Playlist.response_id,
                    usage: {
                        prompt_tokens: (phase1Usage.prompt_tokens || 0) + (phase2Usage.prompt_tokens || 0),
                        completion_tokens: (phase1Usage.completion_tokens || 0) + (phase2Usage.completion_tokens || 0),
                        total_tokens: (phase1Usage.total_tokens || 0) + (phase2Usage.total_tokens || 0),
                        cost_usd: cost,
                        phases: 2,
                        phase1_tokens: phase1Usage.total_tokens || 0,
                        phase2_tokens: phase2Usage.total_tokens || 0,
                    },
                    model: model,
                });
            }
        }

        // If we have Phase 1 but no Phase 2, return Phase 1 result
        if (phase1Playlist && phase2Intents.length === 0) {
            const sessionId = session_id || "default";
            if (phase1Playlist.response_id) {
                conversationState.set(sessionId, phase1Playlist.response_id);
            }

            const cost = calculateCost(phase1Usage, model);

            return res.json({
                reply: phase1Playlist.reply,
                songs: phase1Playlist.songs,
                response_id: phase1Playlist.response_id,
                usage: {
                    prompt_tokens: phase1Usage.prompt_tokens || 0,
                    completion_tokens: phase1Usage.completion_tokens || 0,
                    total_tokens: phase1Usage.total_tokens || 0,
                    cost_usd: cost,
                    phases: 1,
                },
                model: model,
            });
        }

        // Fallback to normal flow if no intents detected
        let context = "";

        // STEP 3: Build system prompt with context and generate playlist
        // Build system prompt with context
        let systemPrompt = `You are a helpful AI assistant that creates and edits music playlists. `;

        // Add context from intent handlers if available
        if (context) {
            systemPrompt += context;
        }

        if (currentPlaylist && currentPlaylist.songs && currentPlaylist.songs.length > 0) {
            const songList = currentPlaylist.songs
                .map((s, i) => {
                    // Only accept structured format: {song, artist}
                    if (!s || typeof s !== "object" || !s.song || !s.artist) {
                        throw new Error(`Invalid song format in main chat route: expected {song, artist}, got ${JSON.stringify(s)}`);
                    }
                    return `${i + 1}. ${s.song} - ${s.artist}`;
                })
                .join("\n");
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

        // Validate response structure
        if (!parsedResponse.songs || !Array.isArray(parsedResponse.songs)) {
            console.error("[OpenAI Debug] ❌ Invalid response structure: songs is not an array");
            throw new Error("Invalid response: songs must be an array");
        }

        // Validate and filter songs using utility function
        const songs = validateAndFilterSongs(parsedResponse);
        console.log(`[OpenAI Debug] Processed ${songs.length} valid songs (${parsedResponse.songs.length} total, ${parsedResponse.songs.length - songs.length} filtered out)`);

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
// Export OpenAI instance for use in other modules (e.g., keyword extraction)
module.exports.openai = openai;
