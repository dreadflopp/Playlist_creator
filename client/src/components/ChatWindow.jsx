import { useState, useRef, useEffect } from "react";

function ChatWindow({ messages, onSendMessage, isLoading }) {
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
                            <div className={`max-w-[80%] rounded-lg px-4 py-2 ${msg.role === "user" ? "bg-[#1DB954] text-white" : "bg-[#282828] text-white"}`}>
                                <p className={`text-xs font-medium mb-1 ${msg.role === "user" ? "text-white opacity-90" : "text-[#b3b3b3]"}`}>{msg.role === "user" ? "You" : "AI"}</p>
                                <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                            </div>
                        </div>
                    ))
                )}
                {isLoading && (
                    <div className="flex justify-start">
                        <div className="bg-[#282828] text-white rounded-lg px-4 py-3">
                            <div className="flex items-end gap-1 h-5">
                                <span className="w-1 bg-[#1DB954] rounded-full animate-sound-wave" style={{ animationDelay: "0ms" }}></span>
                                <span className="w-1 bg-[#1DB954] rounded-full animate-sound-wave" style={{ animationDelay: "150ms" }}></span>
                                <span className="w-1 bg-[#1DB954] rounded-full animate-sound-wave" style={{ animationDelay: "300ms" }}></span>
                                <span className="w-1 bg-[#1DB954] rounded-full animate-sound-wave" style={{ animationDelay: "450ms" }}></span>
                                <span className="w-1 bg-[#1DB954] rounded-full animate-sound-wave" style={{ animationDelay: "600ms" }}></span>
                            </div>
                        </div>
                    </div>
                )}
                <div ref={messagesEndRef} />
            </div>

            {/* Input Form */}
            <form onSubmit={handleSubmit} className="flex gap-2">
                <input type="text" value={input} onChange={(e) => setInput(e.target.value)} placeholder="Type your message..." className="flex-1 px-4 py-2 bg-[#282828] text-white border border-[#404040] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1DB954] placeholder-[#727272] disabled:opacity-50" disabled={isLoading} />
                <button type="submit" disabled={!input.trim() || isLoading} className="px-6 py-2 bg-[#1DB954] text-white rounded-lg hover:bg-[#1ed760] disabled:bg-[#404040] disabled:text-[#727272] disabled:cursor-not-allowed transition-colors font-semibold">
                    Send
                </button>
            </form>
        </div>
    );
}

export default ChatWindow;
