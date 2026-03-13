import { Router, type IRouter } from "express";
import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const router: IRouter = Router();

// Sur Vercel, seul /tmp est accessible en écriture
const TEMP_DIR = "/tmp/clipio";
const CLIPS_DIR = "/tmp/clipio/clips";

// Correction pour obtenir __dirname en mode ESM (requis pour Vercel)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROCESSOR_PATH = path.join(__dirname, "../clipio/processor.py");

// Assurer l'existence des répertoires dans /tmp
if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}
if (!fs.existsSync(CLIPS_DIR)) {
  fs.mkdirSync(CLIPS_DIR, { recursive: true });
}

function getPython3Path(): string {
  const candidates = [
    "/usr/bin/python3",
    "/usr/local/bin/python3",
    "python3",
  ];
  for (const p of candidates) {
    if (p === "python3") return p;
    if (fs.existsSync(p)) return p;
  }
  return "python3";
}

function readStatusFile(jobId: string): Record<string, unknown> | null {
  const statusFile = path.join(TEMP_DIR, `${jobId}_status.json`);
  try {
    if (fs.existsSync(statusFile)) {
      const raw = fs.readFileSync(statusFile, "utf-8");
      return JSON.parse(raw);
    }
  } catch {
    // ignore
  }
  return null;
}

function readClipsFile(jobId: string): unknown[] | null {
  const clipsFile = path.join(TEMP_DIR, `${jobId}_clips.json`);
  try {
    if (fs.existsSync(clipsFile)) {
      const raw = fs.readFileSync(clipsFile, "utf-8");
      return JSON.parse(raw);
    }
  } catch {
    // ignore
  }
  return null;
}

// POST /api/clipio/process
router.post("/process", (req, res) => {
  const { youtubeUrl, captionStyle = "tiktok", maxClips = 5 } = req.body;

  if (!youtubeUrl || typeof youtubeUrl !== "string") {
    res.status(400).json({ error: "youtubeUrl is required" });
    return;
  }

  // Validation URL YouTube
  const ytPattern = /^(https?:\/\/)?(www\.)?(youtube\.com\/(watch\?v=|shorts\/)|youtu\.be\/).+/;
  if (!ytPattern.test(youtubeUrl)) {
    res.status(400).json({ error: "Invalid YouTube URL. Please provide a valid YouTube video link." });
    return;
  }

  const jobId = `job_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  // Écriture du statut initial
  const initialStatus = {
    jobId,
    status: "pending",
    progress: 0,
    message: "Job queued...",
  };
  fs.writeFileSync(
    path.join(TEMP_DIR, `${jobId}_status.json`),
    JSON.stringify(initialStatus)
  );

  // Lancement du processeur Python
  // Note: Sur Vercel, le processus peut être interrompu après la réponse
  const python = getPython3Path();
  const child = spawn(
    python,
    [
      PROCESSOR_PATH,
      jobId,
      youtubeUrl,
      String(captionStyle),
      String(Math.min(10, Math.max(1, Number(maxClips)))),
    ],
    {
      detached: true,
      stdio: "ignore",
      env: {
        ...process.env,
      },
    }
  );
  child.unref();

  console.log(`[ClipIO] Started job ${jobId} for URL: ${youtubeUrl}`);

  res.json({
    jobId,
    message: "Video processing started",
    estimatedMinutes: 3,
  });
});

// GET /api/clipio/status/:jobId
router.get("/status/:jobId", (req, res) => {
  const { jobId } = req.params;

  if (!jobId || !/^job_\d+_[a-z0-9]+$/.test(jobId)) {
    res.status(400).json({ error: "Invalid job ID" });
    return;
  }

  const status = readStatusFile(jobId);
  if (!status) {
    res.status(404).json({ error: "Job not found" });
    return;
  }

  res.json(status);
});

// GET /api/clipio/clips/:jobId
router.get("/clips/:jobId", (req, res) => {
  const { jobId } = req.params;

  if (!jobId || !/^job_\d+_[a-z0-9]+$/.test(jobId)) {
    res.status(400).json({ error: "Invalid job ID" });
    return;
  }

  const status = readStatusFile(jobId);
  if (!status) {
    res.status(404).json({ error: "Job not found" });
    return;
  }

  if (status.status !== "completed") {
    res.status(400).json({ error: "Job is not completed yet", status: status.status });
    return;
  }

  const rawClips = readClipsFile(jobId);
  if (!rawClips) {
    res.status(404).json({ error: "Clips not found" });
    return;
  }

  const baseUrl = `${req.protocol}://${req.get("host")}`;
  const clips = (rawClips as Record<string, any>[]).map((clip) => {
    const filePath = clip.file_path as string;
    const thumbPath = clip.thumbnail_path as string;
    const fileName = path.basename(filePath);
    const thumbName = path.basename(thumbPath);

    return {
      clipId: clip.clip_id,
      title: clip.title,
      startTime: clip.start_time,
      endTime: clip.end_time,
      duration: clip.duration,
      viralityScore: clip.virality_score,
      hookType: clip.hook_type,
      reasoning: clip.reasoning,
      downloadUrl: `${baseUrl}/api/clipio/download/${fileName}`,
      thumbnailUrl: fs.existsSync(thumbPath)
        ? `${baseUrl}/api/clipio/thumbnail/${thumbName}`
        : null,
    };
  });

  res.json({
    jobId,
    videoTitle: (status.videoTitle as string) || "YouTube Video",
    clips,
  });
});

// GET /api/clipio/download/:filename
router.get("/download/:filename", (req, res) => {
  const { filename } = req.params;

  if (!/^[a-zA-Z0-9_.-]+\.mp4$/.test(filename)) {
    res.status(400).json({ error: "Invalid filename" });
    return;
  }

  const filePath = path.join(CLIPS_DIR, filename);
  if (!fs.existsSync(filePath)) {
    res.status(404).json({ error: "File not found" });
    return;
  }

  res.download(filePath, filename);
});

// GET /api/clipio/thumbnail/:filename
router.get("/thumbnail/:filename", (req, res) => {
  const { filename } = req.params;

  if (!/^[a-zA-Z0-9_.-]+\.(jpg|jpeg|png)$/.test(filename)) {
    res.status(400).json({ error: "Invalid filename" });
    return;
  }

  const filePath = path.join(CLIPS_DIR, filename);
  if (!fs.existsSync(filePath)) {
    res.status(404).json({ error: "File not found" });
    return;
  }

  res.sendFile(filePath);
});

export default router;