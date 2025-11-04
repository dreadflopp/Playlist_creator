import { useState, useEffect, useCallback } from 'react'
import ChatWindow from './components/ChatWindow'
import ResponseWindow from './components/ResponseWindow'
import UploadButton from './components/UploadButton'
import SongSearchModal from './components/SongSearchModal'
import PlaylistNameModal from './components/PlaylistNameModal'

function App() {
  const [messages, setMessages] = useState([])
  const [currentPlaylist, setCurrentPlaylist] = useState(null)
  const [isLoading, setIsLoading] = useState(false)
  const [spotifySession, setSpotifySession] = useState(null)
  const [showPlaylistNameModal, setShowPlaylistNameModal] = useState(false)
  const [selectedModel, setSelectedModel] = useState('gpt-5-mini')
  const [responseId, setResponseId] = useState(null) // Store response_id for stateful conversations
  const [lastRequestStats, setLastRequestStats] = useState(null) // Token usage and cost for last request
  const [cumulativeStats, setCumulativeStats] = useState({ // Cumulative stats since reset
    total_prompt_tokens: 0,
    total_completion_tokens: 0,
    total_tokens: 0,
    total_cost_usd: 0
  })

  const handleOAuthCallback = useCallback(async (code) => {
    try {
      const response = await fetch('http://localhost:3000/api/auth/callback', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ code }),
      })

      const data = await response.json()

      if (data.success) {
        setSpotifySession(data)
        localStorage.setItem('spotifySession', JSON.stringify(data))
        // Login successful - state updated automatically
      } else {
        console.error('Failed to authenticate with Spotify')
      }
    } catch (error) {
      console.error('OAuth callback error:', error)
    }
  }, [])

  // Load saved state from localStorage on mount
  useEffect(() => {
    // Load messages
    const savedMessages = localStorage.getItem('chatMessages')
    if (savedMessages) {
      try {
        const parsed = JSON.parse(savedMessages)
        // Convert timestamp strings back to Date objects
        const messagesWithDates = parsed.map(msg => ({
          ...msg,
          timestamp: new Date(msg.timestamp)
        }))
        setMessages(messagesWithDates)
      } catch (e) {
        console.error('Error loading messages:', e)
      }
    }

    // Load playlist
    const savedPlaylist = localStorage.getItem('currentPlaylist')
    if (savedPlaylist) {
      try {
        setCurrentPlaylist(JSON.parse(savedPlaylist))
      } catch (e) {
        console.error('Error loading playlist:', e)
      }
    }

    // Load selected model
    const savedModel = localStorage.getItem('selectedModel')
    if (savedModel) {
      setSelectedModel(savedModel)
    }

    // Load response_id for stateful conversations
    const savedResponseId = localStorage.getItem('openaiResponseId')
    if (savedResponseId) {
      setResponseId(savedResponseId)
    }
  }, [])

  // Save messages to localStorage whenever they change
  useEffect(() => {
    if (messages.length > 0) {
      localStorage.setItem('chatMessages', JSON.stringify(messages))
    }
  }, [messages])

  // Save playlist to localStorage whenever it changes
  useEffect(() => {
    if (currentPlaylist) {
      localStorage.setItem('currentPlaylist', JSON.stringify(currentPlaylist))
    }
  }, [currentPlaylist])

  // Save selected model to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('selectedModel', selectedModel)
  }, [selectedModel])

  // Save response_id to localStorage whenever it changes
  useEffect(() => {
    if (responseId) {
      localStorage.setItem('openaiResponseId', responseId)
    } else {
      localStorage.removeItem('openaiResponseId')
    }
  }, [responseId])

  // Save cumulative stats to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem('cumulativeStats', JSON.stringify(cumulativeStats))
  }, [cumulativeStats])

  // Check for OAuth callback on mount
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search)
    const code = urlParams.get('code')
    const error = urlParams.get('error')

    if (error) {
      console.error(`Spotify login failed: ${error}`)
      // Clean URL
      window.history.replaceState({}, document.title, window.location.pathname)
      return
    }

    if (code) {
      handleOAuthCallback(code)
      // Clean URL
      window.history.replaceState({}, document.title, window.location.pathname)
    } else {
      // Check for existing session in localStorage
      const savedSession = localStorage.getItem('spotifySession')
      if (savedSession) {
        try {
          setSpotifySession(JSON.parse(savedSession))
        } catch (e) {
          localStorage.removeItem('spotifySession')
        }
      }
    }
  }, [handleOAuthCallback])

  const handleLogin = async () => {
    // If already logged in, force logout from Spotify first to allow switching accounts
    const forceLogout = !!spotifySession
    
    // Clear local session
    if (spotifySession) {
      handleLogout()
    }
    
    try {
      // If switching accounts, force logout from Spotify first
      const loginUrl = forceLogout 
        ? 'http://localhost:3000/api/auth/login?force_logout=true'
        : 'http://localhost:3000/api/auth/login'
      
      const response = await fetch(loginUrl)
      const data = await response.json()

      if (data.authUrl) {
        // Redirect to Spotify login (or logout first if force_logout)
        window.location.href = data.authUrl
      }
    } catch (error) {
      console.error('Login error:', error)
    }
  }

  const handleLogout = () => {
    setSpotifySession(null)
    localStorage.removeItem('spotifySession')
  }

  const handleReset = () => {
    setMessages([])
    setCurrentPlaylist(null)
    setResponseId(null) // Clear response_id to start fresh conversation
    setLastRequestStats(null) // Clear last request stats
    setCumulativeStats({ // Reset cumulative stats
      total_prompt_tokens: 0,
      total_completion_tokens: 0,
      total_tokens: 0,
      total_cost_usd: 0
    })
    localStorage.removeItem('chatMessages')
    localStorage.removeItem('currentPlaylist')
    localStorage.removeItem('openaiResponseId')
    localStorage.removeItem('cumulativeStats')
  }

  const handleSendMessage = async (message) => {
    // Add user message to chat
    const userMessage = { role: 'user', content: message, timestamp: new Date() }
    setMessages(prev => [...prev, userMessage])
    setIsLoading(true)

    try {
      // With Responses API stateful conversations, we only send:
      // - The current message
      // - previous_response_id to link to the conversation
      // - session_id for backend state management
      // - currentPlaylist (always sent since user can manually edit it)
      // No need to send full chat history - API manages it automatically!
      // BUT: Playlist state must be sent with each request since it can change independently
      const response = await fetch('http://localhost:3000/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message,
          previous_response_id: responseId, // Link to previous response for stateful conversation
          session_id: 'user_session', // Simple session identifier (in production, use actual user ID)
          currentPlaylist: currentPlaylist ? {
            songs: currentPlaylist.songs.map(s => typeof s === 'string' ? s : s.name)
          } : null,
          model: selectedModel
        }),
      })

      const data = await response.json()

      // Add AI response to chat
      const aiMessage = { role: 'ai', content: data.reply, timestamp: new Date() }
      setMessages(prev => [...prev, aiMessage])

      // Store response_id for next request (stateful conversations)
      if (data.response_id) {
        setResponseId(data.response_id)
      }

      // Update token usage and cost stats
      if (data.usage) {
        // Set last request stats
        setLastRequestStats({
          ...data.usage,
          model: data.model
        })

        // Update cumulative stats
        setCumulativeStats(prev => ({
          total_prompt_tokens: prev.total_prompt_tokens + (data.usage.prompt_tokens || 0),
          total_completion_tokens: prev.total_completion_tokens + (data.usage.completion_tokens || 0),
          total_tokens: prev.total_tokens + (data.usage.total_tokens || 0),
          total_cost_usd: prev.total_cost_usd + (data.usage.cost_usd || 0)
        }))
      }

      // Create playlist if songs are provided
      if (data.songs && data.songs.length > 0) {
        try {
          const playlistResponse = await fetch('http://localhost:3000/api/playlist', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ songs: data.songs }),
          })

          const playlistData = await playlistResponse.json()
          setCurrentPlaylist(playlistData)
        } catch (error) {
          console.error('Error creating playlist:', error)
        }
      }
    } catch (error) {
      console.error('Error sending message:', error)
      const errorMessage = {
        role: 'ai',
        content: 'Sorry, there was an error processing your message.',
        timestamp: new Date()
      }
      setMessages(prev => [...prev, errorMessage])
    } finally {
      setIsLoading(false)
    }
  }

  const handleUpload = () => {
    if (!currentPlaylist) return

    // Check if user has verified songs
    const verifiedCount = currentPlaylist.songs.filter(
      s => typeof s === 'object' && s.verified
    ).length

    if (verifiedCount === 0) {
      alert('No verified songs to upload. Please verify songs using the edit button.')
      return
    }

    // Show playlist name modal first
    setShowPlaylistNameModal(true)
  }

  const handlePlaylistNameConfirm = async (playlistName) => {
    setShowPlaylistNameModal(false)

    // Check if user is logged in
    if (!spotifySession || !spotifySession.sessionId) {
      const login = confirm('You need to log in to Spotify first. Continue to login?')
      if (login) {
        await handleLogin()
      }
      return
    }

    // Upload the playlist
    try {
      const response = await fetch('http://localhost:3000/api/upload', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          playlist: currentPlaylist,
          sessionId: spotifySession.sessionId,
          playlistName: playlistName
        }),
      })

      const data = await response.json()

      if (data.success) {
        alert(`Success! ${data.message}\n\nPlaylist URL: ${data.spotifyUrl}`)
      } else {
        if (data.error && data.error.includes('authenticated')) {
          // Session expired, clear it and prompt to login again
          setSpotifySession(null)
          localStorage.removeItem('spotifySession')
          const login = confirm('Your session expired. Please log in again to upload.')
          if (login) {
            await handleLogin()
          }
        } else {
          alert(`Error: ${data.error || 'Failed to upload playlist'}`)
        }
      }
    } catch (error) {
      console.error('Error uploading playlist:', error)
      alert('Error uploading playlist. Please try again.')
    }
  }

  const handleUpdateSong = (songIndex, selectedTrack) => {
    if (!currentPlaylist) return

    const updatedSongs = [...currentPlaylist.songs]

    // Update the song at the specified index
    updatedSongs[songIndex] = {
      name: `${selectedTrack.name} - ${selectedTrack.artist}`,
      verified: true,
      spotifyId: selectedTrack.id,
      spotifyUrl: selectedTrack.spotifyUrl,
      image: selectedTrack.image || null
    }

    setCurrentPlaylist({
      ...currentPlaylist,
      songs: updatedSongs,
      songCount: updatedSongs.length
    })
  }

  const handleRemoveSong = (songIndex) => {
    if (!currentPlaylist) return

    const updatedSongs = currentPlaylist.songs.filter((_, idx) => idx !== songIndex)

    if (updatedSongs.length === 0) {
      setCurrentPlaylist(null)
    } else {
      setCurrentPlaylist({
        ...currentPlaylist,
        songs: updatedSongs,
        songCount: updatedSongs.length
      })
    }
  }

  const handleAddSong = async (selectedTrack) => {
    const newSong = {
      name: `${selectedTrack.name} - ${selectedTrack.artist}`,
      verified: true,
      spotifyId: selectedTrack.id,
      spotifyUrl: selectedTrack.spotifyUrl,
      image: selectedTrack.image || null
    }

    if (!currentPlaylist) {
      // Create new playlist with the first song
      setCurrentPlaylist({
        songs: [newSong],
        songCount: 1
      })
    } else {
      // Add song to existing playlist
      const updatedSongs = [...currentPlaylist.songs, newSong]
      setCurrentPlaylist({
        ...currentPlaylist,
        songs: updatedSongs,
        songCount: updatedSongs.length
      })
    }
  }

  return (
    <div className="min-h-screen bg-[#121212]">
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        <div className="flex items-center justify-center gap-4 mb-8">
          <h1 className="text-4xl font-bold text-white">
            AI Playlist Generator
          </h1>
          <button
            onClick={handleReset}
            className="px-4 py-2 bg-[#282828] text-white rounded-lg hover:bg-[#404040] transition-colors text-sm flex items-center gap-2"
            title="Reset chat and playlist"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Reset
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Chat Window */}
          <div className="bg-[#181818] rounded-lg shadow-lg p-6 border border-[#282828]">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-2xl font-semibold text-white">Chat</h2>
              <div className="flex items-center gap-2">
                <label className="text-sm text-[#b3b3b3]">Model:</label>
                  <select
                    value={selectedModel}
                    onChange={(e) => setSelectedModel(e.target.value)}
                    className="px-3 py-1.5 bg-[#121212] text-white border border-[#404040] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1DB954] text-sm"
                  >
                    <option value="gpt-5-mini">GPT-5 Mini</option>
                    <option value="gpt-5">GPT-5</option>
                  </select>
              </div>
            </div>
            <ChatWindow
              messages={messages}
              onSendMessage={handleSendMessage}
              isLoading={isLoading}
            />
          </div>

          {/* Playlist Window */}
          <div className="bg-[#181818] rounded-lg shadow-lg p-6 border border-[#282828] flex flex-col min-h-0">
            <div className="flex items-center justify-between mb-4 flex-shrink-0">
              <h2 className="text-2xl font-semibold text-white">Playlist</h2>
              {spotifySession ? (
                <div className="flex items-center gap-3 text-sm">
                  <div className="flex items-center gap-2">
                    <span className="text-[#b3b3b3]">Logged in as:</span>
                    <span className="text-[#1DB954] font-medium">{spotifySession.user.name}</span>
                  </div>
                  <button
                    onClick={handleLogout}
                    className="px-3 py-1 bg-[#282828] text-white rounded hover:bg-[#404040] transition-colors text-xs"
                  >
                    Logout
                  </button>
                </div>
              ) : (
                <button
                  onClick={handleLogin}
                  className="px-3 py-1 bg-[#282828] text-white rounded hover:bg-[#404040] transition-colors text-xs"
                >
                  Log in to Spotify
                </button>
              )}
            </div>
            <div className="flex-1 min-h-0 flex flex-col">
              <ResponseWindow
                playlist={currentPlaylist}
                onUpdateSong={handleUpdateSong}
                onRemoveSong={handleRemoveSong}
                onAddSong={handleAddSong}
              />
            </div>
            <div className="mt-4 space-y-2 flex-shrink-0">
              <UploadButton
                onUpload={handleUpload}
                disabled={!currentPlaylist}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Dev Info Panel */}
      <div className="container mx-auto px-4 py-2 max-w-6xl mt-4">
        <div className="bg-[#181818] rounded-lg shadow-lg p-3 border border-[#282828]">
          <div className="flex items-center justify-between text-xs text-[#b3b3b3]">
            <div className="flex items-center gap-6">
              <div>
                <span className="text-[#727272]">Last Request: </span>
                {lastRequestStats ? (
                  <span className="text-white">
                    {lastRequestStats.total_tokens.toLocaleString()} tokens 
                    ({lastRequestStats.prompt_tokens.toLocaleString()} + {lastRequestStats.completion_tokens.toLocaleString()}) 
                    • ${lastRequestStats.cost_usd.toFixed(6)} • {lastRequestStats.model}
                  </span>
                ) : (
                  <span className="text-[#404040]">No requests yet</span>
                )}
              </div>
              <div>
                <span className="text-[#727272]">Total: </span>
                <span className="text-white">
                  {cumulativeStats.total_tokens.toLocaleString()} tokens 
                  ({cumulativeStats.total_prompt_tokens.toLocaleString()} + {cumulativeStats.total_completion_tokens.toLocaleString()}) 
                  • ${cumulativeStats.total_cost_usd.toFixed(6)}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <PlaylistNameModal
        isOpen={showPlaylistNameModal}
        onClose={() => setShowPlaylistNameModal(false)}
        onConfirm={handlePlaylistNameConfirm}
        currentName={currentPlaylist?.name}
      />
    </div>
  )
}

export default App

