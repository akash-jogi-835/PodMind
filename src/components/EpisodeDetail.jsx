import React, { useState, useEffect, useRef } from "react";
import { db, USE_LOCAL_MOCK } from "../firebase";
import { doc, onSnapshot, collection, query, orderBy, addDoc, serverTimestamp } from "firebase/firestore";
import { useAuth } from "../context/AuthContext";
import QuoteCard from "./QuoteCard";
import { 
  ArrowLeft, Music, MessageSquare, FileText, Send, Sparkles, 
  Play, Download, ExternalLink, Clock, User, Film, AlertCircle, Loader
} from "lucide-react";
import { YoutubeIcon } from "./Icons";

export default function EpisodeDetail({ episodeId, onBack }) {
  const { currentUser } = useAuth();
  const [episode, setEpisode] = useState(null);
  const [clips, setClips] = useState([]);
  const [activeTab, setActiveTab] = useState("chat"); // chat | transcript
  const [chatMessages, setChatMessages] = useState([]);
  const [inputText, setInputText] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [activeClipModal, setActiveClipModal] = useState(null); // stores clip data for modal preview
  
  const iframeRef = useRef(null);
  const chatContainerRef = useRef(null);
  const prevMessagesCountRef = useRef(0);

  // 1. Subscribe to Episode details
  useEffect(() => {
    if (USE_LOCAL_MOCK) {
      const fetchEpisode = async () => {
        try {
          const res = await fetch(`http://localhost:5001/api/episodes/${episodeId}`);
          if (res.ok) {
            const data = await res.json();
            setEpisode(data);
          }
        } catch (e) {
          console.error("Local fetch episode failed:", e);
        }
      };
      fetchEpisode();
      const interval = setInterval(fetchEpisode, 2500);
      return () => clearInterval(interval);
    } else {
      const unsub = onSnapshot(doc(db, "episodes", episodeId), (docSnap) => {
        if (docSnap.exists()) {
          setEpisode({ id: docSnap.id, ...docSnap.data() });
        }
      });
      return unsub;
    }
  }, [episodeId]);

  // 2. Subscribe to Episode clips
  useEffect(() => {
    if (USE_LOCAL_MOCK) {
      const fetchClips = async () => {
        try {
          const res = await fetch(`http://localhost:5001/api/episodes/${episodeId}/clips`);
          if (res.ok) {
            const data = await res.json();
            setClips(data.sort((a, b) => a.startTime - b.startTime));
          }
        } catch (e) {
          console.error("Local fetch clips failed:", e);
        }
      };
      fetchClips();
      const interval = setInterval(fetchClips, 2500);
      return () => clearInterval(interval);
    } else {
      const unsub = onSnapshot(
        collection(db, "episodes", episodeId, "clips"),
        (querySnap) => {
          const items = [];
          querySnap.forEach((doc) => {
            items.push({ id: doc.id, ...doc.data() });
          });
          setClips(items.sort((a, b) => a.startTime - b.startTime));
        }
      );
      return unsub;
    }
  }, [episodeId]);

  // 3. Subscribe to Chat history
  useEffect(() => {
    if (USE_LOCAL_MOCK) {
      const fetchMessages = async () => {
        try {
          const res = await fetch(`http://localhost:5001/api/episodes/${episodeId}/messages`);
          if (res.ok) {
            const data = await res.json();
            setChatMessages(data);
          }
        } catch (e) {
          console.error("Local fetch messages failed:", e);
        }
      };
      fetchMessages();
      const interval = setInterval(fetchMessages, 2500);
      return () => clearInterval(interval);
    } else {
      const chatRef = collection(db, "chats", episodeId, "messages");
      const q = query(chatRef, orderBy("timestamp", "asc"));
      const unsub = onSnapshot(q, (querySnap) => {
        const msgs = [];
        querySnap.forEach((doc) => {
          msgs.push({ id: doc.id, ...doc.data() });
        });
        setChatMessages(msgs);
      });
      return unsub;
    }
  }, [episodeId]);

  // Auto-scroll chat container ONLY when a new message is received (prevents scrolling page on polling)
  useEffect(() => {
    if (chatMessages.length > prevMessagesCountRef.current) {
      if (chatContainerRef.current) {
        chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
      }
      prevMessagesCountRef.current = chatMessages.length;
    }
  }, [chatMessages]);

  // Seek YouTube player
  function seekToYouTube(seconds) {
    if (iframeRef.current) {
      // Seek command via postMessage
      iframeRef.current.contentWindow.postMessage(
        JSON.stringify({
          event: "command",
          func: "seekTo",
          args: [seconds, true],
        }),
        "*"
      );
      // Play command
      iframeRef.current.contentWindow.postMessage(
        JSON.stringify({
          event: "command",
          func: "playVideo",
          args: [],
        }),
        "*"
      );
    }
  }

  // Parse time string MM:SS or HH:MM:SS to seconds
  function parseTimeToSeconds(timeStr) {
    const parts = timeStr.split(":").map(Number);
    if (parts.length === 3) {
      return parts[0] * 3600 + parts[1] * 60 + parts[2];
    } else if (parts.length === 2) {
      return parts[0] * 60 + parts[1];
    }
    return Number(timeStr) || 0;
  }

  // Send message to Gemini chatbot Cloud Function
  async function handleSendMessage(e) {
    e.preventDefault();
    if (!inputText.trim() || chatLoading) return;

    const userMessageText = inputText;
    setInputText("");
    setChatLoading(true);

    try {
      if (USE_LOCAL_MOCK) {
        // Post user message to local server
        const name = currentUser.displayName || currentUser.email.split("@")[0];
        await fetch(`http://localhost:5001/api/episodes/${episodeId}/messages`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ role: "user", text: userMessageText, senderName: name }),
        });

        // Trigger chatbot reply (server will also write assistant reply to database)
        const history = chatMessages.map((m) => ({
          role: m.role,
          text: m.text,
        }));

        const res = await fetch("http://localhost:5001/api/chatWithEpisode", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            episodeId,
            messageHistory: history,
            newMessage: userMessageText,
          }),
        });

        if (!res.ok) {
          throw new Error("Chatbot server error.");
        }
      } else {
        // Write user message to Firestore
        const messagesCollection = collection(db, "chats", episodeId, "messages");
        await addDoc(messagesCollection, {
          role: "user",
          text: userMessageText,
          senderName: currentUser.displayName || currentUser.email.split("@")[0],
          timestamp: serverTimestamp(),
        });

        // Prepare history to send to function
        const history = chatMessages.map((m) => ({
          role: m.role,
          text: m.text,
        }));

        // Call Cloud Function locally or in production
        const functionsUrl = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"
          ? "http://localhost:5001/podmind-dev/us-central1/chatWithEpisode"
          : `https://us-central1-${episode.projectId || "podmind-dev"}.cloudfunctions.net/chatWithEpisode`;

        const response = await fetch(functionsUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            episodeId,
            messageHistory: history,
            newMessage: userMessageText,
          }),
        });

        if (!response.ok) {
          throw new Error("Chatbot failed to respond. Please try again.");
        }

        const resData = await response.json();

        // Write bot message to Firestore
        await addDoc(messagesCollection, {
          role: "assistant",
          text: resData.reply,
          senderName: "PodMind Bot",
          timestamp: serverTimestamp(),
        });
      }
    } catch (err) {
      console.error(err);
      if (USE_LOCAL_MOCK) {
        await fetch(`http://localhost:5001/api/episodes/${episodeId}/messages`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            role: "assistant",
            text: `⚠️ Chatbot Error: ${err.message}`,
            senderName: "PodMind Bot"
          }),
        });
      } else {
        const messagesCollection = collection(db, "chats", episodeId, "messages");
        await addDoc(messagesCollection, {
          role: "assistant",
          text: `⚠️ Chatbot Error: ${err.message}`,
          senderName: "PodMind Bot",
          timestamp: serverTimestamp(),
        });
      }
    } finally {
      setChatLoading(false);
    }
  }

  // Helper: Format duration in seconds
  function formatTime(seconds) {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${String(s).padStart(2, "0")}`;
  }

  // Render text containing clickable timestamps [MM:SS] or [HH:MM:SS]
  function renderMessageText(text) {
    const regex = /\[(\d{2}:\d{2}(?::\d{2})?)\]/g;
    const parts = text.split(regex);
    const matches = text.match(regex);

    if (!matches) return text;

    let matchIndex = 0;
    return parts.map((part, index) => {
      // Every odd element in parts is a match capture group
      if (index % 2 === 1) {
        const timeStr = part;
        const seconds = parseTimeToSeconds(timeStr);
        matchIndex++;
        return (
          <button
            key={index}
            onClick={() => seekToYouTube(seconds)}
            className="text-indigo-400 hover:text-indigo-300 font-semibold underline px-1 cursor-pointer inline-flex items-center gap-0.5 align-baseline"
          >
            <Clock className="w-3 h-3 inline" />
            {timeStr}
          </button>
        );
      }
      return part;
    });
  }

  if (!episode) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Loader className="w-8 h-8 text-indigo-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col space-y-6">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-800 pb-5">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-2 bg-slate-900 border border-slate-800 rounded-xl hover:border-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-xl font-bold font-display text-white line-clamp-1">{episode.title}</h1>
            <p className="text-xs text-slate-400 mt-0.5">{episode.channel || "Podcast show"}</p>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs">
          <span className="text-slate-400">Source:</span>
          {episode.sourceType === "youtube" ? (
            <a
              href={episode.sourceUrl}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 text-red-400 font-semibold bg-red-500/10 border border-red-500/20 px-2.5 py-1.5 rounded-lg"
            >
              <YoutubeIcon className="w-3.5 h-3.5" />
              Watch original
              <ExternalLink className="w-3 h-3" />
            </a>
          ) : (
            <a
              href={episode.sourceUrl}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 text-emerald-400 font-semibold bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1.5 rounded-lg"
            >
              <Music className="w-3.5 h-3.5" />
              Open Spotify
              <ExternalLink className="w-3 h-3" />
            </a>
          )}
        </div>
      </div>

      {/* Main Grid: Player & Clips (Left) / Chat & Transcript (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
        
        {/* Left Side: Player & Clips Catalog (60%) */}
        <div className="lg:col-span-3 space-y-6">
          
          {/* Player Shell */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
            {episode.sourceType === "youtube" ? (
              <div className="aspect-video w-full relative">
                <iframe
                  ref={iframeRef}
                  src={`https://www.youtube.com/embed/${episode.id}?enablejsapi=1&origin=${window.location.origin}`}
                  title={episode.title}
                  className="absolute inset-0 w-full h-full border-0"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                ></iframe>
              </div>
            ) : (
              // Spotify Audio Player Visualizer Placeholder
              <div className="p-8 bg-gradient-to-br from-indigo-950/40 to-slate-950 flex flex-col items-center justify-center text-center space-y-4">
                <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-full text-emerald-400 animate-pulse">
                  <Music className="w-10 h-10" />
                </div>
                <div>
                  <h3 className="font-bold text-white text-lg">{episode.title}</h3>
                  <p className="text-xs text-slate-400 mt-1">{episode.channel}</p>
                </div>
                <div className="flex items-center gap-1.5 w-48 h-8 justify-center">
                  <div className="w-1.5 h-6 bg-indigo-500 rounded animate-bounce [animation-delay:0.1s]"></div>
                  <div className="w-1.5 h-8 bg-purple-500 rounded animate-bounce [animation-delay:0.2s]"></div>
                  <div className="w-1.5 h-5 bg-indigo-500 rounded animate-bounce [animation-delay:0.3s]"></div>
                  <div className="w-1.5 h-7 bg-purple-500 rounded animate-bounce [animation-delay:0.4s]"></div>
                  <div className="w-1.5 h-4 bg-indigo-500 rounded animate-bounce [animation-delay:0.5s]"></div>
                </div>
                <p className="text-xs text-slate-400 italic">
                  Spotify episodes support transcript quote cards and chatbot querying.
                </p>
              </div>
            )}
            
            <div className="p-4 bg-slate-900 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
              <span className="font-semibold text-white">Interactive Player Panel</span>
              {episode.duration > 0 && (
                <span>Duration: {formatTime(episode.duration)}</span>
              )}
            </div>
          </div>

          {/* Highlights & Clips Header */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Film className="w-5 h-5 text-indigo-400" />
              <h2 className="text-lg font-bold font-display text-white">AI-Generated Highlights</h2>
            </div>

            {clips.length === 0 ? (
              <div className="bg-slate-900/30 border border-slate-850 p-6 rounded-2xl text-center text-slate-400 text-sm">
                No clips generated for this episode.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {clips.map((clip) => {
                  const isVideo = clip.type === "video";
                  return (
                    <div
                      key={clip.id}
                      className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col justify-between hover:border-indigo-500/30 hover:shadow-lg hover:shadow-indigo-500/2 transition-all group"
                    >
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded-md border border-indigo-500/20">
                            {formatTime(clip.startTime)} - {formatTime(clip.endTime)}
                          </span>
                          <span className="text-xs text-slate-500">
                            Duration: {Math.round(clip.endTime - clip.startTime)}s
                          </span>
                        </div>
                        <h3 className="font-bold text-white text-sm leading-snug line-clamp-1 group-hover:text-indigo-400 transition-colors">
                          {clip.title}
                        </h3>
                        <p className="text-xs text-slate-400 mt-1 line-clamp-2 leading-relaxed">
                          {clip.summary}
                        </p>
                      </div>

                      <div className="mt-4 border-t border-slate-800/80 pt-3 flex items-center gap-2">
                        {isVideo ? (
                          <>
                            <button
                              onClick={() => seekToYouTube(clip.startTime)}
                              className="flex-1 flex items-center justify-center gap-1 bg-slate-950 hover:bg-slate-800 border border-slate-800 text-white font-semibold py-1.5 px-3 rounded-lg text-xs transition-colors cursor-pointer"
                            >
                              <Play className="w-3.5 h-3.5 fill-current" />
                              Seek Player
                            </button>
                            <button
                              onClick={() => setActiveClipModal(clip)}
                              className="flex-1 flex items-center justify-center gap-1 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-1.5 px-3 rounded-lg text-xs transition-colors cursor-pointer shadow-md"
                            >
                              <Film className="w-3.5 h-3.5" />
                              Watch Clip
                            </button>
                          </>
                        ) : (
                          <button
                            onClick={() => setActiveClipModal(clip)}
                            className="w-full flex items-center justify-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-1.5 px-3 rounded-lg text-xs transition-colors cursor-pointer"
                          >
                            <Sparkles className="w-3.5 h-3.5" />
                            View Quote Card
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

        </div>

        {/* Right Side: Chat Bot & Transcript Panel (40%) */}
        <div className="lg:col-span-2 flex flex-col h-[75vh] min-h-[500px] bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
          {/* Tabs header */}
          <div className="flex border-b border-slate-800 bg-slate-950 p-2 gap-2">
            <button
              onClick={() => setActiveTab("chat")}
              className={`flex-1 flex items-center justify-center gap-2 py-2 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                activeTab === "chat" ? "bg-slate-900 text-white" : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <MessageSquare className="w-4 h-4" />
              Ask PodMind AI
            </button>
            <button
              onClick={() => setActiveTab("transcript")}
              className={`flex-1 flex items-center justify-center gap-2 py-2 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                activeTab === "transcript" ? "bg-slate-900 text-white" : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <FileText className="w-4 h-4" />
              Interactive Transcript
            </button>
          </div>

          {/* Panel Content Body */}
          <div ref={chatContainerRef} className="flex-1 overflow-y-auto p-4 bg-slate-900/30">
            {activeTab === "chat" ? (
              // Chat Interface
              <div className="space-y-4">
                {chatMessages.length === 0 ? (
                  <div className="text-center py-12 px-4 space-y-3">
                    <div className="p-3 bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 rounded-full inline-flex">
                      <Sparkles className="w-6 h-6" />
                    </div>
                    <h4 className="font-bold text-white text-sm">Ask anything about the podcast</h4>
                    <p className="text-xs text-slate-400 max-w-xs mx-auto leading-relaxed">
                      "What were the key takeaways?", "Find the funniest moment", or "Where did they mention career advice?"
                    </p>
                  </div>
                ) : (
                  chatMessages.map((msg) => {
                    const isUser = msg.role === "user";
                    return (
                      <div
                        key={msg.id}
                        className={`flex gap-3 max-w-[85%] ${
                          isUser ? "ml-auto flex-row-reverse" : "mr-auto"
                        }`}
                      >
                        {/* Avatar */}
                        <div
                          className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs shrink-0 font-bold ${
                            isUser ? "bg-indigo-600 text-white" : "bg-slate-800 text-indigo-400"
                          }`}
                        >
                          {isUser ? <User className="w-3.5 h-3.5" /> : "AI"}
                        </div>

                        {/* Speech Bubble */}
                        <div className="space-y-1.5">
                          <span className="text-[10px] text-slate-400 font-semibold uppercase px-1">
                            {msg.senderName}
                          </span>
                          <div
                            className={`rounded-2xl px-4 py-2.5 text-sm leading-relaxed border shadow-md ${
                              isUser
                                ? "bg-indigo-600/15 border-indigo-500/30 text-slate-100 rounded-tr-none"
                                : "bg-slate-950 border-slate-850 text-slate-100 rounded-tl-none whitespace-pre-wrap"
                            }`}
                          >
                            {isUser ? msg.text : renderMessageText(msg.text)}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            ) : (
              // Transcript Reader
              <div className="space-y-4 font-sans text-sm leading-relaxed text-slate-300 select-text">
                {episode.transcript ? (
                  episode.transcript.split("\n").map((line, idx) => {
                    // Match a timestamp like [02:15] or [12:34]
                    const timeMatch = line.match(/^\[(\d{2}:\d{2}(?::\d{2})?)\]/);
                    if (timeMatch) {
                      const timeStr = timeMatch[1];
                      const seconds = parseTimeToSeconds(timeStr);
                      const content = line.replace(timeMatch[0], "").trim();
                      
                      return (
                        <div key={idx} className="group/line py-1 flex items-start gap-3 border-b border-slate-850/50 hover:bg-slate-850/20 px-2 rounded-lg transition-colors">
                          <button
                            onClick={() => seekToYouTube(seconds)}
                            className="text-xs text-indigo-400 font-mono font-bold bg-indigo-500/10 px-1.5 py-0.5 rounded border border-indigo-500/20 cursor-pointer shrink-0 mt-0.5 hover:bg-indigo-500 hover:text-white transition-all"
                          >
                            {timeStr}
                          </button>
                          <span>{content}</span>
                        </div>
                      );
                    }
                    return <p key={idx} className="py-1">{line}</p>;
                  })
                ) : (
                  <p className="text-slate-400 text-xs italic text-center py-12">No transcript content loaded.</p>
                )}
              </div>
            )}
          </div>

          {/* Message Input Box (only visible on Chat tab) */}
          {activeTab === "chat" && (
            <form onSubmit={handleSendMessage} className="p-3 border-t border-slate-850 bg-slate-950 flex items-center gap-2">
              <input
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder={chatLoading ? "AI is typing..." : "Ask PodMind AI..."}
                disabled={chatLoading}
                className="flex-1 bg-slate-900 border border-slate-800 rounded-xl py-2 px-3 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
                required
              />
              <button
                type="submit"
                disabled={chatLoading || !inputText.trim()}
                className="p-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl transition-colors cursor-pointer disabled:opacity-50"
              >
                <Send className="w-3.5 h-3.5" />
              </button>
            </form>
          )}
        </div>

      </div>

      {/* Clip Preview Modal Overlay */}
      {activeClipModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-800 w-full max-w-2xl rounded-2xl overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-white font-display text-sm">{activeClipModal.title}</h3>
                <p className="text-[10px] text-indigo-400 font-semibold mt-0.5">
                  Highlight Clip ({formatTime(activeClipModal.startTime)} - {formatTime(activeClipModal.endTime)})
                </p>
              </div>
              <button
                onClick={() => setActiveClipModal(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg border border-transparent hover:border-slate-800 bg-slate-950 transition-colors cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4 rotate-90" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6">
              {activeClipModal.type === "video" ? (
                // Sliced MP4 Video Player
                <div className="space-y-4">
                  {activeClipModal.mediaUrl ? (
                    <div className="aspect-video w-full bg-black rounded-xl overflow-hidden shadow-inner border border-slate-800">
                      <video
                        src={activeClipModal.mediaUrl}
                        controls
                        autoPlay
                        className="w-full h-full"
                      />
                    </div>
                  ) : (
                    <div className="aspect-video w-full bg-slate-950 rounded-xl flex flex-col items-center justify-center text-center p-6 border border-slate-800">
                      <AlertCircle className="w-8 h-8 text-amber-500 mb-2" />
                      <p className="text-sm text-slate-300 font-semibold">Video clip is processing</p>
                      <p className="text-xs text-slate-400 max-w-xs mt-1">
                        Please wait a few moments or refresh the page as the backend cuts and uploads the clip.
                      </p>
                    </div>
                  )}

                  <div className="flex items-center gap-3">
                    {activeClipModal.mediaUrl && (
                      <a
                        href={activeClipModal.mediaUrl}
                        download={`${activeClipModal.title.replace(/\s+/g, "_")}.mp4`}
                        target="_blank"
                        rel="noreferrer"
                        className="flex-1 flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-2.5 px-4 rounded-xl text-sm transition-colors cursor-pointer"
                      >
                        <Download className="w-4 h-4" />
                        Download Video Clip
                      </a>
                    )}
                  </div>
                </div>
              ) : (
                // Transcript Card Creator
                <QuoteCard
                  quoteText={episode.transcript
                    ?.split("\n")
                    .filter((line) => {
                      const timeMatch = line.match(/^\[(\d{2}:\d{2}(?::\d{2})?)\]/);
                      if (timeMatch) {
                        const sec = parseTimeToSeconds(timeMatch[1]);
                        return sec >= activeClipModal.startTime && sec <= activeClipModal.endTime;
                      }
                      return false;
                    })
                    .map((line) => line.replace(/^\[(\d{2}:\d{2}(?::\d{2})?)\]/, "").trim())
                    .join(" ") || activeClipModal.summary}
                  title={episode.title}
                  channel={episode.channel}
                />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
