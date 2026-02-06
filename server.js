const express = require("express");
const axios = require("axios");
const cors = require("cors");
const compression = require("compression");
const { spawn } = require("child_process");
const path = require("path");

const app = express();

// Middleware
app.use(cors());
app.use(compression());
app.use(express.json());

// PORT for Render
const PORT = process.env.PORT || 5000;

// Health check
app.get("/", (req, res) => {
  res.status(200).json({
    status: "ok",
    message: "YouTube downloader API is running",
    time: new Date().toISOString(),
  });
});

// Load API keys from environment
const API_KEYS = (process.env.API_KEYS || "").split(",").filter(k => k);
let keyIndex = 0;

function getNextKey() {
  if (API_KEYS.length === 0) return "";
  const key = API_KEYS[keyIndex];
  keyIndex = (keyIndex + 1) % API_KEYS.length;
  return key;
}

// Search endpoint
app.get("/api/search", async (req, res) => {
  const query = req.query.q;
  if (!query) return res.status(400).json({ error: "Missing ?q= parameter" });

  try {
    const apiKey = getNextKey();
    const { data } = await axios.get(
      `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=15&q=${encodeURIComponent(query)}&key=${apiKey}`
    );

    res.json({
      status: "success",
      data: data.items.map(item => ({
        id: item.id.videoId,
        title: item.snippet.title,
        thumbnails: item.snippet.thumbnails,
        channel: item.snippet.channelTitle
      }))
    });
  } catch (err) {
    console.error("YouTube API error:", err.message);
    res.status(500).json({ status: "error", message: "Failed to search YouTube" });
  }
});

// Download handler using local yt-dlp binary
function handleDownload(req, res, format) {
  const videoId = req.query.id;
  if (!videoId) return res.status(400).send("Missing ?id= parameter");

  let filename, contentType, ytFormat;

  if (format === "mp4") {
    filename = `video_${videoId}.mp4`;
    contentType = "video/mp4";
    ytFormat = "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best";
  } else if (format === "mp3") {
    filename = `audio_${videoId}.mp3`;
    contentType = "audio/mpeg";
    ytFormat = "bestaudio/best";
  } else {
    return res.status(400).send("Invalid format");
  }

  res.setHeader("Content-Type", contentType);
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

  // Absolute path to local yt-dlp binary
  const ytDlpPath = path.join(__dirname, "yt-dlp");

  const ytProcess = spawn(ytDlpPath, [
    "-f", ytFormat,
    "--no-playlist",
    "--embed-metadata",
    "--embed-thumbnail",
    "--audio-format", "mp3",
    "--audio-quality", "0",
    "--user-agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
    "--extractor-args", "youtube:player_client=android,web",
    "--no-warnings",
    "--no-progress",
    `https://www.youtube.com/watch?v=${videoId}`,
    "-o", "-"
  ]);

  ytProcess.stdout.pipe(res);

  ytProcess.stderr.on("data", (data) => {
    const msg = data.toString().trim();
    if (msg) console.log("yt-dlp:", msg);
  });

  ytProcess.on("close", (code) => {
    if (code !== 0 && !res.headersSent) {
      res.status(500).send("Download failed");
    }
    res.end();
  });

  req.on("close", () => {
    if (!ytProcess.killed) ytProcess.kill();
  });
}

// Video and Audio endpoints
app.get("/api/download/mp4", (req, res) => handleDownload(req, res, "mp4"));
app.get("/api/download/mp3", (req, res) => handleDownload(req, res, "mp3"));

// 404 fallback
app.use((req, res) => res.status(404).json({ error: "Endpoint not found" }));

// Start server
const server = app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// Graceful shutdown
process.on("SIGTERM", () => server.close(() => process.exit(0)));
process.on("SIGINT", () => process.exit(0));
