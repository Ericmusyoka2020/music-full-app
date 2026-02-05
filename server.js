const express = require("express");
const axios = require("axios");
const cors = require("cors");
const { spawn } = require("child_process");
const path = require("path");

const app = express();
app.use(cors());

const API_KEYS = ["AIzaSyA-l_XgaybOFDy5pmmHsLnAnvcR9Ttm5r0", "AIzaSyCZQQ-PkYUuWHRSUNJ_X7pdLUGJ8bLXL-8", "AIzaSyDBurYWTUdSCLeWwVXhCf4noF24-5iwyIo", "AIzaSyArQ-uZSa8rPteW4DWa26qMDSdntWf7Q4o", "AIzaSyAOrH48C3gBCbhYjYn5UTSm7uU3n-wENGY"];
let keyIndex = 0;
function getNextKey() {
    const key = API_KEYS[keyIndex];
    keyIndex = (keyIndex + 1) % API_KEYS.length;
    return key;
}

// Search endpoint
app.get("/api/search", async (req, res) => {
    const query = req.query.q;
    if (!query) return res.status(400).json({ error: "Missing query" });
    try {
        const apiKey = getNextKey();
        const response = await axios.get(`https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=10&q=${encodeURIComponent(query)}&key=${apiKey}`);
        res.json({ status: "success", data: response.data.items.map(item => ({
            id: item.id.videoId,
            title: item.snippet.title,
            thumbnails: item.snippet.thumbnails,
            channel: item.snippet.channelTitle
        }))});
    } catch (err) {
        res.status(500).json({ status: "error", message: "YouTube API check failed" });
    }
});

// Download endpoint
app.get("/api/download/mp4", (req, res) => {
    const videoId = req.query.id;
    if (!videoId) return res.status(400).send("No ID");

    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Content-Disposition', `attachment; filename="video.mp4"`);

    // Path to the yt-dlp binary we download in the build step
    const ytDlpPath = path.join(__dirname, "yt-dlp");

    const ytProcess = spawn(ytDlpPath, [
        "-f", "best[ext=mp4]",
        "--no-playlist",
        "--user-agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "--extractor-args", "youtube:player_client=android,web",
        `https://www.youtube.com/watch?v=${videoId}`,
        "-o", "-"
    ]);

    ytProcess.stdout.pipe(res);

    ytProcess.stderr.on("data", (data) => console.log(`yt-dlp: ${data}`));
    
    ytProcess.on("close", (code) => {
        if (code !== 0) console.error(`yt-dlp exited with code ${code}`);
        res.end();
    });

    req.on("close", () => ytProcess.kill());
});

// IMPORTANT: Use process.env.PORT for Render
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Backend live on port ${PORT}`));