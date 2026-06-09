import { inflateRawSync } from 'zlib';
import pdfParse from 'pdf-parse';
import Replicate from 'replicate';

export type SupportedFileType =
  | 'pdf' | 'docx' | 'txt' | 'csv' | 'xlsx'
  | 'png' | 'jpg' | 'jpeg' | 'webp' | 'gif';

export const SUPPORTED_EXTENSIONS: readonly SupportedFileType[] = [
  'pdf', 'docx', 'txt', 'csv', 'xlsx', 'png', 'jpg', 'jpeg', 'webp', 'gif',
];

export const IMAGE_EXTENSIONS: readonly SupportedFileType[] = [
  'png', 'jpg', 'jpeg', 'webp', 'gif',
];

export const ACCEPT_STRING = '.pdf,.docx,.txt,.csv,.xlsx,.png,.jpg,.jpeg,.webp,.gif';
export const MAX_FILE_SIZE = 15 * 1024 * 1024;
export const MAX_CONTEXT_CHARS = 80_000;

export function getFileTypeFromName(fileName: string): SupportedFileType | null {
  const ext = fileName.split('.').pop()?.toLowerCase() as SupportedFileType | undefined;
  return ext && (SUPPORTED_EXTENSIONS as readonly string[]).includes(ext) ? ext : null;
}

export function isImageType(t: SupportedFileType): boolean {
  return (IMAGE_EXTENSIONS as readonly string[]).includes(t);
}

// ── ZIP parser (Node built-in zlib only) ────────────────────────

function parseZip(buf: Buffer): Map<string, Buffer> {
  const out = new Map<string, Buffer>();
  const EOCD_SIG = 0x06054b50;
  const CD_SIG   = 0x02014b50;
  const LF_SIG   = 0x04034b50;

  let eocd = buf.length - 22;
  while (eocd >= 0 && buf.readUInt32LE(eocd) !== EOCD_SIG) eocd--;
  if (eocd < 0) return out;

  const numEntries = buf.readUInt16LE(eocd + 10);
  let cdOffset = buf.readUInt32LE(eocd + 16);

  for (let i = 0; i < numEntries; i++) {
    if (cdOffset + 46 > buf.length) break;
    if (buf.readUInt32LE(cdOffset) !== CD_SIG) break;

    const compression  = buf.readUInt16LE(cdOffset + 10);
    const compSize     = buf.readUInt32LE(cdOffset + 20);
    const fnLen        = buf.readUInt16LE(cdOffset + 28);
    const extraLen     = buf.readUInt16LE(cdOffset + 30);
    const commentLen   = buf.readUInt16LE(cdOffset + 32);
    const localOff     = buf.readUInt32LE(cdOffset + 42);
    const filename     = buf.slice(cdOffset + 46, cdOffset + 46 + fnLen).toString('utf8');

    if (localOff + 30 <= buf.length && buf.readUInt32LE(localOff) === LF_SIG) {
      const lfnLen  = buf.readUInt16LE(localOff + 26);
      const lExtLen = buf.readUInt16LE(localOff + 28);
      const dataAt  = localOff + 30 + lfnLen + lExtLen;

      if (dataAt + compSize <= buf.length) {
        const compressed = buf.slice(dataAt, dataAt + compSize);
        try {
          out.set(filename, compression === 0 ? compressed : inflateRawSync(compressed));
        } catch { /* skip unreadable entries */ }
      }
    }

    cdOffset += 46 + fnLen + extraLen + commentLen;
  }
  return out;
}

// ── XML helpers ─────────────────────────────────────────────────

function unescapeXml(s: string): string {
  return s
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#x([0-9A-Fa-f]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&#([0-9]+);/g, (_, d) => String.fromCharCode(parseInt(d, 10)));
}

// ── DOCX ────────────────────────────────────────────────────────

function extractDocxText(entries: Map<string, Buffer>): string {
  const docBuf = entries.get('word/document.xml');
  if (!docBuf) throw new Error('Invalid DOCX: missing word/document.xml');

  const xml = docBuf.toString('utf-8');
  const text = unescapeXml(
    xml
      .replace(/<w:p[ >]/g, '\n<w:p>')
      .replace(/<w:br[^/]*/g, '\n')
      .replace(/<w:tab[^/]*/g, '\t')
      .replace(/<[^>]+>/g, '')
  );

  return text.replace(/\n{3,}/g, '\n\n').trim();
}

// ── XLSX ────────────────────────────────────────────────────────

function extractXlsxText(entries: Map<string, Buffer>): string {
  const sharedStrings: string[] = [];

  const ssBuf = entries.get('xl/sharedStrings.xml');
  if (ssBuf) {
    const xml = ssBuf.toString('utf-8');
    for (const m of xml.matchAll(/<si>([\s\S]*?)<\/si>/g)) {
      sharedStrings.push(unescapeXml(m[1].replace(/<[^>]+>/g, '').trim()));
    }
  }

  const rows: string[] = [];
  for (const [name, buf] of entries) {
    if (!name.startsWith('xl/worksheets/') || !name.endsWith('.xml')) continue;
    const xml = buf.toString('utf-8');

    for (const rowM of xml.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
      const cells: string[] = [];
      for (const cellM of rowM[1].matchAll(/<c[^>]*>([\s\S]*?)<\/c>/g)) {
        const cell = cellM[0];
        const isM  = cell.match(/<is>([\s\S]*?)<\/is>/);
        const vM   = cell.match(/<v>([^<]*)<\/v>/);

        if (isM) {
          cells.push(unescapeXml(isM[1].replace(/<[^>]+>/g, '').trim()));
        } else if (cell.includes('t="s"') && vM) {
          const idx = parseInt(vM[1]);
          if (!isNaN(idx) && sharedStrings[idx] != null) cells.push(sharedStrings[idx]);
        } else if (vM) {
          cells.push(vM[1]);
        }
      }
      if (cells.length) rows.push(cells.join('\t'));
    }
  }
  return rows.join('\n');
}

// ── PDF via pdf-parse ────────────────────────────────────────────

async function extractPdfText(buf: Buffer): Promise<string> {
  const result = await pdfParse(buf);
  return result.text;
}

// ── Images via Replicate vision ──────────────────────────────────

async function extractImageText(buf: Buffer, mimeType: string): Promise<string> {
  const replicate = new Replicate({ auth: process.env.REPLICATE_API_TOKEN! });
  const validMimes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
  const safe = validMimes.includes(mimeType) ? mimeType : 'image/jpeg';

  const output = await replicate.run(
    (process.env.AI_ASSISTANT_MODEL ?? 'meta/meta-llama-3-70b-instruct') as `${string}/${string}`,
    {
      input: {
        image: `data:${safe};base64,${buf.toString('base64')}`,
        prompt: 'Extract all visible text from this image, preserving structure. If there is no text, briefly describe what the image shows.',
        max_new_tokens: 4096,
      },
    },
  );

  if (Array.isArray(output)) return (output as string[]).join('');
  return String(output ?? '');
}

// ── Public API ───────────────────────────────────────────────────

export async function extractText(
  buffer: Buffer,
  fileType: SupportedFileType,
  fileName: string,
  mimeType: string,
): Promise<string> {
  switch (fileType) {
    case 'txt':
    case 'csv':
      return buffer.toString('utf-8');
    case 'pdf':
      return extractPdfText(buffer);
    case 'docx':
      return extractDocxText(parseZip(buffer));
    case 'xlsx':
      return extractXlsxText(parseZip(buffer));
    case 'png':
    case 'jpg':
    case 'jpeg':
    case 'webp':
    case 'gif':
      return extractImageText(buffer, mimeType);
    default:
      throw new Error(`Unsupported file type: ${fileType}`);
  }
}
