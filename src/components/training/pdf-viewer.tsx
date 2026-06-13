'use client';

import { useState, useCallback } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
import {
  ChevronLeft, ChevronRight, ZoomIn, ZoomOut,
  Download, Maximize2, RotateCw, FileText,
} from 'lucide-react';

pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

interface PDFViewerProps {
  url: string;
  title: string;
}

export function PDFViewer({ url, title }: PDFViewerProps) {
  const [numPages, setNumPages]   = useState<number>(0);
  const [pageNum, setPageNum]     = useState(1);
  const [scale, setScale]         = useState(1.0);
  const [fullscreen, setFullscreen] = useState(false);
  const [rotation, setRotation]   = useState(0);
  const [inputPage, setInputPage] = useState('1');

  const onDocumentLoad = useCallback(({ numPages }: { numPages: number }) => {
    setNumPages(numPages);
  }, []);

  const goTo = (n: number) => {
    const clamped = Math.max(1, Math.min(n, numPages));
    setPageNum(clamped);
    setInputPage(String(clamped));
  };

  const zoomIn  = () => setScale(s => Math.min(3, +(s + 0.2).toFixed(1)));
  const zoomOut = () => setScale(s => Math.max(0.4, +(s - 0.2).toFixed(1)));
  const rotate  = () => setRotation(r => (r + 90) % 360);

  return (
    <div className={`flex flex-col rounded-2xl overflow-hidden border border-gray-200 shadow-lg bg-gray-900 ${fullscreen ? 'fixed inset-4 z-50' : ''}`}>
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-4 py-2.5 bg-gray-800 border-b border-gray-700 shrink-0">
        {/* File icon + title */}
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <div className="h-7 w-7 rounded-lg bg-red-500/20 flex items-center justify-center shrink-0">
            <FileText className="h-4 w-4 text-red-400" />
          </div>
          <span className="text-[13px] font-semibold text-gray-200 truncate">{title}</span>
        </div>

        {/* Page navigation */}
        <div className="flex items-center gap-1.5 bg-gray-700 rounded-lg px-2 py-1">
          <button
            onClick={() => goTo(pageNum - 1)}
            disabled={pageNum <= 1}
            className="h-6 w-6 flex items-center justify-center rounded hover:bg-gray-600 disabled:opacity-30 transition-colors"
          >
            <ChevronLeft className="h-3.5 w-3.5 text-gray-300" />
          </button>
          <input
            type="text"
            value={inputPage}
            onChange={e => setInputPage(e.target.value)}
            onBlur={() => goTo(parseInt(inputPage) || pageNum)}
            onKeyDown={e => { if (e.key === 'Enter') goTo(parseInt(inputPage) || pageNum); }}
            className="w-8 text-center text-[12px] font-medium text-gray-100 bg-transparent outline-none"
          />
          <span className="text-[12px] text-gray-400">/ {numPages}</span>
          <button
            onClick={() => goTo(pageNum + 1)}
            disabled={pageNum >= numPages}
            className="h-6 w-6 flex items-center justify-center rounded hover:bg-gray-600 disabled:opacity-30 transition-colors"
          >
            <ChevronRight className="h-3.5 w-3.5 text-gray-300" />
          </button>
        </div>

        {/* Zoom */}
        <div className="flex items-center gap-1 bg-gray-700 rounded-lg px-1.5 py-1">
          <button onClick={zoomOut} className="h-6 w-6 flex items-center justify-center rounded hover:bg-gray-600 transition-colors">
            <ZoomOut className="h-3.5 w-3.5 text-gray-300" />
          </button>
          <span className="text-[12px] font-medium text-gray-300 w-10 text-center">{Math.round(scale * 100)}%</span>
          <button onClick={zoomIn} className="h-6 w-6 flex items-center justify-center rounded hover:bg-gray-600 transition-colors">
            <ZoomIn className="h-3.5 w-3.5 text-gray-300" />
          </button>
        </div>

        {/* Actions */}
        <button onClick={rotate} title="Rotate" className="h-7 w-7 flex items-center justify-center rounded-lg hover:bg-gray-700 transition-colors">
          <RotateCw className="h-4 w-4 text-gray-400" />
        </button>
        <a href={url} download title="Download" className="h-7 w-7 flex items-center justify-center rounded-lg hover:bg-gray-700 transition-colors">
          <Download className="h-4 w-4 text-gray-400" />
        </a>
        <button onClick={() => setFullscreen(f => !f)} title="Fullscreen" className="h-7 w-7 flex items-center justify-center rounded-lg hover:bg-gray-700 transition-colors">
          <Maximize2 className="h-4 w-4 text-gray-400" />
        </button>
      </div>

      {/* Page view */}
      <div className="flex-1 overflow-auto flex items-start justify-center py-6 px-4 bg-gray-800 min-h-[60vh]">
        <Document
          file={url}
          onLoadSuccess={onDocumentLoad}
          loading={
            <div className="flex flex-col items-center justify-center gap-3 py-20">
              <div className="h-10 w-10 border-2 border-orange-400 border-t-transparent rounded-full animate-spin" />
              <p className="text-[13px] text-gray-400">Loading PDF…</p>
            </div>
          }
          error={
            <div className="flex flex-col items-center gap-3 py-20">
              <FileText className="h-12 w-12 text-gray-500" />
              <p className="text-[14px] text-gray-400">Could not load PDF</p>
              <a href={url} target="_blank" rel="noopener noreferrer" className="text-[13px] text-orange-400 hover:underline">
                Open in new tab
              </a>
            </div>
          }
        >
          <Page
            pageNumber={pageNum}
            scale={scale}
            rotate={rotation}
            renderAnnotationLayer
            renderTextLayer
            className="shadow-2xl"
          />
        </Document>
      </div>

      {/* Bottom page strip */}
      {numPages > 1 && (
        <div className="flex items-center justify-center gap-1 px-4 py-2 bg-gray-800 border-t border-gray-700 overflow-x-auto">
          {Array.from({ length: Math.min(numPages, 10) }, (_, i) => {
            const n = i + 1;
            return (
              <button
                key={n}
                onClick={() => goTo(n)}
                className={`h-6 min-w-[24px] px-1.5 rounded text-[11px] font-medium transition-colors ${
                  pageNum === n ? 'bg-orange-500 text-white' : 'text-gray-400 hover:bg-gray-700 hover:text-gray-200'
                }`}
              >
                {n}
              </button>
            );
          })}
          {numPages > 10 && <span className="text-[11px] text-gray-500 ml-1">+{numPages - 10} more</span>}
        </div>
      )}
    </div>
  );
}
