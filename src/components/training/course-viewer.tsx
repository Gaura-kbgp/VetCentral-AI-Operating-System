'use client';

import { useState, useEffect, useRef } from 'react';
import {
  X, CheckCircle2, Play, FileText, Link2, Video,
  ChevronLeft, ChevronRight, BookOpen, Award, Loader2,
  Clock, Lock, ExternalLink,
} from 'lucide-react';
import dynamic from 'next/dynamic';
import { cn } from '@/lib/utils';

const PDFViewer = dynamic(
  () => import('./pdf-viewer').then(m => m.PDFViewer),
  { ssr: false, loading: () => (
    <div className="flex items-center justify-center h-48 rounded-2xl bg-gray-900">
      <div className="h-8 w-8 border-2 border-orange-400 border-t-transparent rounded-full animate-spin" />
    </div>
  )},
);
import { QuizPlayer } from './quiz-player';
import { CertificateModal } from './certificate-modal';
import {
  updateModuleProgress,
  type LMSCourse, type LMSModule,
} from '@/lib/actions/training';

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function contentTypeIcon(type: string, cls = 'h-4 w-4') {
  if (type === 'video') return <Video className={cls} />;
  if (type === 'link')  return <Link2 className={cls} />;
  return <FileText className={cls} />;
}

// ─────────────────────────────────────────────────────────────
// Renderers for each content type
// ─────────────────────────────────────────────────────────────

function ArticleContent({ content }: { content: string }) {
  return (
    <div
      className="prose prose-sm max-w-none text-gray-700 leading-relaxed"
      dangerouslySetInnerHTML={{ __html: content }}
    />
  );
}

function YouTubeEmbed({ videoId, title, externalUrl }: { videoId: string; title: string; externalUrl: string }) {
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Listen for YouTube IFrame API postMessage events to detect errors
  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (typeof e.data !== 'string') return;
      try {
        const msg = JSON.parse(e.data);
        // YouTube sends { event: 'infoDelivery', info: { playerState: ... } } or error events
        if (msg?.event === 'onError') setStatus('error');
        if (msg?.event === 'onReady') setStatus('ready');
        if (msg?.event === 'onStateChange') {
          if (msg?.info === -1) setStatus('ready'); // unstarted = video loaded
        }
      } catch { /* not a JSON postMessage */ }
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  // Fallback: if iframe loads without YouTube API events, treat as ready after 3s
  useEffect(() => {
    const t = setTimeout(() => setStatus(s => s === 'loading' ? 'ready' : s), 3000);
    return () => clearTimeout(t);
  }, []);

  const src = `https://www.youtube-nocookie.com/embed/${videoId}?rel=0&modestbranding=1&enablejsapi=1`;

  if (status === 'error') {
    return (
      <div className="aspect-video w-full rounded-xl bg-gray-900 flex flex-col items-center justify-center gap-4 text-white">
        <Video className="h-12 w-12 text-gray-600" />
        <div className="text-center space-y-1">
          <p className="font-semibold text-sm">Video unavailable</p>
          <p className="text-xs text-gray-400">This video has been removed or is not available for embedding.</p>
        </div>
        <a
          href={externalUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg text-sm font-semibold transition-colors"
        >
          <ExternalLink className="h-4 w-4" /> Open in YouTube
        </a>
        <p className="text-[10px] text-gray-500">Ask an admin to update this video URL.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="aspect-video w-full rounded-xl overflow-hidden bg-black relative">
        {status === 'loading' && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-900">
            <Loader2 className="h-8 w-8 text-gray-600 animate-spin" />
          </div>
        )}
        <iframe
          ref={iframeRef}
          src={src}
          title={title}
          className="w-full h-full"
          allowFullScreen
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        />
      </div>
      <a
        href={externalUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 transition-colors"
      >
        <ExternalLink className="h-3 w-3" /> Open in YouTube
      </a>
    </div>
  );
}

function VideoContent({ url, title }: { url: string; title: string }) {
  const isYoutube = url.includes('youtube.com') || url.includes('youtu.be');
  const isVimeo   = url.includes('vimeo.com');

  if (isYoutube) {
    const id = url.match(/(?:v=|youtu\.be\/|embed\/|shorts\/)([^&?/]+)/)?.[1];
    const externalUrl = id ? `https://www.youtube.com/watch?v=${id}` : url;
    if (id) return <YouTubeEmbed videoId={id} title={title} externalUrl={externalUrl} />;
  }

  if (isVimeo) {
    const id = url.match(/vimeo\.com\/(\d+)/)?.[1];
    const src = id ? `https://player.vimeo.com/video/${id}` : url;
    return (
      <div className="space-y-2">
        <div className="aspect-video w-full rounded-xl overflow-hidden bg-black">
          <iframe src={src} title={title} className="w-full h-full" allowFullScreen
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" />
        </div>
        <a href={url} target="_blank" rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 transition-colors">
          <ExternalLink className="h-3 w-3" /> Open in Vimeo
        </a>
      </div>
    );
  }

  return (
    <div className="aspect-video w-full rounded-xl overflow-hidden bg-black">
      <video src={url} controls className="w-full h-full" title={title} />
    </div>
  );
}

function PDFContent({ url, title }: { url: string; title: string }) {
  return <PDFViewer url={url} title={title} />;
}

function LinkContent({ url, title, content }: { url: string; title: string; content?: string | null }) {
  return (
    <div className="space-y-4">
      {content && (
        <div className="prose prose-sm max-w-none text-gray-700" dangerouslySetInnerHTML={{ __html: content }} />
      )}
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-3 p-4 bg-blue-50 border border-blue-100 rounded-xl hover:bg-blue-100 transition-colors group"
      >
        <div className="h-10 w-10 rounded-lg bg-blue-100 flex items-center justify-center shrink-0 group-hover:bg-blue-200 transition-colors">
          <ExternalLink className="h-5 w-5 text-blue-600" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[14px] font-semibold text-blue-700 truncate">{title}</p>
          <p className="text-[12px] text-blue-500 truncate">{url}</p>
        </div>
      </a>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Module Sidebar Item
// ─────────────────────────────────────────────────────────────

function ModuleItem({
  module, index, isActive, isCompleted, onClick,
}: {
  module: LMSModule;
  index: number;
  isActive: boolean;
  isCompleted: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full flex items-start gap-3 px-3 py-2.5 rounded-lg text-left transition-colors',
        isActive
          ? 'bg-orange-50 border border-orange-200'
          : 'hover:bg-gray-100 border border-transparent',
      )}
    >
      <div className={cn(
        'h-6 w-6 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 mt-0.5',
        isCompleted
          ? 'bg-green-100 text-green-600'
          : isActive
            ? 'bg-orange-100 text-orange-600'
            : 'bg-gray-100 text-gray-500',
      )}>
        {isCompleted ? <CheckCircle2 className="h-3.5 w-3.5" /> : index + 1}
      </div>
      <div className="flex-1 min-w-0">
        <p className={cn(
          'text-[13px] font-medium leading-tight',
          isActive ? 'text-orange-800' : 'text-gray-700',
        )}>
          {module.title}
        </p>
        <div className="flex items-center gap-1.5 mt-1">
          <span className={cn('text-[10px]', isActive ? 'text-orange-500' : 'text-gray-400')}>
            {contentTypeIcon(module.content_type, 'h-3 w-3')}
          </span>
          {module.duration_mins > 0 && (
            <span className="text-[10px] text-gray-400 flex items-center gap-0.5">
              <Clock className="h-2.5 w-2.5" />{module.duration_mins}m
            </span>
          )}
          {module.is_required && !isCompleted && (
            <span className="text-[10px] text-red-400">Required</span>
          )}
        </div>
      </div>
    </button>
  );
}

// ─────────────────────────────────────────────────────────────
// Course Viewer
// ─────────────────────────────────────────────────────────────

interface CourseViewerProps {
  course: LMSCourse;
  userId: string;
  onClose: () => void;
  onProgressUpdate: () => void;
}

export function CourseViewer({ course, userId, onClose, onProgressUpdate }: CourseViewerProps) {
  const modules = course.modules ?? [];
  const enrollment = course.enrollment;

  const [currentIdx, setCurrentIdx]         = useState(0);
  const [completing, setCompleting]         = useState(false);
  const [showQuiz, setShowQuiz]             = useState(false);
  const [showCertModal, setShowCertModal]   = useState(false);
  const [localCompleted, setLocalCompleted] = useState(false);
  const [completedIds, setCompletedIds] = useState<Set<string>>(new Set(
    modules.filter(m => m.progress?.completed_at).map(m => m.id)
  ));

  const startTime = useRef(Date.now());

  useEffect(() => {
    startTime.current = Date.now();
  }, [currentIdx]);

  const currentModule = modules[currentIdx];
  const allRequired   = modules.filter(m => m.is_required);
  const allDone       = allRequired.length === 0
    ? modules.every(m => completedIds.has(m.id))
    : allRequired.every(m => completedIds.has(m.id));

  const isCompleted = localCompleted || !!enrollment?.completed_at || enrollment?.progress_pct === 100;
  // a quiz only "exists" if it has at least one question
  const hasQuiz = !!(course.quiz && (course.quiz.questions?.length ?? 0) > 0);

  const markComplete = async () => {
    if (!currentModule) return;
    setCompleting(true);
    const timeSecs = Math.round((Date.now() - startTime.current) / 1000);
    const result = await updateModuleProgress(currentModule.id, course.id, timeSecs);
    const newIds = new Set(completedIds).add(currentModule.id);
    setCompletedIds(newIds);
    // if 100% and no quiz, server auto-issues cert — reflect completion locally
    if (!hasQuiz && result.success && result.data?.pct === 100) {
      setLocalCompleted(true);
    }
    onProgressUpdate();

    // Auto-advance
    if (currentIdx < modules.length - 1) {
      setCurrentIdx(i => i + 1);
    }
    setCompleting(false);
  };

  const progress = modules.length > 0
    ? Math.round((completedIds.size / modules.length) * 100)
    : (enrollment?.progress_pct ?? 0);

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-white">
      {/* Header */}
      <div className="flex items-center gap-4 px-6 py-4 border-b border-gray-100 shrink-0">
        <button
          onClick={onClose}
          className="h-9 w-9 flex items-center justify-center rounded-xl hover:bg-gray-100 transition-colors"
        >
          <X className="h-5 w-5 text-gray-500" />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-[15px] font-bold text-gray-900 truncate">{course.title}</h1>
          <div className="flex items-center gap-3 mt-1">
            <div className="flex-1 max-w-48 h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-orange-400 rounded-full transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
            <span className="text-[11px] text-gray-400 shrink-0">{progress}%</span>
          </div>
        </div>

        {/* Quiz button */}
        {hasQuiz && (
          <button
            onClick={() => setShowQuiz(true)}
            className="flex items-center gap-2 h-9 px-4 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-[13px] font-semibold transition-colors"
          >
            <Play className="h-3.5 w-3.5" />
            {allDone || isCompleted ? 'Take Quiz' : 'Quiz'}
          </button>
        )}
        {/* No-quiz finish: show when all modules done but not yet completed */}
        {!hasQuiz && allDone && !isCompleted && (
          <button
            onClick={async () => {
              setCompleting(true);
              // ensure last module is marked — triggers auto-cert on server
              const mod = modules[modules.length - 1];
              if (mod) {
                const timeSecs = Math.round((Date.now() - startTime.current) / 1000);
                const result = await updateModuleProgress(mod.id, course.id, timeSecs);
                if (result.success && result.data?.pct === 100) {
                  setLocalCompleted(true);
                }
              } else {
                setLocalCompleted(true);
              }
              onProgressUpdate();
              setCompleting(false);
            }}
            disabled={completing}
            className="flex items-center gap-2 h-9 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-[13px] font-semibold transition-colors disabled:opacity-60"
          >
            {completing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
            Finish Course
          </button>
        )}
        {/* Certificate button when completed */}
        {isCompleted && (
          <button
            onClick={() => setShowCertModal(true)}
            className="flex items-center gap-2 h-9 px-4 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-[13px] font-semibold transition-colors"
          >
            <Award className="h-3.5 w-3.5" />
            Get Certificate
          </button>
        )}
      </div>

      <div className="flex flex-1 min-h-0">
        {/* Sidebar */}
        {modules.length > 0 && (
          <div className="w-72 shrink-0 border-r border-gray-100 flex flex-col overflow-y-auto bg-gray-50/50 p-3 gap-1">
            <p className="text-[11px] font-bold uppercase tracking-widest text-gray-400 px-2 py-1">
              Modules ({completedIds.size}/{modules.length})
            </p>
            {modules.map((m, i) => (
              <ModuleItem
                key={m.id}
                module={m}
                index={i}
                isActive={i === currentIdx}
                isCompleted={completedIds.has(m.id)}
                onClick={() => setCurrentIdx(i)}
              />
            ))}

            {/* Quiz entry in sidebar */}
            {hasQuiz && (
              <>
                <div className="border-t border-gray-200 my-1" />
                <button
                  onClick={() => setShowQuiz(true)}
                  className="w-full flex items-start gap-3 px-3 py-2.5 rounded-lg text-left hover:bg-gray-100 border border-transparent transition-colors"
                >
                  <div className="h-6 w-6 rounded-full bg-orange-100 flex items-center justify-center shrink-0">
                    <Play className="h-3.5 w-3.5 text-orange-600" />
                  </div>
                  <div>
                    <p className="text-[13px] font-medium text-gray-700">Final Quiz</p>
                    <p className="text-[10px] text-gray-400">Pass to earn certificate</p>
                  </div>
                </button>
              </>
            )}
          </div>
        )}

        {/* Content area */}
        <div className="flex-1 overflow-y-auto">
          {modules.length === 0 && !hasQuiz ? (
            <div className="flex flex-col items-center justify-center h-full gap-4">
              <BookOpen className="h-16 w-16 text-gray-200" />
              <p className="text-[15px] text-gray-500">No content available yet</p>
            </div>
          ) : currentModule ? (
            <div className="max-w-3xl mx-auto px-8 py-8 space-y-6">
              {/* Module header */}
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-gray-400">
                  {contentTypeIcon(currentModule.content_type, 'h-3.5 w-3.5')}
                  {currentModule.content_type}
                  {currentModule.duration_mins > 0 && (
                    <span className="ml-1 flex items-center gap-1">
                      <Clock className="h-3 w-3" /> {currentModule.duration_mins}m
                    </span>
                  )}
                </div>
                <h2 className="text-[22px] font-bold text-gray-900">{currentModule.title}</h2>
                {currentModule.description && (
                  <p className="text-[14px] text-gray-500">{currentModule.description}</p>
                )}
              </div>

              {/* Content */}
              <div>
                {currentModule.content_type === 'article' || currentModule.content_type === 'docx' ? (
                  <ArticleContent content={currentModule.content ?? '<p>No content available.</p>'} />
                ) : currentModule.content_type === 'video' && currentModule.content_url ? (
                  <VideoContent url={currentModule.content_url} title={currentModule.title} />
                ) : currentModule.content_type === 'pdf' && currentModule.content_url ? (
                  <PDFContent url={currentModule.content_url} title={currentModule.title} />
                ) : currentModule.content_type === 'link' && currentModule.content_url ? (
                  <LinkContent url={currentModule.content_url} title={currentModule.title} content={currentModule.content} />
                ) : (
                  <div className="py-12 text-center text-gray-400">
                    <Lock className="h-10 w-10 mx-auto mb-3 text-gray-200" />
                    <p className="text-[14px]">Content not available</p>
                  </div>
                )}
              </div>


              {/* Actions */}
              <div className="flex items-center justify-between pt-2 border-t border-gray-100">
                <button
                  onClick={() => setCurrentIdx(i => Math.max(0, i - 1))}
                  disabled={currentIdx === 0}
                  className="flex items-center gap-2 h-9 px-4 rounded-xl text-gray-600 text-[13px] font-medium disabled:opacity-40 hover:bg-gray-100 transition-colors"
                >
                  <ChevronLeft className="h-4 w-4" /> Previous
                </button>

                <div className="flex items-center gap-2">
                  {!completedIds.has(currentModule.id) && (
                    <button
                      onClick={markComplete}
                      disabled={completing}
                      className="flex items-center gap-2 h-9 px-4 rounded-xl bg-green-500 hover:bg-green-600 text-white text-[13px] font-semibold transition-colors disabled:opacity-60"
                    >
                      {completing
                        ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        : <CheckCircle2 className="h-3.5 w-3.5" />}
                      Mark Complete
                    </button>
                  )}

                  {currentIdx < modules.length - 1 ? (
                    <button
                      onClick={() => setCurrentIdx(i => i + 1)}
                      className="flex items-center gap-2 h-9 px-4 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-[13px] font-medium transition-colors"
                    >
                      Next <ChevronRight className="h-4 w-4" />
                    </button>
                  ) : hasQuiz ? (
                    <button
                      onClick={() => setShowQuiz(true)}
                      className="flex items-center gap-2 h-9 px-4 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-[13px] font-semibold transition-colors"
                    >
                      <Play className="h-3.5 w-3.5" /> Take Quiz
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {/* Quiz overlay */}
      {showQuiz && hasQuiz && (
        <QuizPlayer
          courseId={course.id}
          onClose={() => { setShowQuiz(false); onProgressUpdate(); }}
          onPassed={() => { setShowQuiz(false); onProgressUpdate(); onClose(); }}
        />
      )}

      {/* Certificate modal */}
      {showCertModal && (
        <CertificateModal
          courseId={course.id}
          courseName={course.title}
          onClose={() => setShowCertModal(false)}
        />
      )}
    </div>
  );
}
