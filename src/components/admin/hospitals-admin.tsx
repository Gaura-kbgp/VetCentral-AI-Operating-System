'use client';

import { useState, useMemo, useTransition } from 'react';
import { formatDistanceToNow } from 'date-fns';
import {
  Search, Building2, CheckCircle2, XCircle, MoreHorizontal,
  Plus, Pencil, Power, PowerOff, Globe, Mail, Phone, MapPin, Users,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  createHospital, updateHospital, toggleHospitalStatus,
  type HospitalInput,
} from '@/lib/actions/hospitals';

// ── Types ────────────────────────────────────────────────────────
export interface HospitalRow {
  id: string;
  name: string;
  slug: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  timezone: string | null;
  color: string | null;
  description: string | null;
  is_active: boolean;
  created_at: string;
  staff_count?: number;
}

interface Props {
  hospitals: HospitalRow[];
  currentUserId: string;
}

const TIMEZONES = [
  'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
  'America/Phoenix', 'America/Anchorage', 'Pacific/Honolulu',
];

const COLOR_PRESETS = ['#2563EB', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6'];

// ── Form ─────────────────────────────────────────────────────────
interface HospitalFormProps {
  initial?: Partial<HospitalRow>;
  pending: boolean;
  onSubmit: (input: HospitalInput) => void;
  onCancel: () => void;
  submitLabel: string;
}

function HospitalForm({ initial, pending, onSubmit, onCancel, submitLabel }: HospitalFormProps) {
  const [name, setName] = useState(initial?.name ?? '');
  const [address, setAddress] = useState(initial?.address ?? '');
  const [phone, setPhone] = useState(initial?.phone ?? '');
  const [email, setEmail] = useState(initial?.email ?? '');
  const [website, setWebsite] = useState(initial?.website ?? '');
  const [timezone, setTimezone] = useState(initial?.timezone ?? 'America/New_York');
  const [color, setColor] = useState(initial?.color ?? COLOR_PRESETS[0]);
  const [description, setDescription] = useState(initial?.description ?? '');

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      toast.error('Name is required');
      return;
    }
    onSubmit({
      name: name.trim(),
      address: address.trim() || null,
      phone: phone.trim() || null,
      email: email.trim() || null,
      website: website.trim() || null,
      timezone,
      color,
      description: description.trim() || null,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="h-name">Name *</Label>
        <Input id="h-name" value={name} onChange={e => setName(e.target.value)} placeholder="Hospital name" required />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="h-phone">Phone</Label>
          <Input id="h-phone" value={phone} onChange={e => setPhone(e.target.value)} placeholder="(555) 123-4567" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="h-email">Email</Label>
          <Input id="h-email" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="info@example.com" />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="h-address">Address</Label>
        <Input id="h-address" value={address} onChange={e => setAddress(e.target.value)} placeholder="123 Main St, City, State" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="h-website">Website</Label>
          <Input id="h-website" value={website} onChange={e => setWebsite(e.target.value)} placeholder="https://example.com" />
        </div>
        <div className="space-y-1.5">
          <Label>Timezone</Label>
          <Select value={timezone} onValueChange={v => setTimezone(v ?? '')}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {TIMEZONES.map(tz => <SelectItem key={tz} value={tz}>{tz}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-1.5">
        <Label>Color</Label>
        <div className="flex gap-2">
          {COLOR_PRESETS.map(c => (
            <button
              key={c}
              type="button"
              onClick={() => setColor(c)}
              className={`h-8 w-8 rounded-full border-2 transition ${color === c ? 'border-foreground scale-110' : 'border-transparent'}`}
              style={{ backgroundColor: c }}
              aria-label={`Color ${c}`}
            />
          ))}
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="h-desc">Description</Label>
        <Textarea id="h-desc" value={description} onChange={e => setDescription(e.target.value)} placeholder="Optional description" rows={3} />
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel} disabled={pending}>Cancel</Button>
        <Button type="submit" disabled={pending}>{pending ? 'Saving…' : submitLabel}</Button>
      </DialogFooter>
    </form>
  );
}

// ── Main ─────────────────────────────────────────────────────────
export default function HospitalsAdmin({ hospitals: initialHospitals }: Props) {
  const [hospitals, setHospitals] = useState<HospitalRow[]>(initialHospitals);
  const [search, setSearch] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<HospitalRow | null>(null);
  const [pending, startTransition] = useTransition();

  const stats = useMemo(() => ({
    total: hospitals.length,
    active: hospitals.filter(h => h.is_active).length,
    inactive: hospitals.filter(h => !h.is_active).length,
  }), [hospitals]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return hospitals;
    return hospitals.filter(h =>
      h.name.toLowerCase().includes(q) ||
      (h.address ?? '').toLowerCase().includes(q) ||
      (h.email ?? '').toLowerCase().includes(q),
    );
  }, [hospitals, search]);

  function upsertLocal(row: HospitalRow) {
    setHospitals(prev => {
      const idx = prev.findIndex(h => h.id === row.id);
      if (idx === -1) return [...prev, row].sort((a, b) => a.name.localeCompare(b.name));
      const next = [...prev];
      next[idx] = { ...next[idx], ...row };
      return next;
    });
  }

  function handleCreate(input: HospitalInput) {
    startTransition(async () => {
      const res = await createHospital(input);
      if (res.success && res.data) {
        upsertLocal(res.data as unknown as HospitalRow);
        toast.success('Hospital created');
        setAddOpen(false);
      } else {
        toast.error(res.error ?? 'Failed to create hospital');
      }
    });
  }

  function handleUpdate(input: HospitalInput) {
    if (!editing) return;
    const id = editing.id;
    startTransition(async () => {
      const res = await updateHospital(id, input);
      if (res.success && res.data) {
        upsertLocal(res.data as unknown as HospitalRow);
        toast.success('Hospital updated');
        setEditing(null);
      } else {
        toast.error(res.error ?? 'Failed to update hospital');
      }
    });
  }

  function handleToggle(h: HospitalRow) {
    startTransition(async () => {
      const res = await toggleHospitalStatus(h.id, !h.is_active);
      if (res.success && res.data) {
        upsertLocal(res.data as unknown as HospitalRow);
        toast.success(h.is_active ? 'Hospital disabled' : 'Hospital enabled');
      } else {
        toast.error(res.error ?? 'Failed to update status');
      }
    });
  }

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard label="Total Hospitals" value={stats.total} icon={<Building2 className="h-5 w-5" />} tone="text-blue-600" />
        <StatCard label="Active" value={stats.active} icon={<CheckCircle2 className="h-5 w-5" />} tone="text-emerald-600" />
        <StatCard label="Inactive" value={stats.inactive} icon={<XCircle className="h-5 w-5" />} tone="text-slate-500" />
      </div>

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search hospitals…" className="pl-9" />
        </div>
        <Button onClick={() => setAddOpen(true)}>
          <Plus className="h-4 w-4 mr-1.5" /> Add Hospital
        </Button>
      </div>

      {/* Grid */}
      {filtered.length === 0 ? (
        <EmptyState onAdd={() => setAddOpen(true)} hasAny={hospitals.length > 0} />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(h => (
            <Card key={h.id} className={`relative overflow-hidden ${h.is_active ? '' : 'opacity-60'}`}>
              <div className="h-1.5 w-full" style={{ backgroundColor: h.color ?? '#2563EB' }} />
              <CardContent className="pt-4 space-y-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="h-10 w-10 rounded-lg flex items-center justify-center shrink-0"
                      style={{ backgroundColor: `${h.color ?? '#2563EB'}1a` }}>
                      <Building2 className="h-5 w-5" style={{ color: h.color ?? '#2563EB' }} />
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold truncate">{h.name}</p>
                      <Badge variant={h.is_active ? 'default' : 'secondary'} className="mt-0.5">
                        {h.is_active ? 'Active' : 'Inactive'}
                      </Badge>
                    </div>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger className="rounded-md p-1.5 hover:bg-muted">
                      <MoreHorizontal className="h-4 w-4" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => setEditing(h)}>
                        <Pencil className="h-4 w-4 mr-2" /> Edit
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => handleToggle(h)}>
                        {h.is_active
                          ? <><PowerOff className="h-4 w-4 mr-2" /> Disable</>
                          : <><Power className="h-4 w-4 mr-2" /> Enable</>}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                <div className="space-y-1.5 text-sm text-muted-foreground">
                  {h.address && <Row icon={<MapPin className="h-3.5 w-3.5" />} text={h.address} />}
                  {h.phone && <Row icon={<Phone className="h-3.5 w-3.5" />} text={h.phone} />}
                  {h.email && <Row icon={<Mail className="h-3.5 w-3.5" />} text={h.email} />}
                  {h.website && <Row icon={<Globe className="h-3.5 w-3.5" />} text={h.website} />}
                </div>

                <div className="flex items-center justify-between pt-2 border-t text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Users className="h-3.5 w-3.5" /> {h.staff_count ?? 0} staff
                  </span>
                  <span>Created {formatDistanceToNow(new Date(h.created_at), { addSuffix: true })}</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Add modal */}
      <Dialog open={addOpen} onOpenChange={(o) => !pending && setAddOpen(o)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Add Hospital</DialogTitle></DialogHeader>
          <HospitalForm pending={pending} onSubmit={handleCreate} onCancel={() => setAddOpen(false)} submitLabel="Create Hospital" />
        </DialogContent>
      </Dialog>

      {/* Edit modal */}
      <Dialog open={!!editing} onOpenChange={(o) => !pending && !o && setEditing(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Edit Hospital</DialogTitle></DialogHeader>
          {editing && (
            <HospitalForm
              key={editing.id}
              initial={editing}
              pending={pending}
              onSubmit={handleUpdate}
              onCancel={() => setEditing(null)}
              submitLabel="Save Changes"
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatCard({ label, value, icon, tone }: { label: string; value: number; icon: React.ReactNode; tone: string }) {
  return (
    <Card>
      <CardContent className="flex items-center justify-between py-5">
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="text-2xl font-bold">{value}</p>
        </div>
        <span className={tone}>{icon}</span>
      </CardContent>
    </Card>
  );
}

function Row({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="flex items-center gap-2 min-w-0">
      <span className="shrink-0">{icon}</span>
      <span className="truncate">{text}</span>
    </div>
  );
}

function EmptyState({ onAdd, hasAny }: { onAdd: () => void; hasAny: boolean }) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center justify-center py-16 text-center">
        <Building2 className="h-12 w-12 text-muted-foreground/40 mb-3" />
        <p className="font-medium">{hasAny ? 'No hospitals match your search' : 'No hospitals yet'}</p>
        <p className="text-sm text-muted-foreground mb-4">
          {hasAny ? 'Try a different search term.' : 'Add your first hospital to get started.'}
        </p>
        {!hasAny && <Button onClick={onAdd}><Plus className="h-4 w-4 mr-1.5" /> Add Hospital</Button>}
      </CardContent>
    </Card>
  );
}
