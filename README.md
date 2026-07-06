# PodMind 🎙️🤖

PodMind is an AI-powered podcast intelligence platform. Paste a YouTube or Spotify podcast link, and the app uses Google Gemini and FFmpeg to transcribe the episode, extract viral highlights, slice video clips, and provide an interactive AI chatbot helper that deep-links directly to timestamps.

---

## ✨ Core Features

*   **Smart Link Processing**: Auto-detects YouTube or Spotify links. Tracks progress in real-time with an active visual progress bar.
*   **AI Highlight Detection**: Sends transcript context to Google Gemini (`gemini-2.5-flash`) to identify the most engaging, hilarious, or high-value insights in JSON format.
*   **Ultra-Fast Video Slicing (YouTube)**: Downloads low-res versions of YouTube videos and cuts them using FFmpeg copy-codecs in less than 1 second (no re-encoding delay), then uploads them to Cloud Storage.
*   **Canvas Quote Cards (Spotify)**: Renders a shareable, stylized typography quote card on an HTML5 Canvas and exports it as a PNG image for social media sharing.
*   **Interactive Chatbot ("Ask PodMind")**: A conversational AI panel powered by Gemini. You can ask questions about the podcast, and the AI will reply with clickable timestamps (e.g. `[02:15]`) that programmatically seek the video player to that exact second.
*   **Interactive Transcript**: A scrolling transcript panel with clickable timeline timestamps that jump the player to the selected moment.
*   **User Profiles & History**: Firebase Auth integration (supporting Google and Email/Password sign-ins) and user history dashboards.

---

## 🛠️ Tech Stack

*   **Frontend**: React.js (Vite), Tailwind CSS v4, Lucide Icons, HTML5 Canvas API.
*   **Backend**: Node.js (Express dev server locally, Firebase Cloud Functions in production).
*   **AI Orchestra**: Google Gemini API (`gemini-2.5-flash`).
*   **Video Slicing**: FFmpeg (via `fluent-ffmpeg` and `@ffmpeg-installer/ffmpeg` binaries).
*   **YouTube Fetching**: `youtube-dl-exec` (native `yt-dlp` wrapper) and `youtube-transcript`.

---

## 🚀 Running Locally (Offline Dev Server)

To facilitate offline development without complex Firebase console configurations or Java version compatibility issues, the project is equipped with an **Express local dev server** and a **JSON-based database backup**.

### Prerequisites
*   Node.js (v18 or above)
*   Google Gemini API Key

### 1. Backend Setup
1. Navigate to the `functions/` directory:
    ```bash
    cd functions
    ```
2. Create a `.env` file containing your Gemini API key:
    ```env
    GEMINI_API_KEY=YOUR_GEMINI_API_KEY
    ```
3. Start the Express server:
    ```bash
    node server.js
    ```
    This will spin up the backend on `http://localhost:5001`. It will create a local database `db.json` and host sliced clips in the `public/clips/` directory.

### 2. Frontend Setup
1. In the root directory, install dependencies:
    ```bash
    npm install
    ```
2. Run the Vite development server:
    ```bash
    npm run dev
    ```
    This starts the frontend on `http://localhost:5173`. 
    
*(Note: `src/firebase.js` is pre-configured with `USE_LOCAL_MOCK = true` which redirects all Firestore/Storage requests to your Express dev server automatically.)*

---

## ☁️ Production Deployment

### 1. Backend (Firebase Cloud Functions)
1. Set up your Firebase project in the [Firebase Console](https://console.firebase.google.com/) and upgrade to the **Blaze (Pay-as-you-go) plan** (required for external API requests).
2. Set your Gemini API key as a Firebase Secret:
    ```bash
    npx firebase-tools functions:secrets:set GEMINI_API_KEY="YOUR_KEY"
    ```
3. Deploy functions, firestore rules, and storage rules:
    ```bash
    npx firebase-tools deploy
    ```

### 2. Frontend (Vercel)
1. Set the database flag `USE_LOCAL_MOCK = false` inside `src/firebase.js` and input your production Firebase Web App credentials.
2. Commit and push the changes to GitHub.
3. Import the repository into your [Vercel Dashboard](https://vercel.com/) and click **Deploy**. Vercel will automatically build the Vite assets.
