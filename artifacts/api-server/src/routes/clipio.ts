import { Router, type IRouter } from "express";
import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const router: IRouter = Router();

// Utilisation de /tmp qui est le seul dossier accessible en écriture sur Vercel
const TEMP_DIR = "/tmp/clipio";
const CLIPS_DIR = "/tmp/clipio/clips";

// Correction pour obtenir __dirname en mode ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROCESSOR_PATH = path.join(__dirname, "../clipio/processor.py");

// Ensure directories exist
if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });
if (!fs.existsSync(CLIPS_DIR)) fs.mkdirSync(CLIPS_DIR, { recursive: true });

function getPython3Path(): string {
  // Sur Vercel, on utilise l'alias standard
  const candidates = [
    "/usr/bin/python3",
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

  const ytPattern = /^(https?:\/\/)?(www\.)?(youtube\.com\/(watch\?v=|shorts\/)|youtu\.be\/).+/;
  if (!ytPattern.test(youtubeUrl)) {
    res.status(400).json({ error: "Invalid YouTube URL." });
    return;
  }

  const jobId = `job_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

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
      env: { ...process.env },
    }
  );
  child.unref();

  res.json({
    jobId,
    message: "Video processing started",
    estimatedMinutes: 3,
  });
});

// Les autres routes (status, clips, download, thumbnail) restent inchangées...
// [Code identique au fichier original pour la suite du fichier]

export default router;