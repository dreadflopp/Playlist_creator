# AI Playlist Creator

A full-stack web application that allows users to chat with an AI to create and manage playlists using React, Express.js, OpenAI API, and Spotify API.

## Features

- **Chat Interface**: Interactive chat with AI assistant powered by OpenAI (GPT-4o, GPT-4o-mini, GPT-5, or GPT-5-mini)
- **AI Playlist Generation**: AI suggests songs based on user input and conversation context
- **Playlist Management**: 
  - View current playlist with album thumbnails
  - Add songs manually via Spotify search
  - Edit/update songs in the playlist
  - Remove songs from the playlist
  - Reset chat and playlist
- **Spotify Integration**:
  - Automatic song verification against Spotify database
  - Visual indicators for verified/unverified songs
  - Upload playlists directly to your Spotify account
  - OAuth authentication with Spotify
- **Model Selection**: Choose between different OpenAI models for different quality/speed tradeoffs
- **State Persistence**: Chat history and playlists persist across page refreshes
- **Spotify-themed UI**: Clean, modern dark theme inspired by Spotify's design

## Setup Instructions

### Backend Setup

1. Navigate to the server directory:
   ```bash
   cd server
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Set up environment variables:
   ```bash
   cp .env.example .env
   ```
   Edit `.env` and add your API keys:
   - `OPENAI_API_KEY`: Your OpenAI API key (required)
   - `SPOTIFY_CLIENT_ID`: Your Spotify app Client ID (required)
   - `SPOTIFY_CLIENT_SECRET`: Your Spotify app Client Secret (required)
   - `SPOTIFY_REDIRECT_URI`: OAuth redirect URI (defaults to `http://127.0.0.1:5173/`)

4. Start the server:
   ```bash
   npm start
   ```
   
   The server will run on `http://localhost:3000`

### Frontend Setup

1. Navigate to the client directory:
   ```bash
   cd client
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the development server:
   ```bash
   npm run dev
   ```
   
   The frontend will be available at `http://localhost:5173`

## API Endpoints

### POST /api/chat
Sends a message to the AI and receives a response with song recommendations.

**Request:**
```json
{
  "message": "Create a relaxing playlist",
  "chatHistory": [...],
  "currentPlaylist": {...},
  "model": "gpt-4o-mini"
}
```

**Response:**
```json
{
  "reply": "Great! Let's create a relaxing Sunday playlist...",
  "songs": ["Song Name - Artist Name", ...]
}
```

### POST /api/playlist
Creates and verifies a playlist against Spotify database.

**Request:**
```json
{
  "songs": ["Song Name - Artist Name", ...]
}
```

**Response:**
```json
{
  "id": "playlist_1234567890",
  "name": "AI Generated Playlist",
  "songs": [
    {
      "name": "Song Name - Artist Name",
      "verified": true,
      "spotifyId": "...",
      "spotifyUrl": "...",
      "image": "..."
    }
  ],
  "songCount": 5,
  "createdAt": "2024-01-01T00:00:00.000Z"
}
```

### GET /api/auth/login
Initiates Spotify OAuth login flow. Redirects user to Spotify authorization page.

### POST /api/auth/callback
Handles Spotify OAuth callback and exchanges code for access tokens.

### POST /api/search
Searches Spotify for track suggestions.

**Request:**
```json
{
  "query": "song name artist",
  "song": "Song Name",
  "artist": "Artist Name"
}
```

**Response:**
```json
{
  "tracks": [
    {
      "id": "...",
      "name": "Song Name",
      "artist": "Artist Name",
      "album": "Album Name",
      "spotifyUrl": "...",
      "previewUrl": "...",
      "image": "..."
    }
  ]
}
```

### POST /api/upload
Uploads a playlist to the authenticated user's Spotify account.

**Request:**
```json
{
  "playlist": {...},
  "sessionId": "...",
  "playlistName": "My Playlist"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Playlist successfully uploaded to Spotify!",
  "playlistId": "...",
  "spotifyUrl": "https://open.spotify.com/playlist/..."
}
```

## Technologies Used

- **Frontend**: React 18, Vite, Tailwind CSS
- **Backend**: Express.js, Node.js
- **APIs**: 
  - OpenAI API (GPT-4o, GPT-4o-mini, GPT-5, GPT-5-mini) with structured outputs
  - Spotify Web API (OAuth 2.0, track search, playlist creation)

## Configuration

### Spotify App Setup

1. Go to [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)
2. Create a new app
3. Add redirect URI: `http://127.0.0.1:5173/` (or your custom URI)
4. Copy Client ID and Client Secret to `.env` file

### OpenAI API Setup

1. Get your API key from [OpenAI Platform](https://platform.openai.com/api-keys)
2. Add it to `.env` file as `OPENAI_API_KEY`

## Notes

- The app uses structured outputs (JSON schema) with OpenAI for reliable song data extraction
- GPT-5 models use different parameters (`max_completion_tokens`, `reasoning_effort`) compared to GPT-4o models
- Playlist data and chat history are persisted in browser localStorage
- Songs are automatically verified against Spotify when playlists are created
- Unverified songs can be manually searched and updated via the edit button

