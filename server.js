const express = require("express");
const axios = require("axios");
const cors = require("cors");
const compression = require("compression");
const { spawn } = require("child_process");

const app = express();
app.use(cors());
app.use(compression());
app.use(express.json());

// API Keys
const API_KEYS = ["AIzaSyA-l_XgaybOFDy5pmmHsLnAnvcR9Ttm5r0", "AIzaSyCZQQ-PkYUuWHRSUNJ_X7pdLUGJ8bLXL-8", "AIzaSyDBurYWTUdSCLeWwVXhCf4noF24-5iwyIo", "AIzaSyArQ-uZSa8rPteW4DWa26qMDSdntWf7Q4o", "AIzaSyAOrH48C3gBCbhYjYn5UTSm7uU3n-wENGY"];
let keyIndex = 0;
function getNextKey() {
    const key = API_KEYS[keyIndex];
    keyIndex = (keyIndex + 1) % API_KEYS.length;
    return key;
}

// Search
app.get("/api/search", async (req, res) => {
    const query = req.query.q;
    if (!query) return res.status(400).json({ error: "No query" });
    try {
        const apiKey = getNextKey();
        const { data } = await axios.get(`https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=15&q=${encodeURIComponent(query)}&key=${apiKey}`);
        res.json({ status: "success", data: data.items.map(item => ({
            id: item.id.videoId, title: item.snippet.title, thumbnails: item.snippet.thumbnails, channel: item.snippet.channelTitle
        }))});
    } catch (err) { res.status(500).json({ status: "error" }); }
});

// Download - UPDATED ARGUMENTS
app.get("/api/download/mp4", (req, res) => {
    const videoId = req.query.id;
    if (!videoId) return res.status(400).send("No ID");

    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Content-Disposition', `attachment; filename="video_${videoId}.mp4"`);

    // We swapped --impersonate for a custom User-Agent and android client args
    // This is much more compatible with Linux/Kali environments
    const ytProcess = spawn("yt-dlp", [
        "-f", "best[ext=mp4]", 
        "--no-playlist",
        "--user-agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "--extractor-args", "youtube:player_client=android,web",
        `https://www.youtube.com/watch?v=${videoId}`,
        "-o", "-" 
    ]);

    ytProcess.stdout.pipe(res);

    ytProcess.stderr.on("data", (data) => {
        const msg = data.toString();
        if (msg.includes("403")) console.error("❌ 403 Forbidden. YouTube blocked the IP.");
        else console.log(`yt-dlp: ${msg.trim()}`);
    });

    ytProcess.on("close", () => res.end());
    req.on("close", () => ytProcess.kill());
});

const PORT = 5000;
app.listen(PORT, () => console.log(`🚀 Server on http://localhost:${PORT}`));