'use client';

import { format, isPast } from 'date-fns';
import { BookOpen, Award, Clock, CheckCircle2, AlertCircle, Play } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useState } from 'react';
import type { UserCourseEnrollment } from '@/types/app';

interface Props {
  enrollments: UserCourseEnrollment[];
  certificateCount: number;
}

export default function TrainingProgress({ enrollments, certificateCount }: Props) {
  const [tab, setTab] = useState<'all' | 'active' | 'completed'>('all');

  const completed = enrollments.filter(e => e.completed_at);
  const active    = enrollments.filter(e => !e.completed_at);
  const overdue   = active.filter(e => e.due_date && isPast(new Date(e.due_date)));
  const required  = active.filter(e => e.course?.is_required && !e.completed_at);

  const filtered = tab === 'active'
    ? active
    : tab === 'completed'
    ? completed
    : enrollments;

  const avgProgress = active.length > 0
    ? Math.round(active.reduce((sum, e) => sum + e.progress_pct, 0) / active.length)
    : 0;

  return (
    <div className="space-y-6">
      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Enrolled', value: enrollments.length, icon: <BookOpen className="h-5 w-5 text-blue-500" />, bg: 'bg-blue-50' },
          { label: 'Completed', value: completed.length,  icon: <CheckCircle2 className="h-5 w-5 text-green-500" />, bg: 'bg-green-50' },
          { label: 'Certificates', value: certificateCount, icon: <Award className="h-5 w-5 text-amber-500" />, bg: 'bg-amber-50' },
          { label: 'Overdue', value: overdue.length, icon: <AlertCircle className="h-5 w-5 text-red-500" />, bg: 'bg-red-50' },
        ].map(stat => (
          <Card key={stat.label} className="border-slate-100">
            <CardContent className="flex items-center gap-3 p-4">
              <div className={`h-10 w-10 rounded-lg flex items-center justify-center shrink-0 ${stat.bg}`}>
                {stat.icon}
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-900">{stat.value}</p>
                <p className="text-xs text-slate-500">{stat.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Required courses alert */}
      {required.length > 0 && (
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="flex items-center gap-3 p-4">
            <AlertCircle className="h-5 w-5 text-amber-600 shrink-0" />
            <p className="text-sm text-amber-800">
              You have <strong>{required.length}</strong> required course{required.length !== 1 ? 's' : ''} to complete.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Overall progress */}
      {active.length > 0 && (
        <Card className="border-slate-100">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-medium text-slate-700">Overall Progress</p>
              <p className="text-sm font-bold text-slate-900">{avgProgress}%</p>
            </div>
            <Progress value={avgProgress} className="h-2" />
            <p className="text-xs text-slate-400 mt-1">{active.length} course{active.length !== 1 ? 's' : ''} in progress</p>
          </CardContent>
        </Card>
      )}

      {/* Course list */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
            <TabsList className="h-8">
              <TabsTrigger value="all"       className="text-xs px-3">All ({enrollments.length})</TabsTrigger>
              <TabsTrigger value="active"    className="text-xs px-3">In Progress ({active.length})</TabsTrigger>
              <TabsTrigger value="completed" className="text-xs px-3">Completed ({completed.length})</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {filtered.length === 0 ? (
          <div className="text-center py-16">
            <BookOpen className="h-12 w-12 text-slate-200 mx-auto mb-3" />
            <p className="text-slate-500 font-medium">No courses found</p>
            <p className="text-xs text-slate-400 mt-1">
              {tab === 'completed' ? 'Complete a course to see it here' : 'Contact your administrator to be enrolled in courses'}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map(enrollment => (
              <CourseCard key={enrollment.id} enrollment={enrollment} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function CourseCard({ enrollment: e }: { enrollment: UserCourseEnrollment }) {
  const course  = e.course;
  const overdue = e.due_date && !e.completed_at && isPast(new Date(e.due_date));

  return (
    <Card className={`border-slate-100 ${overdue ? 'border-red-200 bg-red-50/30' : ''}`}>
      <CardContent className="p-4">
        <div className="flex items-start gap-4">
          {/* Thumbnail / icon */}
          <div className="h-12 w-12 rounded-lg bg-gradient-to-br from-blue-100 to-blue-50 flex items-center justify-center shrink-0">
            {course?.thumbnail_url
              ? <img src={course.thumbnail_url} alt="" className="h-12 w-12 rounded-lg object-cover" />
              : <BookOpen className="h-6 w-6 text-blue-500" />
            }
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-slate-900">{course?.title ?? 'Unknown Course'}</p>
                {course?.category && (
                  <p className="text-xs text-slate-400 mt-0.5">{course.category}</p>
                )}
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {course?.is_required && (
                  <Badge className="text-[10px] bg-red-100 text-red-700 border-0">Required</Badge>
                )}
                {e.completed_at ? (
                  <Badge className="text-[10px] bg-green-100 text-green-700 border-0 gap-1">
                    <CheckCircle2 className="h-2.5 w-2.5" /> Complete
                  </Badge>
                ) : overdue ? (
                  <Badge className="text-[10px] bg-red-100 text-red-700 border-0">Overdue</Badge>
                ) : (
                  <Badge className="text-[10px] bg-blue-100 text-blue-700 border-0">In Progress</Badge>
                )}
              </div>
            </div>

            {/* Progress */}
            {!e.completed_at && (
              <div className="mt-2">
                <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
                  <span>{e.progress_pct}% complete</span>
                  {e.due_date && (
                    <span className={`flex items-center gap-1 ${overdue ? 'text-red-500' : ''}`}>
                      <Clock className="h-3 w-3" />
                      Due {format(new Date(e.due_date), 'MMM d, yyyy')}
                    </span>
                  )}
                </div>
                <Progress value={e.progress_pct} className="h-1.5" />
              </div>
            )}

            {e.completed_at && (
              <p className="text-xs text-slate-400 mt-1.5 flex items-center gap-1">
                <Award className="h-3 w-3 text-amber-500" />
                Completed {format(new Date(e.completed_at), 'MMM d, yyyy')}
              </p>
            )}
          </div>

          {/* CTA */}
          {!e.completed_at && (
            <button className="shrink-0 h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center hover:bg-blue-200 transition-colors">
              <Play className="h-3.5 w-3.5 text-blue-600 ml-0.5" />
            </button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
