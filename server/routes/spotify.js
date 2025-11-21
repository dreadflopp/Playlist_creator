const express = require("express");
const router = express.Router();
const axios = require("axios");

// Spotify API configuration
const SPOTIFY_CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const SPOTIFY_CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;
const SPOTIFY_TOKEN_URL = "https://accounts.spotify.com/api/token";
const SPOTIFY_API_URL = "https://api.spotify.com/v1";
const REDIRECT_URI = process.env.SPOTIFY_REDIRECT_URI || "http://127.0.0.1:5173/";
const AUTH_BASE_URL = "https://accounts.spotify.com/authorize";

// In-memory storage for user access tokens and profiles (in production, use sessions/Redis)
const userTokens = new Map();
const userProfiles = new Map(); // Store user profiles by userId

// Debug logging helper
const DEBUG = true; // Set to false to disable debug logs

function debugLog(...args) {
    if (DEBUG) {
        console.log("[Spotify Debug]", ...args);
    }
}

// Initialize Spotify API check
if (SPOTIFY_CLIENT_ID && SPOTIFY_CLIENT_SECRET) {
    debugLog("✅ Spotify API credentials configured");
    debugLog("   Client ID:", SPOTIFY_CLIENT_ID.substring(0, 8) + "...");
} else {
    console.warn("[Spotify Warning] Spotify API credentials not configured");
    console.warn("   Set SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET in .env file");
}

// Cache for access token
let accessToken = null;
let tokenExpiry = 0;
let tokenPromise = null; // Promise to prevent concurrent token requests

// Get Spotify access token using Client Credentials flow
async function getSpotifyAccessToken() {
    // Return cached token if still valid
    if (accessToken && Date.now() < tokenExpiry) {
        const remainingTime = Math.round((tokenExpiry - Date.now()) / 1000 / 60);
        debugLog(`Using cached access token (expires in ${remainingTime} minutes)`);
        return accessToken;
    }

    if (!SPOTIFY_CLIENT_ID || !SPOTIFY_CLIENT_SECRET) {
        throw new Error("Spotify API credentials not configured");
    }

    // If a token request is already in progress, wait for it instead of making a new one
    if (tokenPromise) {
        debugLog("⏳ Token request already in progress, waiting for it...");
        return await tokenPromise;
    }

    // Start a new token request and store the promise
    debugLog("🔑 Requesting new Spotify access token...");
    tokenPromise = (async () => {
        try {
            const response = await axios.post(SPOTIFY_TOKEN_URL, "grant_type=client_credentials", {
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded",
                    Authorization: `Basic ${Buffer.from(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`).toString("base64")}`,
                },
            });

            accessToken = response.data.access_token;
            const expiresIn = response.data.expires_in;
            // Set expiry to 50 minutes (tokens last 1 hour, refresh early)
            tokenExpiry = Date.now() + (expiresIn - 600) * 1000;
            debugLog(`✅ Successfully obtained access token (expires in ${expiresIn} seconds)`);

            // Clear the promise so future requests can make new ones if needed
            tokenPromise = null;
            return accessToken;
        } catch (error) {
            // Clear the promise on error so retry is possible
            tokenPromise = null;
            console.error("[Spotify Error] Failed to get access token:");
            console.error("   Status:", error.response?.status);
            console.error("   Response:", error.response?.data || error.message);
            throw new Error("Failed to authenticate with Spotify API");
        }
    })();

    return await tokenPromise;
}

// Helper: Extract individual artists for matching (handles ft., feat, &, etc.)
function extractArtistsForMatching(artistString) {
    if (!artistString) return [];

    // Split on collaboration keywords
    const parts = artistString
        .split(/\s*(?:ft\.?|feat\.?|featuring|&|and)\s+/i)
        .map((a) => a.trim())
        .filter((a) => a.length > 0);

    return parts.length > 0 ? parts : [artistString.trim()];
}

// Helper: Check if requested artists match track artists using word boundaries
function artistsMatch(requestedArtists, trackArtists) {
    if (!requestedArtists || requestedArtists.length === 0) return true;
    if (!trackArtists || trackArtists.length === 0) return false;

    const trackArtistNames = trackArtists.map((a) => a.name.toLowerCase().trim());

    // Check if all requested artists appear in track artists (with word boundaries)
    return requestedArtists.every((reqArtist) => {
        const reqLower = reqArtist.toLowerCase().trim();

        // Create regex with word boundaries to avoid partial matches
        // Escape special regex characters in the artist name
        const escapedReq = reqLower.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const wordBoundaryRegex = new RegExp(`\\b${escapedReq}\\b`, "i");

        return trackArtistNames.some((trackArtist) => {
            // Use word boundary matching to find the requested artist in Spotify's artist name
            return wordBoundaryRegex.test(trackArtist);
        });
    });
}

// Search for a track on Spotify using free-form search
async function searchTrack(songName, artistName, market = "US") {
    if (!SPOTIFY_CLIENT_ID || !SPOTIFY_CLIENT_SECRET) {
        debugLog("⚠️  Spotify API not configured - skipping search");
        return null; // Spotify not configured
    }

    debugLog(`🔍 Searching for track: "${songName}" by "${artistName}" (market: ${market})`);

    try {
        const token = await getSpotifyAccessToken();

        // Free-form search - let Spotify handle relevance ranking
        const query = `${songName} ${artistName}`;
        debugLog(`   Query: ${query}`);

        const response = await axios.get(`${SPOTIFY_API_URL}/search`, {
            headers: {
                Authorization: `Bearer ${token}`,
            },
            params: {
                q: query,
                type: "track",
                limit: 10, // Get multiple results to find best match
                market: market, // Use user's market to ensure track is available
            },
        });

        debugLog(`   Results: ${response.data.tracks.items.length} track(s) found`);

        if (response.data.tracks.items.length > 0) {
            // Extract requested artists for matching
            const requestedArtists = extractArtistsForMatching(artistName);

            // Find best match - prefer tracks where all artists match
            const match = response.data.tracks.items.find((track) => artistsMatch(requestedArtists, track.artists));

            if (match) {
                debugLog(`   ✅ Found match: "${match.name}" by ${match.artists.map((a) => a.name).join(", ")}`);
                debugLog(`   Track ID: ${match.id}`);
                return match;
            } else {
                // No artist match found - log for debugging but don't return false positive
                const firstResult = response.data.tracks.items[0];
                debugLog(`   ⚠️  No artist match found`);
                debugLog(`   Top result was: "${firstResult.name}" by ${firstResult.artists.map((a) => a.name).join(", ")}`);
                debugLog(`   Requested artists: ${requestedArtists.join(", ")}`);
                debugLog(`   ❌ Not verifying - artist mismatch (requested: "${artistName}")`);
                return null;
            }
        }

        debugLog(`   ❌ No tracks found for "${songName} - ${artistName}"`);
        return null;
    } catch (error) {
        console.error(`[Spotify Error] Failed to search for track "${songName} - ${artistName}":`);
        console.error("   Status:", error.response?.status);
        console.error("   Response:", error.response?.data || error.message);
        return null;
    }
}

// Verify songs in playlist
async function verifySongs(songs, sessionId = null) {
    debugLog(`\n📋 Starting verification for ${songs.length} song(s)...`);
    const startTime = Date.now();

    // Get user's market if session is provided
    const market = sessionId ? getUserCountry(sessionId) : "US";

    const verifiedSongs = await Promise.all(
        songs.map(async (songData, index) => {
            // We only accept structured format: {song: "...", artist: "..."}
            if (!songData || typeof songData !== "object" || !songData.song || !songData.artist) {
                throw new Error(`Invalid song format at index ${index}: expected {song, artist}, got ${JSON.stringify(songData)}`);
            }

            const songName = songData.song.trim();
            const artistName = songData.artist.trim();

            const songString = `${songName} - ${artistName}`;
            debugLog(`\n[${index + 1}/${songs.length}] Verifying: ${songString}`);

            const spotifyTrack = await searchTrack(songName, artistName, market);

            const result = {
                song: songName,
                artist: artistName,
                name: songString, // For frontend display (generated from song and artist)
                verified: !!spotifyTrack,
                spotifyId: spotifyTrack?.id || null,
                spotifyUrl: spotifyTrack?.external_urls?.spotify || null,
                image: spotifyTrack?.album?.images?.[0]?.url || null,
            };

            debugLog(`   Result: ${result.verified ? "✅ Verified" : "❌ Not found"}`);
            if (result.spotifyId) {
                debugLog(`   Spotify URL: ${result.spotifyUrl}`);
            }

            return result;
        })
    );

    const endTime = Date.now();
    const verifiedCount = verifiedSongs.filter((s) => s.verified).length;
    debugLog(`\n📊 Verification complete:`);
    debugLog(`   Total songs: ${songs.length}`);
    debugLog(`   Verified: ${verifiedCount}`);
    debugLog(`   Not found: ${songs.length - verifiedCount}`);
    debugLog(`   Time taken: ${endTime - startTime}ms\n`);

    return verifiedSongs;
}

router.post("/playlist", async (req, res) => {
    const { songs, sessionId } = req.body;

    debugLog("\n🎵 === PLAYLIST CREATION REQUEST ===");
    debugLog(`Received ${songs?.length || 0} song(s)`);

    if (!songs || !Array.isArray(songs)) {
        console.error("[Spotify Error] Invalid request: songs array is required");
        return res.status(400).json({ error: "Songs array is required" });
    }

    // Require session ID for user market
    if (!sessionId) {
        return res.status(401).json({ error: "User must be logged in to verify songs" });
    }

    try {
        // Verify songs with Spotify API using user's market
        const verifiedSongs = await verifySongs(songs, sessionId);

        const playlist = {
            id: `playlist_${Date.now()}`,
            name: "AI Generated Playlist",
            songs: verifiedSongs,
            songCount: songs.length,
            createdAt: new Date().toISOString(),
        };

        debugLog("✅ Playlist created successfully");
        res.json(playlist);
    } catch (error) {
        console.error("[Spotify Error] Failed to create playlist:");
        console.error("   Error:", error.message);
        console.error("   Stack:", error.stack);

        // Fallback: return playlist without verification if Spotify API fails
        debugLog("⚠️  Returning playlist without verification (fallback mode)");
        const playlist = {
            id: `playlist_${Date.now()}`,
            name: "AI Generated Playlist",
            songs: songs.map((songData) => {
                // Only handle structured format
                if (!songData || typeof songData !== "object" || !songData.song || !songData.artist) {
                    throw new Error(`Invalid song format in fallback: expected {song, artist}, got ${JSON.stringify(songData)}`);
                }
                return {
                    song: songData.song,
                    artist: songData.artist,
                    name: `${songData.song} - ${songData.artist}`, // For display
                    verified: false,
                    spotifyId: null,
                    spotifyUrl: null,
                    image: null,
                };
            }),
            songCount: songs.length,
            createdAt: new Date().toISOString(),
        };
        res.json(playlist);
    }
});

// Search Spotify for multiple track suggestions
router.post("/search", async (req, res) => {
    const { query, song, artist, sessionId } = req.body;

    // Require at least a query string
    if (!query || typeof query !== "string") {
        return res.status(400).json({ error: "Search query is required" });
    }

    // Require session ID for user market
    if (!sessionId) {
        return res.status(401).json({ error: "User must be logged in to search" });
    }

    if (!SPOTIFY_CLIENT_ID || !SPOTIFY_CLIENT_SECRET) {
        return res.status(500).json({ error: "Spotify API is not configured" });
    }

    // Get user's market
    const market = getUserCountry(sessionId);

    try {
        const token = await getSpotifyAccessToken();

        // Use free-form search - let Spotify handle relevance ranking
        // The query is already formatted as "song artist" from the frontend
        debugLog(`🔍 User search (free-form): "${query}" (market: ${market})`);

        const response = await axios.get(`${SPOTIFY_API_URL}/search`, {
            headers: {
                Authorization: `Bearer ${token}`,
            },
            params: {
                q: query,
                type: "track",
                limit: 10, // Return up to 10 suggestions
                market: market, // Use user's market
            },
        });

        const tracks = response.data.tracks.items.map((track) => ({
            id: track.id,
            name: track.name,
            artist: track.artists.map((a) => a.name).join(", "),
            album: track.album.name,
            spotifyUrl: track.external_urls.spotify,
            previewUrl: track.preview_url,
            image: track.album.images[0]?.url || null,
        }));

        debugLog(`   Found ${tracks.length} tracks`);

        res.json({ tracks });
    } catch (error) {
        console.error("[Spotify Error] Search failed:", error.response?.data || error.message);
        res.status(500).json({
            error: "Failed to search Spotify",
            details: error.response?.data || error.message,
        });
    }
});

// OAuth: Get authorization URL to start login
router.get("/auth/login", (req, res) => {
    if (!SPOTIFY_CLIENT_ID) {
        return res.status(500).json({ error: "Spotify API not configured" });
    }

    const scopes = "playlist-modify-public playlist-modify-private user-read-private user-read-email";
    const state = Math.random().toString(36).substring(2, 15); // Simple state for CSRF protection

    // Check if user wants to force logout first (for switching accounts)
    const forceLogout = req.query.force_logout === "true";

    if (forceLogout) {
        // Redirect to Spotify logout first, then back to login
        // Spotify logout will clear the session, then we redirect to authorization
        const logoutUrl = "https://accounts.spotify.com/logout";
        const authUrl = `${AUTH_BASE_URL}?` + `client_id=${SPOTIFY_CLIENT_ID}&` + `response_type=code&` + `redirect_uri=${encodeURIComponent(REDIRECT_URI)}&` + `scope=${encodeURIComponent(scopes)}&` + `state=${state}&` + `show_dialog=true`;

        // Redirect to logout, then to auth URL
        const finalUrl = `${logoutUrl}?continue=${encodeURIComponent(authUrl)}`;
        return res.json({ authUrl: finalUrl, state, forceLogout: true });
    }

    // Normal login - force dialog to allow switching accounts in the dialog
    const authUrl = `${AUTH_BASE_URL}?` + `client_id=${SPOTIFY_CLIENT_ID}&` + `response_type=code&` + `redirect_uri=${encodeURIComponent(REDIRECT_URI)}&` + `scope=${encodeURIComponent(scopes)}&` + `state=${state}&` + `show_dialog=true`; // Force authorization dialog (user can log out from Spotify in the dialog)

    res.json({ authUrl, state });
});

// OAuth: Handle callback and exchange code for token
router.post("/auth/callback", async (req, res) => {
    const { code } = req.body;

    if (!code) {
        return res.status(400).json({ error: "Authorization code is required" });
    }

    try {
        const response = await axios.post(
            SPOTIFY_TOKEN_URL,
            new URLSearchParams({
                grant_type: "authorization_code",
                code: code,
                redirect_uri: REDIRECT_URI,
            }),
            {
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded",
                    Authorization: `Basic ${Buffer.from(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`).toString("base64")}`,
                },
            }
        );

        const { access_token, refresh_token, expires_in } = response.data;

        // Get user info to create a session ID
        const userResponse = await axios.get(`${SPOTIFY_API_URL}/me`, {
            headers: {
                Authorization: `Bearer ${access_token}`,
            },
        });

        const userId = userResponse.data.id;
        const sessionId = `spotify_${userId}_${Date.now()}`;

        // Extract user profile data
        const userProfile = {
            id: userId,
            display_name: userResponse.data.display_name || userId,
            email: userResponse.data.email || null,
            country: userResponse.data.country || "US", // Default to US if not available
            images: userResponse.data.images || [],
            product: userResponse.data.product || null,
        };

        // Store tokens (in production, use proper sessions)
        userTokens.set(sessionId, {
            accessToken: access_token,
            refreshToken: refresh_token,
            expiresAt: Date.now() + expires_in * 1000,
            userId: userId,
        });

        // Store user profile by userId for easy lookup
        userProfiles.set(userId, userProfile);

        debugLog(`✅ User authenticated: ${userProfile.display_name} (${userProfile.country})`);

        res.json({
            success: true,
            sessionId: sessionId,
            user: {
                id: userId,
                name: userProfile.display_name,
                country: userProfile.country,
                image: userProfile.images[0]?.url || null,
            },
        });
    } catch (error) {
        console.error("[Spotify Error] OAuth callback failed:", error.response?.data || error.message);
        res.status(500).json({
            error: "Failed to authenticate with Spotify",
            details: error.response?.data || error.message,
        });
    }
});

// Get user's access token from session
function getUserAccessToken(sessionId) {
    const tokenData = userTokens.get(sessionId);
    if (!tokenData) return null;

    // Check if token expired (simplified - in production, implement refresh)
    if (Date.now() >= tokenData.expiresAt) {
        debugLog("⚠️  User token expired");
        return null;
    }

    return tokenData.accessToken;
}

// Get user profile by session ID
function getUserProfile(sessionId) {
    const tokenData = userTokens.get(sessionId);
    if (!tokenData) return null;

    return userProfiles.get(tokenData.userId) || null;
}

// Get user country by session ID (defaults to US if not available)
function getUserCountry(sessionId) {
    const profile = getUserProfile(sessionId);
    return profile?.country || "US";
}

// Get current user profile endpoint
router.get("/auth/profile", async (req, res) => {
    const sessionId = req.headers["x-session-id"] || req.query.sessionId;

    if (!sessionId) {
        return res.status(401).json({ error: "Session ID required" });
    }

    const profile = getUserProfile(sessionId);
    if (!profile) {
        return res.status(401).json({ error: "User not authenticated" });
    }

    res.json({
        success: true,
        user: {
            id: profile.id,
            name: profile.display_name,
            country: profile.country,
            image: profile.images[0]?.url || null,
        },
    });
});

// Check if user is logged in
router.get("/auth/status", async (req, res) => {
    const sessionId = req.headers["x-session-id"] || req.query.sessionId;

    if (!sessionId) {
        return res.json({ loggedIn: false });
    }

    const tokenData = userTokens.get(sessionId);
    if (!tokenData || Date.now() >= tokenData.expiresAt) {
        return res.json({ loggedIn: false });
    }

    const profile = getUserProfile(sessionId);
    res.json({
        loggedIn: true,
        user: profile
            ? {
                  id: profile.id,
                  name: profile.display_name,
                  country: profile.country,
                  image: profile.images[0]?.url || null,
              }
            : null,
    });
});

// Upload playlist to Spotify
router.post("/upload", async (req, res) => {
    const { playlist, sessionId, playlistName } = req.body;

    if (!playlist) {
        return res.status(400).json({ error: "Playlist is required" });
    }

    if (!sessionId) {
        return res.status(401).json({ error: "User not authenticated. Please log in to Spotify." });
    }

    const accessToken = getUserAccessToken(sessionId);
    if (!accessToken) {
        return res.status(401).json({ error: "Session expired. Please log in again." });
    }

    try {
        debugLog(`📤 Uploading playlist "${playlistName || "AI Generated Playlist"}" to Spotify...`);

        // Get current user
        const userResponse = await axios.get(`${SPOTIFY_API_URL}/me`, {
            headers: {
                Authorization: `Bearer ${accessToken}`,
            },
        });
        const userId = userResponse.data.id;

        // Create playlist
        const playlistResponse = await axios.post(
            `${SPOTIFY_API_URL}/users/${userId}/playlists`,
            {
                name: playlistName || "AI Generated Playlist",
                description: "Created with AI Playlist Creator",
                public: true,
            },
            {
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    "Content-Type": "application/json",
                },
            }
        );

        const spotifyPlaylistId = playlistResponse.data.id;
        debugLog(`✅ Created playlist: ${spotifyPlaylistId}`);

        // Get only verified songs with spotifyId
        const trackUris = playlist.songs.filter((song) => typeof song === "object" && song.verified && song.spotifyId).map((song) => `spotify:track:${song.spotifyId}`);

        if (trackUris.length === 0) {
            return res.status(400).json({ error: "No verified songs to upload" });
        }

        debugLog(`📝 Adding ${trackUris.length} tracks to playlist...`);

        // Spotify API allows max 100 tracks per request
        const batchSize = 100;
        for (let i = 0; i < trackUris.length; i += batchSize) {
            const batch = trackUris.slice(i, i + batchSize);

            await axios.post(
                `${SPOTIFY_API_URL}/playlists/${spotifyPlaylistId}/tracks`,
                {
                    uris: batch,
                },
                {
                    headers: {
                        Authorization: `Bearer ${accessToken}`,
                        "Content-Type": "application/json",
                    },
                }
            );
        }

        const spotifyPlaylistUrl = playlistResponse.data.external_urls.spotify;

        debugLog(`✅ Playlist uploaded successfully: ${spotifyPlaylistUrl}`);

        res.json({
            success: true,
            message: "Playlist successfully uploaded to Spotify!",
            playlistId: spotifyPlaylistId,
            spotifyUrl: spotifyPlaylistUrl,
            uploadedAt: new Date().toISOString(),
            trackCount: trackUris.length,
        });
    } catch (error) {
        console.error("[Spotify Error] Upload failed:", error.response?.data || error.message);
        res.status(500).json({
            error: "Failed to upload playlist to Spotify",
            details: error.response?.data || error.message,
        });
    }
});

// Spotify playlist IDs for popular tracks
const POPULAR_PLAYLISTS = {
    popular: "37i9dQZF1DXcBWIGoYBM5M", // Today's Top Hits - for popular/trending tracks
    new: "37i9dQZF1DWXJfnUiYjUKT", // New Music Friday - for new/hot tracks
};

// Get popular tracks from specific Spotify playlists
// playlistType: "popular" for Today's Top Hits, "new" for New Music Friday
async function getPopularTracks(limit = 50, playlistType = "popular", market = "US") {
    if (!SPOTIFY_CLIENT_ID || !SPOTIFY_CLIENT_SECRET) {
        debugLog("⚠️  Spotify API not configured");
        return [];
    }

    const playlistId = POPULAR_PLAYLISTS[playlistType] || POPULAR_PLAYLISTS.popular;
    debugLog(`📀 Fetching tracks from playlist: ${playlistType} (${playlistId})`);

    try {
        const token = await getSpotifyAccessToken();
        const allTracks = [];
        let nextUrl = null;
        let offset = 0;
        const pageSize = 50; // Spotify API max per request

        // Fetch tracks with pagination to get all tracks
        do {
            let tracksResponse;
            if (nextUrl) {
                // Use the next URL directly (it already contains all params)
                tracksResponse = await axios.get(nextUrl, {
                    headers: { Authorization: `Bearer ${token}` },
                });
            } else {
                // First request - use endpoint with params
                tracksResponse = await axios.get(`${SPOTIFY_API_URL}/playlists/${playlistId}/tracks`, {
                    headers: { Authorization: `Bearer ${token}` },
                    params: {
                        limit: pageSize,
                        offset: offset,
                        market: market,
                        fields: "items(track(id,name,artists,album,popularity)),next,total",
                    },
                });
            }

            const items = tracksResponse.data.items || [];
            const tracks = items
                .filter((item) => item.track && item.track.id)
                .map((item) => ({
                    id: item.track.id,
                    name: item.track.name,
                    artist: item.track.artists.map((a) => a.name).join(", "),
                    album: item.track.album.name,
                    popularity: item.track.popularity || 0,
                }));

            allTracks.push(...tracks);
            nextUrl = tracksResponse.data.next;
            offset += pageSize;

            debugLog(`   Fetched ${tracks.length} tracks (total so far: ${allTracks.length})`);

            // Stop if we have enough tracks or no more pages
            if (allTracks.length >= limit || !nextUrl) {
                break;
            }
        } while (nextUrl && allTracks.length < limit);

        // Remove duplicates and sort by popularity (tracks are already in order by Spotify)
        const uniqueTracks = Array.from(new Map(allTracks.map((track) => [track.id, track])).values());
        uniqueTracks.sort((a, b) => b.popularity - a.popularity);

        const result = uniqueTracks.slice(0, limit);
        debugLog(`📊 Fetched ${result.length} popular tracks from ${playlistType} playlist`);
        return result;
    } catch (error) {
        console.error("[Spotify Error] Failed to get popular tracks:", error.response?.status || error.message);
        if (error.response) {
            console.error("[Spotify Error] Response data:", error.response.data);
        }
        return [];
    }
}

// Get popular artists (from popular tracks playlists)
async function getPopularArtists(limit = 30, market = "US") {
    if (!SPOTIFY_CLIENT_ID || !SPOTIFY_CLIENT_SECRET) {
        return [];
    }

    try {
        // Get popular tracks first, then extract unique artists
        const popularTracks = await getPopularTracks(100, "popular", market);
        const artistMap = new Map();

        popularTracks.forEach((track) => {
            const artists = track.artist.split(", ").map((a) => a.trim());
            artists.forEach((artist) => {
                if (!artistMap.has(artist)) {
                    artistMap.set(artist, {
                        name: artist,
                        trackCount: 0,
                        avgPopularity: 0,
                        topTracks: [],
                    });
                }
                const artistData = artistMap.get(artist);
                artistData.trackCount++;
                artistData.topTracks.push({
                    name: track.name,
                    popularity: track.popularity,
                });
            });
        });

        // Sort by track count and average popularity
        const artists = Array.from(artistMap.values())
            .map((artist) => ({
                name: artist.name,
                trackCount: artist.trackCount,
                topTracks: artist.topTracks
                    .sort((a, b) => b.popularity - a.popularity)
                    .slice(0, 5)
                    .map((t) => t.name),
            }))
            .sort((a, b) => b.trackCount - a.trackCount)
            .slice(0, limit);

        debugLog(`📊 Fetched ${artists.length} popular artists`);
        return artists;
    } catch (error) {
        console.error("[Spotify Error] Failed to get popular artists:", error.message);
        return [];
    }
}

// Get top tracks for specific artists
async function getTopTracksForArtists(artistNames, tracksPerArtist = 5, market = "US") {
    if (!SPOTIFY_CLIENT_ID || !SPOTIFY_CLIENT_SECRET || !artistNames || artistNames.length === 0) {
        return [];
    }

    try {
        const token = await getSpotifyAccessToken();
        const allTracks = [];

        for (const artistName of artistNames) {
            try {
                // First, search for the artist
                const searchResponse = await axios.get(`${SPOTIFY_API_URL}/search`, {
                    headers: { Authorization: `Bearer ${token}` },
                    params: {
                        q: `artist:"${artistName}"`,
                        type: "artist",
                        limit: 1,
                    },
                });

                if (searchResponse.data.artists.items.length === 0) {
                    debugLog(`⚠️  Artist not found: ${artistName}`);
                    continue;
                }

                const artistId = searchResponse.data.artists.items[0].id;

                // Get top tracks for this artist
                const topTracksResponse = await axios.get(`${SPOTIFY_API_URL}/artists/${artistId}/top-tracks`, {
                    headers: { Authorization: `Bearer ${token}` },
                    params: { market: market }, // Use user's market
                });

                const tracks = topTracksResponse.data.tracks.slice(0, tracksPerArtist).map((track) => ({
                    id: track.id,
                    name: track.name,
                    artist: track.artists.map((a) => a.name).join(", "),
                    album: track.album.name,
                    popularity: track.popularity || 0,
                    spotifyUrl: track.external_urls.spotify,
                }));

                allTracks.push(...tracks);
                debugLog(`✅ Got ${tracks.length} top tracks for ${artistName}`);
            } catch (error) {
                debugLog(`⚠️  Failed to get tracks for artist ${artistName}:`, error.message);
            }
        }

        debugLog(`📊 Fetched ${allTracks.length} total tracks for ${artistNames.length} artists`);
        return allTracks;
    } catch (error) {
        console.error("[Spotify Error] Failed to get top tracks for artists:", error.message);
        return [];
    }
}

// Get tracks from a specific playlist
async function getTracksFromPlaylist(playlistId, limit = 50, market = "US") {
    if (!SPOTIFY_CLIENT_ID || !SPOTIFY_CLIENT_SECRET) {
        debugLog("⚠️  Spotify API not configured");
        return [];
    }

    debugLog(`📀 Fetching tracks from playlist: ${playlistId}`);

    try {
        const token = await getSpotifyAccessToken();
        const allTracks = [];
        let nextUrl = null;
        let offset = 0;
        const pageSize = 50;

        do {
            let tracksResponse;
            if (nextUrl) {
                tracksResponse = await axios.get(nextUrl, {
                    headers: { Authorization: `Bearer ${token}` },
                });
            } else {
                tracksResponse = await axios.get(`${SPOTIFY_API_URL}/playlists/${playlistId}/tracks`, {
                    headers: { Authorization: `Bearer ${token}` },
                    params: {
                        limit: pageSize,
                        offset: offset,
                        market: market,
                        fields: "items(track(id,name,artists,album,popularity)),next,total",
                    },
                });
            }

            const items = tracksResponse.data.items || [];
            const tracks = items
                .filter((item) => item.track && item.track.id)
                .map((item) => ({
                    id: item.track.id,
                    name: item.track.name,
                    artist: item.track.artists.map((a) => a.name).join(", "),
                    album: item.track.album.name,
                    popularity: item.track.popularity || 0,
                }));

            allTracks.push(...tracks);
            nextUrl = tracksResponse.data.next;
            offset += pageSize;

            if (allTracks.length >= limit || !nextUrl) {
                break;
            }
        } while (nextUrl && allTracks.length < limit);

        const result = allTracks.slice(0, limit);
        debugLog(`📊 Fetched ${result.length} tracks from playlist`);
        return result;
    } catch (error) {
        console.error("[Spotify Error] Failed to get tracks from playlist:", error.response?.status || error.message);
        return [];
    }
}

module.exports = router;
// Export helper functions for use in other routes
module.exports.getSpotifyAccessToken = getSpotifyAccessToken;
module.exports.getPopularTracks = getPopularTracks;
module.exports.getPopularArtists = getPopularArtists;
module.exports.getTopTracksForArtists = getTopTracksForArtists;
module.exports.getTracksFromPlaylist = getTracksFromPlaylist;
module.exports.getUserCountry = getUserCountry;
