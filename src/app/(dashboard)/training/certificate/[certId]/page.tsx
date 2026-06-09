import { createSupabaseServerClient } from '@/lib/supabase/server';
import { redirect, notFound } from 'next/navigation';
import { getCertificate } from '@/lib/actions/training';
import { Award, Shield, GraduationCap } from 'lucide-react';

export default async function CertificatePage({ params }: { params: { certId: string } }) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const result = await getCertificate(params.certId);
  if (!result.success || !result.data) notFound();

  const cert   = result.data;
  const course = cert.course as any;

  const issuedDate  = new Date(cert.issued_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  const expiresDate = cert.expires_at
    ? new Date(cert.expires_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    : null;

  const expired = cert.expires_at && new Date(cert.expires_at) < new Date();

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col items-center justify-center p-8 print:bg-white print:p-0">
      {/* Print button */}
      <div className="mb-6 print:hidden">
        <button
          onClick={() => window.print()}
          className="flex items-center gap-2 h-10 px-5 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-[14px] font-semibold transition-colors"
        >
          Print / Save as PDF
        </button>
      </div>

      {/* Certificate */}
      <div className="w-full max-w-3xl bg-white rounded-3xl shadow-2xl overflow-hidden print:rounded-none print:shadow-none print:max-w-none">
        {/* Top accent */}
        <div className="h-3 w-full bg-gradient-to-r from-orange-400 via-amber-400 to-yellow-400" />

        <div className="px-16 py-14 flex flex-col items-center text-center gap-8">
          {/* Logo / Header */}
          <div className="flex flex-col items-center gap-3">
            <div className="h-16 w-16 rounded-2xl bg-orange-50 flex items-center justify-center">
              <GraduationCap className="h-9 w-9 text-orange-500" />
            </div>
            <p className="text-[13px] font-bold uppercase tracking-widest text-gray-400">
              VetOS Training Academy
            </p>
          </div>

          {/* Certificate of Completion */}
          <div className="space-y-3">
            <p className="text-[14px] font-semibold text-gray-400 uppercase tracking-widest">
              Certificate of Completion
            </p>
            <p className="text-[15px] text-gray-500">This is to certify that</p>
            <h1 className="text-[36px] font-bold text-gray-900 leading-tight">
              {cert.holderName}
            </h1>
            <p className="text-[15px] text-gray-500">has successfully completed</p>
            <h2 className="text-[24px] font-bold text-orange-600 leading-tight">
              {course?.title ?? 'Training Course'}
            </h2>
            {course?.compliance_type && (
              <div className="inline-flex items-center gap-2 bg-amber-50 border border-amber-100 rounded-full px-4 py-1.5 mt-1">
                <Shield className="h-4 w-4 text-amber-600" />
                <span className="text-[13px] font-semibold text-amber-700">{course.compliance_type} Compliance</span>
              </div>
            )}
          </div>

          {/* Award icon */}
          <div className="flex items-center gap-4">
            <div className="w-20 border-t-2 border-dashed border-gray-200" />
            <div className="h-16 w-16 rounded-full bg-amber-50 border-4 border-amber-100 flex items-center justify-center">
              <Award className="h-8 w-8 text-amber-500" />
            </div>
            <div className="w-20 border-t-2 border-dashed border-gray-200" />
          </div>

          {/* Details */}
          <div className="grid grid-cols-3 gap-8 w-full">
            <div className="text-center">
              <p className="text-[11px] font-bold uppercase tracking-widest text-gray-400 mb-1">Date Issued</p>
              <p className="text-[14px] font-semibold text-gray-800">{issuedDate}</p>
            </div>
            <div className="text-center border-x border-gray-100">
              <p className="text-[11px] font-bold uppercase tracking-widest text-gray-400 mb-1">Certificate #</p>
              <p className="text-[14px] font-mono font-semibold text-gray-800">{cert.cert_number ?? '—'}</p>
            </div>
            <div className="text-center">
              <p className="text-[11px] font-bold uppercase tracking-widest text-gray-400 mb-1">
                {expired ? 'Expired' : expiresDate ? 'Expires' : 'Validity'}
              </p>
              <p className={`text-[14px] font-semibold ${expired ? 'text-red-500' : 'text-gray-800'}`}>
                {expiresDate ?? 'No Expiry'}
              </p>
            </div>
          </div>

          {/* Course details */}
          {(course?.level || course?.estimated_hours) && (
            <div className="flex items-center gap-4 text-[12px] text-gray-400">
              {course.level && <span className="capitalize">{course.level}</span>}
              {course.level && course.estimated_hours && <span>·</span>}
              {course.estimated_hours && <span>{course.estimated_hours} hours</span>}
            </div>
          )}

          {expired && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-5 py-3 text-[13px] text-red-600 font-medium">
              This certificate has expired. Please retake the course to renew your certification.
            </div>
          )}
        </div>

        {/* Bottom accent */}
        <div className="h-1.5 w-full bg-gradient-to-r from-orange-400 via-amber-400 to-yellow-400" />
      </div>

      <p className="mt-6 text-[11px] text-gray-400 print:hidden">
        Certificate ID: {cert.id}
      </p>
    </div>
  );
}
