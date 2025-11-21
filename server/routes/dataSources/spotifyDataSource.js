const BaseDataSource = require("./baseDataSource");

/**
 * Spotify data source implementation
 * Wraps the existing Spotify API functions
 */
class SpotifyDataSource extends BaseDataSource {
    constructor() {
        super("spotify");
        // Lazy load to avoid circular dependencies
        this._spotifyModule = null;
    }

    _getSpotifyModule() {
        if (!this._spotifyModule) {
            this._spotifyModule = require("../spotify");
        }
        return this._spotifyModule;
    }

    isAvailable() {
        return !!(process.env.SPOTIFY_CLIENT_ID && process.env.SPOTIFY_CLIENT_SECRET);
    }

    async getPopularTracks(limit, playlistType = "popular", market = "US") {
        const { getPopularTracks } = this._getSpotifyModule();
        return await getPopularTracks(limit, playlistType, market);
    }

    async getPopularArtists(limit, market = "US") {
        const { getPopularArtists } = this._getSpotifyModule();
        return await getPopularArtists(limit, market);
    }

    async getTopTracksForArtists(artists, perArtist, market = "US") {
        const { getTopTracksForArtists } = this._getSpotifyModule();
        return await getTopTracksForArtists(artists, perArtist, market);
    }
}

module.exports = SpotifyDataSource;
