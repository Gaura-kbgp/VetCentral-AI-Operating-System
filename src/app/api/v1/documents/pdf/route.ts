import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase/server';

// Lightweight markdown-to-HTML (mirrors the viewer)
function mdToHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/_(.+?)_/g, '<em>$1</em>')
    .replace(/```[\w]*\n([\s\S]*?)```/g, '<pre><code>$1</code></pre>')
    .replace(/`(.+?)`/g, '<code>$1</code>')
    .replace(/^&gt; (.+)$/gm, '<blockquote>$1</blockquote>')
    .replace(/^\s*[-*+] (.+)$/gm, '<li>$1</li>')
    .replace(/^\s*\d+\. (.+)$/gm, '<li>$1</li>')
    .replace(/^---$/gm, '<hr />')
    .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2">$1</a>')
    // Wrap consecutive <li> items in <ul>
    .replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>')
    .replace(/\n\n/g, '</p><p>')
    .replace(/\n/g, '<br />');
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  const admin = createSupabaseAdminClient();
  const { data: doc, error } = await admin
    .from('knowledge_documents')
    .select('id, title, description, content, status, version, created_at, published_at')
    .eq('id', id)
    .single();

  if (error || !doc) return NextResponse.json({ error: 'Document not found' }, { status: 404 });

  const bodyHtml = doc.content
    ? `<p>${mdToHtml(doc.content)}</p>`
    : '<p><em>No content.</em></p>';

  const publishedDate = doc.published_at
    ? new Date(doc.published_at).toLocaleDateString('en-US', { dateStyle: 'long' })
    : '';

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${doc.title} — VetCentral</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
      font-size: 13px;
      line-height: 1.7;
      color: #1a1a2e;
      background: #fff;
      padding: 48px 56px;
      max-width: 860px;
      margin: 0 auto;
    }
    /* Header */
    .doc-header {
      border-bottom: 2px solid #1e3a5f;
      padding-bottom: 20px;
      margin-bottom: 28px;
    }
    .org-label {
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: #1e3a5f;
      opacity: 0.6;
      margin-bottom: 6px;
    }
    h1.doc-title {
      font-size: 26px;
      font-weight: 800;
      color: #1e3a5f;
      line-height: 1.2;
      margin-bottom: 8px;
    }
    .doc-description {
      font-size: 13px;
      color: #64748b;
      line-height: 1.5;
      margin-bottom: 12px;
    }
    .doc-meta {
      font-size: 11px;
      color: #94a3b8;
      display: flex;
      gap: 20px;
    }
    /* Content */
    .content { margin-top: 8px; }
    h1 { font-size: 20px; font-weight: 800; color: #1e3a5f; margin: 28px 0 10px; }
    h2 { font-size: 16px; font-weight: 700; color: #1e3a5f; margin: 22px 0 8px; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px; }
    h3 { font-size: 13px; font-weight: 700; color: #334155; margin: 16px 0 6px; }
    p { margin-bottom: 10px; color: #334155; }
    strong { font-weight: 700; color: #1e293b; }
    em { font-style: italic; }
    ul, ol { margin: 8px 0 8px 20px; }
    li { margin-bottom: 4px; color: #334155; }
    blockquote { border-left: 3px solid #1e3a5f; padding-left: 14px; color: #64748b; font-style: italic; margin: 10px 0; }
    code { background: #f1f5f9; padding: 1px 5px; border-radius: 3px; font-size: 11px; font-family: 'Courier New', monospace; color: #1e3a5f; }
    pre { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 14px; overflow: auto; margin: 12px 0; }
    pre code { background: none; padding: 0; }
    hr { border: none; border-top: 1px solid #e2e8f0; margin: 18px 0; }
    a { color: #1e3a5f; }
    table { border-collapse: collapse; width: 100%; margin: 12px 0; font-size: 12px; }
    th { background: #1e3a5f; color: #fff; padding: 8px 12px; text-align: left; font-size: 11px; font-weight: 700; letter-spacing: 0.05em; }
    td { padding: 7px 12px; border-bottom: 1px solid #e2e8f0; color: #334155; }
    tr:nth-child(even) td { background: #f8fafc; }
    /* Footer */
    .doc-footer {
      margin-top: 48px;
      padding-top: 16px;
      border-top: 1px solid #e2e8f0;
      display: flex;
      justify-content: space-between;
      font-size: 10px;
      color: #94a3b8;
    }
    @media print {
      body { padding: 0; }
      .no-print { display: none; }
      @page { margin: 20mm 18mm; size: A4; }
    }
  </style>
</head>
<body>
  <div class="no-print" style="background:#1e3a5f;color:#fff;padding:10px 20px;display:flex;justify-content:space-between;align-items:center;margin:-48px -56px 36px;font-size:12px;">
    <span style="font-weight:700;">VetCentral — Print or Save as PDF</span>
    <button onclick="window.print()" style="background:#fff;color:#1e3a5f;border:none;padding:6px 18px;border-radius:6px;font-weight:700;cursor:pointer;font-size:12px;">
      ⬇ Download PDF
    </button>
  </div>

  <div class="doc-header">
    <p class="org-label">VetCentral Knowledge Base</p>
    <h1 class="doc-title">${doc.title}</h1>
    ${doc.description ? `<p class="doc-description">${doc.description}</p>` : ''}
    <div class="doc-meta">
      <span>Version ${doc.version}</span>
      ${publishedDate ? `<span>Published ${publishedDate}</span>` : ''}
      <span>vetcentral.com</span>
    </div>
  </div>

  <div class="content">
    ${bodyHtml}
  </div>

  <div class="doc-footer">
    <span>VetCentral — Confidential Internal Document</span>
    <span>v${doc.version} · ${publishedDate || new Date().toLocaleDateString('en-US', { dateStyle: 'long' })}</span>
  </div>

  <script>
    // Auto-trigger print on load when opened as download
    if (new URLSearchParams(location.search).get('print') === '1') {
      window.addEventListener('load', () => setTimeout(() => window.print(), 400));
    }
  </script>
</body>
</html>`;

  return new NextResponse(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}
