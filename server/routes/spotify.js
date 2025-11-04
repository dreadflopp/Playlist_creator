const express = require('express');
const router = express.Router();
const axios = require('axios');

// Spotify API configuration
const SPOTIFY_CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const SPOTIFY_CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;
const SPOTIFY_TOKEN_URL = 'https://accounts.spotify.com/api/token';
const SPOTIFY_API_URL = 'https://api.spotify.com/v1';
const REDIRECT_URI = process.env.SPOTIFY_REDIRECT_URI || 'http://127.0.0.1:5173/';
const AUTH_BASE_URL = 'https://accounts.spotify.com/authorize';

// In-memory storage for user access tokens (in production, use sessions/Redis)
const userTokens = new Map();

// Debug logging helper
const DEBUG = true; // Set to false to disable debug logs

function debugLog(...args) {
  if (DEBUG) {
    console.log('[Spotify Debug]', ...args);
  }
}

// Initialize Spotify API check
if (SPOTIFY_CLIENT_ID && SPOTIFY_CLIENT_SECRET) {
  debugLog('✅ Spotify API credentials configured');
  debugLog('   Client ID:', SPOTIFY_CLIENT_ID.substring(0, 8) + '...');
} else {
  console.warn('[Spotify Warning] Spotify API credentials not configured');
  console.warn('   Set SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET in .env file');
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
    throw new Error('Spotify API credentials not configured');
  }

  // If a token request is already in progress, wait for it instead of making a new one
  if (tokenPromise) {
    debugLog('⏳ Token request already in progress, waiting for it...');
    return await tokenPromise;
  }

  // Start a new token request and store the promise
  debugLog('🔑 Requesting new Spotify access token...');
  tokenPromise = (async () => {
    try {
      const response = await axios.post(
        SPOTIFY_TOKEN_URL,
        'grant_type=client_credentials',
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Authorization': `Basic ${Buffer.from(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`).toString('base64')}`
          }
        }
      );

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
      console.error('[Spotify Error] Failed to get access token:');
      console.error('   Status:', error.response?.status);
      console.error('   Response:', error.response?.data || error.message);
      throw new Error('Failed to authenticate with Spotify API');
    }
  })();

  return await tokenPromise;
}

// Search for a track on Spotify
async function searchTrack(songName, artistName) {
  if (!SPOTIFY_CLIENT_ID || !SPOTIFY_CLIENT_SECRET) {
    debugLog('⚠️  Spotify API not configured - skipping search');
    return null; // Spotify not configured
  }

  debugLog(`🔍 Searching for track: "${songName}" by "${artistName}"`);

  try {
    const token = await getSpotifyAccessToken();

    // Try searching with song and artist first
    const query = `track:"${songName}" artist:"${artistName}"`;
    debugLog(`   Query 1: ${query}`);

    const response = await axios.get(`${SPOTIFY_API_URL}/search`, {
      headers: {
        'Authorization': `Bearer ${token}`
      },
      params: {
        q: query,
        type: 'track',
        limit: 1
      }
    });

    debugLog(`   Results: ${response.data.tracks.items.length} track(s) found`);

    if (response.data.tracks.items.length > 0) {
      const track = response.data.tracks.items[0];
      debugLog(`   ✅ Found exact match: "${track.name}" by ${track.artists.map(a => a.name).join(', ')}`);
      debugLog(`   Track ID: ${track.id}`);
      return track;
    }

    // Fallback: search with just song name
    debugLog(`   ⚠️  No exact match, trying fallback search...`);
    const fallbackQuery = songName;
    debugLog(`   Query 2: ${fallbackQuery}`);

    const fallbackResponse = await axios.get(`${SPOTIFY_API_URL}/search`, {
      headers: {
        'Authorization': `Bearer ${token}`
      },
      params: {
        q: fallbackQuery,
        type: 'track',
        limit: 5
      }
    });

    debugLog(`   Fallback results: ${fallbackResponse.data.tracks.items.length} track(s) found`);

    // Try to find a match by checking if artist name appears in the results
    if (fallbackResponse.data.tracks.items.length > 0) {
      const lowerArtist = artistName.toLowerCase();
      const match = fallbackResponse.data.tracks.items.find(track => {
        // Check if any artist from the track matches the requested artist name
        return track.artists.some(artist => {
          const lowerTrackArtist = artist.name.toLowerCase();
          // Match if artist name is contained in either direction (allows for variations)
          return lowerTrackArtist.includes(lowerArtist) || lowerArtist.includes(lowerTrackArtist);
        });
      });

      if (match) {
        debugLog(`   ✅ Found artist match: "${match.name}" by ${match.artists.map(a => a.name).join(', ')}`);
        debugLog(`   Track ID: ${match.id}`);
        return match;
      } else {
        // Don't return first result if artist doesn't match - this prevents false positives
        const firstResult = fallbackResponse.data.tracks.items[0];
        debugLog(`   ⚠️  No artist match found`);
        debugLog(`   First result was: "${firstResult.name}" by ${firstResult.artists.map(a => a.name).join(', ')}`);
        debugLog(`   ❌ Not verifying - artist mismatch (requested: "${artistName}")`);
        return null; // Don't verify if artist doesn't match
      }
    }

    debugLog(`   ❌ No tracks found for "${songName} - ${artistName}"`);
    return null;
  } catch (error) {
    console.error(`[Spotify Error] Failed to search for track "${songName} - ${artistName}":`);
    console.error('   Status:', error.response?.status);
    console.error('   Response:', error.response?.data || error.message);
    return null;
  }
}

// Verify songs in playlist
async function verifySongs(songs) {
  debugLog(`\n📋 Starting verification for ${songs.length} song(s)...`);
  const startTime = Date.now();

  const verifiedSongs = await Promise.all(
    songs.map(async (songString, index) => {
      // Parse "Song Name - Artist Name" format
      const parts = songString.split(' - ').map(s => s.trim());
      const songName = parts[0];
      // Clean up artist name - remove featured artists info from parentheses for better matching
      let artistName = parts.slice(1).join(' - ') || '';
      // Remove content in parentheses (e.g., "(feat. Artist)" or "(with Artist)")
      artistName = artistName.replace(/\s*\([^)]*\)\s*/g, '').trim();

      debugLog(`\n[${index + 1}/${songs.length}] Verifying: ${songString}`);

      const spotifyTrack = await searchTrack(songName, artistName);

      const result = {
        name: songString,
        verified: !!spotifyTrack,
        spotifyId: spotifyTrack?.id || null,
        spotifyUrl: spotifyTrack?.external_urls?.spotify || null,
        image: spotifyTrack?.album?.images?.[0]?.url || null
      };

      debugLog(`   Result: ${result.verified ? '✅ Verified' : '❌ Not found'}`);
      if (result.spotifyId) {
        debugLog(`   Spotify URL: ${result.spotifyUrl}`);
      }

      return result;
    })
  );

  const endTime = Date.now();
  const verifiedCount = verifiedSongs.filter(s => s.verified).length;
  debugLog(`\n📊 Verification complete:`);
  debugLog(`   Total songs: ${songs.length}`);
  debugLog(`   Verified: ${verifiedCount}`);
  debugLog(`   Not found: ${songs.length - verifiedCount}`);
  debugLog(`   Time taken: ${endTime - startTime}ms\n`);

  return verifiedSongs;
}

router.post('/playlist', async (req, res) => {
  const { songs } = req.body;

  debugLog('\n🎵 === PLAYLIST CREATION REQUEST ===');
  debugLog(`Received ${songs?.length || 0} song(s)`);

  if (!songs || !Array.isArray(songs)) {
    console.error('[Spotify Error] Invalid request: songs array is required');
    return res.status(400).json({ error: 'Songs array is required' });
  }

  try {
    // Verify songs with Spotify API
    const verifiedSongs = await verifySongs(songs);

    const playlist = {
      id: `playlist_${Date.now()}`,
      name: 'AI Generated Playlist',
      songs: verifiedSongs,
      songCount: songs.length,
      createdAt: new Date().toISOString()
    };

    debugLog('✅ Playlist created successfully');
    res.json(playlist);
  } catch (error) {
    console.error('[Spotify Error] Failed to create playlist:');
    console.error('   Error:', error.message);
    console.error('   Stack:', error.stack);

    // Fallback: return playlist without verification if Spotify API fails
    debugLog('⚠️  Returning playlist without verification (fallback mode)');
    const playlist = {
      id: `playlist_${Date.now()}`,
      name: 'AI Generated Playlist',
      songs: songs.map(name => ({
        name,
        verified: false,
        spotifyId: null,
        spotifyUrl: null,
        image: null
      })),
      songCount: songs.length,
      createdAt: new Date().toISOString()
    };
    res.json(playlist);
  }
});

// Search Spotify for multiple track suggestions
router.post('/search', async (req, res) => {
  const { query, song, artist } = req.body;

  // Require at least a query string
  if (!query || typeof query !== 'string') {
    return res.status(400).json({ error: 'Search query is required' });
  }

  if (!SPOTIFY_CLIENT_ID || !SPOTIFY_CLIENT_SECRET) {
    return res.status(500).json({ error: 'Spotify API is not configured' });
  }

  try {
    const token = await getSpotifyAccessToken();

    // Build search query - prefer structured search if song and artist are provided
    let searchQuery = query;
    if (song && artist && typeof song === 'string' && typeof artist === 'string') {
      // Use structured search: track:"song" artist:"artist"
      searchQuery = `track:"${song}" artist:"${artist}"`;
      debugLog(`🔍 User search (structured): track:"${song}" artist:"${artist}"`);
    } else {
      debugLog(`🔍 User search query: "${query}"`);
    }

    const response = await axios.get(`${SPOTIFY_API_URL}/search`, {
      headers: {
        'Authorization': `Bearer ${token}`
      },
      params: {
        q: searchQuery,
        type: 'track',
        limit: 10  // Return up to 10 suggestions
      }
    });

    const tracks = response.data.tracks.items.map(track => ({
      id: track.id,
      name: track.name,
      artist: track.artists.map(a => a.name).join(', '),
      album: track.album.name,
      spotifyUrl: track.external_urls.spotify,
      previewUrl: track.preview_url,
      image: track.album.images[0]?.url || null
    }));

    debugLog(`   Found ${tracks.length} tracks`);

    res.json({ tracks });
  } catch (error) {
    console.error('[Spotify Error] Search failed:', error.response?.data || error.message);
    res.status(500).json({
      error: 'Failed to search Spotify',
      details: error.response?.data || error.message
    });
  }
});

// OAuth: Get authorization URL to start login
router.get('/auth/login', (req, res) => {
  if (!SPOTIFY_CLIENT_ID) {
    return res.status(500).json({ error: 'Spotify API not configured' });
  }

  const scopes = 'playlist-modify-public playlist-modify-private user-read-private';
  const state = Math.random().toString(36).substring(2, 15); // Simple state for CSRF protection
  
  // Check if user wants to force logout first (for switching accounts)
  const forceLogout = req.query.force_logout === 'true';

  if (forceLogout) {
    // Redirect to Spotify logout first, then back to login
    // Spotify logout will clear the session, then we redirect to authorization
    const logoutUrl = 'https://accounts.spotify.com/logout';
    const authUrl = `${AUTH_BASE_URL}?` +
      `client_id=${SPOTIFY_CLIENT_ID}&` +
      `response_type=code&` +
      `redirect_uri=${encodeURIComponent(REDIRECT_URI)}&` +
      `scope=${encodeURIComponent(scopes)}&` +
      `state=${state}&` +
      `show_dialog=true`;
    
    // Redirect to logout, then to auth URL
    const finalUrl = `${logoutUrl}?continue=${encodeURIComponent(authUrl)}`;
    return res.json({ authUrl: finalUrl, state, forceLogout: true });
  }

  // Normal login - force dialog to allow switching accounts in the dialog
  const authUrl = `${AUTH_BASE_URL}?` +
    `client_id=${SPOTIFY_CLIENT_ID}&` +
    `response_type=code&` +
    `redirect_uri=${encodeURIComponent(REDIRECT_URI)}&` +
    `scope=${encodeURIComponent(scopes)}&` +
    `state=${state}&` +
    `show_dialog=true`; // Force authorization dialog (user can log out from Spotify in the dialog)

  res.json({ authUrl, state });
});

// OAuth: Handle callback and exchange code for token
router.post('/auth/callback', async (req, res) => {
  const { code } = req.body;

  if (!code) {
    return res.status(400).json({ error: 'Authorization code is required' });
  }

  try {
    const response = await axios.post(
      SPOTIFY_TOKEN_URL,
      new URLSearchParams({
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: REDIRECT_URI,
      }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': `Basic ${Buffer.from(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`).toString('base64')}`
        }
      }
    );

    const { access_token, refresh_token, expires_in } = response.data;

    // Get user info to create a session ID
    const userResponse = await axios.get(`${SPOTIFY_API_URL}/me`, {
      headers: {
        'Authorization': `Bearer ${access_token}`
      }
    });

    const userId = userResponse.data.id;
    const sessionId = `spotify_${userId}_${Date.now()}`;

    // Store tokens (in production, use proper sessions)
    userTokens.set(sessionId, {
      accessToken: access_token,
      refreshToken: refresh_token,
      expiresAt: Date.now() + expires_in * 1000,
      userId: userId
    });

    debugLog(`✅ User authenticated: ${userResponse.data.display_name || userId}`);

    res.json({
      success: true,
      sessionId: sessionId,
      user: {
        id: userId,
        name: userResponse.data.display_name || userResponse.data.id
      }
    });
  } catch (error) {
    console.error('[Spotify Error] OAuth callback failed:', error.response?.data || error.message);
    res.status(500).json({
      error: 'Failed to authenticate with Spotify',
      details: error.response?.data || error.message
    });
  }
});

// Get user's access token from session
function getUserAccessToken(sessionId) {
  const tokenData = userTokens.get(sessionId);
  if (!tokenData) return null;

  // Check if token expired (simplified - in production, implement refresh)
  if (Date.now() >= tokenData.expiresAt) {
    debugLog('⚠️  User token expired');
    return null;
  }

  return tokenData.accessToken;
}

// Upload playlist to Spotify
router.post('/upload', async (req, res) => {
  const { playlist, sessionId, playlistName } = req.body;

  if (!playlist) {
    return res.status(400).json({ error: 'Playlist is required' });
  }

  if (!sessionId) {
    return res.status(401).json({ error: 'User not authenticated. Please log in to Spotify.' });
  }

  const accessToken = getUserAccessToken(sessionId);
  if (!accessToken) {
    return res.status(401).json({ error: 'Session expired. Please log in again.' });
  }

  try {
    debugLog(`📤 Uploading playlist "${playlistName || 'AI Generated Playlist'}" to Spotify...`);

    // Get current user
    const userResponse = await axios.get(`${SPOTIFY_API_URL}/me`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    });
    const userId = userResponse.data.id;

    // Create playlist
    const playlistResponse = await axios.post(
      `${SPOTIFY_API_URL}/users/${userId}/playlists`,
      {
        name: playlistName || 'AI Generated Playlist',
        description: 'Created with AI Playlist Creator',
        public: true
      },
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const spotifyPlaylistId = playlistResponse.data.id;
    debugLog(`✅ Created playlist: ${spotifyPlaylistId}`);

    // Get only verified songs with spotifyId
    const trackUris = playlist.songs
      .filter(song => typeof song === 'object' && song.verified && song.spotifyId)
      .map(song => `spotify:track:${song.spotifyId}`);

    if (trackUris.length === 0) {
      return res.status(400).json({ error: 'No verified songs to upload' });
    }

    debugLog(`📝 Adding ${trackUris.length} tracks to playlist...`);

    // Spotify API allows max 100 tracks per request
    const batchSize = 100;
    for (let i = 0; i < trackUris.length; i += batchSize) {
      const batch = trackUris.slice(i, i + batchSize);

      await axios.post(
        `${SPOTIFY_API_URL}/playlists/${spotifyPlaylistId}/tracks`,
        {
          uris: batch
        },
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          }
        }
      );
    }

    const spotifyPlaylistUrl = playlistResponse.data.external_urls.spotify;

    debugLog(`✅ Playlist uploaded successfully: ${spotifyPlaylistUrl}`);

    res.json({
      success: true,
      message: 'Playlist successfully uploaded to Spotify!',
      playlistId: spotifyPlaylistId,
      spotifyUrl: spotifyPlaylistUrl,
      uploadedAt: new Date().toISOString(),
      trackCount: trackUris.length
    });
  } catch (error) {
    console.error('[Spotify Error] Upload failed:', error.response?.data || error.message);
    res.status(500).json({
      error: 'Failed to upload playlist to Spotify',
      details: error.response?.data || error.message
    });
  }
});

// Get popular tracks from featured playlists
async function getPopularTracks(limit = 50) {
  if (!SPOTIFY_CLIENT_ID || !SPOTIFY_CLIENT_SECRET) {
    debugLog('⚠️  Spotify API not configured');
    return [];
  }

  try {
    const token = await getSpotifyAccessToken();
    
    const featuredResponse = await axios.get(`${SPOTIFY_API_URL}/browse/featured-playlists`, {
      headers: { 'Authorization': `Bearer ${token}` },
      params: { limit: 5, country: 'US' }
    });

    const playlists = featuredResponse.data.playlists.items;
    const allTracks = [];

    for (const playlist of playlists.slice(0, 3)) {
      try {
        const tracksResponse = await axios.get(`${SPOTIFY_API_URL}/playlists/${playlist.id}/tracks`, {
          headers: { 'Authorization': `Bearer ${token}` },
          params: {
            limit: 20,
            fields: 'items(track(id,name,artists,album,popularity))'
          }
        });

        const tracks = tracksResponse.data.items
          .filter(item => item.track && item.track.id)
          .map(item => ({
            id: item.track.id,
            name: item.track.name,
            artist: item.track.artists.map(a => a.name).join(', '),
            album: item.track.album.name,
            popularity: item.track.popularity || 0
          }));

        allTracks.push(...tracks);
      } catch (error) {
        debugLog(`⚠️  Failed to get tracks from playlist ${playlist.id}`);
      }
    }

    // Remove duplicates and sort by popularity
    const uniqueTracks = Array.from(
      new Map(allTracks.map(track => [track.id, track])).values()
    );
    uniqueTracks.sort((a, b) => b.popularity - a.popularity);
    
    debugLog(`📊 Fetched ${uniqueTracks.length} popular tracks`);
    return uniqueTracks.slice(0, limit);
  } catch (error) {
    console.error('[Spotify Error] Failed to get popular tracks:', error.message);
    return [];
  }
}

// Get popular artists (from featured playlists)
async function getPopularArtists(limit = 30) {
  if (!SPOTIFY_CLIENT_ID || !SPOTIFY_CLIENT_SECRET) {
    return [];
  }

  try {
    const token = await getSpotifyAccessToken();
    
    // Get popular tracks first, then extract unique artists
    const popularTracks = await getPopularTracks(100);
    const artistMap = new Map();

    popularTracks.forEach(track => {
      const artists = track.artist.split(', ').map(a => a.trim());
      artists.forEach(artist => {
        if (!artistMap.has(artist)) {
          artistMap.set(artist, {
            name: artist,
            trackCount: 0,
            avgPopularity: 0,
            topTracks: []
          });
        }
        const artistData = artistMap.get(artist);
        artistData.trackCount++;
        artistData.topTracks.push({
          name: track.name,
          popularity: track.popularity
        });
      });
    });

    // Sort by track count and average popularity
    const artists = Array.from(artistMap.values())
      .map(artist => ({
        name: artist.name,
        trackCount: artist.trackCount,
        topTracks: artist.topTracks
          .sort((a, b) => b.popularity - a.popularity)
          .slice(0, 5)
          .map(t => t.name)
      }))
      .sort((a, b) => b.trackCount - a.trackCount)
      .slice(0, limit);

    debugLog(`📊 Fetched ${artists.length} popular artists`);
    return artists;
  } catch (error) {
    console.error('[Spotify Error] Failed to get popular artists:', error.message);
    return [];
  }
}

// Get top tracks for specific artists
async function getTopTracksForArtists(artistNames, tracksPerArtist = 5) {
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
          headers: { 'Authorization': `Bearer ${token}` },
          params: {
            q: `artist:"${artistName}"`,
            type: 'artist',
            limit: 1
          }
        });

        if (searchResponse.data.artists.items.length === 0) {
          debugLog(`⚠️  Artist not found: ${artistName}`);
          continue;
        }

        const artistId = searchResponse.data.artists.items[0].id;

        // Get top tracks for this artist
        const topTracksResponse = await axios.get(
          `${SPOTIFY_API_URL}/artists/${artistId}/top-tracks`,
          {
            headers: { 'Authorization': `Bearer ${token}` },
            params: { market: 'US' }
          }
        );

        const tracks = topTracksResponse.data.tracks
          .slice(0, tracksPerArtist)
          .map(track => ({
            id: track.id,
            name: track.name,
            artist: track.artists.map(a => a.name).join(', '),
            album: track.album.name,
            popularity: track.popularity || 0,
            spotifyUrl: track.external_urls.spotify
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
    console.error('[Spotify Error] Failed to get top tracks for artists:', error.message);
    return [];
  }
}

module.exports = router;
// Export helper functions for use in other routes
module.exports.getPopularTracks = getPopularTracks;
module.exports.getPopularArtists = getPopularArtists;
module.exports.getTopTracksForArtists = getTopTracksForArtists;

