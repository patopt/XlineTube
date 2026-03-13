import { useEffect } from "react";
import { useLocation, useParams } from "wouter";
import { motion } from "framer-motion";
import { Loader2, CheckCircle2, AlertCircle, ArrowLeft } from "lucide-react";
import { useGetJobStatus } from "@/hooks/use-clipio";

const STEPS = [
  { id: 'pending', label: 'In Queue' },
  { id: 'downloading', label: 'Downloading Video' },
  { id: 'transcribing', label: 'AI Transcription' },
  { id: 'analyzing', label: 'Detecting Viral Moments' },
  { id: 'clipping', label: 'Generating Shorts' },
  { id: 'completed', label: 'Done' }
];

export default function Process({ params }: { params: { jobId: string } }) {
  const { jobId } = params;
  const [, setLocation] = useLocation();

  const { data: job, error } = useGetJobStatus(jobId, {
    query: {
      // Keep polling every 2 seconds unless we hit a terminal state
      refetchInterval: (query) => {
        const state = query.state.data?.status;
        if (state === 'completed' || state === 'failed') return false;
        return 2000;
      }
    }
  });

  const isFailed = job?.status === 'failed' || error;
  const isCompleted = job?.status === 'completed';
  const progress = job?.progress || 0;
  
  const currentStepIndex = STEPS.findIndex(s => s.id === job?.status);
  const activeIndex = currentStepIndex >= 0 ? currentStepIndex : 0;

  useEffect(() => {
    if (isCompleted) {
      // Add a tiny delay so the user sees 100% completion before jumping
      const t = setTimeout(() => {
        setLocation(`/results/${jobId}`);
      }, 1000);
      return () => clearTimeout(t);
    }
  }, [isCompleted, jobId, setLocation]);

  // Circular Progress SVG properties
  const radius = 100;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (progress / 100) * circumference;

  return (
    <div className="flex-1 w-full flex items-center justify-center p-4">
      <div className="w-full max-w-xl mx-auto bg-white/[0.02] border border-white/[0.05] backdrop-blur-xl rounded-3xl p-8 sm:p-12 shadow-2xl flex flex-col items-center">
        
        {isFailed ? (
          <div className="text-center w-full py-8">
            <div className="w-24 h-24 bg-red-500/10 text-red-500 rounded-full flex items-center justify-center mx-auto mb-6">
              <AlertCircle className="w-12 h-12" />
            </div>
            <h2 className="text-3xl font-bold text-white mb-4">Processing Failed</h2>
            <p className="text-white/60 mb-8 max-w-md mx-auto">
              {job?.error || (error as any)?.message || "An unexpected error occurred while processing your video."}
            </p>
            <button
              onClick={() => setLocation("/")}
              className="px-6 py-3 rounded-xl bg-white/10 hover:bg-white/15 text-white font-semibold flex items-center justify-center gap-2 mx-auto transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Try Another Video
            </button>
          </div>
        ) : (
          <>
            <div className="mb-10 text-center">
              <h2 className="text-2xl sm:text-3xl font-bold text-white mb-2">
                {job?.videoTitle ? <span className="line-clamp-1">{job.videoTitle}</span> : "Processing Video..."}
              </h2>
              <p className="text-white/50">{job?.message || "Please wait while we do the magic."}</p>
            </div>

            <div className="relative w-64 h-64 mb-12">
              <svg className="w-full h-full transform -rotate-90">
                {/* Track */}
                <circle
                  cx="128"
                  cy="128"
                  r={radius}
                  className="stroke-white/5"
                  strokeWidth="12"
                  fill="transparent"
                />
                {/* Progress */}
                <motion.circle
                  cx="128"
                  cy="128"
                  r={radius}
                  className="stroke-primary"
                  strokeWidth="12"
                  fill="transparent"
                  strokeLinecap="round"
                  strokeDasharray={circumference}
                  animate={{ strokeDashoffset }}
                  transition={{ duration: 0.5, ease: "easeInOut" }}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-5xl font-display font-bold text-white tracking-tighter">
                  {progress}%
                </span>
                {progress === 100 && (
                  <CheckCircle2 className="w-8 h-8 text-primary mt-2 animate-bounce" />
                )}
              </div>
            </div>

            <div className="w-full max-w-sm space-y-4">
              {STEPS.map((step, idx) => {
                const isPast = idx < activeIndex;
                const isActive = idx === activeIndex;
                
                return (
                  <div key={step.id} className="flex items-center gap-4">
                    <div className="relative flex items-center justify-center w-6 h-6">
                      {isPast ? (
                        <CheckCircle2 className="w-5 h-5 text-primary" />
                      ) : isActive ? (
                        <Loader2 className="w-5 h-5 text-primary animate-spin" />
                      ) : (
                        <div className="w-2.5 h-2.5 rounded-full bg-white/10" />
                      )}
                    </div>
                    <span className={`text-sm font-semibold transition-colors duration-300 ${
                      isActive ? 'text-white text-base' : isPast ? 'text-white/60' : 'text-white/20'
                    }`}>
                      {step.label}
                    </span>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
