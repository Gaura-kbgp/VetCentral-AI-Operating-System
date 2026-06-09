'use client';

import { useTransition, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { Bot, Trash2, Plus, Zap, Mic, History, Copy } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  updateAISettings, savePrompt, deletePrompt, clearConversationHistory,
} from '@/lib/actions/ai-settings';
import type { AIUserSettings, SavedPrompt } from '@/types/app';

const AI_MODELS = [
  { id: 'meta/meta-llama-3-70b-instruct', provider: 'replicate', name: 'Llama 3 70B',   desc: 'Balanced · Recommended for daily use' },
  { id: 'meta/meta-llama-3-8b-instruct',  provider: 'replicate', name: 'Llama 3 8B',    desc: 'Fast · Best for quick queries' },
  { id: 'meta/llama-2-70b-chat',          provider: 'replicate', name: 'Llama 2 70B',   desc: 'Reliable · Strong general reasoning' },
];

interface Props {
  settings: AIUserSettings | null;
  conversationCount: number;
}

export default function AISettingsForm({ settings, conversationCount }: Props) {
  const [isPending, startTransition]           = useTransition();
  const [prompts, setPrompts]                  = useState<SavedPrompt[]>(settings?.saved_prompts ?? []);
  const [showPromptForm, setShowPromptForm]    = useState(false);
  const [selectedModel, setSelectedModel]      = useState(settings?.preferred_model ?? 'meta/meta-llama-3-70b-instruct');
  const [voiceEnabled, setVoiceEnabled]        = useState(settings?.voice_enabled ?? false);

  const { register, handleSubmit, reset } = useForm<{ name: string; content: string }>();

  function handleModelChange(model: string) {
    setSelectedModel(model);
    startTransition(async () => {
      const r = await updateAISettings({ preferred_model: model });
      if (r.success) toast.success('Model updated');
      else toast.error(r.error);
    });
  }

  function handleVoiceToggle(enabled: boolean) {
    setVoiceEnabled(enabled);
    startTransition(async () => {
      const r = await updateAISettings({ voice_enabled: enabled });
      if (!r.success) toast.error(r.error);
    });
  }

  function handleSavePrompt(data: { name: string; content: string }) {
    startTransition(async () => {
      const r = await savePrompt(data.name, data.content);
      if (r.success) {
        setPrompts(prev => [...prev, r.data]);
        reset();
        setShowPromptForm(false);
        toast.success('Prompt saved');
      } else {
        toast.error(r.error);
      }
    });
  }

  function handleDeletePrompt(id: string) {
    setPrompts(prev => prev.filter(p => p.id !== id));
    startTransition(async () => {
      const r = await deletePrompt(id);
      if (!r.success) toast.error(r.error);
    });
  }

  function handleClearHistory() {
    startTransition(async () => {
      const r = await clearConversationHistory();
      if (r.success) toast.success('Conversation history cleared');
      else toast.error(r.error);
    });
  }

  const currentModel = AI_MODELS.find(m => m.id === selectedModel);

  return (
    <div className="space-y-4">
      {/* Model Selection */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-slate-500" />
            <CardTitle className="text-sm font-semibold text-slate-700">AI Model</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {AI_MODELS.map(model => (
            <label
              key={model.id}
              className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                selectedModel === model.id
                  ? 'border-blue-500 bg-blue-50/50'
                  : 'border-slate-200 hover:border-slate-300'
              }`}
            >
              <input
                type="radio"
                name="model"
                value={model.id}
                checked={selectedModel === model.id}
                onChange={() => handleModelChange(model.id)}
                className="accent-blue-600"
              />
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-slate-800">{model.name}</p>
                  {model.id === 'claude-sonnet-4-6' && (
                    <Badge className="text-[10px] bg-blue-100 text-blue-700 border-0 px-1.5">Recommended</Badge>
                  )}
                </div>
                <p className="text-xs text-slate-400 mt-0.5">{model.desc}</p>
              </div>
            </label>
          ))}

          {currentModel && (
            <div className="mt-2 p-2 bg-slate-50 rounded text-xs text-slate-500 flex items-center gap-1.5">
              <Bot className="h-3.5 w-3.5" />
              Using <span className="font-medium">{currentModel.name}</span> · Provider: Anthropic
            </div>
          )}
        </CardContent>
      </Card>

      {/* Voice */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Mic className="h-4 w-4 text-slate-500" />
            <CardTitle className="text-sm font-semibold text-slate-700">Voice Settings</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm font-medium">Enable Voice Input</Label>
              <p className="text-xs text-slate-400 mt-0.5">Use your microphone to speak to the AI assistant</p>
            </div>
            <Switch checked={voiceEnabled} onCheckedChange={handleVoiceToggle} />
          </div>
        </CardContent>
      </Card>

      {/* Saved Prompts */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold text-slate-700">
              Saved Prompts ({prompts.length})
            </CardTitle>
            <Button
              variant="outline" size="sm"
              onClick={() => setShowPromptForm(!showPromptForm)}
              className="gap-1.5 h-7 text-xs"
            >
              <Plus className="h-3 w-3" />
              Add Prompt
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {showPromptForm && (
            <form onSubmit={handleSubmit(handleSavePrompt)} className="space-y-3 p-3 bg-slate-50 rounded-lg border">
              <div className="space-y-1.5">
                <Label className="text-xs">Prompt Name</Label>
                <Input
                  placeholder="e.g. Summarize patient notes"
                  className="h-8 text-sm"
                  {...register('name', { required: true })}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Prompt Content</Label>
                <Textarea
                  placeholder="Write your prompt template here…"
                  rows={3}
                  className="text-sm"
                  {...register('content', { required: true })}
                />
              </div>
              <div className="flex gap-2">
                <Button type="submit" size="sm" disabled={isPending} className="h-7 text-xs">Save</Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => { reset(); setShowPromptForm(false); }} className="h-7 text-xs">Cancel</Button>
              </div>
            </form>
          )}

          {prompts.length === 0 && !showPromptForm ? (
            <p className="text-sm text-slate-400 text-center py-4">
              No saved prompts yet. Add prompts to reuse them quickly in the AI assistant.
            </p>
          ) : (
            <div className="space-y-2">
              {prompts.map(p => (
                <div key={p.id} className="flex items-start gap-2 p-2.5 rounded-lg border border-slate-100 group hover:border-slate-200 transition-colors">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-700">{p.name}</p>
                    <p className="text-xs text-slate-400 mt-0.5 line-clamp-2">{p.content}</p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => { navigator.clipboard.writeText(p.content); toast.success('Copied!', { duration: 1200 }); }}
                      className="h-6 w-6 flex items-center justify-center rounded text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => handleDeletePrompt(p.id)}
                      className="h-6 w-6 flex items-center justify-center rounded text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Conversation History */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <History className="h-4 w-4 text-slate-500" />
            <CardTitle className="text-sm font-semibold text-slate-700">Conversation History</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-700">
                {conversationCount} saved conversation{conversationCount !== 1 ? 's' : ''}
              </p>
              <p className="text-xs text-slate-400 mt-0.5">
                Clearing history cannot be undone
              </p>
            </div>
            {conversationCount > 0 && (
              <AlertDialog>
                <AlertDialogTrigger render={
                  <Button variant="outline" size="sm" className="gap-1.5 text-xs h-8 text-red-600 border-red-200 hover:bg-red-50">
                    <Trash2 className="h-3.5 w-3.5" />
                    Clear History
                  </Button>
                } />
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Clear all conversation history?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will permanently delete all {conversationCount} conversations. This action cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={handleClearHistory}
                      className="bg-red-600 hover:bg-red-700"
                    >
                      Clear All History
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
