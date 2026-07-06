import React, { useState, useEffect } from "react";
import { AuthProvider, useAuth } from "./context/AuthContext";
import AuthView from "./components/AuthView";
import LinkInput from "./components/LinkInput";
import EpisodeGrid from "./components/EpisodeGrid";
import EpisodeDetail from "./components/EpisodeDetail";
import { db, USE_LOCAL_MOCK } from "./firebase";
import { collection, onSnapshot, addDoc, serverTimestamp } from "firebase/firestore";
import { LogOut, LayoutDashboard, Sparkles, User, History } from "lucide-react";

function MainApp() {
  const { currentUser, logout } = useAuth();
  const [activeEpisodeId, setActiveEpisodeId] = useState(null);
  const [episodes, setEpisodes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [submitError, setSubmitError] = useState("");

  // Subscribe to episodes (local Express mock vs Firestore)
  useEffect(() => {
    if (!currentUser) return;

    if (USE_LOCAL_MOCK) {
      // Local Mock DB Polling (simulating real-time)
      const fetchEpisodes = async () => {
        try {
          const res = await fetch("http://localhost:5001/api/episodes");
          if (res.ok) {
            const data = await res.json();
            // Filter by user locally
            const userEps = data.filter(ep => ep.createdBy === currentUser.uid);
            setEpisodes(userEps);
          }
        } catch (e) {
          console.warn("Offline dev server not running yet or unreachable:", e.message);
        }
      };

      fetchEpisodes();
      const interval = setInterval(fetchEpisodes, 2500);
      return () => clearInterval(interval);
    } else {
      // Real Firestore subscription
      const unsub = onSnapshot(collection(db, "episodes"), (snapshot) => {
        const items = [];
        snapshot.forEach((doc) => {
          const data = doc.data();
          if (data.createdBy === currentUser.uid) {
            items.push({ id: doc.id, ...data });
          }
        });
        // Sort client-side
        items.sort((a, b) => {
          const aTime = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0;
          const bTime = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0;
          return bTime - aTime;
        });
        setEpisodes(items);
      });
      return unsub;
    }
  }, [currentUser]);

  // Submit link to processEpisode Cloud Function or Local API
  async function handleLinkSubmit({ url, sourceType, manualTranscript, focus }) {
    setLoading(true);
    setSubmitError("");

    try {
      let data;
      if (USE_LOCAL_MOCK) {
        // Call Local Express Dev Server API
        const response = await fetch("http://localhost:5001/api/processEpisode", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            url,
            manualTranscript,
            focus,
            userId: currentUser.uid
          }),
        });

        if (!response.ok) {
          const errText = await response.text();
          throw new Error(errText || "Local analysis trigger failed");
        }

        data = await response.json();
      } else {
        // Connect to Cloud Function
        const functionsUrl = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"
          ? "http://localhost:5001/podmind-dev/us-central1/processEpisode"
          : "https://us-central1-podmind-dev.cloudfunctions.net/processEpisode";

        const response = await fetch(functionsUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url, manualTranscript, focus }),
        });

        if (!response.ok) {
          const errText = await response.text();
          throw new Error(errText || "Failed to trigger podcast analysis");
        }

        data = await response.json();
        const episodeId = data.episodeId;

        // Save metadata to Firestore
        const { doc: firestoreDoc, setDoc } = await import("firebase/firestore");
        await setDoc(firestoreDoc(db, "episodes", episodeId), {
          createdBy: currentUser.uid,
          sourceUrl: url,
          sourceType,
          createdAt: serverTimestamp(),
        }, { merge: true });
      }

      // If the episode is already completed (cached), open it immediately
      if (data.status === "completed") {
        setActiveEpisodeId(data.episodeId);
      }

    } catch (err) {
      console.error(err);
      setSubmitError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen bg-slate-950 text-slate-100 font-sans">
      {/* Sidebar navigation */}
      <aside className="w-64 bg-slate-900 border-r border-slate-800 flex flex-col justify-between p-5 hidden md:flex shrink-0">
        <div className="space-y-8">
          {/* Logo */}
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-indigo-600 text-white">
              <Sparkles className="w-5 h-5" />
            </div>
            <span className="font-extrabold text-lg tracking-tight font-display">
              Pod<span className="text-indigo-400">Mind</span>
            </span>
          </div>

          {/* Navigation Links */}
          <nav className="space-y-1.5">
            <button
              onClick={() => setActiveEpisodeId(null)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-colors cursor-pointer ${
                !activeEpisodeId ? "bg-indigo-600/10 text-indigo-400" : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <LayoutDashboard className="w-4.5 h-4.5" />
              Dashboard
            </button>
            <button
              onClick={() => setActiveEpisodeId(null)}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
            >
              <History className="w-4.5 h-4.5" />
              My History
            </button>
          </nav>
        </div>

        {/* User Card */}
        <div className="border-t border-slate-800 pt-4 space-y-3">
          <div className="flex items-center gap-3 px-1">
            <div className="w-9 h-9 rounded-lg bg-slate-800 flex items-center justify-center text-xs font-bold text-indigo-400 border border-slate-700">
              <User className="w-4.5 h-4.5" />
            </div>
            <div className="overflow-hidden">
              <p className="text-xs font-bold text-white leading-tight truncate">
                {currentUser.displayName || currentUser.email.split("@")[0]}
              </p>
              <p className="text-[10px] text-slate-400 truncate">{currentUser.email}</p>
            </div>
          </div>

          <button
            onClick={() => logout()}
            className="w-full flex items-center gap-2.5 justify-center bg-slate-950 hover:bg-slate-900 border border-slate-850 hover:border-slate-800 text-slate-400 hover:text-white font-semibold py-2 px-4 rounded-xl text-xs transition-colors cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main Panel Area */}
      <main className="flex-1 p-6 md:p-10 overflow-y-auto max-w-7xl mx-auto w-full">
        {activeEpisodeId ? (
          <EpisodeDetail
            episodeId={activeEpisodeId}
            onBack={() => setActiveEpisodeId(null)}
          />
        ) : (
          // Dashboard Catalog View
          <div className="space-y-8">
            {/* Title Intro */}
            <div>
              <h1 className="text-3xl font-extrabold font-display tracking-tight text-white sm:text-4xl">
                Intelligence Dashboard
              </h1>
              <p className="text-sm text-slate-400 mt-1.5">
                Analyze and extract highlight-worthy clips from your favorite YouTube & Spotify podcasts.
              </p>
            </div>

            {submitError && (
              <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-xs p-4 rounded-xl text-center">
                {submitError}
              </div>
            )}

            {/* Input Form */}
            <div className="max-w-3xl">
              <LinkInput onSubmit={handleLinkSubmit} loading={loading} />
            </div>

            {/* Catalog Grid */}
            <div className="space-y-4 pt-4">
              <h2 className="text-lg font-bold font-display text-white">Your Episodes Catalog</h2>
              <EpisodeGrid
                episodes={episodes}
                onSelectEpisode={setActiveEpisodeId}
              />
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AuthContextConsumer />
    </AuthProvider>
  );
}

function AuthContextConsumer() {
  const { currentUser } = useAuth();
  return currentUser ? <MainApp /> : <AuthView />;
}
