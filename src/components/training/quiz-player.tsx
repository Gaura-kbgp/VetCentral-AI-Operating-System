'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  CheckCircle2, XCircle, Clock, Trophy, AlertCircle,
  ChevronLeft, ChevronRight, Loader2, RotateCcw,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  getQuizForCourse, getMyQuizAttempts, submitQuizAttempt,
  type QuizDefinition, type QuizQuestion,
} from '@/lib/actions/training';

// ─────────────────────────────────────────────────────────────
// Timer
// ─────────────────────────────────────────────────────────────

function Timer({ seconds, onExpire }: { seconds: number; onExpire: () => void }) {
  const [remaining, setRemaining] = useState(seconds);
  const expired = useRef(false);

  useEffect(() => {
    if (remaining <= 0) {
      if (!expired.current) { expired.current = true; onExpire(); }
      return;
    }
    const t = setTimeout(() => setRemaining(r => r - 1), 1000);
    return () => clearTimeout(t);
  }, [remaining, onExpire]);

  const mins = Math.floor(remaining / 60);
  const secs = remaining % 60;
  const warn = remaining < 60;

  return (
    <div className={cn(
      'flex items-center gap-1.5 text-[13px] font-semibold tabular-nums',
      warn ? 'text-red-600 animate-pulse' : 'text-gray-600',
    )}>
      <Clock className="h-4 w-4" />
      {String(mins).padStart(2, '0')}:{String(secs).padStart(2, '0')}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Result Screen
// ─────────────────────────────────────────────────────────────

function ResultScreen({
  score, passed, passScore, onClose, onRetry, canRetry,
}: {
  score: number; passed: boolean; passScore: number;
  onClose: () => void; onRetry: () => void; canRetry: boolean;
}) {
  return (
    <div className="flex flex-col items-center justify-center flex-1 gap-6 p-8 text-center">
      <div className={cn(
        'h-24 w-24 rounded-full flex items-center justify-center',
        passed ? 'bg-green-100' : 'bg-red-100',
      )}>
        {passed
          ? <Trophy className="h-12 w-12 text-green-500" />
          : <XCircle className="h-12 w-12 text-red-500" />}
      </div>

      <div>
        <p className="text-[28px] font-bold text-gray-900">{score}%</p>
        <p className={cn('text-[16px] font-semibold mt-1', passed ? 'text-green-600' : 'text-red-600')}>
          {passed ? 'Quiz Passed!' : 'Quiz Failed'}
        </p>
        <p className="text-[13px] text-gray-400 mt-1">
          Passing score: {passScore}%
        </p>
      </div>

      {passed && (
        <div className="bg-green-50 border border-green-200 rounded-xl px-6 py-4 max-w-sm">
          <p className="text-[13px] text-green-700">
            Congratulations! Your certificate will be generated automatically.
          </p>
        </div>
      )}

      <div className="flex items-center gap-3">
        {!passed && canRetry && (
          <button
            onClick={onRetry}
            className="flex items-center gap-2 h-10 px-5 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-[14px] font-medium transition-colors"
          >
            <RotateCcw className="h-4 w-4" />
            Try Again
          </button>
        )}
        <button
          onClick={onClose}
          className="flex items-center gap-2 h-10 px-5 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 text-[14px] font-medium transition-colors"
        >
          {passed ? 'Continue' : 'Back to Course'}
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// QuizPlayer
// ─────────────────────────────────────────────────────────────

interface QuizPlayerProps {
  courseId: string;
  onClose: () => void;
  onPassed: () => void;
}

type Phase = 'loading' | 'intro' | 'taking' | 'submitting' | 'result';

export function QuizPlayer({ courseId, onClose, onPassed }: QuizPlayerProps) {
  const [phase, setPhase]       = useState<Phase>('loading');
  const [quiz, setQuiz]         = useState<QuizDefinition | null>(null);
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [answers, setAnswers]   = useState<Record<string, string>>({});
  const [current, setCurrent]   = useState(0);
  const [attemptsUsed, setAttemptsUsed] = useState(0);
  const [error, setError]       = useState('');

  // Result state
  const [score, setScore]       = useState(0);
  const [passed, setPassed]     = useState(false);

  const load = useCallback(async () => {
    setPhase('loading');
    setError('');
    const [quizRes, attemptsRes] = await Promise.all([
      getQuizForCourse(courseId),
      // We'll get attempt count from the quiz action
      Promise.resolve({ success: true, data: [] }),
    ]);

    if (!quizRes.success) {
      setError((quizRes as any).error ?? 'No quiz found');
      setPhase('intro');
      return;
    }

    if (!quizRes.data) {
      setError('No quiz found');
      setPhase('intro');
      return;
    }

    const qDef = quizRes.data;
    let qs = qDef.questions ?? [];
    if (qDef.randomize) qs = [...qs].sort(() => Math.random() - 0.5);

    setQuiz(qDef);
    setQuestions(qs);
    setAnswers({});
    setCurrent(0);
    setPhase('intro');
  }, [courseId]);

  useEffect(() => { load(); }, [load]);

  const handleTimerExpire = useCallback(() => {
    // Auto-submit on timer expiry
    handleSubmit();
  }, [answers, quiz]);

  const handleSubmit = async () => {
    if (!quiz) return;
    setPhase('submitting');
    const result = await submitQuizAttempt(quiz.id, courseId, answers);
    if (!result.success) {
      setError(result.error ?? 'Failed to submit');
      setPhase('taking');
      return;
    }
    setScore(result.data.score);
    setPassed(result.data.passed);
    setAttemptsUsed(a => a + 1);
    if (result.data.passed) onPassed();
    setPhase('result');
  };

  const answeredCount = Object.keys(answers).length;
  const totalQs = questions.length;
  const q = questions[current];

  // ── Loading ──
  if (phase === 'loading') {
    return (
      <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center">
        <div className="bg-white rounded-2xl p-10 flex items-center gap-4 shadow-2xl">
          <Loader2 className="h-6 w-6 animate-spin text-orange-500" />
          <p className="text-[15px] font-medium text-gray-700">Loading quiz…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-[16px] font-bold text-gray-900">{quiz?.title ?? 'Course Quiz'}</h2>
            {quiz && (
              <p className="text-[12px] text-gray-400 mt-0.5">
                Pass score: {quiz.pass_score}%
                {quiz.max_attempts > 0 && ` · Max ${quiz.max_attempts} attempts`}
              </p>
            )}
          </div>
          {phase === 'taking' && quiz?.time_limit && (
            <Timer seconds={quiz.time_limit * 60} onExpire={handleTimerExpire} />
          )}
        </div>

        {/* Error */}
        {error && phase !== 'taking' && (
          <div className="mx-6 mt-4 bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
            <AlertCircle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
            <p className="text-[13px] text-red-600">{error}</p>
          </div>
        )}

        {/* Intro */}
        {phase === 'intro' && !error && quiz && (
          <div className="flex flex-col items-center justify-center flex-1 p-8 text-center gap-5">
            <div className="h-20 w-20 rounded-full bg-orange-100 flex items-center justify-center">
              <Trophy className="h-10 w-10 text-orange-500" />
            </div>
            <div>
              <h3 className="text-[20px] font-bold text-gray-900">{quiz.title}</h3>
              {quiz.description && (
                <p className="text-[13px] text-gray-500 mt-1 max-w-sm">{quiz.description}</p>
              )}
            </div>
            <div className="flex items-center gap-6 text-[13px] text-gray-500">
              <span>{totalQs} questions</span>
              <span>·</span>
              <span>{quiz.pass_score}% to pass</span>
              {quiz.time_limit && <><span>·</span><span>{quiz.time_limit} min limit</span></>}
            </div>
            <button
              onClick={() => setPhase('taking')}
              className="h-11 px-8 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-[15px] font-semibold transition-colors"
            >
              Start Quiz
            </button>
            <button onClick={onClose} className="text-[13px] text-gray-400 hover:text-gray-600">
              Cancel
            </button>
          </div>
        )}

        {/* Error state — no quiz */}
        {phase === 'intro' && error && (
          <div className="flex flex-col items-center justify-center flex-1 p-8 text-center gap-4">
            <AlertCircle className="h-12 w-12 text-gray-300" />
            <p className="text-[14px] text-gray-500">{error}</p>
            <button onClick={onClose} className="h-9 px-5 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 text-[13px] font-medium transition-colors">
              Back to Course
            </button>
          </div>
        )}

        {/* Taking */}
        {phase === 'taking' && q && (
          <div className="flex flex-col flex-1 overflow-hidden">
            {/* Progress */}
            <div className="px-6 py-3 bg-gray-50 border-b border-gray-100">
              <div className="flex items-center justify-between text-[12px] text-gray-500 mb-1.5">
                <span>Question {current + 1} of {totalQs}</span>
                <span>{answeredCount} answered</span>
              </div>
              <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-orange-400 rounded-full transition-all"
                  style={{ width: `${((current + 1) / totalQs) * 100}%` }}
                />
              </div>
            </div>

            {/* Question */}
            <div className="flex-1 overflow-y-auto p-6 space-y-5">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-widest text-gray-400 mb-2">
                  {q.question_type === 'true_false' ? 'True / False' : 'Multiple Choice'}
                  {q.points > 1 && <span className="ml-2 text-orange-500">{q.points} pts</span>}
                </p>
                <p className="text-[16px] font-semibold text-gray-900 leading-snug">{q.question_text}</p>
              </div>

              <div className="space-y-2.5">
                {q.options.map(opt => {
                  const selected = answers[q.id] === opt.id;
                  return (
                    <button
                      key={opt.id}
                      onClick={() => setAnswers(prev => ({ ...prev, [q.id]: opt.id }))}
                      className={cn(
                        'w-full text-left px-4 py-3.5 rounded-xl border-2 text-[14px] transition-all',
                        selected
                          ? 'border-orange-400 bg-orange-50 text-orange-800 font-medium'
                          : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300 hover:bg-gray-50',
                      )}
                    >
                      <span className={cn(
                        'inline-flex h-5 w-5 rounded-full border-2 mr-3 items-center justify-center text-[10px] font-bold shrink-0',
                        selected ? 'border-orange-400 bg-orange-400 text-white' : 'border-gray-300',
                      )}>
                        {selected && '✓'}
                      </span>
                      {opt.text}
                    </button>
                  );
                })}
              </div>

              {/* Error inline */}
              {error && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-[12px] text-red-600">
                  {error}
                </div>
              )}
            </div>

            {/* Navigation */}
            <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100">
              <button
                onClick={() => setCurrent(c => Math.max(0, c - 1))}
                disabled={current === 0}
                className="flex items-center gap-2 h-9 px-4 rounded-xl text-gray-600 text-[13px] font-medium disabled:opacity-40 hover:bg-gray-100 transition-colors"
              >
                <ChevronLeft className="h-4 w-4" /> Prev
              </button>

              {current < totalQs - 1 ? (
                <button
                  onClick={() => setCurrent(c => c + 1)}
                  className="flex items-center gap-2 h-9 px-4 rounded-xl text-gray-600 text-[13px] font-medium hover:bg-gray-100 transition-colors"
                >
                  Next <ChevronRight className="h-4 w-4" />
                </button>
              ) : (
                <button
                  onClick={handleSubmit}
                  disabled={answeredCount < totalQs}
                  className="flex items-center gap-2 h-9 px-5 rounded-xl bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white text-[13px] font-semibold transition-colors"
                >
                  Submit Quiz
                </button>
              )}
            </div>

            {/* Jump nav */}
            <div className="px-6 pb-4 flex items-center gap-1.5 flex-wrap">
              {questions.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setCurrent(i)}
                  className={cn(
                    'h-6 w-6 rounded text-[11px] font-semibold transition-colors',
                    i === current
                      ? 'bg-orange-500 text-white'
                      : answers[questions[i].id]
                        ? 'bg-green-100 text-green-700'
                        : 'bg-gray-100 text-gray-500 hover:bg-gray-200',
                  )}
                >
                  {i + 1}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Submitting */}
        {phase === 'submitting' && (
          <div className="flex flex-col items-center justify-center flex-1 p-8 gap-4">
            <Loader2 className="h-8 w-8 animate-spin text-orange-500" />
            <p className="text-[14px] text-gray-600">Submitting your answers…</p>
          </div>
        )}

        {/* Result */}
        {phase === 'result' && (
          <ResultScreen
            score={score}
            passed={passed}
            passScore={quiz?.pass_score ?? 80}
            onClose={onClose}
            onRetry={() => {
              setAnswers({});
              setCurrent(0);
              if (quiz?.randomize) setQuestions(q => [...q].sort(() => Math.random() - 0.5));
              setPhase('taking');
            }}
            canRetry={attemptsUsed < (quiz?.max_attempts ?? 3)}
          />
        )}

      </div>
    </div>
  );
}
