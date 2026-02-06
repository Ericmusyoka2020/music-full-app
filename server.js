
const express = require("express");
const axios = require("axios");
const cors = require("cors");
const compression = require("compression");
const { spawn } = require("child_process");

const app = express();

// Middleware
app.use(cors());
app.use(compression());
app.use(express.json());

// Important for Render / Railway / Fly.io etc.
const PORT = process.env.PORT || 5000;

// Simple health check endpoint (Render requires something to respond on root)
app.get("/", (req, res) => {
  res.status(200).json({
    status: "ok",
    message: "YouTube downloader API is running",
    time: new Date().toISOString(),
  });
});

// API Keys – better to use env var in production
// Format on Render: API_KEYS=key1,key2,key3,key4
const API_KEYS = (process.env.API_KEYS || "AIzaSyA-l_XgaybOFDy5pmmHsLnAnvcR9Ttm5r0").split(",");
let keyIndex = 0;

function getNextKey() {
  const key = API_KEYS[keyIndex];
  keyIndex = (keyIndex + 1) % API_KEYS.length;
  return key;
}

// Search endpoint
app.get("/api/search", async (req, res) => {
  const query = req.query.q;
  if (!query) {
    return res.status(400).json({ error: "Missing query parameter ?q=" });
  }

  try {
    const apiKey = getNextKey();
    const { data } = await axios.get(
      `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=15&q=${encodeURIComponent(query)}&key=${apiKey}`
    );

    res.json({
      status: "success",
      data: data.items.map((item) => ({
        id: item.id.videoId,
        title: item.snippet.title,
        thumbnails: item.snippet.thumbnails,
        channel: item.snippet.channelTitle,
      })),
    });
  } catch (err) {
    console.error("Search error:", err.message);
    res.status(500).json({ status: "error", message: "YouTube API error" });
  }
});

// Download endpoint
app.get("/api/download/mp4", (req, res) => {
  const videoId = req.query.id;
  if (!videoId) {
    return res.status(400).send("Missing video id (?id=...)");
  }

  // Set headers
  res.setHeader("Content-Type", "video/mp4");
  res.setHeader("Content-Disposition", `attachment; filename="video_${videoId}.mp4"`);

  // Modern yt-dlp arguments (2024–2025 compatible)
  const ytProcess = spawn("yt-dlp", [
    "-f", "best[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]",
    "--no-playlist",
    "--user-agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
    "--extractor-args", "youtube:player_client=android,web",
    "--no-warnings",
    "--no-progress",
    `https://www.youtube.com/watch?v=${videoId}`,
    "-o", "-"
  ]);

  // Pipe video stream directly to response
  ytProcess.stdout.pipe(res);

  // Log errors / important messages
  ytProcess.stderr.on("data", (data) => {
    const msg = data.toString().trim();
    if (msg.includes("ERROR") || msg.includes("403") || msg.includes("429")) {
      console.error(`yt-dlp error: ${msg}`);
    } else if (msg) {
      console.log(`yt-dlp: ${msg}`);
    }
  });

  // Handle process exit
  ytProcess.on("close", (code) => {
    if (code !== 0) {
      console.warn(`yt-dlp exited with code ${code}`);
    }
    if (!res.headersSent) {
      res.status(500).send("Download failed");
    }
    res.end();
  });

  // Clean up if client disconnects early
  req.on("close", () => {
    if (!ytProcess.killed) {
      ytProcess.kill();
    }
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: "Not found" });
});

// Start server
const server = app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/`);
});

// Graceful shutdown (important on Render)
process.on("SIGTERM", () => {
  console.log("SIGTERM received. Shutting down gracefully...");
  server.close(() => {
    console.log("HTTP server closed.");
    process.exit(0);
  });
});

process.on("SIGINT", () => {
  console.log("SIGINT received. Shutting down...");
  server.close(() => process.exit(0));
});