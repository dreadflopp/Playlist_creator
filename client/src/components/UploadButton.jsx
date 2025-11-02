import { useState } from 'react'

function UploadButton({ onUpload, disabled }) {
  const [isUploading, setIsUploading] = useState(false)

  const handleClick = async () => {
    if (disabled || isUploading) return

    setIsUploading(true)
    try {
      await onUpload()
    } finally {
      setIsUploading(false)
    }
  }

  return (
    <button
      onClick={handleClick}
      disabled={disabled || isUploading}
      className={`w-full px-6 py-3 rounded-full font-semibold transition-all ${
        disabled
          ? 'bg-[#404040] text-[#727272] cursor-not-allowed'
          : isUploading
          ? 'bg-[#1DB954] text-white opacity-75'
          : 'bg-[#1DB954] text-white hover:bg-[#1ed760] hover:scale-105 active:scale-100'
      }`}
    >
      {isUploading ? 'Uploading...' : 'Upload Playlist to Spotify'}
    </button>
  )
}

export default UploadButton

