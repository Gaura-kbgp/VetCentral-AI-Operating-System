'use client';

import { useEffect, useCallback, useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import ImageExt from '@tiptap/extension-image';
import LinkExt from '@tiptap/extension-link';
import TextAlign from '@tiptap/extension-text-align';
import Underline from '@tiptap/extension-underline';
import Highlight from '@tiptap/extension-highlight';
import { TextStyle } from '@tiptap/extension-text-style';
import Placeholder from '@tiptap/extension-placeholder';
import {
  Bold, Italic, UnderlineIcon, Strikethrough, Highlighter,
  Heading1, Heading2, Heading3, List, ListOrdered,
  AlignLeft, AlignCenter, AlignRight,
  Link2, Image as ImageIcon, FileText, Film,
  Undo2, Redo2, Minus, Quote, Code, X,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ─────────────────────────────────────────────────────────────
// Toolbar button
// ─────────────────────────────────────────────────────────────
function TBtn({
  onClick, active, disabled, title, children, className,
}: {
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      onMouseDown={e => { e.preventDefault(); onClick(); }}
      disabled={disabled}
      title={title}
      className={cn(
        'h-7 w-7 flex items-center justify-center rounded-md text-[12px] transition-colors',
        active
          ? 'bg-orange-100 text-orange-700'
          : 'text-gray-500 hover:bg-gray-100 hover:text-gray-800',
        disabled && 'opacity-30 cursor-not-allowed',
        className,
      )}
    >
      {children}
    </button>
  );
}

function Divider() {
  return <div className="w-px h-5 bg-gray-200 mx-0.5" />;
}

// ─────────────────────────────────────────────────────────────
// Media insert dialog (image / pdf / video)
// ─────────────────────────────────────────────────────────────
type MediaType = 'image' | 'pdf' | 'video';

function MediaDialog({
  type, onInsert, onClose,
}: { type: MediaType; onInsert: (url: string, label: string) => void; onClose: () => void }) {
  const [url, setUrl] = useState('');
  const [label, setLabel] = useState('');

  const labels: Record<MediaType, { title: string; urlPlaceholder: string; labelPlaceholder: string }> = {
    image: { title: 'Insert Image', urlPlaceholder: 'https://... or paste image URL', labelPlaceholder: 'Alt text / caption (optional)' },
    pdf:   { title: 'Reference PDF', urlPlaceholder: 'https://... PDF file URL', labelPlaceholder: 'PDF title' },
    video: { title: 'Embed Video', urlPlaceholder: 'YouTube, Vimeo, or any video URL', labelPlaceholder: 'Video title (optional)' },
  };
  const meta = labels[type];

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl p-6 w-[420px] space-y-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-[15px] font-bold text-gray-900">{meta.title}</h3>
          <button onClick={onClose} className="h-7 w-7 flex items-center justify-center rounded-lg hover:bg-gray-100">
            <X className="h-4 w-4 text-gray-500" />
          </button>
        </div>
        <div className="space-y-3">
          <input
            autoFocus
            value={url}
            onChange={e => setUrl(e.target.value)}
            placeholder={meta.urlPlaceholder}
            className="w-full h-10 px-3 rounded-xl border border-gray-200 text-[13px] focus:outline-none focus:ring-2 focus:ring-orange-400"
          />
          <input
            value={label}
            onChange={e => setLabel(e.target.value)}
            placeholder={meta.labelPlaceholder}
            className="w-full h-10 px-3 rounded-xl border border-gray-200 text-[13px] focus:outline-none focus:ring-2 focus:ring-orange-400"
          />
        </div>
        <div className="flex gap-2 pt-1">
          <button onClick={onClose} className="flex-1 h-10 rounded-xl border border-gray-200 text-[13px] text-gray-600 hover:bg-gray-50 transition-colors">
            Cancel
          </button>
          <button
            onClick={() => { if (url.trim()) { onInsert(url.trim(), label.trim()); onClose(); } }}
            disabled={!url.trim()}
            className="flex-1 h-10 rounded-xl bg-orange-500 hover:bg-orange-600 disabled:opacity-40 text-white text-[13px] font-semibold transition-colors"
          >
            Insert
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Rich Content Editor
// ─────────────────────────────────────────────────────────────
interface RichContentEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  minHeight?: number;
}

export function RichContentEditor({ value, onChange, placeholder = 'Start writing your module content…', minHeight = 280 }: RichContentEditorProps) {
  const [mediaDialog, setMediaDialog] = useState<MediaType | null>(null);
  const [linkDialog, setLinkDialog] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      ImageExt.configure({ inline: false, allowBase64: true }),
      LinkExt.configure({ openOnClick: false, HTMLAttributes: { class: 'text-orange-600 underline underline-offset-2 hover:text-orange-800' } }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Underline,
      Highlight.configure({ multicolor: false }),
      TextStyle,
      Placeholder.configure({ placeholder }),
    ],
    content: value,
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
    editorProps: {
      attributes: {
        class: 'focus:outline-none prose prose-sm max-w-none',
        style: `min-height:${minHeight}px;padding:20px 24px`,
      },
    },
  });

  // sync value when it changes externally (e.g. edit mode load)
  useEffect(() => {
    if (editor && value !== editor.getHTML()) {
      editor.commands.setContent(value || '');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const insertImage = useCallback((url: string, alt: string) => {
    editor?.chain().focus().setImage({ src: url, alt }).run();
  }, [editor]);

  const insertVideo = useCallback((url: string, title: string) => {
    // extract YouTube/Vimeo id and build embed
    let embed = url;
    const ytId = url.match(/(?:v=|youtu\.be\/|embed\/)([^&?/]+)/)?.[1];
    if (ytId) embed = `https://www.youtube.com/embed/${ytId}`;
    const viId = url.match(/vimeo\.com\/(\d+)/)?.[1];
    if (viId) embed = `https://player.vimeo.com/video/${viId}`;

    const html = `<div class="video-embed" style="margin:16px 0;border-radius:12px;overflow:hidden;background:#000;aspect-ratio:16/9">
  <iframe src="${embed}" title="${title || 'Video'}" width="100%" height="100%" style="border:0;display:block" allowfullscreen allow="autoplay;encrypted-media;picture-in-picture"></iframe>
</div>`;
    editor?.chain().focus().insertContent(html).run();
  }, [editor]);

  const insertPdf = useCallback((url: string, label: string) => {
    const title = label || url.split('/').pop() || 'Document';
    const html = `<div class="pdf-ref" style="display:flex;align-items:center;gap:12px;padding:12px 16px;margin:12px 0;background:#f8fafc;border:1.5px solid #e2e8f0;border-radius:12px;text-decoration:none">
  <span style="font-size:22px">📄</span>
  <div style="flex:1;min-width:0">
    <div style="font-size:13px;font-weight:600;color:#1e293b">${title}</div>
    <div style="font-size:11px;color:#94a3b8;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${url}</div>
  </div>
  <a href="${url}" target="_blank" rel="noopener" style="font-size:11px;font-weight:600;color:#f97316;text-decoration:none;flex-shrink:0">Open ↗</a>
</div>`;
    editor?.chain().focus().insertContent(html).run();
  }, [editor]);

  const setLink = useCallback(() => {
    if (linkUrl) {
      editor?.chain().focus().setLink({ href: linkUrl }).run();
    } else {
      editor?.chain().focus().unsetLink().run();
    }
    setLinkDialog(false);
    setLinkUrl('');
  }, [editor, linkUrl]);

  if (!editor) return null;

  const isActive = (name: string, attrs?: Record<string, any>) => editor.isActive(name, attrs);

  return (
    <div className="flex flex-col border border-gray-200 rounded-2xl overflow-hidden bg-white shadow-sm">
      {/* ── Toolbar ── */}
      <div className="flex flex-wrap items-center gap-0.5 px-3 py-2 border-b border-gray-100 bg-gray-50/80">

        {/* Undo/Redo */}
        <TBtn onClick={() => editor.chain().focus().undo().run()} disabled={!editor.can().undo()} title="Undo"><Undo2 className="h-3.5 w-3.5" /></TBtn>
        <TBtn onClick={() => editor.chain().focus().redo().run()} disabled={!editor.can().redo()} title="Redo"><Redo2 className="h-3.5 w-3.5" /></TBtn>
        <Divider />

        {/* Headings */}
        <TBtn onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} active={isActive('heading', { level: 1 })} title="Heading 1"><Heading1 className="h-3.5 w-3.5" /></TBtn>
        <TBtn onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} active={isActive('heading', { level: 2 })} title="Heading 2"><Heading2 className="h-3.5 w-3.5" /></TBtn>
        <TBtn onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} active={isActive('heading', { level: 3 })} title="Heading 3"><Heading3 className="h-3.5 w-3.5" /></TBtn>
        <Divider />

        {/* Marks */}
        <TBtn onClick={() => editor.chain().focus().toggleBold().run()} active={isActive('bold')} title="Bold"><Bold className="h-3.5 w-3.5" /></TBtn>
        <TBtn onClick={() => editor.chain().focus().toggleItalic().run()} active={isActive('italic')} title="Italic"><Italic className="h-3.5 w-3.5" /></TBtn>
        <TBtn onClick={() => editor.chain().focus().toggleUnderline().run()} active={isActive('underline')} title="Underline"><UnderlineIcon className="h-3.5 w-3.5" /></TBtn>
        <TBtn onClick={() => editor.chain().focus().toggleStrike().run()} active={isActive('strike')} title="Strikethrough"><Strikethrough className="h-3.5 w-3.5" /></TBtn>
        <TBtn onClick={() => editor.chain().focus().toggleHighlight().run()} active={isActive('highlight')} title="Highlight"><Highlighter className="h-3.5 w-3.5" /></TBtn>
        <TBtn onClick={() => editor.chain().focus().toggleCode().run()} active={isActive('code')} title="Inline Code"><Code className="h-3.5 w-3.5" /></TBtn>
        <Divider />

        {/* Alignment */}
        <TBtn onClick={() => editor.chain().focus().setTextAlign('left').run()}   active={editor.isActive('paragraph', { textAlign: 'left' }) || editor.isActive('heading', { textAlign: 'left' })}   title="Align Left"><AlignLeft className="h-3.5 w-3.5" /></TBtn>
        <TBtn onClick={() => editor.chain().focus().setTextAlign('center').run()} active={editor.isActive('paragraph', { textAlign: 'center' }) || editor.isActive('heading', { textAlign: 'center' })} title="Align Center"><AlignCenter className="h-3.5 w-3.5" /></TBtn>
        <TBtn onClick={() => editor.chain().focus().setTextAlign('right').run()}  active={editor.isActive('paragraph', { textAlign: 'right' }) || editor.isActive('heading', { textAlign: 'right' })}  title="Align Right"><AlignRight className="h-3.5 w-3.5" /></TBtn>
        <Divider />

        {/* Lists */}
        <TBtn onClick={() => editor.chain().focus().toggleBulletList().run()}  active={isActive('bulletList')}  title="Bullet List"><List className="h-3.5 w-3.5" /></TBtn>
        <TBtn onClick={() => editor.chain().focus().toggleOrderedList().run()} active={isActive('orderedList')} title="Numbered List"><ListOrdered className="h-3.5 w-3.5" /></TBtn>
        <TBtn onClick={() => editor.chain().focus().toggleBlockquote().run()}  active={isActive('blockquote')}  title="Quote"><Quote className="h-3.5 w-3.5" /></TBtn>
        <TBtn onClick={() => editor.chain().focus().setHorizontalRule().run()} title="Horizontal Line"><Minus className="h-3.5 w-3.5" /></TBtn>
        <Divider />

        {/* Link */}
        <TBtn
          onClick={() => { setLinkUrl(editor.getAttributes('link').href ?? ''); setLinkDialog(true); }}
          active={isActive('link')}
          title="Insert Link"
        >
          <Link2 className="h-3.5 w-3.5" />
        </TBtn>
        <Divider />

        {/* Media inserts */}
        <TBtn onClick={() => setMediaDialog('image')} title="Insert Image" className="text-blue-500 hover:bg-blue-50">
          <ImageIcon className="h-3.5 w-3.5" />
        </TBtn>
        <TBtn onClick={() => setMediaDialog('video')} title="Embed Video" className="text-red-500 hover:bg-red-50">
          <Film className="h-3.5 w-3.5" />
        </TBtn>
        <TBtn onClick={() => setMediaDialog('pdf')} title="Reference PDF" className="text-emerald-600 hover:bg-emerald-50">
          <FileText className="h-3.5 w-3.5" />
        </TBtn>
      </div>

      {/* ── Editor Area ── */}
      <EditorContent editor={editor} className="flex-1" />

      {/* ── Bottom stats ── */}
      <div className="flex items-center justify-between px-4 py-1.5 border-t border-gray-100 bg-gray-50/60 text-[11px] text-gray-400">
        <span>{editor.storage.characterCount?.characters?.() ?? editor.getText().length} chars</span>
        <span>{editor.getText().split(/\s+/).filter(Boolean).length} words</span>
      </div>

      {/* ── Media dialog ── */}
      {mediaDialog === 'image' && (
        <MediaDialog type="image" onInsert={insertImage} onClose={() => setMediaDialog(null)} />
      )}
      {mediaDialog === 'video' && (
        <MediaDialog type="video" onInsert={insertVideo} onClose={() => setMediaDialog(null)} />
      )}
      {mediaDialog === 'pdf' && (
        <MediaDialog type="pdf" onInsert={insertPdf} onClose={() => setMediaDialog(null)} />
      )}

      {/* ── Link dialog ── */}
      {linkDialog && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setLinkDialog(false)}>
          <div className="bg-white rounded-2xl shadow-2xl p-5 w-[380px] space-y-3" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <p className="text-[14px] font-bold text-gray-900 flex items-center gap-2"><Link2 className="h-4 w-4 text-orange-500" /> Insert Link</p>
              <button onClick={() => setLinkDialog(false)} className="h-7 w-7 flex items-center justify-center rounded-lg hover:bg-gray-100"><X className="h-4 w-4 text-gray-500" /></button>
            </div>
            <input
              autoFocus
              value={linkUrl}
              onChange={e => setLinkUrl(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && setLink()}
              placeholder="https://..."
              className="w-full h-10 px-3 rounded-xl border border-gray-200 text-[13px] focus:outline-none focus:ring-2 focus:ring-orange-400"
            />
            <div className="flex gap-2">
              {isActive('link') && (
                <button onClick={() => { editor.chain().focus().unsetLink().run(); setLinkDialog(false); }} className="h-9 px-4 rounded-xl border border-red-200 text-red-500 text-[12px] font-medium hover:bg-red-50 transition-colors">Remove</button>
              )}
              <button onClick={setLink} className="flex-1 h-9 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-[13px] font-semibold transition-colors">
                {linkUrl ? 'Apply' : 'Remove Link'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
