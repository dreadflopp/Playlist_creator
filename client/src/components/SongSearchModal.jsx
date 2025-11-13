import { useState, useEffect } from "react";

function SongSearchModal({ isOpen, onClose, currentSong, onSelect }) {
    const [songName, setSongName] = useState("");
    const [artistName, setArtistName] = useState("");
    const [results, setResults] = useState([]);
    const [isSearching, setIsSearching] = useState(false);

    // Initialize fields with current song and artist
    useEffect(() => {
        if (isOpen && currentSong) {
            let song = "";
            let artist = "";

            // We only accept structured format: {song, artist, ...}
            if (!currentSong || typeof currentSong !== "object" || !currentSong.song || !currentSong.artist) {
                console.error("Invalid song format in SongSearchModal:", currentSong);
                throw new Error(`Invalid song format: expected {song, artist}, got ${JSON.stringify(currentSong)}`);
            }
            song = currentSong.song;
            artist = currentSong.artist;

            setSongName(song);
            setArtistName(artist);

            // Perform initial search if we have at least a song name or artist name
            if (song.trim() || artist.trim()) {
                // Use inline async function to avoid dependency issues
                const performInitialSearch = async () => {
                    setIsSearching(true);
                    try {
                        const searchData = {
                            query: song.trim() && artist.trim() ? `${song.trim()} ${artist.trim()}` : song.trim() || artist.trim(),
                            song: song.trim() || undefined,
                            artist: artist.trim() || undefined,
                        };

                        const response = await fetch("http://localhost:3000/api/search", {
                            method: "POST",
                            headers: {
                                "Content-Type": "application/json",
                            },
                            body: JSON.stringify(searchData),
                        });

                        const data = await response.json();
                        setResults(data.tracks || []);
                    } catch (error) {
                        console.error("Search error:", error);
                        setResults([]);
                    } finally {
                        setIsSearching(false);
                    }
                };

                performInitialSearch();
            }
        }
    }, [isOpen, currentSong]);

    const handleSearch = async (song, artist = "") => {
        // Need at least song name or artist name to search
        if (!song.trim() && !artist.trim()) {
            setResults([]);
            return;
        }

        setIsSearching(true);
        try {
            const searchData = {
                query: song.trim() && artist.trim() ? `${song.trim()} ${artist.trim()}` : song.trim() || artist.trim(),
                song: song.trim() || undefined,
                artist: artist.trim() || undefined,
            };

            const response = await fetch("http://localhost:3000/api/search", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(searchData),
            });

            const data = await response.json();
            setResults(data.tracks || []);
        } catch (error) {
            console.error("Search error:", error);
            setResults([]);
        } finally {
            setIsSearching(false);
        }
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        handleSearch(songName, artistName);
    };

    const handleSelect = (track) => {
        onSelect(track);
        onClose();
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={onClose}>
            <div className="bg-[#181818] rounded-lg p-6 max-w-2xl w-full mx-4 max-h-[80vh] flex flex-col border border-[#282828]" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-xl font-semibold text-white">Search Spotify</h3>
                    <button onClick={onClose} className="text-[#b3b3b3] hover:text-white transition-colors">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="mb-4 space-y-3">
                    <div>
                        <label className="block text-sm text-[#b3b3b3] mb-1">Song</label>
                        <input type="text" value={songName} onChange={(e) => setSongName(e.target.value)} placeholder="Enter song name (optional)..." className="w-full px-4 py-2 bg-[#121212] text-white border border-[#404040] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1ED760] placeholder-[#727272]" autoFocus />
                    </div>
                    <div>
                        <label className="block text-sm text-[#b3b3b3] mb-1">Artist</label>
                        <input type="text" value={artistName} onChange={(e) => setArtistName(e.target.value)} placeholder="Enter artist name (optional)..." className="w-full px-4 py-2 bg-[#121212] text-white border border-[#404040] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1ED760] placeholder-[#727272]" />
                    </div>
                    <button type="submit" className="w-full px-4 py-2 bg-[#1ED760] text-black rounded-lg hover:bg-[#3BE477] transition-colors font-semibold">
                        Search
                    </button>
                </form>

                <div className="flex-1 overflow-y-auto">
                    {isSearching ? (
                        <div className="text-center py-8 text-[#b3b3b3]">Searching...</div>
                    ) : results.length === 0 ? (
                        <div className="text-center py-8 text-[#b3b3b3]">{songName || artistName ? "No results found" : "Enter a song name or artist to search"}</div>
                    ) : (
                        <div className="space-y-2">
                            {results.map((track) => (
                                <div key={track.id} onClick={() => handleSelect(track)} className="bg-[#282828] hover:bg-[#404040] rounded-lg p-3 cursor-pointer transition-colors flex items-center gap-3">
                                    {track.image && <img src={track.image} alt={track.album} className="w-12 h-12 rounded object-cover" />}
                                    <div className="flex-1 min-w-0">
                                        <p className="text-white font-medium truncate">{track.name}</p>
                                        <p className="text-[#b3b3b3] text-sm truncate">{track.artist}</p>
                                        {track.album && <p className="text-[#727272] text-xs truncate">{track.album}</p>}
                                    </div>
                                    <svg className="w-5 h-5 text-[#1ED760] flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-8.707l-3-3a1 1 0 00-1.414 0l-3 3a1 1 0 001.414 1.414L9 9.414V13a1 1 0 102 0V9.414l1.293 1.293a1 1 0 001.414-1.414z" clipRule="evenodd" />
                                    </svg>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

export default SongSearchModal;
