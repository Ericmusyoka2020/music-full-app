const express = require("express");
const axios = require("axios");
const cors = require("cors");
const { spawn } = require("child_process");
const path = require("path");

const app = express();
app.use(cors());

// ... (Your Search API Code) ...

app.get("/api/download/mp4", (req, res) => {
    const videoId = req.query.id;
    if (!videoId) return res.status(400).send("No ID");

    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Content-Disposition', `attachment; filename="video.mp4"`);

    // We point to the local file downloaded by the build script
    const ytDlpPath = path.join(__dirname, "yt-dlp");

    const ytProcess = spawn(ytDlpPath, [
        "-f", "best[ext=mp4]",
        "--no-playlist",
        // Force python3 to execute the script
        "--python-executable", "python3",
        "--user-agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "--extractor-args", "youtube:player_client=android,web",
        `https://www.youtube.com/watch?v=${videoId}`,
        "-o", "-"
    ]);

    ytProcess.stdout.pipe(res);

    ytProcess.stderr.on("data", (data) => console.log(`Log: ${data}`));
    ytProcess.on("close", () => res.end());
    req.on("close", () => ytProcess.kill());
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));