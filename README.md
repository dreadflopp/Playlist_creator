# AI Playlist Creator

A full-stack web application that allows users to chat with an AI to create playlists using React, Express.js, and mock APIs for OpenAI and Spotify.

## Project Structure

```
ai-playlist-creator/
├── client/              # React + Vite + Tailwind frontend
│   ├── src/
│   │   ├── components/
│   │   │   ├── ChatWindow.jsx
│   │   │   ├── ResponseWindow.jsx
│   │   │   └── UploadButton.jsx
│   │   ├── App.jsx
│   │   ├── main.jsx
│   │   └── index.css
│   ├── index.html
│   ├── vite.config.js
│   ├── tailwind.config.js
│   └── package.json
│
└── server/              # Express backend
    ├── routes/
    │   ├── openai.js    # Mock OpenAI chat endpoint
    │   └── spotify.js   # Mock Spotify playlist endpoints
    ├── index.js
    ├── package.json
    └── .env.example
```

## Features

- Chat interface for interacting with AI
- AI suggests songs based on user input
- Playlist creation with song recommendations
- Upload playlist to Spotify (mocked)
- Clean, modern UI with Tailwind CSS

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

3. (Optional) Set up environment variables:
   ```bash
   cp .env.example .env
   ```
   Edit `.env` and add your API keys when ready to integrate real APIs.

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
  "message": "Create a relaxing playlist"
}
```

**Response:**
```json
{
  "reply": "Great! Let's create a relaxing Sunday playlist...",
  "songs": ["Song 1", "Song 2", "Song 3", "Song 4", "Song 5"]
}
```

### POST /api/playlist
Creates a playlist from an array of songs.

**Request:**
```json
{
  "songs": ["Song 1", "Song 2", "Song 3"]
}
```

**Response:**
```json
{
  "id": "playlist_1234567890",
  "name": "AI Generated Playlist",
  "songs": ["Song 1", "Song 2", "Song 3"],
  "songCount": 3,
  "createdAt": "2024-01-01T00:00:00.000Z"
}
```

### POST /api/upload
Uploads a playlist to Spotify (mocked).

**Request:**
```json
{
  "playlist": {
    "id": "playlist_1234567890",
    "songs": ["Song 1", "Song 2", "Song 3"]
  }
}
```

**Response:**
```json
{
  "success": true,
  "message": "Playlist successfully uploaded to Spotify!",
  "playlistId": "playlist_1234567890",
  "spotifyUrl": "https://open.spotify.com/playlist/...",
  "uploadedAt": "2024-01-01T00:00:00.000Z"
}
```

## Future Integration

The codebase includes TODO comments where real API integrations should be added:

- **OpenAI API**: In `server/routes/openai.js`, replace the mock response with actual OpenAI API calls
- **Spotify API**: In `server/routes/spotify.js`, replace mock endpoints with Spotify Web API calls

## Technologies Used

- **Frontend**: React 18, Vite, Tailwind CSS
- **Backend**: Express.js, Node.js
- **APIs**: Mock endpoints (ready for OpenAI and Spotify integration)

## Notes

- All API calls are currently mocked with realistic responses
- CORS is enabled on the Express server to allow frontend communication
- The app uses a two-column layout: chat on the left, AI responses and playlist on the right
- The upload button is disabled until a playlist is created

