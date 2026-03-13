"""
ClipIO Video Processor
Analyzes YouTube videos and generates viral short clips with subtitles.
Uses: yt-dlp (download), AssemblyAI (transcription), Gemini (AI analysis), FFmpeg (video processing)
"""

import os
import sys
import json
import uuid
import logging
import asyncio
import subprocess
import re
import time
from pathlib import Path
from typing import Optional, List, Dict, Any
from dataclasses import dataclass, asdict

import assemblyai as aai
from google import genai
import yt_dlp

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")
ASSEMBLYAI_API_KEY = os.environ.get("ASSEMBLYAI_API_KEY", "")

TEMP_DIR = Path("/tmp/clipio")
CLIPS_DIR = Path("/tmp/clipio/clips")
TEMP_DIR.mkdir(parents=True, exist_ok=True)
CLIPS_DIR.mkdir(parents=True, exist_ok=True)

CAPTION_STYLES = {
    "default": {
        "font": "Arial",
        "fontsize": 28,
        "color": "white",
        "stroke_color": "black",
        "stroke_width": 2,
        "position_y": 0.75,
    },
    "hormozi": {
        "font": "Arial-Bold",
        "fontsize": 36,
        "color": "white",
        "stroke_color": "black",
        "stroke_width": 3,
        "highlight_color": "lime",
        "position_y": 0.75,
    },
    "mrbeast": {
        "font": "Arial-Bold",
        "fontsize": 42,
        "color": "yellow",
        "stroke_color": "black",
        "stroke_width": 4,
        "highlight_color": "red",
        "position_y": 0.70,
    },
    "minimal": {
        "font": "Arial",
        "fontsize": 24,
        "color": "white",
        "stroke_color": None,
        "stroke_width": 0,
        "position_y": 0.80,
    },
    "tiktok": {
        "font": "Arial-Bold",
        "fontsize": 32,
        "color": "white",
        "stroke_color": "black",
        "stroke_width": 2,
        "highlight_color": "#FE2C55",
        "position_y": 0.75,
    },
    "neon": {
        "font": "Arial-Bold",
        "fontsize": 34,
        "color": "cyan",
        "stroke_color": "#000066",
        "stroke_width": 2,
        "highlight_color": "magenta",
        "position_y": 0.75,
    },
    "podcast": {
        "font": "Arial",
        "fontsize": 26,
        "color": "white",
        "stroke_color": "#333333",
        "stroke_width": 1,
        "position_y": 0.78,
    },
}


@dataclass
class ViralSegment:
    start_time: str
    end_time: str
    text: str
    virality_score: int
    hook_type: str
    reasoning: str
    title: str


@dataclass
class GeneratedClip:
    clip_id: str
    title: str
    start_time: str
    end_time: str
    duration: float
    virality_score: int
    hook_type: str
    reasoning: str
    file_path: str
    thumbnail_path: str


def parse_time_to_seconds(time_str: str) -> float:
    """Convert MM:SS or HH:MM:SS to seconds."""
    parts = time_str.strip().split(":")
    try:
        if len(parts) == 2:
            return int(parts[0]) * 60 + float(parts[1])
        elif len(parts) == 3:
            return int(parts[0]) * 3600 + int(parts[1]) * 60 + float(parts[2])
    except Exception:
        pass
    return 0.0


def seconds_to_time(seconds: float) -> str:
    """Convert seconds to MM:SS format."""
    m = int(seconds) // 60
    s = int(seconds) % 60
    return f"{m:02d}:{s:02d}"


def get_video_id(url: str) -> Optional[str]:
    """Extract YouTube video ID from URL."""
    patterns = [
        r'(?:youtube\.com/watch\?v=|youtu\.be/|youtube\.com/shorts/)([a-zA-Z0-9_-]{11})',
        r'youtube\.com/embed/([a-zA-Z0-9_-]{11})',
    ]
    for pattern in patterns:
        match = re.search(pattern, url)
        if match:
            return match.group(1)
    return None


def download_video(url: str, job_id: str) -> Optional[Path]:
    """Download YouTube video using yt-dlp."""
    output_path = TEMP_DIR / f"{job_id}.%(ext)s"
    
    ydl_opts = {
        "outtmpl": str(output_path),
        "format": "bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]/best[height<=1080][ext=mp4]/best[height<=1080]/best",
        "merge_output_format": "mp4",
        "noplaylist": True,
        "quiet": True,
        "no_warnings": True,
        "retries": 3,
        "http_headers": {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        },
    }
    
    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            ydl.download([url])
        
        # Find the downloaded file
        for ext in ["mp4", "mkv", "webm", "avi"]:
            candidate = TEMP_DIR / f"{job_id}.{ext}"
            if candidate.exists():
                return candidate
        
        # Search for any matching file
        for f in TEMP_DIR.glob(f"{job_id}.*"):
            if f.suffix in [".mp4", ".mkv", ".webm"]:
                return f
                
        logger.error(f"Downloaded file not found for job {job_id}")
        return None
    except Exception as e:
        logger.error(f"Download failed: {e}")
        return None


def get_video_title(url: str) -> str:
    """Get the title of a YouTube video."""
    ydl_opts = {"quiet": True, "no_warnings": True}
    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)
            return info.get("title", "YouTube Video")
    except Exception:
        return "YouTube Video"


def get_video_duration(video_path: Path) -> float:
    """Get video duration in seconds using ffprobe."""
    cmd = [
        "ffprobe", "-v", "quiet", "-print_format", "json",
        "-show_format", str(video_path)
    ]
    try:
        result = subprocess.run(cmd, capture_output=True, text=True)
        data = json.loads(result.stdout)
        return float(data["format"]["duration"])
    except Exception:
        return 0.0


def transcribe_video(video_path: Path) -> List[Dict]:
    """Transcribe video using AssemblyAI and return words with timestamps."""
    aai.settings.api_key = ASSEMBLYAI_API_KEY
    transcriber = aai.Transcriber()
    
    config = aai.TranscriptionConfig(
        speaker_labels=False,
        punctuate=True,
        format_text=True,
        speech_models=["universal-2"],
    )
    
    logger.info(f"Transcribing: {video_path}")
    transcript = transcriber.transcribe(str(video_path), config=config)
    
    if transcript.status == aai.TranscriptStatus.error:
        raise Exception(f"AssemblyAI error: {transcript.error}")
    
    # Build timestamped transcript text
    words = []
    if transcript.words:
        for word in transcript.words:
            words.append({
                "text": word.text,
                "start": word.start / 1000.0,  # ms to seconds
                "end": word.end / 1000.0,
            })
    
    return words


def build_transcript_text(words: List[Dict]) -> str:
    """Build a readable transcript with timestamps for AI analysis."""
    if not words:
        return ""
    
    segments = []
    current_segment = []
    current_start = None
    
    for word in words:
        if current_start is None:
            current_start = word["start"]
        
        current_segment.append(word["text"])
        
        if len(current_segment) >= 8 or word["text"].endswith((".", "!", "?")):
            start_str = seconds_to_time(current_start)
            end_str = seconds_to_time(word["end"])
            text = " ".join(current_segment)
            segments.append(f"[{start_str} - {end_str}] {text}")
            current_segment = []
            current_start = None
    
    if current_segment and current_start is not None:
        end_time = words[-1]["end"] if words else 0
        start_str = seconds_to_time(current_start)
        end_str = seconds_to_time(end_time)
        text = " ".join(current_segment)
        segments.append(f"[{start_str} - {end_str}] {text}")
    
    return "\n".join(segments)


def analyze_transcript_with_gemini(transcript_text: str, max_clips: int = 5) -> List[ViralSegment]:
    """Use Gemini to find viral moments in the transcript."""
    client = genai.Client(api_key=GEMINI_API_KEY)
    model_name = "gemini-3.1-pro-preview"
    
    prompt = f"""You are an expert viral content strategist. Analyze this video transcript and find {max_clips} segments with the highest viral potential for short-form content (TikTok/YouTube Shorts/Instagram Reels).

TRANSCRIPT:
{transcript_text}

For each segment, provide:
1. start_time: exact timestamp from transcript (MM:SS format)
2. end_time: exact timestamp from transcript (MM:SS format, must be 15-60 seconds after start)
3. text: the transcript text for this segment
4. virality_score: 0-100 (hook strength + engagement + value + shareability)
5. hook_type: one of [question, statement, statistic, story, contrast, none]
6. reasoning: why this segment is viral (1-2 sentences)
7. title: catchy short title for this clip (max 8 words)

IMPORTANT RULES:
- Each segment MUST be 15-60 seconds long (end_time - start_time >= 15 seconds)
- start_time MUST be different from end_time
- Use EXACT timestamps that appear in the transcript
- Prioritize: strong hooks, emotional peaks, valuable insights, surprising facts
- Return EXACTLY {max_clips} segments (or fewer if video is short)

Respond ONLY with valid JSON array, no other text:
[
  {{
    "start_time": "00:15",
    "end_time": "00:45",
    "text": "...",
    "virality_score": 87,
    "hook_type": "question",
    "reasoning": "Opens with a compelling question that creates immediate curiosity",
    "title": "Why Most People Fail at This"
  }}
]"""

    try:
        response = client.models.generate_content(model=model_name, contents=prompt)
        raw = response.text.strip()
        
        # Extract JSON array from response
        json_match = re.search(r'\[[\s\S]*\]', raw)
        if not json_match:
            logger.error(f"No JSON array found in Gemini response: {raw[:500]}")
            return []
        
        segments_data = json.loads(json_match.group())
        segments = []
        
        for item in segments_data:
            try:
                start = item.get("start_time", "00:00")
                end = item.get("end_time", "00:30")
                
                start_sec = parse_time_to_seconds(start)
                end_sec = parse_time_to_seconds(end)
                
                # Ensure minimum duration
                if end_sec - start_sec < 10:
                    end_sec = start_sec + 30
                    end = seconds_to_time(end_sec)
                
                segments.append(ViralSegment(
                    start_time=start,
                    end_time=end,
                    text=item.get("text", ""),
                    virality_score=int(item.get("virality_score", 70)),
                    hook_type=item.get("hook_type", "none"),
                    reasoning=item.get("reasoning", ""),
                    title=item.get("title", "Viral Clip"),
                ))
            except Exception as e:
                logger.warning(f"Skipping invalid segment: {e}")
                continue
        
        return segments
        
    except Exception as e:
        logger.error(f"Gemini analysis failed: {e}")
        return []


def build_subtitle_filter(words: List[Dict], start_sec: float, end_sec: float, style: str) -> str:
    """Build FFmpeg drawtext filters for word-by-word subtitles."""
    clip_words = [w for w in words if w["start"] >= start_sec - 0.1 and w["end"] <= end_sec + 0.1]
    
    if not clip_words:
        return ""
    
    caption_config = CAPTION_STYLES.get(style, CAPTION_STYLES["tiktok"])
    font = caption_config.get("font", "Arial")
    fontsize = caption_config.get("fontsize", 32)
    color = caption_config.get("color", "white")
    stroke_color = caption_config.get("stroke_color", "black")
    stroke_width = caption_config.get("stroke_width", 2)
    position_y = caption_config.get("position_y", 0.75)
    
    # Group words into lines of ~5 words for readability
    lines = []
    current_line = []
    line_start = None
    
    for word in clip_words:
        if line_start is None:
            line_start = word["start"]
        current_line.append(word)
        
        if len(current_line) >= 5 or (word["text"].endswith((".", "!", "?", ",")) and len(current_line) >= 3):
            line_end = word["end"]
            lines.append({
                "words": current_line[:],
                "start": line_start,
                "end": line_end,
                "text": " ".join(w["text"] for w in current_line),
            })
            current_line = []
            line_start = None
    
    if current_line and line_start is not None:
        lines.append({
            "words": current_line,
            "start": line_start,
            "end": clip_words[-1]["end"],
            "text": " ".join(w["text"] for w in current_line),
        })
    
    filters = []
    for line in lines:
        # Adjust timestamps relative to clip start
        enable_start = max(0, line["start"] - start_sec)
        enable_end = max(0, line["end"] - start_sec)
        
        text = line["text"].replace("'", "\\'").replace(":", "\\:").replace(",", "\\,")
        
        # Build drawtext filter
        filter_parts = [
            f"drawtext=text='{text}'",
            f"fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf" if os.path.exists("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf") else "fontfile=/System/Library/Fonts/Helvetica.ttc",
            f"fontsize={fontsize}",
            f"fontcolor={color}",
            f"x=(w-tw)/2",
            f"y=h*{position_y}",
            f"enable='between(t,{enable_start:.2f},{enable_end:.2f})'",
        ]
        
        if stroke_color and stroke_width > 0:
            filter_parts.append(f"bordercolor={stroke_color}")
            filter_parts.append(f"borderw={stroke_width}")
        
        filters.append(":".join(filter_parts))
    
    return ",".join(filters)


def create_clip(
    video_path: Path,
    segment: ViralSegment,
    words: List[Dict],
    job_id: str,
    clip_index: int,
    caption_style: str,
) -> Optional[GeneratedClip]:
    """Create a single vertical short clip from a video segment."""
    clip_id = f"{job_id}_clip{clip_index}"
    output_path = CLIPS_DIR / f"{clip_id}.mp4"
    thumbnail_path = CLIPS_DIR / f"{clip_id}_thumb.jpg"
    
    start_sec = parse_time_to_seconds(segment.start_time)
    end_sec = parse_time_to_seconds(segment.end_time)
    duration = end_sec - start_sec
    
    if duration < 5:
        logger.warning(f"Segment too short ({duration}s), skipping")
        return None
    
    # Cap at 90 seconds
    if duration > 90:
        end_sec = start_sec + 90
        duration = 90
    
    video_duration = get_video_duration(video_path)
    if start_sec >= video_duration:
        logger.warning(f"Segment start ({start_sec}s) exceeds video duration ({video_duration}s)")
        return None
    
    end_sec = min(end_sec, video_duration)
    duration = end_sec - start_sec
    
    logger.info(f"Creating clip {clip_index}: {segment.start_time} - {segment.end_time}")
    
    # Build subtitle filter
    subtitle_filter = build_subtitle_filter(words, start_sec, end_sec, caption_style)
    
    # Build FFmpeg command for vertical 9:16 crop with subtitles
    vf_parts = [
        # Crop to 9:16 aspect ratio (center crop)
        "crop=ih*9/16:ih:(iw-ih*9/16)/2:0",
        # Scale to 1080x1920
        "scale=1080:1920:force_original_aspect_ratio=decrease",
        # Pad to exact size
        "pad=1080:1920:(ow-iw)/2:(oh-ih)/2:black",
    ]
    
    if subtitle_filter:
        vf_parts.append(subtitle_filter)
    
    vf = ",".join(vf_parts)
    
    cmd = [
        "ffmpeg", "-y",
        "-ss", str(start_sec),
        "-i", str(video_path),
        "-t", str(duration),
        "-vf", vf,
        "-c:v", "libx264",
        "-preset", "fast",
        "-crf", "23",
        "-c:a", "aac",
        "-b:a", "128k",
        "-movflags", "+faststart",
        str(output_path)
    ]
    
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
        if result.returncode != 0:
            logger.error(f"FFmpeg error: {result.stderr[-500:]}")
            
            # Try without subtitles as fallback
            vf_simple = ",".join(vf_parts[:3])
            cmd_simple = [
                "ffmpeg", "-y",
                "-ss", str(start_sec),
                "-i", str(video_path),
                "-t", str(duration),
                "-vf", vf_simple,
                "-c:v", "libx264",
                "-preset", "fast",
                "-crf", "23",
                "-c:a", "aac",
                "-b:a", "128k",
                "-movflags", "+faststart",
                str(output_path)
            ]
            result2 = subprocess.run(cmd_simple, capture_output=True, text=True, timeout=300)
            if result2.returncode != 0:
                logger.error(f"FFmpeg fallback also failed: {result2.stderr[-200:]}")
                return None
    except subprocess.TimeoutExpired:
        logger.error("FFmpeg timed out")
        return None
    except Exception as e:
        logger.error(f"FFmpeg exception: {e}")
        return None
    
    # Generate thumbnail
    thumb_cmd = [
        "ffmpeg", "-y",
        "-ss", str(start_sec + 1),
        "-i", str(video_path),
        "-vframes", "1",
        "-vf", "crop=ih*9/16:ih:(iw-ih*9/16)/2:0,scale=360:640",
        str(thumbnail_path)
    ]
    subprocess.run(thumb_cmd, capture_output=True, timeout=30)
    
    return GeneratedClip(
        clip_id=clip_id,
        title=segment.title,
        start_time=segment.start_time,
        end_time=seconds_to_time(end_sec),
        duration=duration,
        virality_score=segment.virality_score,
        hook_type=segment.hook_type,
        reasoning=segment.reasoning,
        file_path=str(output_path),
        thumbnail_path=str(thumbnail_path),
    )


def update_job_status(job_id: str, status: str, progress: int, message: str, extra: Dict = None):
    """Update job status file."""
    status_file = TEMP_DIR / f"{job_id}_status.json"
    data = {
        "jobId": job_id,
        "status": status,
        "progress": progress,
        "message": message,
        **(extra or {}),
    }
    with open(status_file, "w") as f:
        json.dump(data, f)


def process_video_job(job_id: str, youtube_url: str, caption_style: str = "tiktok", max_clips: int = 5):
    """Main processing pipeline."""
    try:
        logger.info(f"Starting job {job_id}: {youtube_url}")
        
        update_job_status(job_id, "pending", 5, "Starting video processing...")
        
        # Step 1: Get title and download video
        update_job_status(job_id, "downloading", 10, "Getting video info...")
        video_title = get_video_title(youtube_url)
        update_job_status(job_id, "downloading", 15, f"Downloading: {video_title}", {"videoTitle": video_title})
        
        video_path = download_video(youtube_url, job_id)
        if not video_path:
            update_job_status(job_id, "failed", 0, "Failed to download video. Make sure the YouTube URL is valid and the video is public.", {"videoTitle": video_title})
            return
        
        logger.info(f"Downloaded: {video_path}")
        update_job_status(job_id, "transcribing", 30, "Transcribing audio with AssemblyAI...", {"videoTitle": video_title})
        
        # Step 2: Transcribe
        try:
            words = transcribe_video(video_path)
        except Exception as e:
            logger.error(f"Transcription failed: {e}")
            update_job_status(job_id, "failed", 0, f"Transcription failed: {str(e)}", {"videoTitle": video_title})
            return
        
        if not words:
            update_job_status(job_id, "failed", 0, "No speech detected in video.", {"videoTitle": video_title})
            return
        
        transcript_text = build_transcript_text(words)
        logger.info(f"Transcript built: {len(transcript_text)} chars, {len(words)} words")
        
        # Step 3: AI Analysis
        update_job_status(job_id, "analyzing", 55, "Analyzing viral moments with Gemini AI...", {"videoTitle": video_title})
        
        segments = analyze_transcript_with_gemini(transcript_text, max_clips)
        if not segments:
            update_job_status(job_id, "failed", 0, "Could not identify viral segments. Video may be too short or unclear.", {"videoTitle": video_title})
            return
        
        logger.info(f"Found {len(segments)} viral segments")
        
        # Step 4: Generate clips
        update_job_status(job_id, "clipping", 65, f"Generating {len(segments)} clips...", {"videoTitle": video_title})
        
        clips = []
        for i, segment in enumerate(segments):
            clip_progress = 65 + int((i / len(segments)) * 30)
            update_job_status(job_id, "clipping", clip_progress, f"Processing clip {i+1}/{len(segments)}: {segment.title}", {"videoTitle": video_title})
            
            clip = create_clip(video_path, segment, words, job_id, i + 1, caption_style)
            if clip:
                clips.append(asdict(clip))
                logger.info(f"Clip {i+1} created: {clip.file_path}")
            else:
                logger.warning(f"Failed to create clip {i+1}")
        
        if not clips:
            update_job_status(job_id, "failed", 0, "Failed to generate any clips.", {"videoTitle": video_title})
            return
        
        # Save clips data
        clips_file = TEMP_DIR / f"{job_id}_clips.json"
        with open(clips_file, "w") as f:
            json.dump(clips, f)
        
        # Clean up video file to save space
        try:
            video_path.unlink()
        except Exception:
            pass
        
        update_job_status(job_id, "completed", 100, f"Done! Generated {len(clips)} viral clips.", {"videoTitle": video_title})
        logger.info(f"Job {job_id} completed with {len(clips)} clips")
        
    except Exception as e:
        logger.error(f"Job {job_id} failed with exception: {e}", exc_info=True)
        update_job_status(job_id, "failed", 0, f"Processing failed: {str(e)}")


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: processor.py <job_id> <youtube_url> [caption_style] [max_clips]")
        sys.exit(1)
    
    job_id = sys.argv[1]
    youtube_url = sys.argv[2]
    caption_style = sys.argv[3] if len(sys.argv) > 3 else "tiktok"
    max_clips = int(sys.argv[4]) if len(sys.argv) > 4 else 5
    
    process_video_job(job_id, youtube_url, caption_style, max_clips)
