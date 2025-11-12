import { useState, useRef, useEffect } from "react";

function ChatWindow({ messages, onSendMessage, isLoading, lastError, onRetry }) {
    const [input, setInput] = useState("");
    const messagesEndRef = useRef(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    const handleSubmit = (e) => {
        e.preventDefault();
        if (input.trim() && !isLoading) {
            onSendMessage(input.trim());
            setInput("");
        }
    };

    return (
        <div className="flex flex-col h-[600px]">
            {/* Messages Area */}
            <div className="flex-1 overflow-y-auto mb-4 space-y-4 p-4 bg-[#121212] rounded-lg">
                {messages.length === 0 ? (
                    <p className="text-[#b3b3b3] text-center py-8">Start a conversation to create your playlist!</p>
                ) : (
                    messages.map((msg, idx) => (
                        <div key={idx} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                            <div className={`max-w-[80%] rounded-lg px-4 py-2 ${msg.role === "user" ? "bg-[#1ED760] text-black" : msg.isError ? "bg-[#5a1a1a] text-white border border-[#8b2a2a]" : "bg-[#282828] text-white"}`}>
                                <p className={`text-xs font-medium mb-1 ${msg.role === "user" ? "text-black opacity-90" : "text-[#b3b3b3]"}`}>{msg.role === "user" ? "You" : "AI"}</p>
                                <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                            </div>
                        </div>
                    ))
                )}
                {isLoading && (
                    <div className="flex justify-start">
                        <div className="bg-[#282828] text-white rounded-lg px-4 py-3">
                            <div className="flex items-end gap-1 h-5">
                                <span className="w-1 bg-[#1ED760] rounded-full animate-sound-wave" style={{ animationDelay: "0ms" }}></span>
                                <span className="w-1 bg-[#1ED760] rounded-full animate-sound-wave" style={{ animationDelay: "150ms" }}></span>
                                <span className="w-1 bg-[#1ED760] rounded-full animate-sound-wave" style={{ animationDelay: "300ms" }}></span>
                                <span className="w-1 bg-[#1ED760] rounded-full animate-sound-wave" style={{ animationDelay: "450ms" }}></span>
                                <span className="w-1 bg-[#1ED760] rounded-full animate-sound-wave" style={{ animationDelay: "600ms" }}></span>
                            </div>
                        </div>
                    </div>
                )}
                <div ref={messagesEndRef} />
            </div>

            {/* Retry Button - Only show when there's an error and not loading */}
            {lastError && !isLoading && (
                <div className="mb-2 flex justify-center">
                    <button
                        onClick={onRetry}
                        className="px-4 py-2 bg-[#1ED760] text-black rounded-lg hover:bg-[#3BE477] transition-colors font-semibold text-sm flex items-center gap-2"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                        Retry
                    </button>
                </div>
            )}

            {/* Input Form */}
            <form onSubmit={handleSubmit} className="flex gap-2">
                <input type="text" value={input} onChange={(e) => setInput(e.target.value)} placeholder="Type your message..." className="flex-1 px-4 py-2 bg-[#282828] text-white border border-[#404040] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1ED760] placeholder-[#727272] disabled:opacity-50" disabled={isLoading} />
                <button type="submit" disabled={!input.trim() || isLoading} className="px-6 py-2 bg-[#1ED760] text-black rounded-lg hover:bg-[#3BE477] disabled:bg-[#404040] disabled:text-[#727272] disabled:cursor-not-allowed transition-colors font-semibold">
                    Send
                </button>
            </form>
        </div>
    );
}

export default ChatWindow;
