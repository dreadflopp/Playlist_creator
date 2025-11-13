import { useState } from "react";
import SongSearchModal from "./SongSearchModal";

function ResponseWindow({ playlist, onUpdateSong, onRemoveSong, onAddSong }) {
    const [searchModalOpen, setSearchModalOpen] = useState(false);
    const [selectedSongIndex, setSelectedSongIndex] = useState(null);

    const handleEditClick = (e, index) => {
        e.stopPropagation(); // Prevent triggering parent click handlers
        setSelectedSongIndex(index);
        setSearchModalOpen(true);
    };

    const handleRemoveClick = (e, index) => {
        e.stopPropagation(); // Prevent triggering parent click handlers
        if (onRemoveSong) {
            onRemoveSong(index);
        }
    };

    const handleAddSongClick = () => {
        setSelectedSongIndex(null); // null means we're adding a new song
        setSearchModalOpen(true);
    };

    const handleSelectTrack = (track) => {
        if (selectedSongIndex !== null && onUpdateSong) {
            // Updating existing song
            onUpdateSong(selectedSongIndex, track);
        } else if (selectedSongIndex === null && onAddSong) {
            // Adding new song
            onAddSong(track);
        }
        setSelectedSongIndex(null);
    };

    const currentSong = selectedSongIndex !== null && playlist ? playlist.songs[selectedSongIndex] : null;

    return (
        <>
            <div className="flex flex-col min-h-0 flex-1">
                {/* Playlist Display */}
                <div className="flex-1 min-h-0 flex flex-col">
                    {playlist ? (
                        <div className="bg-[#121212] rounded-lg p-4 border border-[#282828] flex flex-col flex-1 min-h-0">
                            <div className="flex items-center justify-between mb-2">
                                <div>
                                    <h3 className="text-lg font-semibold text-white">Current Playlist</h3>
                                    <p className="text-sm text-[#b3b3b3]">
                                        {playlist.songCount} {playlist.songCount === 1 ? "song" : "songs"}
                                    </p>
                                </div>
                                <button onClick={handleAddSongClick} className="px-3 py-1.5 bg-[#1ED760] text-black rounded-lg hover:bg-[#3BE477] transition-colors text-sm font-medium flex items-center gap-1.5" title="Add song to playlist">
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                    </svg>
                                    Add Song
                                </button>
                            </div>
                            <div className="space-y-1 flex-1 overflow-y-auto min-h-0">
                                {playlist.songs.map((song, idx) => {
                                    // We only accept structured format: {song, artist, name, verified, ...}
                                    // name is generated from song and artist for display
                                    const songName = song.name || (song.song && song.artist ? `${song.song} - ${song.artist}` : "Unknown");
                                    const isVerified = song.verified || false;
                                    const albumImage = song.image || null;

                                    return (
                                        <div key={idx} className="bg-[#181818] hover:bg-[#282828] rounded px-3 py-2 text-sm text-white transition-colors flex items-center gap-2 group">
                                            {/* Album thumbnail */}
                                            {albumImage ? (
                                                <img src={albumImage} alt={`${songName} album cover`} className="w-10 h-10 rounded object-cover flex-shrink-0" />
                                            ) : (
                                                <div className="w-10 h-10 rounded bg-[#282828] flex items-center justify-center flex-shrink-0">
                                                    <svg className="w-6 h-6 text-[#727272]" fill="currentColor" viewBox="0 0 20 20">
                                                        <path fillRule="evenodd" d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z" clipRule="evenodd" />
                                                    </svg>
                                                </div>
                                            )}
                                            <span className="text-[#b3b3b3] mr-1 w-6 text-right">{idx + 1}.</span>
                                            <span className="flex-1 truncate">{songName}</span>
                                            <div className="flex items-center gap-1">
                                                {isVerified ? (
                                                    <svg className="w-4 h-4 text-[#1ED760] flex-shrink-0" fill="currentColor" viewBox="0 0 20 20" title="Verified on Spotify">
                                                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                                                    </svg>
                                                ) : (
                                                    <svg className="w-4 h-4 text-[#727272] flex-shrink-0" fill="currentColor" viewBox="0 0 20 20" title="Not found on Spotify">
                                                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                                                    </svg>
                                                )}
                                                <button onClick={(e) => handleEditClick(e, idx)} className="opacity-0 group-hover:opacity-100 transition-opacity text-[#b3b3b3] hover:text-white p-1" title="Search and update song">
                                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                                    </svg>
                                                </button>
                                                <button onClick={(e) => handleRemoveClick(e, idx)} className="opacity-0 group-hover:opacity-100 transition-opacity text-[#ef4444] hover:text-[#f87171] p-1" title="Remove song from playlist">
                                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                    </svg>
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    ) : (
                        <div className="bg-[#121212] rounded-lg p-4 border border-[#282828] flex-1 flex flex-col items-center justify-center min-h-0">
                            <p className="text-sm text-[#b3b3b3] text-center mb-4">No playlist created yet. Chat with the AI to generate one or add songs manually!</p>
                            <button onClick={handleAddSongClick} className="px-4 py-2 bg-[#1ED760] text-black rounded-lg hover:bg-[#3BE477] transition-colors text-sm font-medium flex items-center gap-2" title="Add song to playlist">
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                </svg>
                                Add First Song
                            </button>
                        </div>
                    )}
                </div>
            </div>

            <SongSearchModal
                isOpen={searchModalOpen}
                onClose={() => {
                    setSearchModalOpen(false);
                    setSelectedSongIndex(null);
                }}
                currentSong={selectedSongIndex !== null ? currentSong : null}
                onSelect={handleSelectTrack}
            />
        </>
    );
}

export default ResponseWindow;
