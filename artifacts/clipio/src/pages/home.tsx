import { useState } from "react";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { Youtube, Wand2, Music2, Target, Zap, Type, Lightbulb, Mic, Loader2 } from "lucide-react";
import { useProcessVideo } from "@/hooks/use-clipio";
import { useToast } from "@/hooks/use-toast";

const CAPTION_STYLES = [
  { id: 'tiktok', name: 'TikTok', icon: Music2, color: 'text-pink-400', bg: 'bg-pink-400/10', border: 'border-pink-400/20' },
  { id: 'hormozi', name: 'Hormozi', icon: Target, color: 'text-green-400', bg: 'bg-green-400/10', border: 'border-green-400/20' },
  { id: 'mrbeast', name: 'MrBeast', icon: Zap, color: 'text-yellow-400', bg: 'bg-yellow-400/10', border: 'border-yellow-400/20' },
  { id: 'neon', name: 'Neon', icon: Lightbulb, color: 'text-cyan-400', bg: 'bg-cyan-400/10', border: 'border-cyan-400/20' },
  { id: 'podcast', name: 'Podcast', icon: Mic, color: 'text-orange-400', bg: 'bg-orange-400/10', border: 'border-orange-400/20' },
  { id: 'minimal', name: 'Minimal', icon: Type, color: 'text-gray-300', bg: 'bg-gray-300/10', border: 'border-gray-300/20' },
];

export default function Home() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  
  const [url, setUrl] = useState("");
  const [style, setStyle] = useState<string>("tiktok");
  const [clips, setClips] = useState(5);

  const processVideo = useProcessVideo({
    mutation: {
      onSuccess: (data) => {
        setLocation(`/process/${data.jobId}`);
      },
      onError: (err: any) => {
        toast({
          title: "Processing Failed",
          description: err?.message || "Failed to start processing your video.",
          variant: "destructive"
        });
      }
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!url || !url.includes("youtu")) {
      toast({ 
        title: "Invalid URL", 
        description: "Please enter a valid YouTube video URL.", 
        variant: "destructive" 
      });
      return;
    }

    processVideo.mutate({
      data: {
        youtubeUrl: url,
        captionStyle: style as any,
        maxClips: clips
      }
    });
  };

  return (
    <div className="relative flex-1 w-full flex flex-col items-center">
      {/* Background Image inside Home so it only shows here perfectly */}
      <div className="absolute top-0 left-0 w-full h-[600px] z-0 overflow-hidden pointer-events-none">
        <img
          src={`${import.meta.env.BASE_URL}images/hero-bg.png`}
          alt="Hero Background"
          className="w-full h-full object-cover opacity-25 mix-blend-screen"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-background/80 to-background"></div>
      </div>

      <div className="relative z-10 w-full max-w-4xl mx-auto px-4 pt-20 pb-24 text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
        >
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-sm font-medium text-primary mb-6 shadow-xl">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
            </span>
            Powered by AI Virality Detection
          </div>
          
          <h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold tracking-tight text-white mb-6">
            Turn Videos Into <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-blue-400">Viral Shorts</span>
          </h1>
          <p className="text-lg sm:text-xl text-white/60 max-w-2xl mx-auto mb-12">
            Paste a YouTube link and our AI will automatically find the most engaging hooks, clip them, and add professional animated captions.
          </p>
        </motion.div>

        <motion.form 
          onSubmit={handleSubmit}
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1, ease: "easeOut" }}
          className="bg-white/[0.02] border border-white/[0.05] backdrop-blur-2xl rounded-3xl p-6 sm:p-10 shadow-2xl text-left"
        >
          {/* URL Input */}
          <div className="mb-8">
            <label className="block text-sm font-semibold text-white mb-3">YouTube Video URL</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                <Youtube className="h-6 w-6 text-white/40" />
              </div>
              <input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://www.youtube.com/watch?v=..."
                className="block w-full pl-13 pr-4 py-4 bg-black/40 border border-white/10 rounded-2xl text-white placeholder-white/30 focus:ring-2 focus:ring-primary focus:border-primary transition-all outline-none"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-10">
            {/* Caption Style */}
            <div>
              <label className="block text-sm font-semibold text-white mb-3">Caption Style</label>
              <div className="grid grid-cols-2 gap-3">
                {CAPTION_STYLES.map((s) => {
                  const Icon = s.icon;
                  const isSelected = style === s.id;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setStyle(s.id)}
                      className={`flex items-center gap-3 p-3 rounded-xl border transition-all duration-200 outline-none ${
                        isSelected 
                          ? `bg-white/10 border-primary shadow-lg shadow-primary/10` 
                          : `bg-black/20 border-white/5 hover:bg-white/5 hover:border-white/10`
                      }`}
                    >
                      <div className={`p-2 rounded-lg ${isSelected ? s.bg : 'bg-white/5'}`}>
                        <Icon className={`w-4 h-4 ${isSelected ? s.color : 'text-white/50'}`} />
                      </div>
                      <span className={`text-sm font-semibold ${isSelected ? 'text-white' : 'text-white/60'}`}>
                        {s.name}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Max Clips */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <label className="block text-sm font-semibold text-white">Maximum Clips</label>
                <span className="text-primary font-bold bg-primary/10 px-2 py-0.5 rounded-md text-sm">{clips}</span>
              </div>
              <div className="bg-black/20 border border-white/5 rounded-2xl p-6 h-[calc(100%-28px)] flex flex-col justify-center">
                <input
                  type="range"
                  min="1"
                  max="10"
                  value={clips}
                  onChange={(e) => setClips(parseInt(e.target.value))}
                  className="w-full accent-primary h-2 bg-white/10 rounded-lg appearance-none cursor-pointer"
                />
                <div className="flex justify-between text-xs text-white/40 mt-4 font-mono">
                  <span>1</span>
                  <span>5</span>
                  <span>10</span>
                </div>
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={processVideo.isPending}
            className="w-full py-4 rounded-2xl bg-gradient-to-r from-primary to-blue-600 hover:from-primary/90 hover:to-blue-600/90 text-white font-bold text-lg shadow-[0_0_40px_-10px_var(--color-primary)] hover:shadow-[0_0_60px_-15px_var(--color-primary)] transition-all flex items-center justify-center gap-3 disabled:opacity-70 disabled:cursor-not-allowed outline-none active:scale-[0.99]"
          >
            {processVideo.isPending ? (
              <>
                <Loader2 className="w-6 h-6 animate-spin" />
                Processing Video...
              </>
            ) : (
              <>
                <Wand2 className="w-6 h-6" />
                Generate Viral Clips
              </>
            )}
          </button>
        </motion.form>
      </div>
    </div>
  );
}
