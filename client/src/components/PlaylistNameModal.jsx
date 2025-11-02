import { useState, useEffect } from 'react'

function PlaylistNameModal({ isOpen, onClose, onConfirm, currentName }) {
  const [playlistName, setPlaylistName] = useState('')

  useEffect(() => {
    if (isOpen) {
      setPlaylistName(currentName || 'AI Generated Playlist')
    }
  }, [isOpen, currentName])

  const handleSubmit = (e) => {
    e.preventDefault()
    if (playlistName.trim()) {
      onConfirm(playlistName.trim())
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-[#181818] rounded-lg p-6 max-w-md w-full mx-4 border border-[#282828]" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-xl font-semibold text-white mb-4">Name Your Playlist</h3>
        <form onSubmit={handleSubmit}>
          <input
            type="text"
            value={playlistName}
            onChange={(e) => setPlaylistName(e.target.value)}
            placeholder="Enter playlist name..."
            className="w-full px-4 py-2 bg-[#121212] text-white border border-[#404040] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1DB954] placeholder-[#727272] mb-4"
            autoFocus
            maxLength={100}
          />
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 bg-[#282828] text-white rounded-lg hover:bg-[#404040] transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!playlistName.trim()}
              className="flex-1 px-4 py-2 bg-[#1DB954] text-white rounded-lg hover:bg-[#1ed760] transition-colors font-semibold disabled:bg-[#404040] disabled:text-[#727272] disabled:cursor-not-allowed"
            >
              Continue
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default PlaylistNameModal

