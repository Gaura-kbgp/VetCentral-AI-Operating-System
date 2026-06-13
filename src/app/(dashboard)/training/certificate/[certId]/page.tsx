import { createSupabaseServerClient } from '@/lib/supabase/server';
import { redirect, notFound } from 'next/navigation';
import { getCertificate } from '@/lib/actions/training';
import { PrintButton } from './print-button';

export default async function CertificatePage({
  params,
}: {
  params: Promise<{ certId: string }>;
}) {
  const { certId } = await params;

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const result = await getCertificate(certId);
  if (!result.success || !result.data) notFound();

  const cert        = result.data;
  const course      = cert.course as any;
  const issuedDate  = new Date(cert.issued_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  const expiresDate = cert.expires_at
    ? new Date(cert.expires_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    : null;
  const expired = cert.expires_at && new Date(cert.expires_at) < new Date();
  const orgLabel = cert.hospitalName ?? cert.orgName ?? 'VetCentral';

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-8 print:p-0"
      style={{ background: 'linear-gradient(135deg,#0f172a 0%,#1e293b 50%,#0f172a 100%)' }}>

      {/* Toolbar */}
      <div className="flex items-center gap-4 mb-8 print:hidden">
        <PrintButton />
        <a href="/dashboard?section=training"
          className="flex items-center gap-2 h-10 px-5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-[14px] font-medium transition-colors border border-white/10">
          ← Back to Training
        </a>
      </div>

      {/* Certificate card */}
      <div
        className="w-full max-w-[820px] bg-white shadow-[0_30px_80px_rgba(0,0,0,0.5)] print:shadow-none print:max-w-none print:rounded-none"
        style={{ borderRadius: '20px', overflow: 'hidden' }}
      >
        {/* Top stripe */}
        <div className="h-2 w-full" style={{ background: 'linear-gradient(90deg,#f97316,#fbbf24,#f97316)' }} />

        {/* Navy header banner */}
        <div
          className="flex flex-col items-center gap-3 px-16 py-10"
          style={{ background: 'linear-gradient(180deg,#0f172a 0%,#1e3a5f 100%)' }}
        >
          <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-orange-400">{orgLabel}</p>

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
          <h1 className="text-[22px] font-bold tracking-widest text-white uppercase mt-1">
            Certificate of Completion
          </h1>
          <div className="w-32 h-0.5 mt-2" style={{ background: 'linear-gradient(90deg,transparent,#f97316,transparent)' }} />
        </div>

        {/* Body */}
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
            <h3 className="text-[22px] font-bold text-orange-600 leading-snug">{course?.title ?? 'Training Course'}</h3>
            {course?.description && (
              <p className="text-[12px] text-slate-400 mt-1 line-clamp-2">{course.description}</p>
            )}
          </div>

          <div className="flex items-center gap-4 w-full max-w-md">
            <div className="flex-1 h-px bg-gradient-to-r from-transparent to-amber-300" />
            <div className="h-14 w-14 rounded-full flex items-center justify-center border-4 border-amber-200 bg-amber-50 shrink-0">
              <svg viewBox="0 0 24 24" className="h-7 w-7 text-amber-500" fill="none">
                <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z" fill="currentColor" />
              </svg>
            </div>
            <div className="flex-1 h-px bg-gradient-to-l from-transparent to-amber-300" />
          </div>

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

          {expired && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-5 py-3 text-[13px] text-red-600 font-medium w-full text-center">
              ⚠ This certificate has expired. Retake the course to renew your certification.
            </div>
          )}

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

        {/* Bottom stripe */}
        <div className="h-1.5 w-full" style={{ background: 'linear-gradient(90deg,#f97316,#fbbf24,#f97316)' }} />
      </div>

      <p className="mt-4 text-[11px] text-white/30 print:hidden">ID: {certId}</p>
    </div>
  );
}
