import React from "react";
import { Music, Calendar, Clock, AlertCircle, Play, Loader } from "lucide-react";
import { YoutubeIcon } from "./Icons";

export default function EpisodeGrid({ episodes, onSelectEpisode }) {
  if (episodes.length === 0) {
    return (
      <div className="bg-slate-900/50 border border-slate-800/80 rounded-2xl p-12 text-center">
        <Loader className="w-8 h-8 text-indigo-400 mx-auto mb-4 animate-spin" />
        <h3 className="text-lg font-bold text-white mb-1">No episodes processed yet</h3>
        <p className="text-sm text-slate-450 max-w-sm mx-auto">
          Paste a YouTube or Spotify link above to generate your first set of podcast highlights and start chatting.
        </p>
      </div>
    );
  }

  // Format date helper
  function formatDate(timestamp) {
    if (!timestamp) return "Just now";
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
      {episodes.map((ep) => {
        const isProcessing = ep.status === "processing";
        const isFailed = ep.status === "failed";
        const isCompleted = ep.status === "completed";

        return (
          <div
            key={ep.id}
            onClick={() => isCompleted && onSelectEpisode(ep.id)}
            className={`bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-lg transition-all duration-300 flex flex-col group ${
              isCompleted ? "hover:border-indigo-500/50 hover:shadow-indigo-500/5 cursor-pointer hover:-translate-y-0.5" : ""
            }`}
          >
            {/* Episode Image Preview */}
            <div className="relative aspect-video bg-slate-950 flex items-center justify-center overflow-hidden border-b border-slate-800">
              {ep.thumbnailUrl ? (
                <img
                  src={ep.thumbnailUrl}
                  alt={ep.title}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                />
              ) : (
                <div className="absolute inset-0 bg-gradient-to-br from-indigo-900/40 to-purple-900/40 flex items-center justify-center">
                  {ep.sourceType === "youtube" ? (
                    <YoutubeIcon className="w-12 h-12 text-red-500/20" />
                  ) : (
                    <Music className="w-12 h-12 text-emerald-500/20" />
                  )}
                </div>
              )}
              
              {/* Source Badge */}
              <div className="absolute top-3 right-3 z-10">
                {ep.sourceType === "youtube" ? (
                  <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-red-500 bg-red-500/10 px-2 py-1 rounded-md border border-red-500/20 backdrop-blur-md">
                    <YoutubeIcon className="w-3 h-3" />
                    YouTube
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-emerald-500 bg-emerald-500/10 px-2 py-1 rounded-md border border-emerald-500/20 backdrop-blur-md">
                    <Music className="w-3 h-3" />
                    Spotify
                  </span>
                )}
              </div>

              {/* Hover overlay */}
              {isCompleted && (
                <div className="absolute inset-0 bg-slate-950/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                  <div className="p-3 rounded-full bg-indigo-600 text-white shadow-lg">
                    <Play className="w-6 h-6 fill-current" />
                  </div>
                </div>
              )}
            </div>

            {/* Content Details */}
            <div className="p-5 flex-1 flex flex-col justify-between">
              <div>
                <h3 className="font-bold text-white leading-snug line-clamp-2 mb-2 group-hover:text-indigo-400 transition-colors">
                  {ep.title || "Processing Podcast..."}
                </h3>
                {ep.channel && (
                  <p className="text-xs text-slate-400 mb-4">{ep.channel}</p>
                )}
              </div>

              {/* Status and Progress rendering */}
              <div className="mt-auto space-y-3">
                {isProcessing && (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-indigo-400 flex items-center gap-1.5 font-medium">
                        <span className="w-2 h-2 rounded-full bg-indigo-500 animate-ping"></span>
                        {ep.statusText || "Processing..."}
                      </span>
                      <span className="text-slate-400">{ep.progress || 0}%</span>
                    </div>
                    <div className="w-full h-1.5 bg-slate-950 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-indigo-600 rounded-full transition-all duration-500"
                        style={{ width: `${ep.progress || 0}%` }}
                      ></div>
                    </div>
                  </div>
                )}

                {isFailed && (
                  <div className="flex items-start gap-2 text-xs text-red-400 bg-red-500/5 p-3 rounded-lg border border-red-500/10">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span className="line-clamp-2">{ep.statusText || "An error occurred"}</span>
                  </div>
                )}

                {isCompleted && (
                  <div className="flex items-center gap-4 text-xs text-slate-450 border-t border-slate-800 pt-3">
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5" />
                      {formatDate(ep.createdAt)}
                    </span>
                    {ep.duration > 0 && (
                      <span className="flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5" />
                        {Math.round(ep.duration / 60)} min
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
