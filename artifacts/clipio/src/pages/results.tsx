import { useParams, useLocation } from "wouter";
import { ArrowLeft, RefreshCw, AlertCircle } from "lucide-react";
import { useGetClips } from "@/hooks/use-clipio";
import { ClipCard } from "@/components/clip-card";

export default function Results({ params }: { params: { jobId: string } }) {
  const { jobId } = params;
  const [, setLocation] = useLocation();

  const { data, isLoading, isError, error } = useGetClips(jobId);

  return (
    <div className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-6 mb-12">
        <div>
          <button 
            onClick={() => setLocation("/")}
            className="mb-4 text-sm font-semibold text-primary hover:text-primary/80 flex items-center gap-2 transition-colors w-fit"
          >
            <ArrowLeft className="w-4 h-4" />
            Process Another Video
          </button>
          <h1 className="text-4xl font-bold text-white mb-2 tracking-tight">Your Viral Clips</h1>
          <p className="text-white/50 text-lg line-clamp-1 max-w-2xl">
            {data?.videoTitle ? `From: ${data.videoTitle}` : "We found the best moments for you."}
          </p>
        </div>
      </div>

      {isLoading && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="animate-pulse bg-white/5 rounded-3xl aspect-[9/16] relative overflow-hidden border border-white/5">
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent"></div>
              <div className="absolute bottom-6 left-6 right-6 space-y-3">
                <div className="h-6 bg-white/10 rounded-md w-3/4"></div>
                <div className="h-4 bg-white/10 rounded-md w-1/2"></div>
                <div className="h-12 bg-white/10 rounded-xl w-full mt-4"></div>
              </div>
            </div>
          ))}
        </div>
      )}

      {isError && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-8 text-center max-w-2xl mx-auto">
          <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
          <h3 className="text-xl font-bold text-white mb-2">Could not load clips</h3>
          <p className="text-red-200/80 mb-6">
            {(error as any)?.message || "The job might not exist or has expired."}
          </p>
          <button 
            onClick={() => setLocation("/")}
            className="px-6 py-3 rounded-xl bg-white/10 hover:bg-white/15 text-white font-semibold transition-colors"
          >
            Go Back
          </button>
        </div>
      )}

      {data?.clips && data.clips.length === 0 && !isLoading && (
        <div className="bg-white/5 border border-white/10 rounded-2xl p-16 text-center max-w-2xl mx-auto">
          <RefreshCw className="w-12 h-12 text-white/40 mx-auto mb-4" />
          <h3 className="text-xl font-bold text-white mb-2">No clips found</h3>
          <p className="text-white/60">
            We couldn't find any highly engaging viral moments in this video.
          </p>
        </div>
      )}

      {data?.clips && data.clips.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {data.clips.map((clip) => (
            <ClipCard key={clip.clipId} clip={clip} />
          ))}
        </div>
      )}
      
    </div>
  );
}
