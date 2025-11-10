
 const express = require("express");
const axios = require("axios");
const cors = require("cors");
const compression = require("compression");
const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");
const os = require("os");

const app = express();
app.use(cors());
app.use(compression());

// ---------------- Serve frontend ----------------
app.use(express.static("public")); // "public" folder contains index.html

// ---------------- API keys rotation ----------------
const API_KEYS = [
   "AIzaSyA-l_XgaybOFDy5pmmHsLnAnvcR9Ttm5r0",
   "AIzaSyCZQQ-PkYUuWHRSUNJ_X7pdLUGJ8bLXL-8",
   "AIzaSyDBurYWTUdSCLeWwVXhCf4noF24-5iwyIo",
   "AIzaSyArQ-uZSa8rPteW4DWa26qMDSdntWf7Q4o",
   "AIzaSyAOrH48C3gBCbhYjYn5UTSm7uU3n-wENGY"
];
let keyIndex = 0;
function getNextKey() {
    const key = API_KEYS[keyIndex];
    keyIndex = (keyIndex + 1) % API_KEYS.length;
    return key;
}

// ---------------- Search endpoint ----------------
app.get("/search", async (req, res) => {
    const query = req.query.q;
    if (!query) return res.status(400).json({ error: "Missing query" });

    try {
        const apiKey = getNextKey();
        const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=20&q=${encodeURIComponent(query)}&key=${apiKey}`;
        const { data } = await axios.get(url);
        res.json(data.items);
    } catch (err) {
        res.status(500).json({ error: "Search failed", details: err.message });
    }
});

// ---------------- Download MP4 ----------------
app.get("/download/mp4", (req, res) => {
    const videoId = req.query.id;
    if (!videoId) return res.status(400).send("Missing video ID");

    const titleProcess = spawn("yt-dlp", [
        "--get-title",
        `https://www.youtube.com/watch?v=${videoId}`
    ]);

    let title = "";
    titleProcess.stdout.on("data", (data) => title += data.toString());

    titleProcess.on("close", () => {
        title = title.trim().replace(/[\/\\?%*:|"<>]/g, "_");
        const tempPath = path.join(os.tmpdir(), title);

        const process = spawn("yt-dlp", [
            "-f", "bestvideo+bestaudio/best",
            "--merge-output-format", "mp4",
            "--ffmpeg-location", "/usr/bin/ffmpeg",
            `https://www.youtube.com/watch?v=${videoId}`,
            "-o", `${tempPath}.%(ext)s`
        ]);

        process.on("close", () => {
            const finalPath = `${tempPath}.mp4`;
            res.download(finalPath, `${title}.mp4`, () => fs.unlink(finalPath, () => {}));
        });
    });
});

// ---------------- Download MP3 ----------------
app.get("/download/mp3", (req, res) => {
    const videoId = req.query.id;
    if (!videoId) return res.status(400).send("Missing video ID");

    const titleProcess = spawn("yt-dlp", [
        "--get-title",
        `https://www.youtube.com/watch?v=${videoId}`
    ]);

    let title = "";
    titleProcess.stdout.on("data", (data) => title += data.toString());

    titleProcess.on("close", () => {
        title = title.trim().replace(/[\/\\?%*:|"<>]/g, "_");
        const tempPath = path.join(os.tmpdir(), title);

        const process = spawn("yt-dlp", [
            "-x", "--audio-format", "mp3",
            "--ffmpeg-location", "/usr/bin/ffmpeg",
            `https://www.youtube.com/watch?v=${videoId}`,
            "-o", `${tempPath}.%(ext)s`
        ]);

        process.on("close", () => {
            const finalPath = `${tempPath}.mp3`;
            res.download(finalPath, `${title}.mp3`, () => fs.unlink(finalPath, () => {}));
        });
    });
});

// ---------------- Start server ----------------
const PORT = 5000;
app.listen(PORT, () => console.log(`✅ Server running on http://localhost:${PORT}`));