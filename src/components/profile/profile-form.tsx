'use client';

import { useTransition, useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { Camera, Save, X, Pencil, Send, AlertCircle, CheckCircle2 } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { updateProfile, updateAvatar, type ProfileUpdateInput } from '@/lib/actions/profile';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

interface ProfileFormProps {
  profile: Record<string, unknown> | null;
  email: string;
}

export default function ProfileForm({ profile, email }: ProfileFormProps) {
  const [isPending, startTransition] = useTransition();
  const [avatarUrl, setAvatarUrl] = useState<string>((profile?.avatar_url as string) ?? '');
  const [uploading, setUploading] = useState(false);
  const [changingEmail, setChangingEmail] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [emailPending, setEmailPending] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const supabase = createSupabaseBrowserClient();

  const { register, handleSubmit, reset, formState: { isDirty, errors } } = useForm<ProfileUpdateInput>({
    defaultValues: {
      first_name:              (profile?.first_name as string) ?? '',
      last_name:               (profile?.last_name as string) ?? '',
      display_name:            (profile?.display_name as string) ?? '',
      employee_id:             (profile?.employee_id as string) ?? '',
      job_title:               (profile?.job_title as string) ?? '',
      department:              (profile?.department as string) ?? '',
      phone:                   (profile?.phone as string) ?? '',
      emergency_contact_name:  (profile?.emergency_contact_name as string) ?? '',
      emergency_contact_phone: (profile?.emergency_contact_phone as string) ?? '',
    },
  });

  const initials = [
    (profile?.first_name as string)?.[0],
    (profile?.last_name as string)?.[0],
  ].filter(Boolean).join('').toUpperCase() || 'U';

  async function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image must be under 5 MB');
      return;
    }

    setUploading(true);
    const ext  = file.name.split('.').pop();
    const path = `avatars/${(profile?.id as string)}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(path, file, { upsert: true });

    if (uploadError) {
      toast.error('Failed to upload photo');
      setUploading(false);
      return;
    }

    const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path);
    setAvatarUrl(publicUrl);

    const result = await updateAvatar(publicUrl);
    if (result.success) {
      toast.success('Photo updated');
    } else {
      toast.error(result.error);
    }
    setUploading(false);
  }

  async function handleEmailChange() {
    if (!newEmail || !newEmail.includes('@')) {
      toast.error('Enter a valid email address');
      return;
    }
    if (newEmail === email) {
      toast.error('New email is the same as your current email');
      return;
    }
    setEmailPending(true);
    const { error } = await supabase.auth.updateUser({ email: newEmail });
    setEmailPending(false);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success(`Confirmation link sent to ${newEmail}. Check your inbox to complete the change.`);
      setChangingEmail(false);
      setNewEmail('');
    }
  }

  function onSubmit(data: ProfileUpdateInput) {
    setSaveError(null);
    setSaveSuccess(false);
    startTransition(async () => {
      const result = await updateProfile(data);
      if (result.success) {
        setSaveSuccess(true);
        toast.success('Profile saved successfully');
        reset(data);
      } else {
        setSaveError(result.error ?? 'Failed to save profile');
        toast.error(result.error);
      }
    });
  }

  return (
    <Card>
      <CardHeader className="pb-4">
        <CardTitle className="text-base font-semibold">Personal Information</CardTitle>
      </CardHeader>
      <CardContent>
        {/* Avatar upload */}
        <div className="flex items-center gap-4 mb-6">
          <div className="relative">
            <Avatar className="h-20 w-20 ring-2 ring-slate-100">
              <AvatarImage src={avatarUrl || undefined} />
              <AvatarFallback className="text-xl font-semibold bg-blue-600 text-white">
                {initials}
              </AvatarFallback>
            </Avatar>
            <label
              htmlFor="avatar-upload"
              className="absolute -bottom-1 -right-1 h-7 w-7 rounded-full bg-blue-600 text-white flex items-center justify-center cursor-pointer hover:bg-blue-700 transition-colors shadow-sm"
            >
              <Camera className="h-3.5 w-3.5" />
              <input
                id="avatar-upload"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="sr-only"
                onChange={handlePhotoChange}
                disabled={uploading}
              />
            </label>
          </div>
          <div>
            <p className="text-sm font-medium text-slate-700">Profile Photo</p>
            <p className="text-xs text-slate-400 mt-0.5">JPEG, PNG or WebP · Max 5 MB</p>
            {uploading && <p className="text-xs text-blue-500 mt-0.5">Uploading…</p>}
          </div>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          {/* Name row */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="first_name">First Name <span className="text-red-500">*</span></Label>
              <Input id="first_name" {...register('first_name', { required: 'Required' })} />
              {errors.first_name && <p className="text-xs text-red-500">{errors.first_name.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="last_name">Last Name <span className="text-red-500">*</span></Label>
              <Input id="last_name" {...register('last_name', { required: 'Required' })} />
              {errors.last_name && <p className="text-xs text-red-500">{errors.last_name.message}</p>}
            </div>
          </div>

          {/* Display name */}
          <div className="space-y-1.5">
            <Label htmlFor="display_name">Display Name</Label>
            <Input id="display_name" placeholder="How you appear to others" {...register('display_name')} />
          </div>

          {/* Email */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="email">Email Address</Label>
              {!changingEmail && (
                <button
                  type="button"
                  onClick={() => setChangingEmail(true)}
                  className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium"
                >
                  <Pencil className="h-3 w-3" />
                  Change email
                </button>
              )}
            </div>
            <Input id="email" type="email" value={email} disabled className="bg-slate-50 text-slate-500" />
            {changingEmail && (
              <div className="mt-2 space-y-2 rounded-lg border border-blue-100 bg-blue-50/50 p-3">
                <p className="text-xs text-slate-600 font-medium">New email address</p>
                <Input
                  type="email"
                  placeholder="new@example.com"
                  value={newEmail}
                  onChange={e => setNewEmail(e.target.value)}
                  autoFocus
                  className="bg-white"
                />
                <p className="text-xs text-slate-400">
                  A confirmation link will be sent to the new address. Your email won&apos;t change until you click it.
                </p>
                <div className="flex items-center gap-2 pt-1">
                  <Button
                    type="button"
                    size="sm"
                    onClick={handleEmailChange}
                    disabled={emailPending || !newEmail}
                    className="gap-1.5 h-8 text-xs"
                  >
                    <Send className="h-3 w-3" />
                    {emailPending ? 'Sending…' : 'Send Confirmation'}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => { setChangingEmail(false); setNewEmail(''); }}
                    disabled={emailPending}
                    className="h-8 text-xs text-slate-500"
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* Employee ID */}
          <div className="space-y-1.5">
            <Label htmlFor="employee_id">Employee ID</Label>
            <Input id="employee_id" placeholder="EMP-001" {...register('employee_id')} />
          </div>

          <Separator />

          {/* Job info */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="job_title">Job Title</Label>
              <Input id="job_title" placeholder="Veterinarian" {...register('job_title')} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="department">Department</Label>
              <Input id="department" placeholder="Surgery" {...register('department')} />
            </div>
          </div>

          {/* Phone */}
          <div className="space-y-1.5">
            <Label htmlFor="phone">Phone Number</Label>
            <Input id="phone" type="tel" placeholder="+1 (555) 000-0000" {...register('phone')} />
          </div>

          <Separator />

          {/* Emergency contact */}
          <p className="text-sm font-medium text-slate-700">Emergency Contact</p>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="emergency_contact_name">Contact Name</Label>
              <Input id="emergency_contact_name" placeholder="Jane Doe" {...register('emergency_contact_name')} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="emergency_contact_phone">Contact Phone</Label>
              <Input id="emergency_contact_phone" type="tel" placeholder="+1 (555) 000-0000" {...register('emergency_contact_phone')} />
            </div>
          </div>

          {/* Inline save feedback */}
          {saveError && (
            <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5">
              <AlertCircle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
              <p className="text-sm text-red-700">{saveError}</p>
            </div>
          )}
          {saveSuccess && !isDirty && (
            <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-3 py-2">
              <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
              <p className="text-sm text-green-700">Profile saved successfully</p>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-3 pt-2">
            <Button type="submit" disabled={isPending} className="gap-2">
              <Save className="h-4 w-4" />
              {isPending ? 'Saving…' : 'Save Changes'}
            </Button>
            {isDirty && (
              <Button
                type="button"
                variant="outline"
                onClick={() => { reset(); setSaveError(null); setSaveSuccess(false); }}
                className="gap-2"
              >
                <X className="h-4 w-4" />
                Cancel
              </Button>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
