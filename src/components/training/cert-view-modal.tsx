'use client';

import { useState, useEffect } from 'react';
import { X, Download, Award, Loader2, AlertCircle } from 'lucide-react';
import { getCertificate, type LMSCertificate } from '@/lib/actions/training';

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────
type CertData = LMSCertificate & {
  holderName: string;
  holderJobTitle: string | null;
  hospitalName: string | null;
  orgName: string | null;
  course: any;
};

function buildHtml(cert: CertData): string {
  const org        = cert.hospitalName ?? cert.orgName ?? 'VetCentral';
  const issued     = new Date(cert.issued_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  const expires    = cert.expires_at
    ? new Date(cert.expires_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    : 'Lifetime';
  const title      = cert.course?.title ?? 'Training Course';

  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/>
<title>Certificate — ${title}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  @page{size:A4 landscape;margin:0}
  html,body{width:297mm;height:210mm;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif;-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important;overflow:hidden;background:#0f172a}
  .page{width:297mm;height:210mm;background:linear-gradient(135deg,#0f172a 0%,#1e293b 100%);display:flex;align-items:center;justify-content:center;padding:10mm}
  .cert{width:100%;height:100%;background:#fff;border-radius:12px;overflow:hidden;display:flex;flex-direction:column}
  .bar{height:6px;flex-shrink:0;background:linear-gradient(90deg,#f97316,#fbbf24,#f97316)}
  .bar-sm{height:4px;flex-shrink:0;background:linear-gradient(90deg,#f97316,#fbbf24,#f97316)}
  .layout{display:flex;flex:1;min-height:0}
  .left{width:210px;flex-shrink:0;background:linear-gradient(180deg,#0f172a 0%,#1e3a5f 100%);display:flex;flex-direction:column;align-items:center;justify-content:center;padding:18px 14px;gap:9px}
  .org{font-size:7.5px;font-weight:700;letter-spacing:.28em;text-transform:uppercase;color:#fb923c;text-align:center}
  .seal{width:68px;height:68px;border-radius:50%;border:2.5px solid rgba(251,191,36,.35);display:flex;align-items:center;justify-content:center;position:relative}
  .seal::after{content:'';position:absolute;inset:6px;border-radius:50%;border:1.5px solid rgba(251,191,36,.2)}
  .acad{font-size:7px;font-weight:700;letter-spacing:.22em;text-transform:uppercase;color:#64748b;text-align:center}
  .heading{font-size:10px;font-weight:800;letter-spacing:.18em;text-transform:uppercase;color:#fff;text-align:center;line-height:1.4}
  .div{width:72px;height:1.5px;background:linear-gradient(90deg,transparent,#f97316,transparent)}
  .lbl{font-size:6.5px;font-weight:600;letter-spacing:.1em;text-transform:uppercase;color:#475569;text-align:center;margin-top:4px}
  .val{font-size:8px;font-family:'Courier New',monospace;font-weight:700;color:#94a3b8;text-align:center;padding:0 6px;word-break:break-all}
  .right{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:18px 32px;gap:9px}
  .certify{font-size:9px;color:#94a3b8;letter-spacing:.12em;text-transform:uppercase}
  .name{font-size:28px;font-weight:700;color:#0f172a;font-family:Georgia,'Times New Roman',serif;text-align:center;line-height:1.15}
  .role{font-size:8.5px;font-weight:700;letter-spacing:.18em;text-transform:uppercase;color:#f97316}
  .done{font-size:9px;color:#64748b}
  .pill{background:#fff7ed;border:1.5px solid #fed7aa;border-radius:10px;padding:8px 20px;text-align:center;max-width:320px}
  .pill-title{font-size:13.5px;font-weight:700;color:#ea580c;line-height:1.3}
  .star-row{display:flex;align-items:center;gap:10px;width:100%;max-width:300px}
  .gl{flex:1;height:1px;background:linear-gradient(90deg,transparent,#fbbf24)}
  .gr{flex:1;height:1px;background:linear-gradient(270deg,transparent,#fbbf24)}
  .star{width:32px;height:32px;border-radius:50%;border:2.5px solid #fde68a;background:#fffbeb;display:flex;align-items:center;justify-content:center;flex-shrink:0}
  .sigs{display:grid;grid-template-columns:1fr 1fr;gap:24px;width:100%;max-width:320px}
  .sg{text-align:center}
  .sg-line{border-bottom:1px solid #e2e8f0;height:22px}
  .sg-lbl{font-size:6.5px;letter-spacing:.1em;text-transform:uppercase;color:#94a3b8;margin-top:3px}
  .sg-name{font-size:8px;font-weight:600;color:#475569;margin-top:1px}
</style></head><body>
<div class="page"><div class="cert">
  <div class="bar"></div>
  <div class="layout">
    <div class="left">
      <div class="org">${org}</div>
      <div class="seal"><svg viewBox="0 0 40 40" width="42" height="42" fill="none"><circle cx="20" cy="20" r="18" stroke="#fbbf24" stroke-width="1.5" opacity="0.5"/><path d="M20 8l2.5 7.5H30l-6.5 4.5 2.5 7.5L20 23l-6 4.5 2.5-7.5L10 15.5h7.5z" fill="#fbbf24" opacity="0.9"/></svg></div>
      <div class="acad">Training Academy</div>
      <div class="heading">Certificate<br/>of Completion</div>
      <div class="div"></div>
      <div class="lbl">Certificate No.</div>
      <div class="val">${cert.cert_number ?? '—'}</div>
      <div class="lbl" style="margin-top:4px">Issued</div>
      <div class="val" style="color:#cbd5e1">${issued}</div>
      <div class="lbl" style="margin-top:3px">Valid Until</div>
      <div class="val" style="color:#cbd5e1">${expires}</div>
    </div>
    <div class="right">
      <div class="certify">This is to certify that</div>
      <div class="name">${cert.holderName}</div>
      ${cert.holderJobTitle ? `<div class="role">${cert.holderJobTitle}</div>` : ''}
      <div class="done">has successfully completed the course</div>
      <div class="pill"><div class="pill-title">${title}</div></div>
      <div class="star-row">
        <div class="gl"></div>
        <div class="star"><svg viewBox="0 0 24 24" width="18" height="18" fill="#f59e0b"><path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z"/></svg></div>
        <div class="gr"></div>
      </div>
      <div class="sigs">
        <div class="sg"><div class="sg-line"></div><div class="sg-lbl">Training Director</div><div class="sg-name">${org}</div></div>
        <div class="sg"><div class="sg-line"></div><div class="sg-lbl">Authorised Signatory</div><div class="sg-name">VetCentral AI OS</div></div>
      </div>
    </div>
  </div>
  <div class="bar-sm"></div>
</div></div>
</body></html>`;
}

// ─────────────────────────────────────────────────────────────
// Modal
// ─────────────────────────────────────────────────────────────
interface CertViewModalProps {
  certId: string;
  onClose: () => void;
}

export function CertViewModal({ certId, onClose }: CertViewModalProps) {
  const [cert, setCert]     = useState<CertData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState('');

  useEffect(() => {
    getCertificate(certId).then(r => {
      if (r.success && r.data) {
        setCert({ ...r.data, course: (r.data as any).course ?? null } as CertData);
      } else {
        setError('Could not load certificate');
      }
      setLoading(false);
    });
  }, [certId]);

  const handleDownload = () => {
    if (!cert) return;
    const html = buildHtml(cert);
    const win = window.open('', '_blank', 'width=1000,height=720');
    if (!win) return;
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 800);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="relative w-full max-w-2xl my-auto">
        {/* Close */}
        <button
          onClick={onClose}
          className="absolute -top-3 -right-3 z-10 h-9 w-9 flex items-center justify-center rounded-full bg-white shadow-lg hover:bg-gray-100 transition-colors"
        >
          <X className="h-4 w-4 text-gray-600" />
        </button>

        {loading && (
          <div className="bg-white rounded-3xl p-16 flex flex-col items-center gap-4 shadow-2xl">
            <Loader2 className="h-10 w-10 animate-spin text-orange-400" />
            <p className="text-[14px] text-gray-500">Loading certificate…</p>
          </div>
        )}

        {error && (
          <div className="bg-white rounded-3xl p-12 flex flex-col items-center gap-4 shadow-2xl">
            <AlertCircle className="h-12 w-12 text-red-400" />
            <p className="text-[15px] font-semibold text-gray-800">Certificate Not Found</p>
            <p className="text-[13px] text-red-500">{error}</p>
            <button onClick={onClose} className="h-9 px-6 rounded-xl border border-gray-200 text-[13px] text-gray-600 hover:bg-gray-50 transition-colors">Close</button>
          </div>
        )}

        {cert && !loading && (
          <div className="space-y-4">
            {/* Top action bar */}
            <div className="flex items-center justify-between bg-white/10 backdrop-blur-sm rounded-2xl px-5 py-3">
              <div className="flex items-center gap-2">
                <Award className="h-5 w-5 text-amber-400" />
                <span className="text-white text-[14px] font-semibold">
                  {cert.course?.title ?? 'Certificate of Completion'}
                </span>
              </div>
              <button
                onClick={handleDownload}
                className="flex items-center gap-2 h-9 px-5 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-[13px] font-semibold transition-colors"
              >
                <Download className="h-4 w-4" /> Download PDF
              </button>
            </div>

            {/* Certificate card */}
            <div className="bg-white rounded-2xl shadow-2xl overflow-hidden">
              {/* top stripe */}
              <div className="h-1.5 w-full" style={{ background: 'linear-gradient(90deg,#f97316,#fbbf24,#f97316)' }} />

              {/* two-column */}
              <div className="flex">
                {/* left navy panel */}
                <div className="w-52 shrink-0 flex flex-col items-center justify-center gap-3 px-4 py-8"
                  style={{ background: 'linear-gradient(180deg,#0f172a 0%,#1e3a5f 100%)' }}>
                  <p className="text-[9px] font-bold tracking-[.25em] uppercase text-orange-400 text-center">{cert.hospitalName ?? cert.orgName ?? 'VetCentral'}</p>

                  <div className="relative h-16 w-16 shrink-0">
                    <div className="absolute inset-0 rounded-full border-[2.5px] border-amber-400/30" />
                    <div className="absolute inset-[7px] rounded-full border border-amber-400/20" />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <svg viewBox="0 0 40 40" className="h-10 w-10 text-amber-400" fill="none">
                        <circle cx="20" cy="20" r="18" stroke="currentColor" strokeWidth="1.5" opacity="0.4" />
                        <path d="M20 8l2.5 7.5H30l-6.5 4.5 2.5 7.5L20 23l-6 4.5 2.5-7.5L10 15.5h7.5z" fill="currentColor" opacity="0.8" />
                      </svg>
                    </div>
                  </div>

                  <p className="text-[8px] font-bold tracking-[.2em] uppercase text-slate-500 text-center">Training Academy</p>
                  <p className="text-[10px] font-bold tracking-[.15em] uppercase text-white text-center leading-snug">Certificate<br/>of Completion</p>
                  <div className="w-16 h-px" style={{ background: 'linear-gradient(90deg,transparent,#f97316,transparent)' }} />

                  <div className="text-center space-y-2 mt-1">
                    <div>
                      <p className="text-[7px] font-semibold tracking-widest uppercase text-slate-500">Cert No.</p>
                      <p className="text-[8px] font-mono text-slate-400 mt-0.5">{cert.cert_number ?? '—'}</p>
                    </div>
                    <div>
                      <p className="text-[7px] font-semibold tracking-widest uppercase text-slate-500">Issued</p>
                      <p className="text-[8px] text-slate-400 mt-0.5">{new Date(cert.issued_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</p>
                    </div>
                    <div>
                      <p className="text-[7px] font-semibold tracking-widest uppercase text-slate-500">Valid Until</p>
                      <p className="text-[8px] text-slate-400 mt-0.5">
                        {cert.expires_at ? new Date(cert.expires_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Lifetime'}
                      </p>
                    </div>
                  </div>
                </div>

                {/* right white panel */}
                <div className="flex-1 flex flex-col items-center justify-center gap-4 px-10 py-8">
                  <p className="text-[10px] text-slate-400 tracking-[.12em] uppercase">This is to certify that</p>
                  <h2 className="text-[28px] font-bold text-slate-900 text-center leading-tight" style={{ fontFamily: 'Georgia,serif' }}>
                    {cert.holderName}
                  </h2>
                  {cert.holderJobTitle && (
                    <p className="text-[10px] font-bold tracking-[.15em] uppercase text-orange-500">{cert.holderJobTitle}</p>
                  )}
                  <p className="text-[11px] text-slate-500">has successfully completed the course</p>

                  <div className="bg-orange-50 border border-orange-100 rounded-xl px-6 py-3 text-center w-full max-w-sm">
                    <p className="text-[14px] font-bold text-orange-600 leading-snug">{cert.course?.title ?? 'Training Course'}</p>
                  </div>

                  {/* star divider */}
                  <div className="flex items-center gap-3 w-full max-w-xs">
                    <div className="flex-1 h-px" style={{ background: 'linear-gradient(90deg,transparent,#fbbf24)' }} />
                    <div className="h-8 w-8 rounded-full border-2 border-amber-200 bg-amber-50 flex items-center justify-center shrink-0">
                      <svg viewBox="0 0 24 24" className="h-4 w-4 text-amber-500" fill="currentColor">
                        <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z" />
                      </svg>
                    </div>
                    <div className="flex-1 h-px" style={{ background: 'linear-gradient(270deg,transparent,#fbbf24)' }} />
                  </div>

                  {/* signatures */}
                  <div className="grid grid-cols-2 gap-6 w-full max-w-xs">
                    {['Training Director', 'Authorised Signatory'].map((lbl, i) => (
                      <div key={i} className="text-center">
                        <div className="h-6 border-b border-slate-200 mb-1" />
                        <p className="text-[8px] text-slate-400 uppercase tracking-wider">{lbl}</p>
                        <p className="text-[9px] font-semibold text-slate-500 mt-0.5">{i === 0 ? (cert.hospitalName ?? cert.orgName ?? 'VetCentral') : 'VetCentral AI OS'}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* bottom stripe */}
              <div className="h-1 w-full" style={{ background: 'linear-gradient(90deg,#f97316,#fbbf24,#f97316)' }} />
            </div>

            <div className="flex justify-center">
              <button onClick={onClose} className="h-9 px-8 rounded-xl bg-white/10 hover:bg-white/20 text-white text-[13px] font-medium transition-colors border border-white/20">
                Done
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
