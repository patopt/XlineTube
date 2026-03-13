import { Download, Flame, Clock, Video } from "lucide-react";
import type { ClipInfo } from "@workspace/api-client-react";

export function ClipCard({ clip }: { clip: ClipInfo }) {
  // Determine color based on virality score
  let scoreColor = "bg-green-500/20 text-green-400 border-green-500/30";
  if (clip.viralityScore < 50) {
    scoreColor = "bg-rose-500/20 text-rose-400 border-rose-500/30";
  } else if (clip.viralityScore < 80) {
    scoreColor = "bg-amber-500/20 text-amber-400 border-amber-500/30";
  }

  return (
    <div className="group relative flex flex-col bg-white/[0.02] border border-white/[0.05] rounded-3xl overflow-hidden hover:bg-white/[0.04] hover:border-primary/40 transition-all duration-500 hover:shadow-2xl hover:shadow-primary/10 hover:-translate-y-1">
      
      {/* Thumbnail Area */}
      <div className="aspect-[9/16] relative bg-black/60 overflow-hidden w-full">
        {clip.thumbnailUrl ? (
          <img 
            src={clip.thumbnailUrl} 
            alt={clip.title} 
            className="w-full h-full object-cover opacity-80 group-hover:opacity-100 group-hover:scale-105 transition-all duration-700 ease-out" 
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center text-white/20">
            <Video className="w-12 h-12 mb-3 opacity-50" />
            <span className="text-[10px] font-bold uppercase tracking-[0.2em]">No Preview</span>
          </div>
        )}

        {/* Absolute Overlays */}
        <div className="absolute top-4 right-4 z-10">
          <div className={`px-3 py-1.5 rounded-full border backdrop-blur-xl flex items-center gap-1.5 shadow-2xl ${scoreColor}`}>
            <Flame className="w-3.5 h-3.5" />
            <span className="text-xs font-black tracking-wide">{clip.viralityScore}/100</span>
          </div>
        </div>

        <div className="absolute bottom-4 left-4 z-10">
          <div className="bg-black/60 backdrop-blur-xl px-2.5 py-1.5 rounded-lg border border-white/10 flex items-center gap-1.5">
            <Clock className="w-3 h-3 text-white/70" />
            <span className="text-xs font-mono font-medium text-white/90">
              {clip.duration}s
            </span>
          </div>
        </div>

        {/* Bottom text readability gradient mask */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-60"></div>
      </div>

      {/* Content Area */}
      <div className="p-6 flex flex-col flex-grow relative z-20">
        <h3 className="font-display font-semibold text-lg text-white leading-tight mb-3 line-clamp-2" title={clip.title}>
          {clip.title}
        </h3>

        {clip.hookType && clip.hookType !== "none" && (
          <div className="mb-4">
            <span className="inline-flex items-center px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-[11px] font-bold uppercase tracking-wider text-primary shadow-inner">
              {clip.hookType}
            </span>
          </div>
        )}

        <p className="text-sm text-white/50 leading-relaxed line-clamp-3 mb-6 flex-grow">
          {clip.reasoning}
        </p>

        <a
          href={clip.downloadUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="w-full flex items-center justify-center gap-2 py-3.5 px-4 rounded-xl bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 text-white font-bold shadow-lg shadow-primary/25 hover:shadow-primary/40 transition-all active:scale-[0.98] outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-background"
        >
          <Download className="w-4.5 h-4.5" />
          Download Clip
        </a>
      </div>
      
    </div>
  );
}
