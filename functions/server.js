const express = require("express");
const cors = require("cors");
const youtubedl = require("youtube-dl-exec");
const { YoutubeTranscript } = require("youtube-transcript");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const ffmpegPath = require("@ffmpeg-installer/ffmpeg").path;
const ffmpeg = require("fluent-ffmpeg");
const fs = require("fs");
const path = require("path");
const os = require("os");

ffmpeg.setFfmpegPath(ffmpegPath);

// Load env variables
require("dotenv").config({ path: path.join(__dirname, ".env") });

const app = express();
app.use(cors({ origin: true }));
app.use(express.json());

// Serve the local "public" folder for static sliced clips
const publicDir = path.join(__dirname, "public");
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir);
}
app.use("/public", express.static(publicDir));

const PORT = 5001;
const DB_PATH = path.join(__dirname, "db.json");

// Helper: Format duration in seconds to MM:SS or HH:MM:SS
function formatTimestamp(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const mStr = String(m).padStart(2, '0');
  const sStr = String(s).padStart(2, '0');
  if (h > 0) {
    const hStr = String(h).padStart(2, '0');
    return `${hStr}:${mStr}:${sStr}`;
  }
  return `${mStr}:${sStr}`;
}

// Helper: Read local DB
function readDb() {
  if (!fs.existsSync(DB_PATH)) {
    fs.writeFileSync(DB_PATH, JSON.stringify({ episodes: {}, clips: {}, chats: {} }, null, 2));
  }
  return JSON.parse(fs.readFileSync(DB_PATH, "utf8"));
}

// Helper: Write local DB
function writeDb(data) {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

// Helper: Slice video (re-mux copy codec)
function sliceVideo(inputPath, outputPath, startTime, duration) {
  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .setStartTime(startTime)
      .setDuration(duration)
      .videoCodec("copy")
      .audioCodec("copy")
      .output(outputPath)
      .on("end", () => resolve())
      .on("error", (err) => reject(err))
      .run();
  });
}

// Helper: Extract YouTube ID
function getYouTubeId(url) {
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
  const match = url.match(regExp);
  return (match && match[2].length === 11) ? match[2] : null;
}

// API Endpoints for Offline Local Testing

// Get all episodes
app.get("/api/episodes", (req, res) => {
  const dbData = readDb();
  // Return episodes as array sorted by createdAt descending
  const list = Object.values(dbData.episodes).sort((a, b) => {
    return new Date(b.createdAt) - new Date(a.createdAt);
  });
  res.json(list);
});

// Get single episode
app.get("/api/episodes/:id", (req, res) => {
  const dbData = readDb();
  const ep = dbData.episodes[req.params.id];
  if (!ep) return res.status(404).json({ error: "Episode not found" });
  res.json(ep);
});

// Get clips for episode
app.get("/api/episodes/:id/clips", (req, res) => {
  const dbData = readDb();
  const episodeClips = dbData.clips[req.params.id] || {};
  res.json(Object.values(episodeClips));
});

// Get chats for episode
app.get("/api/episodes/:id/messages", (req, res) => {
  const dbData = readDb();
  const episodeChat = dbData.chats[req.params.id] || [];
  res.json(episodeChat);
});

// Trigger processing (Express version)
app.post("/api/processEpisode", async (req, res) => {
  const { url, manualTranscript, focus, userId } = req.body;
  if (!url) return res.status(400).json({ error: "Missing URL" });

  let sourceType = "";
  let episodeId = "";

  const ytId = getYouTubeId(url);
  if (ytId) {
    sourceType = "youtube";
    episodeId = ytId;
  } else if (url.includes("spotify.com")) {
    sourceType = "spotify";
    const match = url.match(/episode\/([a-zA-Z0-9]+)/);
    if (match) {
      episodeId = match[1];
    } else {
      return res.status(400).json({ error: "Invalid Spotify URL" });
    }
  } else {
    return res.status(400).json({ error: "Unsupported platform link" });
  }

  const dbData = readDb();
  
  // Cache check
  if (dbData.episodes[episodeId] && dbData.episodes[episodeId].status === "completed") {
    return res.json({ episodeId, status: "completed", cached: true });
  }

  // Create initial doc
  dbData.episodes[episodeId] = {
    id: episodeId,
    sourceUrl: url,
    sourceType,
    status: "processing",
    progress: 5,
    statusText: "Analyzing link...",
    createdAt: new Date().toISOString(),
    createdBy: userId || "local-user"
  };
  writeDb(dbData);

  // Respond immediately
  res.json({ episodeId, status: "processing", cached: false });

  // Run in background
  processBackgroundLocal(episodeId, url, sourceType, manualTranscript, focus).catch((err) => {
    console.error("Local background process error:", err);
    const currentData = readDb();
    if (currentData.episodes[episodeId]) {
      currentData.episodes[episodeId].status = "failed";
      currentData.episodes[episodeId].statusText = `Error: ${err.message}`;
      writeDb(currentData);
    }
  });
});

// Process background job locally
async function processBackgroundLocal(episodeId, url, sourceType, manualTranscript, focus) {
  console.log(`Starting local background job for ${episodeId}...`);
  const updateStatus = (progress, statusText, extra = {}) => {
    const data = readDb();
    if (data.episodes[episodeId]) {
      data.episodes[episodeId] = {
        ...data.episodes[episodeId],
        progress,
        statusText,
        ...extra
      };
      writeDb(data);
    }
  };

  let title = "Podcast Episode";
  let description = "";
  let duration = 0;
  let thumbnailUrl = "";
  let channel = "Podcast Creator";
  let transcript = "";
  let rawTranscriptData = [];

  if (sourceType === "youtube") {
    updateStatus(15, "Fetching YouTube Metadata...");
    try {
      const metadata = await youtubedl(url, {
        dumpSingleJson: true,
        noCheckCertificates: true,
        noWarnings: true,
        preferFreeFormats: true
      });
      title = metadata.title || title;
      description = metadata.description || description;
      duration = Math.round(metadata.duration) || duration;
      thumbnailUrl = metadata.thumbnail || thumbnailUrl;
      channel = metadata.channel || channel;
    } catch (e) {
      console.warn("YouTube metadata scrape failed:", e.message);
    }

    updateStatus(30, "Extracting YouTube Transcript...");
    try {
      const parts = await YoutubeTranscript.fetchTranscript(episodeId);
      rawTranscriptData = parts.map(p => ({
        text: p.text,
        start: Math.round(p.offset / 1000),
        duration: Math.round(p.duration / 1000)
      }));
      transcript = rawTranscriptData.map(p => `[${formatTimestamp(p.start)}] ${p.text}`).join("\n");
    } catch (e) {
      console.error("Transcript fetch failed:", e.message);
      throw new Error("No transcription available for this YouTube video.");
    }
  } else if (sourceType === "spotify") {
    updateStatus(15, "Processing Spotify Podcast link...");
    if (manualTranscript) {
      transcript = manualTranscript;
    }
    if (!transcript) {
      const data = readDb();
      if (data.episodes[episodeId]) {
        data.episodes[episodeId].status = "awaiting_transcript";
        data.episodes[episodeId].progress = 30;
        data.episodes[episodeId].statusText = "Awaiting manual transcript upload...";
        writeDb(data);
      }
      return;
    }
    title = "Spotify Episode (Manual Transcript)";
  }

  updateStatus(50, "Analyzing highlights with Gemini...", {
    title, description, duration, thumbnailUrl, channel, transcript
  });

  // Call Gemini
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    generationConfig: { responseMimeType: "application/json" }
  });

  const promptFocus = focus ? `The user requested focus: "${focus}". Prioritize highlights matching this theme.` : "Find the most engaging, hilarious, or high-value insights.";
  
  const geminiPrompt = `
You are an expert podcast clip creator. Analyze this podcast transcript and extract the top 3 to 5 highlight-worthy segments.
${promptFocus}

Your output must be a strict JSON array of objects conforming to this schema:
[
  {
    "start_time": number, // in seconds
    "end_time": number, // in seconds
    "title": string, // catchy title for the clip
    "summary": string, // short 1-2 sentence description
    "reason": string // why this is interesting (emotional, insight, joke)
  }
]

Transcript:
${transcript.substring(0, 100000)}
`;

  let highlights = [];
  try {
    const result = await model.generateContent(geminiPrompt);
    const text = result.response.text();
    highlights = JSON.parse(text);
    console.log(`Gemini highlights identified: ${highlights.length}`);
  } catch (err) {
    console.error("Gemini failed:", err);
    throw new Error(`AI highlight extraction failed: ${err.message}`);
  }

  updateStatus(70, "Generating highlight clips...");

  const data = readDb();
  if (!data.clips[episodeId]) data.clips[episodeId] = {};

  if (sourceType === "youtube" && rawTranscriptData.length > 0) {
    updateStatus(75, "Downloading video file...");
    const localDir = path.join(__dirname, "temp_downloads");
    if (!fs.existsSync(localDir)) {
      fs.mkdirSync(localDir);
    }
    const localVideoName = `video_${episodeId}.mp4`;
    
    try {
      await youtubedl(url, {
        format: "worst[ext=mp4]/worst",
        output: localVideoName,
      }, {
        cwd: localDir
      });

      const downloadedFilePath = path.join(localDir, localVideoName);
      if (!fs.existsSync(downloadedFilePath)) {
        throw new Error("Downloaded video file not found.");
      }

      // Create clips output folder
      const clipsOutFolder = path.join(publicDir, "clips", episodeId);
      fs.mkdirSync(clipsOutFolder, { recursive: true });

      for (let i = 0; i < highlights.length; i++) {
        const h = highlights[i];
        const clipId = `clip_${i}_${Date.now()}`;
        const startSec = Math.max(0, h.start_time);
        const endSec = h.end_time > startSec ? h.end_time : startSec + 30;
        const durationSec = endSec - startSec;

        updateStatus(80 + Math.round((i / highlights.length) * 15), `Clipping: ${h.title}...`);

        const clipFileName = `${clipId}.mp4`;
        const localClipPath = path.join(clipsOutFolder, clipFileName);

        await sliceVideo(downloadedFilePath, localClipPath, startSec, durationSec);

        // Serving locally via Express static folder
        const mediaUrl = `http://localhost:${PORT}/public/clips/${episodeId}/${clipFileName}`;

        data.clips[episodeId][clipId] = {
          id: clipId,
          title: h.title,
          summary: h.summary,
          startTime: startSec,
          endTime: endSec,
          reason: h.reason,
          mediaUrl,
          type: "video"
        };
      }

      // Clean up temp downloads
      if (fs.existsSync(downloadedFilePath)) {
        fs.unlinkSync(downloadedFilePath);
      }

    } catch (downloadErr) {
      console.error("Local video clipping failed:", downloadErr);
      throw new Error(`Video clipping failed: ${downloadErr.message}`);
    }
  } else {
    // Spotify path (No audio slicing)
    for (let i = 0; i < highlights.length; i++) {
      const h = highlights[i];
      const clipId = `clip_${i}_${Date.now()}`;

      data.clips[episodeId][clipId] = {
        id: clipId,
        title: h.title,
        summary: h.summary,
        startTime: h.start_time,
        endTime: h.end_time,
        reason: h.reason,
        mediaUrl: "",
        type: "transcriptCard"
      };
    }
  }

  writeDb(data);
  updateStatus(100, "Processing complete!", { status: "completed" });
  console.log(`Local background job completed for ${episodeId}!`);
}

// Chat with episode chatbot (Express version)
app.post("/api/chatWithEpisode", async (req, res) => {
  const { episodeId, messageHistory, newMessage } = req.body;
  if (!episodeId || !newMessage) {
    return res.status(400).json({ error: "Missing episodeId or newMessage" });
  }

  const dbData = readDb();
  const episode = dbData.episodes[episodeId];
  if (!episode) return res.status(404).json({ error: "Episode not found" });

  try {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    const chatHistory = [
      {
        role: "user",
        parts: [{ text: `Here is the transcript of the podcast episode "${episode.title}":\n\n${episode.transcript}\n\nYou are an AI assistant for this podcast. Respond to user queries based on this transcript. Format your answer with markdown. ALWAYS include clickable timestamp links in the format [MM:SS] or [HH:MM:SS] (e.g. [04:12]) whenever referencing specific quotes, concepts, or events, so the user can easily find that moment.` }]
      },
      {
        role: "model",
        parts: [{ text: `Understood! I am the PodMind AI assistant for "${episode.title}". I will answer your questions using the transcript and provide clickable timestamps like [02:15] to deep-link to the exact moments.` }]
      }
    ];

    if (messageHistory && Array.isArray(messageHistory)) {
      messageHistory.forEach((msg) => {
        chatHistory.push({
          role: msg.role === "user" ? "user" : "model",
          parts: [{ text: msg.text }]
        });
      });
    }

    const chat = model.startChat({ history: chatHistory });
    const result = await chat.sendMessage(newMessage);
    const reply = result.response.text();

    // Store message in local DB
    if (!dbData.chats[episodeId]) dbData.chats[episodeId] = [];
    
    // Add user message
    dbData.chats[episodeId].push({
      id: `msg_user_${Date.now()}`,
      role: "user",
      text: newMessage,
      senderName: "User",
      timestamp: new Date().toISOString()
    });

    // Add bot message
    dbData.chats[episodeId].push({
      id: `msg_bot_${Date.now()}`,
      role: "assistant",
      text: reply,
      senderName: "PodMind Bot",
      timestamp: new Date().toISOString()
    });

    writeDb(dbData);

    res.json({ reply });

  } catch (err) {
    console.error("Local chat error:", err);
    res.status(500).json({ error: err.message });
  }
});

// Add message to chat manually (from client direct fetch fallback)
app.post("/api/episodes/:id/messages", async (req, res) => {
  const episodeId = req.params.id;
  const { role, text, senderName } = req.body;

  const dbData = readDb();
  if (!dbData.chats[episodeId]) dbData.chats[episodeId] = [];

  const msg = {
    id: `msg_${role}_${Date.now()}`,
    role,
    text,
    senderName,
    timestamp: new Date().toISOString()
  };

  dbData.chats[episodeId].push(msg);
  writeDb(dbData);

  res.json(msg);
});

app.listen(PORT, () => {
  console.log(`\n======================================================`);
  console.log(`PodMind Local Express Server running on:`);
  console.log(`👉 http://localhost:${PORT}`);
  console.log(`======================================================\n`);
});
