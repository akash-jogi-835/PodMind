import React, { useState, useEffect } from "react";
import { Music, Sparkles, AlertCircle, FileText } from "lucide-react";
import { YoutubeIcon } from "./Icons";

export default function LinkInput({ onSubmit, loading }) {
  const [url, setUrl] = useState("");
  const [sourceType, setSourceType] = useState("");
  const [manualTranscript, setManualTranscript] = useState("");
  const [focus, setFocus] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!url) {
      setSourceType("");
      setError("");
      return;
    }

    if (url.includes("youtube.com") || url.includes("youtu.be")) {
      setSourceType("youtube");
      setError("");
    } else if (url.includes("spotify.com")) {
      setSourceType("spotify");
      setError("");
    } else {
      setSourceType("");
      setError("Please paste a valid YouTube or Spotify link");
    }
  }, [url]);

  function handleSubmit(e) {
    e.preventDefault();
    if (error || !url) return;
    
    if (sourceType === "spotify" && !manualTranscript.trim()) {
      setError("A manual transcript is required for Spotify episodes");
      return;
    }

    onSubmit({ url, sourceType, manualTranscript, focus });
    // Reset form after submission if needed
  }

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl relative overflow-hidden">
      {/* Decorative gradient light */}
      <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/5 rounded-full blur-3xl pointer-events-none"></div>

      <div className="flex items-center gap-3 mb-4">
        <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-400">
          <Sparkles className="w-5 h-5" />
        </div>
        <div>
          <h2 className="text-lg font-bold font-display text-white">Create Highlights</h2>
          <p className="text-xs text-slate-400">Paste an episode link to identify key insights and clips.</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
            Podcast Episode URL
          </label>
          <div className="relative">
            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl py-3 pl-4 pr-12 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
              placeholder="e.g. https://www.youtube.com/watch?v=... or https://open.spotify.com/episode/..."
              disabled={loading}
              required
            />
            <div className="absolute right-3.5 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
              {sourceType === "youtube" && (
                <span className="flex items-center gap-1 text-red-500 text-xs font-semibold bg-red-500/10 px-2 py-1 rounded-md border border-red-500/20">
                  <YoutubeIcon className="w-3.5 h-3.5" />
                  YouTube
                </span>
              )}
              {sourceType === "spotify" && (
                <span className="flex items-center gap-1 text-emerald-500 text-xs font-semibold bg-emerald-500/10 px-2 py-1 rounded-md border border-emerald-500/20">
                  <Music className="w-3.5 h-3.5" />
                  Spotify
                </span>
              )}
            </div>
          </div>
          {error && (
            <div className="flex items-center gap-1.5 mt-2 text-xs text-red-400">
              <AlertCircle className="w-3.5 h-3.5" />
              {error}
            </div>
          )}
        </div>

        {/* Focus selector */}
        <div>
          <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
            Highlight Focus (Optional)
          </label>
          <select
            value={focus}
            onChange={(e) => setFocus(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2.5 px-4 text-sm text-slate-350 focus:outline-none focus:border-indigo-500 transition-colors cursor-pointer"
            disabled={loading}
          >
            <option value="">General Highlights (Auto-detect best moments)</option>
            <option value="humor">Funny & Hilarious Moments</option>
            <option value="insight">Deep Insights & Key Explanations</option>
            <option value="quotes">Quotable & Inspirational Slogans</option>
            <option value="career">Career & Life Advice</option>
          </select>
        </div>

        {/* Manual transcript input if Spotify is pasted */}
        {sourceType === "spotify" && (
          <div className="animate-in fade-in slide-in-from-top-2 duration-300">
            <div className="flex items-center justify-between mb-2">
              <label className="block text-xs font-semibold text-slate-450 uppercase tracking-wider">
                Manual Transcript (Required for Spotify)
              </label>
              <span className="text-[10px] text-indigo-400 bg-indigo-500/10 px-1.5 py-0.5 rounded border border-indigo-500/20 flex items-center gap-1 font-medium">
                <FileText className="w-3 h-3" />
                Text Format
              </span>
            </div>
            <textarea
              value={manualTranscript}
              onChange={(e) => setManualTranscript(e.target.value)}
              rows={6}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl p-4 text-sm text-white placeholder-slate-550 focus:outline-none focus:border-indigo-500 transition-colors resize-none font-mono text-xs leading-relaxed"
              placeholder="Paste episode transcript here. If it includes timestamps in [MM:SS] format, the chatbot will be able to seek to them!"
              disabled={loading}
              required
            />
          </div>
        )}

        <button
          type="submit"
          disabled={loading || !!error || !url}
          className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-3 px-4 rounded-xl text-sm transition-colors shadow-lg shadow-indigo-600/15 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? (
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
              Processing...
            </div>
          ) : (
            <>
              <Sparkles className="w-4 h-4" />
              Analyze Podcast & Generate Clips
            </>
          )}
        </button>
      </form>
    </div>
  );
}
