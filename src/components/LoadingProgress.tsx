import React, { useState, useEffect } from 'react';

export default function LoadingProgress() {
  const [progress, setProgress] = useState(0);
  const [stepIndex, setStepIndex] = useState(0);

  const steps = [
    "Initializing evaluation engine...",
    "Scanning resume structure & layout...",
    "Cross-referencing with targeted job description...",
    "Checking brevity, focus, and tailoring...",
    "Analyzing narrative flow & proof of evidence...",
    "Evaluating context, clarity, and impact framing...",
    "Checking craft, formatting, and formatting errors...",
    "Synthesizing actionable PM rewrites...",
    "Polishing expert feedback reports..."
  ];

  useEffect(() => {
    // Reset progress
    setProgress(0);
    setStepIndex(0);

    const interval = setInterval(() => {
      setProgress((prev) => {
        if (prev < 30) {
          // Fast start
          return prev + Math.random() * 4 + 1;
        } else if (prev < 65) {
          // Medium progress
          return prev + Math.random() * 2 + 0.5;
        } else if (prev < 88) {
          // Slow down
          return prev + Math.random() * 1 + 0.2;
        } else if (prev < 96) {
          // Extremely slow near completion
          return prev + 0.15;
        } else if (prev < 98) {
          return prev + 0.02;
        }
        return prev;
      });
    }, 150);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    // Dynamically calculate which step based on current progress
    const slice = 98 / steps.length;
    const currentStep = Math.min(
      Math.floor(progress / slice),
      steps.length - 1
    );
    setStepIndex(currentStep);
  }, [progress]);

  return (
    <div className="w-full max-w-md mx-auto space-y-4">
      <div className="space-y-2">
        <div className="flex justify-between items-center text-xs font-semibold uppercase tracking-widest text-stone-500">
          <span className="animate-pulse">{steps[stepIndex]}</span>
          <span className="font-mono text-stone-700 bg-stone-100 px-2 py-0.5 rounded-full">
            {Math.floor(progress)}%
          </span>
        </div>
        
        {/* Progress Bar Container */}
        <div className="w-full bg-stone-100 h-2.5 rounded-full overflow-hidden border border-stone-200/40 relative shadow-inner">
          <div 
            className="h-full bg-gradient-to-r from-teal-400 via-emerald-400 to-teal-500 rounded-full transition-all duration-300 ease-out"
            style={{ width: `${progress}%` }}
          />
          {/* Shimmer overlay effect */}
          <div className="absolute inset-x-0 top-0 bottom-0 bg-gradient-to-r from-transparent via-white/20 to-transparent w-1/2 animate-shimmer pointer-events-none" />
        </div>
      </div>
      
      <p className="text-[11px] text-stone-400 text-center uppercase tracking-wide">
        This takes a few seconds to run detailed LLM pipeline scans
      </p>
    </div>
  );
}
