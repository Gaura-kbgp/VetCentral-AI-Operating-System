'use client';

import { useState, useEffect } from 'react';
import { X, Award, Download, Loader2, CheckCircle2, User, Briefcase, Building2, ChevronRight } from 'lucide-react';
import {
  getCertPreviewData, generateCertificate, getCertificate,
  type LMSCertificate,
} from '@/lib/actions/training';

// ─────────────────────────────────────────────────────────────
// Self-contained HTML for print/PDF — no Tailwind dependency
// ─────────────────────────────────────────────────────────────
function buildCertHtml(cert: CertData): string {
  const orgLabel   = cert.hospitalName ?? cert.orgName ?? 'VetCentral';
  const issuedDate = new Date(cert.issued_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  const expiresDate = cert.expires_at
    ? new Date(cert.expires_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    : 'Lifetime';
  const courseName = cert.course?.title ?? 'Training Course';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<title>Certificate — ${courseName}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  @page{size:A4 landscape;margin:0}
  html,body{
    width:297mm;height:210mm;
    font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif;
    -webkit-print-color-adjust:exact!important;
    print-color-adjust:exact!important;
    color-adjust:exact!important;
    overflow:hidden;
    background:#0f172a;
  }
  /* outer page background */
  .page{
    width:297mm;height:210mm;
    background:linear-gradient(135deg,#0f172a 0%,#1e293b 100%);
    display:flex;align-items:center;justify-content:center;
    padding:10mm;
  }
  /* certificate card */
  .cert{
    width:100%;height:100%;
    background:#ffffff;
    border-radius:12px;
    overflow:hidden;
    display:flex;flex-direction:column;
    box-shadow:0 0 0 1px rgba(255,255,255,.08);
  }
  /* top colour bar */
  .bar-top{height:6px;flex-shrink:0;background:linear-gradient(90deg,#f97316,#fbbf24,#f97316)}
  /* two-column layout */
  .layout{display:flex;flex:1;min-height:0}
  /* LEFT panel — navy */
  .left{
    width:220px;flex-shrink:0;
    background:linear-gradient(180deg,#0f172a 0%,#1e3a5f 100%);
    display:flex;flex-direction:column;align-items:center;justify-content:center;
    padding:20px 16px;gap:10px;
  }
  .org-chip{font-size:7.5px;font-weight:700;letter-spacing:.28em;text-transform:uppercase;color:#fb923c;text-align:center}
  .seal-ring{
    width:76px;height:76px;border-radius:50%;
    border:2.5px solid rgba(251,191,36,.35);
    display:flex;align-items:center;justify-content:center;
    position:relative;flex-shrink:0;
  }
  .seal-ring::after{
    content:'';position:absolute;inset:7px;border-radius:50%;
    border:1.5px solid rgba(251,191,36,.2);
  }
  .academy-lbl{font-size:7px;font-weight:700;letter-spacing:.22em;text-transform:uppercase;color:#64748b;text-align:center}
  .cert-heading{font-size:10.5px;font-weight:800;letter-spacing:.18em;text-transform:uppercase;color:#fff;text-align:center;line-height:1.4}
  .left-divider{width:80px;height:1.5px;background:linear-gradient(90deg,transparent,#f97316,transparent)}
  .cert-no-lbl{font-size:7px;font-weight:600;letter-spacing:.12em;text-transform:uppercase;color:#475569;text-align:center;margin-top:4px}
  .cert-no-val{font-size:8px;font-family:'Courier New',monospace;font-weight:700;color:#94a3b8;text-align:center;word-break:break-all;padding:0 8px}
  /* RIGHT panel — white */
  .right{
    flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;
    padding:20px 36px;gap:10px;
  }
  .certify-txt{font-size:9px;color:#94a3b8;letter-spacing:.12em;text-transform:uppercase}
  .holder-name{font-size:30px;font-weight:700;color:#0f172a;font-family:Georgia,'Times New Roman',serif;text-align:center;line-height:1.15}
  .holder-role{font-size:8.5px;font-weight:700;letter-spacing:.18em;text-transform:uppercase;color:#f97316}
  .completed-txt{font-size:9px;color:#64748b}
  .course-pill{
    background:#fff7ed;border:1.5px solid #fed7aa;border-radius:10px;
    padding:9px 22px;text-align:center;max-width:340px;
  }
  .course-title{font-size:14px;font-weight:700;color:#ea580c;line-height:1.3}
  /* gold star row */
  .star-row{display:flex;align-items:center;gap:10px;width:100%;max-width:320px}
  .gline{flex:1;height:1px;background:linear-gradient(90deg,transparent,#fbbf24)}
  .gline-r{flex:1;height:1px;background:linear-gradient(270deg,transparent,#fbbf24)}
  .star-circle{
    width:34px;height:34px;border-radius:50%;
    border:2.5px solid #fde68a;background:#fffbeb;
    display:flex;align-items:center;justify-content:center;flex-shrink:0;
  }
  /* stats row */
  .stats{display:grid;grid-template-columns:repeat(3,1fr);width:100%;max-width:340px;border:1px solid #f1f5f9;border-radius:10px;overflow:hidden}
  .sc{padding:8px 6px;text-align:center}
  .sc+.sc{border-left:1px solid #f1f5f9}
  .sl{font-size:6.5px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#94a3b8;margin-bottom:3px}
  .sv{font-size:10px;font-weight:700;color:#1e293b}
  .sv.m{font-family:'Courier New',monospace;font-size:8.5px}
  /* signatures */
  .sigs{display:grid;grid-template-columns:1fr 1fr;gap:24px;width:100%;max-width:340px}
  .sg{text-align:center}
  .sg-line{border-bottom:1px solid #e2e8f0;height:22px}
  .sg-lbl{font-size:6.5px;letter-spacing:.1em;text-transform:uppercase;color:#94a3b8;margin-top:3px}
  .sg-name{font-size:8.5px;font-weight:600;color:#475569;margin-top:1px}
  /* bottom bar */
  .bar-bot{height:4px;flex-shrink:0;background:linear-gradient(90deg,#f97316,#fbbf24,#f97316)}
</style>
</head>
<body>
<div class="page">
<div class="cert">
  <div class="bar-top"></div>
  <div class="layout">

    <!-- LEFT: navy branding panel -->
    <div class="left">
      <div class="org-chip">${orgLabel}</div>
      <div class="seal-ring">
        <svg viewBox="0 0 40 40" width="46" height="46" fill="none">
          <circle cx="20" cy="20" r="18" stroke="#fbbf24" stroke-width="1.5" opacity="0.5"/>
          <path d="M20 8l2.5 7.5H30l-6.5 4.5 2.5 7.5L20 23l-6 4.5 2.5-7.5L10 15.5h7.5z" fill="#fbbf24" opacity="0.9"/>
        </svg>
      </div>
      <div class="academy-lbl">Training Academy</div>
      <div class="cert-heading">Certificate<br/>of Completion</div>
      <div class="left-divider"></div>
      <div class="cert-no-lbl">Certificate No.</div>
      <div class="cert-no-val">${cert.cert_number ?? '—'}</div>
      <div class="cert-no-lbl" style="margin-top:6px">Date Issued</div>
      <div class="cert-no-val" style="color:#cbd5e1">${issuedDate}</div>
      <div class="cert-no-lbl" style="margin-top:4px">Valid Until</div>
      <div class="cert-no-val" style="color:#cbd5e1">${expiresDate}</div>
    </div>

    <!-- RIGHT: content panel -->
    <div class="right">
      <div class="certify-txt">This is to certify that</div>
      <div class="holder-name">${cert.holderName}</div>
      ${cert.holderJobTitle ? `<div class="holder-role">${cert.holderJobTitle}</div>` : ''}
      <div class="completed-txt">has successfully completed the course</div>

      <div class="course-pill">
        <div class="course-title">${courseName}</div>
      </div>

      <div class="star-row">
        <div class="gline"></div>
        <div class="star-circle">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="#f59e0b">
            <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z"/>
          </svg>
        </div>
        <div class="gline-r"></div>
      </div>

      <div class="sigs">
        <div class="sg">
          <div class="sg-line"></div>
          <div class="sg-lbl">Training Director</div>
          <div class="sg-name">${orgLabel}</div>
        </div>
        <div class="sg">
          <div class="sg-line"></div>
          <div class="sg-lbl">Authorised Signatory</div>
          <div class="sg-name">VetCentral AI OS</div>
        </div>
      </div>
    </div>

  </div>
  <div class="bar-bot"></div>
</div>
</div>
</body>
</html>`;
}

// ─────────────────────────────────────────────────────────────
// Certificate renderer (pure display, no server deps)
// ─────────────────────────────────────────────────────────────
interface CertData extends Omit<LMSCertificate, 'course'> {
  holderName: string;
  holderJobTitle: string | null;
  hospitalName: string | null;
  orgName: string | null;
  course: any;
}

function CertificateCard({ cert }: { cert: CertData }) {
  const orgLabel   = cert.hospitalName ?? cert.orgName ?? 'VetCentral';
  const issuedDate = new Date(cert.issued_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  const expiresDate = cert.expires_at
    ? new Date(cert.expires_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    : null;
  const expired = cert.expires_at && new Date(cert.expires_at) < new Date();

  return (
    <div className="w-full max-w-[820px] mx-auto bg-white shadow-2xl" style={{ borderRadius: 20, overflow: 'hidden' }}>
      {/* top stripe */}
      <div className="h-2 w-full" style={{ background: 'linear-gradient(90deg,#f97316,#fbbf24,#f97316)' }} />

      {/* navy header */}
      <div className="flex flex-col items-center gap-3 px-16 py-10"
        style={{ background: 'linear-gradient(180deg,#0f172a 0%,#1e3a5f 100%)' }}>
        <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-orange-400">{orgLabel}</p>

        {/* seal */}
        <div className="relative h-20 w-20 my-2">
          <div className="absolute inset-0 rounded-full border-4 border-amber-400/30" />
          <div className="absolute inset-2 rounded-full border-2 border-amber-400/20" />
          <div className="absolute inset-0 flex items-center justify-center">
            <svg viewBox="0 0 40 40" className="h-12 w-12 text-amber-400" fill="none">
              <circle cx="20" cy="20" r="18" stroke="currentColor" strokeWidth="1.5" opacity="0.4" />
              <path d="M20 8l2.5 7.5H30l-6.5 4.5 2.5 7.5L20 23l-6 4.5 2.5-7.5L10 15.5h7.5z" fill="currentColor" opacity="0.7" />
            </svg>
          </div>
        </div>

        <p className="text-[11px] font-bold uppercase tracking-[0.25em] text-slate-400">Training Academy</p>
        <h1 className="text-[22px] font-bold tracking-widest text-white uppercase mt-1">Certificate of Completion</h1>
        <div className="w-32 h-0.5 mt-2" style={{ background: 'linear-gradient(90deg,transparent,#f97316,transparent)' }} />
      </div>

      {/* body */}
      <div className="flex flex-col items-center gap-6 px-16 py-12">
        <div className="text-center space-y-1">
          <p className="text-[13px] text-slate-400 tracking-wider">This is to certify that</p>
          <h2 className="text-[38px] font-bold text-slate-900 leading-tight" style={{ fontFamily: 'Georgia,serif' }}>
            {cert.holderName}
          </h2>
          {cert.holderJobTitle && (
            <p className="text-[13px] font-semibold text-orange-500 uppercase tracking-wider">{cert.holderJobTitle}</p>
          )}
        </div>

        <p className="text-[14px] text-slate-500">has successfully completed the course</p>

        <div className="text-center px-8 py-5 rounded-2xl border-2 border-orange-100 bg-orange-50 w-full max-w-lg">
          <h3 className="text-[22px] font-bold text-orange-600 leading-snug">{cert.course?.title ?? 'Training Course'}</h3>
          {cert.course?.description && (
            <p className="text-[12px] text-slate-400 mt-1 line-clamp-2">{cert.course.description}</p>
          )}
        </div>

        {/* gold divider */}
        <div className="flex items-center gap-4 w-full max-w-md">
          <div className="flex-1 h-px bg-gradient-to-r from-transparent to-amber-300" />
          <div className="h-14 w-14 rounded-full flex items-center justify-center border-4 border-amber-200 bg-amber-50 shrink-0">
            <svg viewBox="0 0 24 24" className="h-7 w-7 text-amber-500" fill="none">
              <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z" fill="currentColor" />
            </svg>
          </div>
          <div className="flex-1 h-px bg-gradient-to-l from-transparent to-amber-300" />
        </div>

        {/* stats */}
        <div className="grid grid-cols-3 gap-0 w-full max-w-md border border-slate-100 rounded-2xl overflow-hidden">
          <div className="text-center px-4 py-4">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Date Issued</p>
            <p className="text-[14px] font-bold text-slate-800">{issuedDate}</p>
          </div>
          <div className="text-center px-4 py-4 border-x border-slate-100">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Certificate No.</p>
            <p className="text-[13px] font-mono font-bold text-slate-800">{cert.cert_number ?? '—'}</p>
          </div>
          <div className="text-center px-4 py-4">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
              {expired ? 'Expired' : expiresDate ? 'Valid Until' : 'Validity'}
            </p>
            <p className={`text-[14px] font-bold ${expired ? 'text-red-500' : 'text-slate-800'}`}>
              {expiresDate ?? 'Lifetime'}
            </p>
          </div>
        </div>

        {cert.course?.estimated_hours && (
          <p className="text-[12px] text-slate-400">
            {cert.course.estimated_hours} hour{cert.course.estimated_hours !== 1 ? 's' : ''} completed
            {cert.course.level ? ` · ${cert.course.level.charAt(0).toUpperCase() + cert.course.level.slice(1)} level` : ''}
          </p>
        )}

        {expired && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-5 py-3 text-[13px] text-red-600 font-medium w-full text-center">
            ⚠ This certificate has expired. Retake the course to renew.
          </div>
        )}

        {/* signatures */}
        <div className="grid grid-cols-2 gap-8 w-full max-w-md mt-4">
          <div className="text-center">
            <div className="h-10 border-b border-slate-200 mb-1" />
            <p className="text-[11px] text-slate-400 uppercase tracking-wider">Training Director</p>
            <p className="text-[12px] font-semibold text-slate-600">{orgLabel}</p>
          </div>
          <div className="text-center">
            <div className="h-10 border-b border-slate-200 mb-1" />
            <p className="text-[11px] text-slate-400 uppercase tracking-wider">Authorised Signatory</p>
            <p className="text-[12px] font-semibold text-slate-600">VetCentral AI OS</p>
          </div>
        </div>
      </div>

      {/* bottom stripe */}
      <div className="h-1.5 w-full" style={{ background: 'linear-gradient(90deg,#f97316,#fbbf24,#f97316)' }} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Field component
// ─────────────────────────────────────────────────────────────
function Field({
  icon: Icon, label, value, onChange, placeholder,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="space-y-1.5">
      <label className="flex items-center gap-2 text-[12px] font-semibold text-gray-500 uppercase tracking-wider">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </label>
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full h-11 px-4 rounded-xl border border-gray-200 text-[14px] text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-orange-400 focus:border-transparent transition-all"
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Main modal
// ─────────────────────────────────────────────────────────────
interface CertificateModalProps {
  courseId: string;
  courseName: string;
  onClose: () => void;
}

type Step = 'loading-profile' | 'form' | 'generating' | 'view' | 'error';

export function CertificateModal({ courseId, courseName, onClose }: CertificateModalProps) {
  const [step, setStep]             = useState<Step>('loading-profile');
  const [displayName, setDisplayName] = useState('');
  const [jobTitle, setJobTitle]     = useState('');
  const [hospitalName, setHospital] = useState('');
  const [certData, setCertData]     = useState<CertData | null>(null);
  const [errorMsg, setErrorMsg]     = useState('');

  useEffect(() => {
    getCertPreviewData(courseId).then(r => {
      if (r.success) {
        setDisplayName(r.data.displayName);
        setJobTitle(r.data.jobTitle);
        setHospital(r.data.hospitalName || r.data.orgName);
      }
      setStep('form');
    });
  }, [courseId]);

  const handleGenerate = async () => {
    setStep('generating');
    const genRes = await generateCertificate(courseId);
    if (!genRes.success || !genRes.data?.certId) {
      setErrorMsg(genRes.success ? 'Certificate ID missing.' : (genRes.error ?? 'Failed to generate certificate'));
      setStep('error');
      return;
    }
    const certRes = await getCertificate(genRes.data.certId);
    if (!certRes.success || !certRes.data) {
      setErrorMsg('Failed to load certificate');
      setStep('error');
      return;
    }
    const d = certRes.data;
    // override display fields with what the user confirmed in the form
    setCertData({
      ...d,
      course: (d as any).course ?? null,
      holderName: displayName || d.holderName,
      holderJobTitle: jobTitle || d.holderJobTitle,
      hospitalName: hospitalName || d.hospitalName,
    } as CertData);
    setStep('view');
  };

  const handlePrint = () => {
    if (!certData) return;
    const html = buildCertHtml(certData);
    const win = window.open('', '_blank', 'width=1000,height=720');
    if (!win) return;
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); }, 800);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="relative w-full max-w-3xl my-auto">
        {/* Close */}
        <button
          onClick={onClose}
          className="absolute -top-3 -right-3 z-10 h-9 w-9 flex items-center justify-center rounded-full bg-white shadow-lg hover:bg-gray-100 transition-colors"
        >
          <X className="h-4 w-4 text-gray-600" />
        </button>

        {/* ── Loading profile ── */}
        {step === 'loading-profile' && (
          <div className="bg-white rounded-3xl p-16 flex flex-col items-center gap-4 shadow-2xl">
            <Loader2 className="h-10 w-10 animate-spin text-orange-400" />
            <p className="text-[14px] text-gray-500">Loading your details…</p>
          </div>
        )}

        {/* ── Form step ── */}
        {step === 'form' && (
          <div className="bg-white rounded-3xl shadow-2xl overflow-hidden">
            {/* header */}
            <div className="px-8 pt-8 pb-6 border-b border-gray-100">
              <div className="flex items-center gap-3 mb-1">
                <div className="h-10 w-10 rounded-2xl bg-amber-100 flex items-center justify-center">
                  <Award className="h-5 w-5 text-amber-500" />
                </div>
                <div>
                  <h2 className="text-[18px] font-bold text-gray-900">Confirm Your Certificate Details</h2>
                  <p className="text-[13px] text-gray-400">These details will appear on your certificate</p>
                </div>
              </div>
            </div>

            <div className="px-8 py-7 space-y-5">
              {/* Course preview */}
              <div className="bg-orange-50 border border-orange-100 rounded-2xl px-5 py-4">
                <p className="text-[11px] font-bold uppercase tracking-widest text-orange-400 mb-0.5">Course Completed</p>
                <p className="text-[15px] font-bold text-orange-700">{courseName}</p>
              </div>

              <Field icon={User}      label="Full Name"         value={displayName}  onChange={setDisplayName}  placeholder="Your full name" />
              <Field icon={Briefcase} label="Job Title"         value={jobTitle}     onChange={setJobTitle}     placeholder="e.g. Senior Veterinarian" />
              <Field icon={Building2} label="Hospital / Clinic" value={hospitalName} onChange={setHospital}     placeholder="Your hospital or clinic name" />

              <p className="text-[12px] text-gray-400">
                These are pre-filled from your profile. Edit if needed before generating.
              </p>
            </div>

            <div className="px-8 pb-8 flex items-center gap-3">
              <button
                onClick={onClose}
                className="h-11 px-5 rounded-xl border border-gray-200 text-gray-600 text-[14px] font-medium hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleGenerate}
                disabled={!displayName.trim()}
                className="flex-1 h-11 rounded-xl bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white text-[14px] font-semibold flex items-center justify-center gap-2 transition-colors"
              >
                Generate Certificate <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        {/* ── Generating ── */}
        {step === 'generating' && (
          <div className="bg-white rounded-3xl p-16 flex flex-col items-center gap-5 shadow-2xl">
            <div className="h-16 w-16 rounded-full bg-amber-50 border-4 border-amber-200 flex items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-amber-500" />
            </div>
            <div className="text-center">
              <p className="text-[16px] font-bold text-gray-800">Generating Your Certificate</p>
              <p className="text-[13px] text-gray-400 mt-1">Just a moment…</p>
            </div>
          </div>
        )}

        {/* ── View certificate ── */}
        {step === 'view' && certData && (
          <div className="space-y-4">
            {/* Actions bar */}
            <div className="flex items-center justify-between bg-white/10 backdrop-blur-sm rounded-2xl px-5 py-3">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-green-400" />
                <span className="text-white text-[14px] font-semibold">Certificate Generated!</span>
              </div>
              <button
                onClick={handlePrint}
                className="flex items-center gap-2 h-9 px-5 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-[13px] font-semibold transition-colors"
              >
                <Download className="h-4 w-4" />
                Download / Print PDF
              </button>
            </div>

            {/* Certificate */}
            <CertificateCard cert={certData} />

            <div className="flex justify-center">
              <button
                onClick={onClose}
                className="h-10 px-8 rounded-xl bg-white/10 hover:bg-white/20 text-white text-[13px] font-medium transition-colors border border-white/20"
              >
                Done
              </button>
            </div>
          </div>
        )}

        {/* ── Error ── */}
        {step === 'error' && (
          <div className="bg-white rounded-3xl p-10 flex flex-col items-center gap-5 shadow-2xl">
            <div className="h-14 w-14 rounded-full bg-red-50 border-4 border-red-200 flex items-center justify-center">
              <X className="h-7 w-7 text-red-400" />
            </div>
            <div className="text-center">
              <p className="text-[16px] font-bold text-gray-800">Could Not Generate Certificate</p>
              <p className="text-[13px] text-red-500 mt-2">{errorMsg}</p>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setStep('form')} className="h-10 px-5 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-[13px] font-semibold transition-colors">
                Try Again
              </button>
              <button onClick={onClose} className="h-10 px-5 rounded-xl border border-gray-200 text-gray-600 text-[13px] font-medium hover:bg-gray-50 transition-colors">
                Close
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
