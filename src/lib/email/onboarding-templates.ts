// Email templates for onboarding notifications
// All templates return HTML-formatted email bodies

export const onboardingEmailTemplates = {
  invitation: (employeeName: string, portalUrl: string) => ({
    subject: 'Welcome to VetOS — Your Onboarding Portal',
    html: `<p>Hi ${employeeName},</p>
      <p>Your onboarding has started! Please log in to your VetOS portal and complete the onboarding steps.</p>
      <p><a href="${portalUrl}">Go to Your Onboarding Portal</a></p>`,
  }),

  documentApproved: (employeeName: string, docName: string, portalUrl: string) => ({
    subject: `Document Approved: ${docName}`,
    html: `<p>Hi ${employeeName},</p>
      <p>Good news! Your <strong>${docName}</strong> has been approved.</p>
      <p><a href="${portalUrl}">View Your Onboarding Portal</a></p>`,
  }),

  documentRejected: (employeeName: string, docName: string, reason: string, portalUrl: string) => ({
    subject: `Document Revision Needed: ${docName}`,
    html: `<p>Hi ${employeeName},</p>
      <p>Your <strong>${docName}</strong> was not approved and needs revision.</p>
      <p><strong>Reason:</strong> ${reason}</p>
      <p>Please upload a revised version of this document.</p>
      <p><a href="${portalUrl}">Go to Your Onboarding Portal</a></p>`,
  }),

  documentUploaded: (hrName: string, employeeName: string, docName: string, portalUrl: string) => ({
    subject: `Document Uploaded: ${docName}`,
    html: `<p>Hi ${hrName},</p>
      <p><strong>${employeeName}</strong> has uploaded a document: <strong>${docName}</strong></p>
      <p>Please review and approve or request revision.</p>
      <p><a href="${portalUrl}">Review Document</a></p>`,
  }),
};
