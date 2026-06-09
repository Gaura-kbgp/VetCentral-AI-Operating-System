'use client';

import { useState } from 'react';
import { Plus, Edit3, Trash2, ChevronRight, Lock, X, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import {
  createOnboardingTemplate,
  updateOnboardingTemplate,
  deleteOnboardingTemplate,
} from '@/lib/actions/onboarding';
import type { OnboardingTemplate, CreateTemplateInput } from '@/lib/actions/onboarding';

interface TemplateManagerProps {
  templates: OnboardingTemplate[];
  onTemplatesChange?: () => void;
}

const ROLE_COLORS: Record<string, string> = {
  doctor: '#3b82f6',
  csr: '#22c55e',
  hr: '#8b5cf6',
  manager: '#f59e0b',
  vet_assistant: '#ec4899',
  custom: '#6b7280',
};

const ROLE_EMOJIS: Record<string, string> = {
  doctor: '🩺',
  csr: '📞',
  hr: '👥',
  manager: '💼',
  vet_assistant: '🐾',
  custom: '✦',
};

export function TemplateManager({ templates, onTemplatesChange }: TemplateManagerProps) {
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<OnboardingTemplate | null>(null);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    name: '',
    role_type: 'custom',
    description: '',
    color: '#f97316',
  });

  const systemTemplates = templates.filter(t => t.is_system);
  const customTemplates = templates.filter(t => !t.is_system);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      toast.error('Template name is required');
      return;
    }

    setLoading(true);
    try {
      const input: CreateTemplateInput = {
        name: form.name.trim(),
        role_type: form.role_type,
        description: form.description || null,
        color: form.color,
        default_tasks: [],
        doc_requirements: [],
      };

      let res;
      if (editing) {
        res = await updateOnboardingTemplate(editing.id, input);
      } else {
        res = await createOnboardingTemplate(input);
      }

      if (!res.success) {
        toast.error(res.error);
        return;
      }

      toast.success(editing ? 'Template updated' : 'Template created');
      setForm({ name: '', role_type: 'custom', description: '', color: '#f97316' });
      setEditing(null);
      setShowForm(false);
      onTemplatesChange?.();
    } catch (e) {
      toast.error('Failed to save template');
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this template?')) return;

    setLoading(true);
    try {
      const res = await deleteOnboardingTemplate(id);
      if (!res.success) {
        toast.error(res.error);
        return;
      }

      toast.success('Template deleted');
      onTemplatesChange?.();
    } catch (e) {
      toast.error('Failed to delete template');
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const TemplateCard = ({ template, isSystem }: { template: OnboardingTemplate; isSystem: boolean }) => (
    <div className="bg-white rounded-2xl border border-gray-200 p-4 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <div
            className="h-10 w-10 rounded-xl flex items-center justify-center text-[20px] shrink-0"
            style={{ backgroundColor: `${template.color}20` }}
          >
            {ROLE_EMOJIS[template.role_type] || '📋'}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="text-[13px] font-bold text-gray-900">{template.name}</h3>
              {isSystem && <Lock className="h-3.5 w-3.5 text-gray-400 shrink-0" />}
            </div>
            {template.description && <p className="text-[11px] text-gray-500 mt-0.5 line-clamp-2">{template.description}</p>}
            <p className="text-[10px] text-gray-400 mt-1">
              {template.default_tasks?.length ?? 0} tasks · {template.doc_requirements?.filter((d: any) => d.required).length ?? 0} required docs
            </p>
          </div>
        </div>

        {!isSystem && (
          <div className="flex gap-1 shrink-0">
            <button
              onClick={() => {
                setEditing(template);
                setForm({
                  name: template.name,
                  role_type: template.role_type,
                  description: template.description || '',
                  color: template.color,
                });
                setShowForm(true);
              }}
              className="h-7 w-7 rounded-lg hover:bg-blue-50 flex items-center justify-center transition-colors"
            >
              <Edit3 className="h-3.5 w-3.5 text-blue-500" />
            </button>
            <button
              onClick={() => handleDelete(template.id)}
              disabled={loading}
              className="h-7 w-7 rounded-lg hover:bg-red-50 flex items-center justify-center transition-colors disabled:opacity-50"
            >
              <Trash2 className="h-3.5 w-3.5 text-red-500" />
            </button>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-[16px] font-bold text-gray-900">Onboarding Templates</h2>
        <button
          onClick={() => {
            setEditing(null);
            setForm({ name: '', role_type: 'custom', description: '', color: '#f97316' });
            setShowForm(!showForm);
          }}
          className="flex items-center gap-1.5 h-9 px-3 rounded-xl bg-teal-500 hover:bg-teal-600 text-white text-[12px] font-bold transition-colors"
        >
          <Plus className="h-4 w-4" /> New Template
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white border-2 border-teal-200 rounded-2xl p-5 space-y-4 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[11px] font-bold uppercase tracking-widest text-teal-500">
              {editing ? 'Edit Template' : 'New Template'}
            </p>
            <button type="button" onClick={() => { setShowForm(false); setEditing(null); }} className="text-gray-400 hover:text-gray-600">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="text-[10px] font-bold uppercase tracking-widest text-gray-400 block mb-1">Template Name</label>
              <input
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Senior Doctor Onboarding"
                required
                className="w-full h-10 px-3 rounded-xl border border-gray-200 text-[13px] focus:outline-none focus:ring-2 focus:ring-teal-300"
              />
            </div>

            <div>
              <label className="text-[10px] font-bold uppercase tracking-widest text-gray-400 block mb-1">Role Type</label>
              <select
                value={form.role_type}
                onChange={e => setForm(f => ({ ...f, role_type: e.target.value }))}
                className="w-full h-10 px-3 rounded-xl border border-gray-200 text-[13px] focus:outline-none focus:ring-2 focus:ring-teal-300"
              >
                <option value="doctor">Doctor (DVM)</option>
                <option value="csr">Client Service Rep</option>
                <option value="hr">HR Staff</option>
                <option value="manager">Practice Manager</option>
                <option value="vet_assistant">Veterinary Assistant</option>
                <option value="custom">Custom</option>
              </select>
            </div>

            <div>
              <label className="text-[10px] font-bold uppercase tracking-widest text-gray-400 block mb-1">Color</label>
              <input
                type="color"
                value={form.color}
                onChange={e => setForm(f => ({ ...f, color: e.target.value }))}
                className="w-full h-10 rounded-xl cursor-pointer"
              />
            </div>

            <div className="col-span-2">
              <label className="text-[10px] font-bold uppercase tracking-widest text-gray-400 block mb-1">Description (Optional)</label>
              <textarea
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                placeholder="What is this template used for?"
                className="w-full h-20 px-3 py-2 rounded-xl border border-gray-200 text-[13px] focus:outline-none focus:ring-2 focus:ring-teal-300 resize-none"
              />
            </div>
          </div>

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={() => {
                setShowForm(false);
                setEditing(null);
              }}
              className="flex-1 h-9 rounded-xl border border-gray-200 text-[12px] text-gray-600 hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 h-9 rounded-xl bg-teal-500 text-white text-[12px] font-bold hover:bg-teal-600 flex items-center justify-center gap-1.5 transition-colors disabled:opacity-60"
            >
              {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
              {loading ? 'Saving...' : 'Save Template'}
            </button>
          </div>

          <p className="text-[10px] text-gray-500 pt-2">
            💡 Tip: Tasks and document requirements can be added when configuring individual onboardings, or updated here to apply to all future uses.
          </p>
        </form>
      )}

      {/* System Templates */}
      <div>
        <h3 className="text-[12px] font-bold uppercase tracking-widest text-gray-400 mb-3 flex items-center gap-2">
          <Lock className="h-3.5 w-3.5" /> System Templates (Read-Only)
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {systemTemplates.map(t => (
            <TemplateCard key={t.id} template={t} isSystem />
          ))}
        </div>
      </div>

      {/* Custom Templates */}
      <div>
        <h3 className="text-[12px] font-bold uppercase tracking-widest text-gray-400 mb-3">Your Custom Templates</h3>
        {customTemplates.length === 0 ? (
          <div className="text-center py-8 bg-gray-50 rounded-2xl border border-gray-100">
            <p className="text-[12px] text-gray-400">No custom templates yet. Create one to get started.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {customTemplates.map(t => (
              <TemplateCard key={t.id} template={t} isSystem={false} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
