import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import {
  extractText,
  getFileTypeFromName,
  MAX_FILE_SIZE,
  MAX_CONTEXT_CHARS,
} from '@/lib/ai/text-extractor';

// Mode 1: extract text from a file and return it — no KB indexing, no storage
export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 });
  }

  const file = formData.get('file') as File | null;
  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });

  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json({ error: 'File too large (max 15 MB)' }, { status: 400 });
  }

  const fileType = getFileTypeFromName(file.name);
  if (!fileType) {
    return NextResponse.json({
      error: 'Unsupported file type. Supported: PDF, DOCX, TXT, CSV, XLSX, PNG, JPG, WEBP, GIF',
    }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  try {
    let text = await extractText(buffer, fileType, file.name, file.type || '');
    const truncated = text.length > MAX_CONTEXT_CHARS;
    if (truncated) {
      text = text.slice(0, MAX_CONTEXT_CHARS) + '\n\n[Content truncated — file too large to include in full]';
    }

    if (!text.trim()) {
      return NextResponse.json({ error: 'No readable text found in file' }, { status: 422 });
    }

    return NextResponse.json({
      text,
      file_name: file.name,
      file_type: fileType,
      file_size: file.size,
      truncated,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Could not read file: ${msg}` }, { status: 422 });
  }
}
