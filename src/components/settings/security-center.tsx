'use client';

import { useTransition, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { formatDistanceToNow, format } from 'date-fns';
import {
  Shield, Key, Monitor, LogOut, AlertTriangle, Clock, CheckCircle2
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger
} from '@/components/ui/alert-dialog';
import { changePassword, revokeSession, revokeAllOtherSessions, type ChangePasswordInput } from '@/lib/actions/security';
import type { UserSession } from '@/types/app';

interface Props {
  sessions: UserSession[];
  loginHistory: Record<string, unknown>[];
  email: string;
}

export default function SecurityCenter({ sessions, loginHistory, email }: Props) {
  const [isPending, startTransition] = useTransition();
  const [activeSessions, setActiveSessions] = useState(sessions);
  const [showPassword, setShowPassword] = useState(false);

  const { register, handleSubmit, reset, formState: { errors } } = useForm<ChangePasswordInput>();

  function handleChangePassword(data: ChangePasswordInput) {
    startTransition(async () => {
      const r = await changePassword(data);
      if (r.success) {
        toast.success('Password changed successfully');
        reset();
        setShowPassword(false);
      } else {
        toast.error(r.error);
      }
    });
  }

  function handleRevokeSession(sessionId: string) {
    startTransition(async () => {
      const r = await revokeSession(sessionId);
      if (r.success) {
        setActiveSessions(prev => prev.filter(s => s.id !== sessionId));
        toast.success('Session revoked');
      } else {
        toast.error(r.error);
      }
    });
  }

  function handleRevokeAll() {
    startTransition(async () => {
      const r = await revokeAllOtherSessions();
      if (r.success) {
        setActiveSessions(prev => prev.slice(0, 1));
        toast.success('All other sessions signed out');
      } else {
        toast.error(r.error);
      }
    });
  }

  return (
    <div className="space-y-4">
      {/* Change Password */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Key className="h-4 w-4 text-slate-500" />
            <CardTitle className="text-sm font-semibold text-slate-700">Password</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          {!showPassword ? (
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-700">{email}</p>
                <p className="text-xs text-slate-400 mt-0.5">Password last changed: unknown</p>
              </div>
              <Button variant="outline" size="sm" onClick={() => setShowPassword(true)}>
                Change Password
              </Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit(handleChangePassword)} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="current_password">Current Password</Label>
                <Input
                  id="current_password"
                  type="password"
                  {...register('current_password', { required: 'Required' })}
                />
                {errors.current_password && <p className="text-xs text-red-500">{errors.current_password.message}</p>}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="new_password">New Password</Label>
                <Input
                  id="new_password"
                  type="password"
                  {...register('new_password', {
                    required: 'Required',
                    minLength: { value: 8, message: 'Minimum 8 characters' },
                  })}
                />
                {errors.new_password && <p className="text-xs text-red-500">{errors.new_password.message}</p>}
                <ul className="text-xs text-slate-400 space-y-0.5 mt-1">
                  <li className="flex items-center gap-1"><CheckCircle2 className="h-3 w-3" /> Minimum 8 characters</li>
                  <li className="flex items-center gap-1"><CheckCircle2 className="h-3 w-3" /> One uppercase letter</li>
                  <li className="flex items-center gap-1"><CheckCircle2 className="h-3 w-3" /> One number</li>
                  <li className="flex items-center gap-1"><CheckCircle2 className="h-3 w-3" /> One special character</li>
                </ul>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="confirm_password">Confirm New Password</Label>
                <Input
                  id="confirm_password"
                  type="password"
                  {...register('confirm_password', { required: 'Required' })}
                />
                {errors.confirm_password && <p className="text-xs text-red-500">{errors.confirm_password.message}</p>}
              </div>

              <div className="flex gap-3">
                <Button type="submit" disabled={isPending}>
                  {isPending ? 'Updating…' : 'Update Password'}
                </Button>
                <Button type="button" variant="outline" onClick={() => { setShowPassword(false); reset(); }}>
                  Cancel
                </Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>

      {/* Active Sessions */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Monitor className="h-4 w-4 text-slate-500" />
              <CardTitle className="text-sm font-semibold text-slate-700">
                Active Sessions ({activeSessions.length})
              </CardTitle>
            </div>
            {activeSessions.length > 1 && (
              <AlertDialog>
                <AlertDialogTrigger render={
                  <Button variant="outline" size="sm" className="gap-1.5 text-xs h-7">
                    <LogOut className="h-3 w-3" />
                    Sign out all others
                  </Button>
                } />
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Sign out all other sessions?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will end all other active sessions. You will remain signed in on this device.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={handleRevokeAll}>Sign out all others</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {activeSessions.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-4">No active sessions found</p>
          ) : (
            <div className="space-y-3">
              {activeSessions.map((s, i) => (
                <div key={s.id} className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
                    <Monitor className="h-4 w-4 text-slate-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-700 truncate">
                      {s.user_agent ? s.user_agent.substring(0, 60) : 'Unknown device'}
                      {i === 0 && <Badge className="ml-2 text-[10px] bg-green-100 text-green-700 border-0">Current</Badge>}
                    </p>
                    <p className="text-xs text-slate-400">
                      {s.ip_address ?? 'Unknown IP'} ·{' '}
                      Last active {formatDistanceToNow(new Date(s.last_seen), { addSuffix: true })}
                    </p>
                  </div>
                  {i !== 0 && (
                    <Button
                      variant="ghost" size="sm"
                      className="text-xs text-red-500 hover:text-red-600 hover:bg-red-50 shrink-0"
                      onClick={() => handleRevokeSession(s.id)}
                      disabled={isPending}
                    >
                      Revoke
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Login History */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-slate-500" />
            <CardTitle className="text-sm font-semibold text-slate-700">Security Activity</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          {loginHistory.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-4">No security activity recorded</p>
          ) : (
            <div className="space-y-3">
              {loginHistory.map((log) => {
                const isSuccess = !String(log.action).includes('fail');
                return (
                  <div key={String(log.id)} className="flex items-start gap-3">
                    <div className={`mt-0.5 h-6 w-6 rounded-full flex items-center justify-center shrink-0 ${
                      isSuccess ? 'bg-green-100' : 'bg-red-100'
                    }`}>
                      {isSuccess
                        ? <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
                        : <AlertTriangle className="h-3.5 w-3.5 text-red-600" />
                      }
                    </div>
                    <div>
                      <p className="text-sm text-slate-700 capitalize">
                        {String(log.action).replace(/_/g, ' ')}
                      </p>
                      <p className="text-xs text-slate-400">
                        {format(new Date(String(log.created_at)), 'MMM d, yyyy · HH:mm')}
                        {log.ip_address ? ` · ${log.ip_address}` : ''}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
