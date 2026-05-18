import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { signInWithGoogle, logout, auth } from './firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

import { 
  FileText, 
  Briefcase, 
  CheckCircle2, 
  AlertCircle, 
  ChevronRight, 
  Loader2, 
  Zap, 
  ShieldAlert,
  ArrowRight,
  UploadCloud,
  X,
  FileUp,
  Linkedin,
  Github
} from 'lucide-react';

interface Suggestion {
  original: string;
  suggestion: string;
  reasoning: string;
}

interface EvaluationData {
  overall_fit_score: string;
  strengths: string[];
  gaps: string[];
  violations: string[];
  actionable_suggestions: Suggestion[];
}

export default function App() {
  const [jobDescription, setJobDescription] = useState('');
  const [resume, setResume] = useState('');
  const [resumeFileUrl, setResumeFileUrl] = useState<string | null>(null);
  const [resumeFileType, setResumeFileType] = useState<'text' | 'pdf' | null>(null);
  const [numPages, setNumPages] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const [result, setResult] = useState<EvaluationData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [limits, setLimits] = useState<{remaining: number, limit: number} | null>(null);

  const fetchLimits = async () => {
    try {
      const res = await fetch('/api/limits');
      const data = await res.json();
      setLimits(data);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchLimits();
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
    });
    return () => unsubscribe();
  }, []);

  const handleFile = async (file: File) => {
    if (file.size > 5 * 1024 * 1024) {
      setError('File too large. Please upload something smaller than 5MB.');
      return;
    }
    setIsParsing(true);
    setError(null);
    try {
      if (file.type === 'application/pdf') {
        const formData = new FormData();
        formData.append('file', file);
        const res = await fetch('/api/parse-pdf', {
          method: 'POST',
          body: formData,
        });

        if (!res.ok) {
          const errorData = await res.json();
          throw new Error(errorData.error || 'Failed to parse PDF.');
        }

        const data = await res.json();
        setResume(data.text);
        setResumeFileUrl(URL.createObjectURL(file));
        setResumeFileType('pdf');
      } else if (file.type === 'text/plain' || file.name.endsWith('.txt') || file.name.endsWith('.md')) {
        const text = await file.text();
        setResume(text);
        setResumeFileUrl(null);
        setResumeFileType('text');
      } else {
        throw new Error('Unsupported file type. Please upload a PDF or Text file.');
      }
    } catch (err: any) {
      setError(err.message || 'Error parsing file.');
    } finally {
      setIsParsing(false);
    }
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  };

  const handleEvaluate = async () => {
    if (!user) {
      setError('Please sign in to evaluate your resume. You have 1 free evaluation.');
      return;
    }

    if (!jobDescription || !resume) {
      setError('Please provide both the job description and your resume.');
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const token = await user.getIdToken();
      const response = await fetch('/api/evaluate', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ jobDescription, resume }),
      });

      if (!response.ok) {
        let errorMessage = 'Failed to connect to the evaluation server.';
        try {
          const errorData = await response.json();
          if (errorData.error) errorMessage = errorData.error;
        } catch (e) {}
        throw new Error(errorMessage);
      }

      const data = await response.json();
      setResult(data);
    } catch (err: any) {
      setError(err.message || 'An unexpected error occurred.');
    } finally {
      setLoading(false);
      fetchLimits();
    }
  };

  return (
    <div className="min-h-screen bg-mesh-gradient font-sans text-stone-800 flex flex-col">
      {/* Header */}
      <header className="glass-panel sticky top-0 z-10 border-b-0 border-white rounded-b-3xl">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-gradient-to-tr from-teal-400 to-emerald-400 p-2 rounded-xl shadow-lg shadow-teal-500/20">
              <Briefcase className="w-5 h-5 text-white" />
            </div>
            <h1 className="text-xl font-display font-bold tracking-tight text-stone-900">AI PM Resume Helper</h1>
          </div>
          <div className="flex items-center gap-6">
            {limits && (
              <div className="text-sm font-medium px-3 py-1 bg-stone-100 rounded-full border border-stone-200 text-stone-600 shadow-inner">
                {limits.remaining} / {limits.limit} <span className="hidden sm:inline">free checks left today</span>
              </div>
            )}
            <div>
              {user ? (
                <div className="flex items-center gap-4">
                <span className="text-sm font-medium text-stone-600 hidden sm:inline-block">{user.email}</span>
                <button
                  onClick={logout}
                  className="text-sm font-semibold text-stone-500 hover:text-stone-900 transition-colors"
                >
                  Sign Out
                </button>
              </div>
            ) : (
              <button
                onClick={async () => {
                  try {
                    await signInWithGoogle();
                  } catch (e: any) {
                    setError(`Sign-in failed: ${e.message || "Unknown error"}. Check console or try allowing popups/third-party cookies.`);
                  }
                }}
                className="px-4 py-2 bg-stone-900 text-white rounded-full text-sm font-medium hover:bg-stone-800 transition-colors shadow-md flex items-center gap-2"
              >
                Sign in with Google
              </button>
            )}
          </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-12">
        <div className={`transition-all duration-500 ${loading || result ? 'flex flex-col gap-16 w-full lg:max-w-5xl mx-auto' : 'grid lg:grid-cols-2 gap-12 items-start'}`}>
          
          {/* Input Panel */}
          <motion.div 
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className={`space-y-8 ${loading || result ? 'order-last opacity-80 hover:opacity-100 transition-opacity bg-stone-50 p-8 rounded-3xl mt-8 border border-stone-200 w-full' : 'w-full'}`}
          >
            <div className="space-y-2">
              <h2 className="text-4xl lg:text-5xl font-display font-bold text-stone-900 leading-tight">
                {loading || result ? 'Update Application' : 'Refine Your Story'} <br/>
                {!loading && !result && <span className="text-transparent bg-clip-text bg-gradient-to-r from-teal-500 to-emerald-500">Land the PM Role.</span>}
              </h2>
              <p className="text-stone-600 text-lg leading-relaxed">
                Upload your resume and the target job description. The AI evaluator will analyze them against best practices.
              </p>
            </div>

            <div className="glass-panel rounded-3xl p-6 sm:p-8 space-y-6">
              <div className="space-y-3">
                <label className="flex items-center gap-2 text-sm font-semibold text-teal-600 tracking-wide uppercase">
                  <FileText className="w-4 h-4 text-teal-500" />
                  Target Job Description
                </label>
                <textarea
                  className="w-full h-48 p-5 bg-white/50 border border-stone-200 rounded-2xl shadow-inner focus:ring-2 focus:ring-teal-400 focus:border-teal-400 transition-all outline-none resize-none text-sm text-stone-800 leading-relaxed placeholder:text-stone-400 font-sans"
                  placeholder="Paste the link or the full text of the job description..."
                  value={jobDescription}
                  onChange={(e) => setJobDescription(e.target.value)}
                />
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 text-sm font-semibold text-teal-600 tracking-wide uppercase">
                    <Briefcase className="w-4 h-4 text-teal-500" />
                    Your Current Resume
                  </label>
                  <button 
                    onClick={() => {
                      setResume('');
                      setResumeFileUrl(null);
                      setResumeFileType(null);
                    }}
                    className="text-xs font-medium text-stone-500 hover:text-stone-800 flex items-center gap-1 transition-colors bg-stone-100/50 px-2 py-1 rounded-lg"
                  >
                    <X className="w-3 h-3" />
                    Clear
                  </button>
                </div>

                {!resume ? (
                  <div
                    onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                    onDragLeave={() => setIsDragging(false)}
                    onDrop={onDrop}
                    onClick={() => fileInputRef.current?.click()}
                    className={`
                      relative group cursor-pointer border-2 border-dashed rounded-2xl p-10 transition-all text-center backdrop-blur-sm
                      ${isDragging 
                        ? 'border-teal-400 bg-teal-50 scale-[0.99]' 
                        : 'border-stone-200 bg-white/50 hover:border-teal-300 hover:bg-white/80'}
                    `}
                  >
                    <input 
                      type="file" 
                      className="hidden" 
                      ref={fileInputRef}
                      accept=".pdf,.txt,.md"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleFile(file);
                      }}
                    />
                    <div className="flex flex-col items-center gap-4">
                      <div className={`
                        p-4 rounded-2xl shadow-lg transition-all border border-stone-100
                        ${isDragging ? 'bg-teal-500 text-white' : 'bg-stone-50 shadow-inner text-stone-400 group-hover:bg-teal-50 group-hover:text-teal-600'}
                      `}>
                        <UploadCloud className="w-8 h-8" />
                      </div>
                      <div>
                        <p className="font-display font-medium text-lg text-stone-700">Drop your resume here</p>
                        <p className="text-sm text-stone-500 mt-1">or <span className="text-teal-600 underline decoration-teal-400/30 underline-offset-4 pointer-events-none group-hover:text-teal-700">browse files</span> (PDF, TXT)</p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between text-xs font-bold text-stone-500 uppercase tracking-widest px-1">
                      <span>{resumeFileType === 'pdf' ? 'PDF Preview' : 'Live Text Preview'}</span>
                      <button 
                        onClick={() => fileInputRef.current?.click()}
                        className="flex items-center gap-1.5 text-teal-600 hover:text-teal-700 transition-colors bg-teal-50 hover:bg-teal-100 px-2 py-1 rounded-md"
                      >
                        <FileUp className="w-3 h-3" />
                        Re-upload
                        <input 
                          type="file" 
                          className="hidden" 
                          ref={fileInputRef}
                          accept=".pdf,.txt,.md"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) handleFile(file);
                          }}
                        />
                      </button>
                    </div>
                    {resumeFileType === 'pdf' && resumeFileUrl ? (
                      <div className="w-full h-80 overflow-y-auto overflow-x-hidden border border-stone-200 rounded-2xl shadow-inner bg-stone-100 flex flex-col items-center p-4">
                        <Document
                          file={resumeFileUrl}
                          onLoadSuccess={({ numPages }) => setNumPages(numPages)}
                          loading={<Loader2 className="w-6 h-6 animate-spin text-teal-500 m-10" />}
                        >
                          {Array.from(new Array(numPages || 0), (_, index) => (
                            <div key={`page_${index + 1}`}>
                              <Page 
                                pageNumber={index + 1} 
                                width={400} 
                                className="mb-4 shadow-sm bg-white"
                              />
                            </div>
                          ))}
                        </Document>
                      </div>
                    ) : (
                      <textarea
                        className="w-full h-64 p-5 bg-white/50 border border-stone-200 rounded-2xl shadow-inner focus:ring-2 focus:ring-teal-400 focus:border-teal-400 transition-all outline-none resize-none text-sm leading-relaxed text-stone-800 placeholder:text-stone-400 font-sans"
                        placeholder="Paste your resume text here..."
                        value={resume}
                        onChange={(e) => setResume(e.target.value)}
                      />
                    )}
                  </div>
                )}
              </div>

              {error && (
                <div className="p-4 bg-rose-50 border border-rose-100 rounded-xl flex items-center gap-3 text-rose-600 text-sm">
                  <AlertCircle className="w-5 h-5 flex-shrink-0" />
                  {error}
                </div>
              )}

              <button
                id="evaluate-button"
                onClick={handleEvaluate}
                disabled={loading || isParsing}
                className="w-full py-4 bg-teal-500 text-white rounded-xl font-display font-bold text-lg shadow-xl hover:shadow-teal-500/20 hover:bg-teal-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2 group mt-4 relative overflow-hidden"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:translate-x-full duration-1000 transition-transform ease-in-out" />
                {loading || isParsing ? (
                  <>
                    <Loader2 className="w-6 h-6 animate-spin text-white" />
                    {isParsing ? 'Parsing PDF...' : 'Executing Deep Analysis...'}
                  </>
                ) : (
                  <>
                    <Zap className="w-5 h-5 text-teal-100 fill-teal-100 group-hover:text-white group-hover:fill-white transition-colors" />
                    <span className="relative z-10 text-white">Evaluate My Application</span>
                    <ChevronRight className="w-5 h-5 text-teal-200 group-hover:translate-x-1 group-hover:text-white transition-all relative z-10" />
                  </>
                )}
              </button>
            </div>
          </motion.div>

          {/* Results Panel Container - Moved to top conceptually using order in flex mode */}
          <div className={`${loading || result ? 'order-first w-full' : 'lg:sticky lg:top-28'}`}>
            <AnimatePresence mode="wait">
              {!result && !loading && (
                <motion.div 
                  key="empty"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="h-full flex flex-col items-center justify-center py-32 px-8 text-center glass-panel border-dashed border-stone-200 rounded-3xl"
                >
                  <div className="w-24 h-24 bg-stone-50 shadow-inner rounded-full flex items-center justify-center mb-8 border border-stone-100">
                    <Loader2 className="w-12 h-12 text-stone-400" />
                  </div>
                  <h3 className="text-2xl font-display font-semibold text-stone-700 mb-3 tracking-wide">Awaiting Inputs</h3>
                  <p className="text-stone-500 max-w-sm text-lg">
                    Your detailed evaluation report will appear here once you submit your materials.
                  </p>
                </motion.div>
              )}

              {loading && (
                <motion.div 
                  key="loading"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="space-y-6 w-full"
                >
                  <div className="flex flex-col items-center justify-center py-16 space-y-6">
                    <div className="relative">
                      <div className="w-24 h-24 bg-teal-50 rounded-full flex items-center justify-center animate-pulse">
                        <Loader2 className="w-10 h-10 animate-spin text-teal-600" />
                      </div>
                      <div className="absolute inset-0 border-4 border-teal-200 rounded-full animate-ping opacity-20"></div>
                    </div>
                    <h3 className="text-2xl font-display font-bold relative z-10 text-stone-800">Evaluating your application...</h3>
                    <p className="text-stone-500 max-w-md text-center">Gemini is analyzing your resume against the job description and industry best practices.</p>
                  </div>
                  <div className="h-48 glass-card animate-pulse rounded-3xl border border-stone-200/50 bg-stone-100/50" />
                  <div className="h-32 glass-card animate-pulse rounded-2xl border border-stone-200/50 bg-stone-100/50" />
                </motion.div>
              )}

              {result && (
                <motion.div 
                  key="result"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-6 w-full"
                >
                  {/* Score Card */}
                  <div className="glass-panel p-8 rounded-3xl overflow-hidden relative group">
                    <div className="absolute right-0 top-0 w-64 h-64 bg-gradient-to-bl from-teal-50 to-emerald-50 rounded-full blur-3xl -mr-20 -mt-20 z-0 transition-opacity opacity-70 group-hover:opacity-100" />
                    <div className="relative z-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
                      <div>
                        <h4 className="text-sm font-bold text-teal-600 uppercase tracking-widest mb-2 font-display">Overall Match Score</h4>
                        <div className="flex items-baseline gap-3">
                          <span className="text-7xl lg:text-8xl font-display font-black tracking-tighter text-stone-900">{result.overall_fit_score}</span>
                          <span className="text-stone-500 font-medium text-lg lg:text-xl">compatibility</span>
                        </div>
                      </div>
                      <div className="bg-gradient-to-br from-teal-400 to-emerald-400 p-6 rounded-3xl shadow-[0_0_30px_rgba(45,212,191,0.3)] shadow-teal-500/20 border border-teal-300">
                        <CheckCircle2 className="w-12 h-12 text-white" />
                      </div>
                    </div>
                  </div>

                  {/* Summary Sections */}
                  <div className="grid sm:grid-cols-2 gap-6 w-full">
                    <div className="bg-emerald-50/50 border border-emerald-100 backdrop-blur-md p-8 rounded-3xl flex-1">
                        <h4 className="flex items-center gap-2 text-emerald-800 font-display font-bold mb-5 text-xl">
                        <CheckCircle2 className="w-6 h-6 text-emerald-600" />
                        Key Strengths
                      </h4>
                      <ul className="space-y-4">
                        {result.strengths.map((s, i) => (
                          <li key={i} className="text-emerald-900 text-base flex gap-3 leading-relaxed">
                            <span className="mt-2 w-2 h-2 rounded-full bg-emerald-500 flex-shrink-0" />
                            {s}
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div className="bg-amber-50/50 border border-amber-100 backdrop-blur-md p-8 rounded-3xl flex-1">
                      <h4 className="flex items-center gap-2 text-amber-800 font-display font-bold mb-5 text-xl">
                        <ShieldAlert className="w-6 h-6 text-amber-500" />
                        Critical Gaps
                      </h4>
                        <ul className="space-y-4">
                          {result.gaps.map((g, i) => (
                            <li key={i} className="text-amber-900 text-base flex gap-3 leading-relaxed">
                              <span className="mt-2 w-2 h-2 rounded-full bg-amber-500 flex-shrink-0" />
                              {g}
                            </li>
                          ))}
                        </ul>
                    </div>
                  </div>

                  {/* Best Practice Violations */}
                  {result.violations.length > 0 && (
                    <div className="bg-rose-50 border border-rose-100 p-8 rounded-3xl">
                      <h4 className="text-sm font-bold text-rose-600 uppercase tracking-widest mb-5">Best Practice Violations</h4>
                      <div className="space-y-4">
                        {result.violations.map((v, i) => (
                          <div key={i} className="flex gap-4 items-start bg-white p-5 rounded-2xl border border-rose-100 shadow-sm">
                            <AlertCircle className="w-6 h-6 text-rose-600 flex-shrink-0 mt-0.5" />
                            <p className="text-base text-rose-800 leading-relaxed font-medium">{v}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Actionable Suggestions */}
                  <div className="space-y-6 pt-6">
                    <h4 className="text-3xl font-display font-bold text-stone-900 px-2 lg:px-4">Actionable Rewrites</h4>
                    <div className="grid gap-8 lg:px-4">
                      {result.actionable_suggestions.map((item, i) => (
                        <div key={i} className="glass-panel rounded-3xl overflow-hidden border border-stone-200 group shadow-xl">
                          <div className="p-8 border-b border-stone-100 bg-stone-50/50">
                            <div className="text-sm font-bold text-stone-500 uppercase tracking-widest mb-4">Original Context</div>
                            <p className="text-base text-stone-500 line-through decoration-stone-300 italic leading-relaxed">{item.original}</p>
                          </div>
                          <div className="p-8 space-y-6 bg-white/50">
                            <div>
                              <div className="text-sm font-bold text-teal-600 uppercase tracking-widest mb-4">Elite Rewrite</div>
                              <div className="flex gap-5 bg-teal-50/50 p-6 rounded-2xl border border-teal-100/50 shadow-inner group-hover:bg-teal-50 transition-colors">
                                <ArrowRight className="w-6 h-6 text-teal-600 flex-shrink-0 mt-0.5" />
                                <p className="text-base font-semibold text-stone-800 leading-relaxed italic">
                                  {item.suggestion}
                                </p>
                              </div>
                            </div>
                            <div>
                              <div className="text-sm font-bold text-stone-500 uppercase tracking-widest mb-3">Expert Reasoning</div>
                              <p className="text-base text-stone-600 leading-relaxed">{item.reasoning}</p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="pt-12 pb-8 text-center">
                    <p className="text-sm font-medium text-stone-500 tracking-wider">
                      Evaluated with Gemini Models & Elite Industry Heuristics.
                    </p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </main>

      <footer className="mt-auto py-10 bg-white border-t border-stone-200/60 text-center">
        <div className="max-w-7xl mx-auto px-4 flex flex-col items-center gap-4">
          <div className="flex items-center gap-2.5">
            <span className="text-stone-500 font-medium">Built by</span>
            <img 
              src="/profile.jpeg" 
              alt="Vignesh Radhakrishnan" 
              style={{ imageRendering: 'high-quality' }}
              className="w-12 h-12 rounded-full border border-stone-200 shadow-sm object-cover"
              onError={(e) => {
                e.currentTarget.src = "https://ui-avatars.com/api/?name=Vignesh+Radhakrishnan&background=0D8B84&color=fff";
              }}
            />
            <span className="font-semibold text-stone-800 text-lg">Vignesh Radhakrishnan</span>
          </div>
          
          <div className="flex items-center justify-center gap-4">
            <a 
              href="https://www.linkedin.com/in/vignesh-radhakrishnan-" 
              target="_blank" 
              rel="noopener noreferrer"
              className="group flex items-center justify-center w-10 h-10 rounded-full bg-stone-50 border border-stone-200 hover:border-[#0A66C2]/30 hover:bg-[#0A66C2]/5 transition-all shadow-sm hover:shadow"
              title="LinkedIn"
            >
              <Linkedin className="w-5 h-5 text-[#0A66C2] group-hover:scale-110 transition-transform" />
            </a>
            <a 
              href="https://github.com/vignesh-r24" 
              target="_blank" 
              rel="noopener noreferrer"
              className="group flex items-center justify-center w-10 h-10 rounded-full bg-stone-50 border border-stone-200 hover:border-[#181717]/30 hover:bg-[#181717]/5 transition-all shadow-sm hover:shadow"
              title="GitHub"
            >
              <Github className="w-5 h-5 text-[#181717] group-hover:scale-110 transition-transform" />
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}

