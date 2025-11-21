# Spotify Playlist Reference

This document contains Spotify playlist IDs for fetching popular tracks and artists.

## Popular Tracks Playlists

### Today's Top Hits
- **Playlist ID**: `37i9dQZF1DXcBWIGoYBM5M`
- **Use Case**: When user wants popular/trending tracks
- **Description**: Spotify's official playlist of the most popular songs right now

### New Music Friday
- **Playlist ID**: `37i9dQZF1DWXJfnUiYjUKT`
- **Use Case**: For future intent (not yet implemented)
- **Description**: The best new music releases this week
- **Status**: Reserved for future use

## Usage Notes

- Use `/v1/playlists/{playlist_id}` endpoint to fetch tracks
- Playlists typically contain 50 tracks
- Use pagination to fetch all tracks if needed
- Include `market` parameter for user's country
- Tracks are already sorted by popularity/recency by Spotify

## Future Playlists

Additional playlists can be added here for different use cases:
- Genre-specific popular playlists
- Regional popular playlists
- Decade-specific playlists
- Mood-based playlists

