const functions = require("firebase-functions");
const admin = require("firebase-admin");
const cors = require("cors")({ origin: true });
const youtubedl = require("youtube-dl-exec");
const { YoutubeTranscript } = require("youtube-transcript");
const Parser = require("rss-parser");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const ffmpegPath = require("@ffmpeg-installer/ffmpeg").path;
const ffmpeg = require("fluent-ffmpeg");
const fs = require("fs");
const path = require("path");
const os = require("os");

ffmpeg.setFfmpegPath(ffmpegPath);
admin.initializeApp();
const db = admin.firestore();
const bucket = admin.storage().bucket();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const rssParser = new Parser();

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

// Helper: Parse MM:SS or HH:MM:SS to seconds
function parseTimestamp(ts) {
  if (typeof ts === 'number') return ts;
  const parts = ts.split(':').map(Number);
  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  } else if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  }
  return Number(ts) || 0;
}

// Helper: Parse YouTube ID from URL
function getYouTubeId(url) {
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
  const match = url.match(regExp);
  return (match && match[2].length === 11) ? match[2] : null;
}

// Helper: Slice video using fluent-ffmpeg copy codec (ultra-fast)
function sliceVideo(inputPath, outputPath, startTime, duration) {
  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .setStartTime(startTime)
      .setDuration(duration)
      .videoCodec("copy")
      .audioCodec("copy")
      .output(outputPath)
      .on("end", () => {
        resolve();
      })
      .on("error", (err) => {
        reject(err);
      })
      .run();
  });
}

// Cloud Function 1: processEpisode (HTTP Request with CORS)
exports.processEpisode = functions.https.onRequest((req, res) => {
  return cors(req, res, async () => {
    try {
      if (req.method !== "POST") {
        return res.status(405).json({ error: "Method not allowed" });
      }

      const { url, manualTranscript, focus } = req.body;
      if (!url) {
        return res.status(400).json({ error: "Missing YouTube or Spotify URL" });
      }

      let sourceType = "";
      let episodeId = "";

      const ytId = getYouTubeId(url);
      if (ytId) {
        sourceType = "youtube";
        episodeId = ytId;
      } else if (url.includes("spotify.com")) {
        sourceType = "spotify";
        // Extract spotify episode ID
        const match = url.match(/episode\/([a-zA-Z0-9]+)/);
        if (match) {
          episodeId = match[1];
        } else {
          return res.status(400).json({ error: "Invalid Spotify URL" });
        }
      } else {
        return res.status(400).json({ error: "Unsupported platform link" });
      }

      // Check cache
      const episodeRef = db.collection("episodes").doc(episodeId);
      const episodeDoc = await episodeRef.get();

      if (episodeDoc.exists && episodeDoc.data().status === "completed") {
        return res.json({ episodeId, status: "completed", cached: true });
      }

      // Initialize status in Firestore
      await episodeRef.set({
        sourceUrl: url,
        sourceType,
        status: "processing",
        progress: 5,
        statusText: "Analyzing link...",
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });

      // Run long processing asynchronously in the background so HTTP request does not time out.
      // We respond immediately with the episodeId
      res.json({ episodeId, status: "processing", cached: false });

      // Background processing trigger
      processBackground(episodeId, url, sourceType, manualTranscript, focus).catch(async (err) => {
        console.error("Background processing failed:", err);
        await episodeRef.update({
          status: "failed",
          statusText: `Error: ${err.message}`,
        });
      });

    } catch (err) {
      console.error("Endpoint error:", err);
      res.status(500).json({ error: err.message });
    }
  });
});

// Background job logic
async function processBackground(episodeId, url, sourceType, manualTranscript, focus) {
  const episodeRef = db.collection("episodes").doc(episodeId);
  let title = "Podcast Episode";
  let description = "";
  let duration = 0;
  let thumbnailUrl = "";
  let channel = "Podcast Creator";
  let transcript = "";
  let rawTranscriptData = [];

  // Step 1: Metadata & Transcript Fetching
  if (sourceType === "youtube") {
    await episodeRef.update({ progress: 15, statusText: "Fetching YouTube Metadata..." });
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
      console.warn("YouTube metadata scrape failed, using fallback:", e.message);
    }

    await episodeRef.update({ progress: 30, statusText: "Extracting YouTube Transcript..." });
    try {
      const parts = await YoutubeTranscript.fetchTranscript(episodeId);
      rawTranscriptData = parts.map(p => ({
        text: p.text,
        start: Math.round(p.offset / 1000),
        duration: Math.round(p.duration / 1000)
      }));
      transcript = rawTranscriptData.map(p => `[${formatTimestamp(p.start)}] ${p.text}`).join("\n");
    } catch (e) {
      console.error("Failed to fetch transcript:", e.message);
      throw new Error("No transcription or captions available for this YouTube video. Please try a different video or upload captions manually.");
    }
  } else if (sourceType === "spotify") {
    // Spotify Path
    await episodeRef.update({ progress: 15, statusText: "Searching Spotify Podcast Metadata..." });
    
    // We try to scrape metadata via oEmbed or Apple Podcasts lookup as fallback
    // For now, let's fetch using a generic title, and if the user provided manual transcript
    if (manualTranscript) {
      transcript = manualTranscript;
    }
    
    // Attempt Apple iTunes Podcast lookup by attempting to find the show name from the user description
    // But since they paste just the link, we can let them input the title/transcript manually
    // For styling and UX, we save the status as 'awaiting_transcript' if transcript is missing
    if (!transcript) {
      await episodeRef.update({
        status: "awaiting_transcript",
        title: "Spotify Podcast Episode",
        progress: 30,
        statusText: "Awaiting manual transcript upload..."
      });
      return;
    }

    // Parse manual transcript into timestamp lines if it has them, or default it
    // If it's a block of text, we can split it into small paragraphs
    title = "Spotify Episode (Manual Transcript)";
  }

  await episodeRef.update({
    title,
    description,
    duration,
    thumbnailUrl,
    channel,
    transcript,
    progress: 50,
    statusText: "Analyzing highlights with Gemini..."
  });

  // Step 2: Highlight Detection with Gemini
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
${transcript.substring(0, 100000) /* Safety slice to avoid context limits if extremely long */}
`;

  let highlights = [];
  try {
    const result = await model.generateContent(geminiPrompt);
    const text = result.response.text();
    highlights = JSON.parse(text);
  } catch (err) {
    console.error("Gemini highlight analysis failed:", err);
    throw new Error(`AI highlight extraction failed: ${err.message}`);
  }

  await episodeRef.update({ progress: 70, statusText: "Generating clips..." });

  // Step 3: Clip Slicing / Generation
  if (sourceType === "youtube" && rawTranscriptData.length > 0) {
    // Download video locally
    await episodeRef.update({ progress: 75, statusText: "Downloading video file..." });
    const localDir = path.join(os.tmpdir(), "podmind");
    if (!fs.existsSync(localDir)) {
      fs.mkdirSync(localDir);
    }
    const localVideoName = `video_${episodeId}.mp4`;
    const localVideoPath = path.join(localDir, localVideoName);
    
    // Download lowest resolution format using yt-dlp to save RAM and time
    try {
      await youtubedl(url, {
        format: "worst[ext=mp4]/worst",
        output: localVideoName,
      }, {
        cwd: localDir // Execute inside the local directory to avoid spaces in paths
      });
      
      const downloadedFilePath = path.join(localDir, localVideoName);
      if (!fs.existsSync(downloadedFilePath)) {
        throw new Error("Downloaded video file not found.");
      }

      // Slice each highlight
      for (let i = 0; i < highlights.length; i++) {
        const h = highlights[i];
        const clipId = `clip_${i}_${Date.now()}`;
        const startSec = Math.max(0, h.start_time);
        const endSec = h.end_time > startSec ? h.end_time : startSec + 30;
        const durationSec = endSec - startSec;
        
        await episodeRef.update({ statusText: `Clipping: ${h.title}...` });
        
        const localClipPath = path.join(localDir, `clip_${clipId}.mp4`);
        await sliceVideo(downloadedFilePath, localClipPath, startSec, durationSec);
        
        // Upload to storage
        const destination = `clips/${episodeId}/${clipId}.mp4`;
        await bucket.upload(localClipPath, {
          destination,
          metadata: { contentType: "video/mp4" }
        });
        
        const mediaUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(destination)}?alt=media`;
        
        // Write clip to Firestore subcollection
        await episodeRef.collection("clips").doc(clipId).set({
          title: h.title,
          summary: h.summary,
          startTime: startSec,
          endTime: endSec,
          reason: h.reason,
          mediaUrl,
          type: "video"
        });
        
        // Delete local clip file
        if (fs.existsSync(localClipPath)) fs.unlinkSync(localClipPath);
      }
      
      // Delete local full video file
      if (fs.existsSync(downloadedFilePath)) fs.unlinkSync(downloadedFilePath);
      
    } catch (downloadErr) {
      console.error("Video downloading/clipping failed:", downloadErr);
      throw new Error(`Video clipping failed: ${downloadErr.message}`);
    }
  } else {
    // Spotify or Fallback card generation
    for (let i = 0; i < highlights.length; i++) {
      const h = highlights[i];
      const clipId = `clip_${i}_${Date.now()}`;
      
      // Write card details
      await episodeRef.collection("clips").doc(clipId).set({
        title: h.title,
        summary: h.summary,
        startTime: h.start_time,
        endTime: h.end_time,
        reason: h.reason,
        mediaUrl: "", // Renders dynamic card in frontend
        type: "transcriptCard"
      });
    }
  }

  // Done!
  await episodeRef.update({
    status: "completed",
    progress: 100,
    statusText: "Processing complete!"
  });
}

// Cloud Function 2: chatWithEpisode (HTTP Request with CORS)
exports.chatWithEpisode = functions.https.onRequest((req, res) => {
  return cors(req, res, async () => {
    try {
      if (req.method !== "POST") {
        return res.status(405).json({ error: "Method not allowed" });
      }

      const { episodeId, messageHistory, newMessage } = req.body;
      if (!episodeId || !newMessage) {
        return res.status(400).json({ error: "Missing episodeId or newMessage" });
      }

      // Fetch transcript
      const episodeDoc = await db.collection("episodes").doc(episodeId).get();
      if (!episodeDoc.exists) {
        return res.status(404).json({ error: "Episode not found" });
      }

      const episodeData = episodeDoc.data();
      const transcript = episodeData.transcript || "";
      const title = episodeData.title || "the podcast";

      // Call Gemini for chat response
      const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

      const chatHistory = [
        {
          role: "user",
          parts: [{ text: `Here is the transcript of the podcast episode "${title}":\n\n${transcript}\n\nYou are an AI assistant for this podcast. Respond to user queries based on this transcript. Format your answer with markdown. ALWAYS include clickable timestamp links in the format [MM:SS] or [HH:MM:SS] (e.g. [04:12]) whenever referencing specific quotes, concepts, or events, so the user can easily find that moment.` }]
        },
        {
          role: "model",
          parts: [{ text: `Understood! I am the PodMind AI assistant for "${title}". I will answer your questions using the transcript and provide clickable timestamps like [02:15] to deep-link to the exact moments.` }]
        }
      ];

      // Format input history
      if (messageHistory && Array.isArray(messageHistory)) {
        messageHistory.forEach(msg => {
          chatHistory.push({
            role: msg.role === "user" ? "user" : "model",
            parts: [{ text: msg.text }]
          });
        });
      }

      const chat = model.startChat({ history: chatHistory });
      const result = await chat.sendMessage(newMessage);
      const reply = result.response.text();

      // Return the reply
      res.json({ reply });

    } catch (err) {
      console.error("Chat error:", err);
      res.status(500).json({ error: err.message });
    }
  });
});
