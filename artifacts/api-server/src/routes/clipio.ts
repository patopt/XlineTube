import { Router, type IRouter } from "express";
import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const router: IRouter = Router();

// Sur Vercel, seul le répertoire /tmp est accessible en écriture
const TEMP_DIR = "/tmp/clipio";
const CLIPS_DIR = "/tmp/clipio/clips";

// Définition de __dirname pour la compatibilité ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROCESSOR_PATH = path.join(__dirname, "../clipio/processor.py");

// Création récursive des dossiers nécessaires dans /tmp
if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });
if (!fs.existsSync(CLIPS_DIR)) fs.mkdirSync(CLIPS_DIR, { recursive: true });

function getPython3Path(): string {
  const candidates = ["/usr/bin/python3", "/usr/local/bin/python3", "python3"];
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
  } catch { /* ignore */ }
  return null;
}

function readClipsFile(jobId: string): unknown[] | null {
  const clipsFile = path.join(TEMP_DIR, `${jobId}_clips.json`);
  try {
    if (fs.existsSync(clipsFile)) {
      const raw = fs.readFileSync(clipsFile, "utf-8");
      return JSON.parse(raw);
    }
  } catch { /* ignore */ }
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
    res.status(400).json({ error: "URL YouTube invalide." });
    return;
  }

  const jobId = `job_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  const initialStatus = {
    jobId,
    status: "pending",
    progress: 0,
    message: "Job mis en attente...",
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
    message: "Traitement démarré",
    estimatedMinutes: 3,
  });
});

// GET /api/clipio/status/:jobId
router.get("/status/:jobId", (req, res) => {
  const { jobId } = req.params;
  const status = readStatusFile(jobId);
  if (!status) return res.status(404).json({ error: "Job non trouvé" });
  res.json(status);
});

// GET /api/clipio/clips/:jobId
router.get("/clips/:jobId", (req, res) => {
  const { jobId } = req.params;
  const status = readStatusFile(jobId);
  
  if (!status) return res.status(404).json({ error: "Job non trouvé" });
  if (status.status !== "completed") return res.status(400).json({ error: "Job non terminé", status: status.status });

  const rawClips = readClipsFile(jobId);
  if (!rawClips) return res.status(404).json({ error: "Clips non trouvés" });

  const baseUrl = `${req.protocol}://${req.get("host")}`;
  const clips = (rawClips as any[]).map((clip) => ({
    clipId: clip.clip_id,
    title: clip.title,
    startTime: clip.start_time,
    endTime: clip.end_time,
    duration: clip.duration,
    viralityScore: clip.virality_score,
    downloadUrl: `${baseUrl}/api/clipio/download/${path.basename(clip.file_path)}`,
    thumbnailUrl: fs.existsSync(clip.thumbnail_path) ? `${baseUrl}/api/clipio/thumbnail/${path.basename(clip.thumbnail_path)}` : null,
  }));

  res.json({ jobId, videoTitle: status.videoTitle || "Vidéo YouTube", clips });
});

// GET /api/clipio/download/:filename
router.get("/download/:filename", (req, res) => {
  const { filename } = req.params;
  if (!/^[a-zA-Z0-9_.-]+\.mp4$/.test(filename)) return res.status(400).json({ error: "Nom de fichier invalide" });
  
  const filePath = path.join(CLIPS_DIR, filename);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: "Fichier non trouvé" });
  res.download(filePath, filename);
});

// GET /api/clipio/thumbnail/:filename
router.get("/thumbnail/:filename", (req, res) => {
  const { filename } = req.params;
  if (!/^[a-zA-Z0-9_.-]+\.(jpg|jpeg|png)$/.test(filename)) return res.status(400).json({ error: "Format invalide" });

  const filePath = path.join(CLIPS_DIR, filename);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: "Miniature non trouvée" });
  res.sendFile(filePath);
});

export default router;