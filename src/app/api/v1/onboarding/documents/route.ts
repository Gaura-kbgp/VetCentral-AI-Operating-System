import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient, createSupabaseAdminClient } from '@/lib/supabase/server';
import { extractText, getFileTypeFromName, MAX_FILE_SIZE } from '@/lib/ai/text-extractor';
import { Resend } from 'resend';

const ALLOWED_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/msword'];
const ALLOWED_EXTS = ['.pdf', '.jpg', '.jpeg', '.png', '.doc', '.docx'];

export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createSupabaseAdminClient();
  const { data: profile } = await admin.from('profiles').select('org_id').eq('id', user.id).single();
  if (!profile?.org_id) return NextResponse.json({ error: 'Profile not found' }, { status: 401 });

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 });
  }

  const file = formData.get('file') as File | null;
  const docId = (formData.get('docId') as string | null) || null;
  const recordId = (formData.get('recordId') as string | null) || null;

  if (!file || !docId || !recordId) {
    return NextResponse.json({ error: 'Missing file, docId, or recordId' }, { status: 400 });
  }

  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json({ error: 'File too large (max 15 MB)' }, { status: 400 });
  }

  const fileType = getFileTypeFromName(file.name);
  if (!fileType || !ALLOWED_EXTS.some(ext => file.name.toLowerCase().endsWith(ext))) {
    return NextResponse.json({
      error: 'Unsupported file type. Supported: PDF, JPG, PNG, DOC, DOCX',
    }, { status: 400 });
  }

  // Verify user is the employee on this record
  const { data: doc, error: docError } = await admin
    .from('onboarding_documents')
    .select('id,record_id,employee_id,doc_type,name')
    .eq('id', docId)
    .single();

  if (docError || !doc || doc.employee_id !== user.id) {
    return NextResponse.json({ error: 'Unauthorized — not your document' }, { status: 403 });
  }

  // Get record to find hr_manager
  const { data: record, error: recError } = await admin
    .from('onboarding_records')
    .select('id,org_id,employee_id,hr_manager_id')
    .eq('id', recordId)
    .single();

  if (recError || !record || record.employee_id !== user.id) {
    return NextResponse.json({ error: 'Record not found or unauthorized' }, { status: 403 });
  }

  // Upload file to storage
  const buffer = Buffer.from(await file.arrayBuffer());
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const storagePath = `onboarding-docs/${profile.org_id}/${user.id}/${docId}-${safeName}`;

  const { error: storageError } = await admin.storage
    .from('onboarding-docs')
    .upload(storagePath, buffer, {
      contentType: file.type || 'application/octet-stream',
      upsert: true,
    });

  if (storageError) {
    return NextResponse.json({ error: `Storage error: ${storageError.message}` }, { status: 500 });
  }

  // Extract OCR text
  let ocrText = '';
  try {
    ocrText = await extractText(buffer, fileType, file.name, file.type || 'application/octet-stream');
  } catch (e) {
    console.warn('OCR extraction failed:', e);
    // Continue without OCR text
  }

  // Create signed URL (1 hour expiry)
  const { data: signedUrl } = await admin.storage
    .from('onboarding-docs')
    .createSignedUrl(storagePath, 3600);

  const publicUrl = signedUrl?.signedUrl ?? null;

  // Update document record
  const { data: updatedDoc, error: updateError } = await admin
    .from('onboarding_documents')
    .update({
      storage_path: storagePath,
      file_size: file.size,
      file_type: fileType,
      status: 'uploaded',
      uploaded_by: user.id,
      ocr_text: ocrText || null,
      public_url: publicUrl,
      updated_at: new Date().toISOString(),
    })
    .eq('id', docId)
    .select()
    .single();

  if (updateError) {
    return NextResponse.json({ error: `Update error: ${updateError.message}` }, { status: 500 });
  }

  // Send notification to HR manager
  if (record.hr_manager_id) {
    try {
      await admin.from('notifications').insert({
        user_id: record.hr_manager_id,
        org_id: profile.org_id,
        type: 'document_shared',
        title: 'Document Uploaded',
        body: `Employee uploaded: ${doc.name}`,
        action_url: `/onboarding/${record.employee_id}?tab=documents`,
      });
    } catch (e) {
      console.warn('Notification insert failed:', e);
    }

    // Send email to HR manager
    const apiKey = process.env.RESEND_API_KEY;
    const fromEmail = process.env.FROM_EMAIL || 'onboarding@vetOS.local';
    if (apiKey) {
      try {
        const { data: hrProfile } = await admin
          .from('profiles')
          .select('email,first_name')
          .eq('id', record.hr_manager_id)
          .single();

        if (hrProfile?.email) {
          const portalUrl = `${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/onboarding/${record.employee_id}?tab=documents`;
          const { data: empProfile } = await admin
            .from('profiles')
            .select('first_name,last_name')
            .eq('id', user.id)
            .single();
          const empName = empProfile ? `${empProfile.first_name} ${empProfile.last_name}` : 'An employee';

          const resend = new Resend(apiKey);
          await resend.emails.send({
            from: fromEmail,
            to: hrProfile.email,
            subject: `Document Uploaded: ${doc.name}`,
            html: `<p>Hi ${hrProfile.first_name},</p>
              <p><strong>${empName}</strong> has uploaded a document: <strong>${doc.name}</strong></p>
              <p>Please review and approve or request revision.</p>
              <p><a href="${portalUrl}">Review Document</a></p>`,
          });

          // Log email
          try {
            await admin.from('email_logs').insert({
              org_id: profile.org_id,
              user_id: record.hr_manager_id,
              recipient_email: hrProfile.email,
              event_type: 'document_uploaded',
              subject: `Document Uploaded: ${doc.name}`,
              status: 'sent',
              reference_id: docId,
            });
          } catch { /* ignore log failure */ }
        }
      } catch (e) {
        console.warn('Email send failed for document upload:', e);
        // Log failure
        try {
          const { data: hrProfile } = await admin
            .from('profiles')
            .select('email')
            .eq('id', record.hr_manager_id)
            .single();
          await admin.from('email_logs').insert({
            org_id: profile.org_id,
            user_id: record.hr_manager_id,
            recipient_email: hrProfile?.email || 'unknown',
            event_type: 'document_uploaded',
            subject: `Document Uploaded: ${doc.name}`,
            status: 'failed',
            error_message: e instanceof Error ? e.message : 'Unknown error',
            reference_id: docId,
          });
        } catch { /* ignore */ }
      }
    }
  }

  // Log activity
  try {
    await admin.from('onboarding_activity').insert({
      org_id: profile.org_id,
      record_id: recordId,
      user_id: user.id,
      action: `uploaded document: ${doc.name}`,
      details: { doc_id: docId, file_name: file.name, file_size: file.size },
    });
  } catch (e) {
    console.warn('Activity log failed:', e);
  }

  return NextResponse.json({ success: true, data: updatedDoc }, { status: 200 });
}

export async function DELETE(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createSupabaseAdminClient();
  const { data: profile } = await admin.from('profiles').select('org_id').eq('id', user.id).single();
  if (!profile?.org_id) return NextResponse.json({ error: 'Profile not found' }, { status: 401 });

  const docId = req.nextUrl.searchParams.get('docId');
  const recordId = req.nextUrl.searchParams.get('recordId');

  if (!docId || !recordId) {
    return NextResponse.json({ error: 'Missing docId or recordId' }, { status: 400 });
  }

  // Get document
  const { data: doc, error: docError } = await admin
    .from('onboarding_documents')
    .select('id,storage_path,employee_id,record_id')
    .eq('id', docId)
    .single();

  if (docError || !doc) {
    return NextResponse.json({ error: 'Document not found' }, { status: 404 });
  }

  // Check permission: employee can delete own or HR/admin can delete any
  const { data: roles } = await admin
    .from('user_hospital_roles')
    .select('role')
    .eq('user_id', user.id);

  const isAdmin = roles?.some(r => ['super_admin', 'org_admin', 'hospital_admin', 'practice_manager', 'hr'].includes(r.role));
  const isOwner = doc.employee_id === user.id;

  if (!isOwner && !isAdmin) {
    return NextResponse.json({ error: 'Unauthorized — cannot delete this document' }, { status: 403 });
  }

  // Delete from storage
  if (doc.storage_path) {
    try {
      await admin.storage.from('onboarding-docs').remove([doc.storage_path]);
    } catch (e) {
      console.warn('Storage delete failed:', e);
    }
  }

  // Reset document status
  const { error: updateError } = await admin
    .from('onboarding_documents')
    .update({
      storage_path: null,
      file_size: null,
      file_type: null,
      status: 'pending',
      uploaded_by: null,
      ocr_text: null,
      public_url: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', docId);

  if (updateError) {
    return NextResponse.json({ error: `Update error: ${updateError.message}` }, { status: 500 });
  }

  // Log activity
  try {
    await admin.from('onboarding_activity').insert({
      org_id: profile.org_id,
      record_id: recordId,
      user_id: user.id,
      action: `deleted document upload: ${doc.id}`,
      details: { doc_id: docId },
    });
  } catch (e) {
    console.warn('Activity log failed:', e);
  }

  return NextResponse.json({ success: true }, { status: 200 });
}
