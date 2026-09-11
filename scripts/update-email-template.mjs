#!/usr/bin/env node

/**
 * Update Supabase Auth email branding (Nod Notes) via Management API.
 *
 * Usage:
 *   SUPABASE_ACCESS_TOKEN=your-token node scripts/update-email-template.mjs
 *
 * Token: https://supabase.com/dashboard/account/tokens
 */

const PROJECT_REF = 'yhsyhtnnklpkfcpydbst' // Nod Notes Supabase project

const CONFIRM_HTML = `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Verify your email</title>
  </head>
  <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #0f172a; max-width: 600px; margin: 0 auto; padding: 20px;">
    <div style="background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
      <h1 style="color: white; margin: 0; font-size: 28px;">Welcome to Nod Notes</h1>
    </div>
    <div style="background: #f8fafc; padding: 30px; border-radius: 0 0 10px 10px;">
      <p style="font-size: 16px; margin-bottom: 20px;">Thanks for signing up. Verify your email to get started.</p>
      <div style="text-align: center; margin: 30px 0;">
        <a href="{{ .ConfirmationURL }}" style="background: #3b82f6; color: white; padding: 12px 30px; text-decoration: none; border-radius: 8px; display: inline-block; font-weight: 600; font-size: 16px;">Verify email</a>
      </div>
      <p style="font-size: 14px; color: #64748b; margin-top: 30px;">If the button doesn’t work, copy and paste this link:</p>
      <p style="font-size: 12px; color: #94a3b8; word-break: break-all; background: white; padding: 10px; border-radius: 4px; margin-top: 10px;">{{ .ConfirmationURL }}</p>
      <p style="font-size: 14px; color: #64748b; margin-top: 30px;">This link expires in 24 hours.</p>
    </div>
    <div style="text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #e2e8f0;">
      <p style="font-size: 12px; color: #94a3b8;">© Nod Notes · easayani@nodnotes.com</p>
    </div>
  </body>
</html>`

const MAGIC_HTML = `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Sign in to Nod Notes</title>
  </head>
  <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #0f172a; max-width: 600px; margin: 0 auto; padding: 20px;">
    <div style="background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
      <h1 style="color: white; margin: 0; font-size: 28px;">Nod Notes</h1>
    </div>
    <div style="background: #f8fafc; padding: 30px; border-radius: 0 0 10px 10px;">
      <p style="font-size: 16px; margin-bottom: 20px;">Use this link to sign in to your Nod Notes account.</p>
      <div style="text-align: center; margin: 30px 0;">
        <a href="{{ .ConfirmationURL }}" style="background: #3b82f6; color: white; padding: 12px 30px; text-decoration: none; border-radius: 8px; display: inline-block; font-weight: 600; font-size: 16px;">Sign in</a>
      </div>
      <p style="font-size: 14px; color: #64748b; margin-top: 30px;">If the button doesn’t work, copy and paste this link:</p>
      <p style="font-size: 12px; color: #94a3b8; word-break: break-all; background: white; padding: 10px; border-radius: 4px; margin-top: 10px;">{{ .ConfirmationURL }}</p>
      <p style="font-size: 14px; color: #64748b; margin-top: 30px;">If you didn’t request this, you can ignore this email.</p>
    </div>
    <div style="text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #e2e8f0;">
      <p style="font-size: 12px; color: #94a3b8;">© Nod Notes · easayani@nodnotes.com</p>
    </div>
  </body>
</html>`

async function updateEmailTemplate() {
  const accessToken = process.env.SUPABASE_ACCESS_TOKEN // Management API PAT
  if (!accessToken) {
    console.error('SUPABASE_ACCESS_TOKEN is not set')
    console.log('Get a token: https://supabase.com/dashboard/account/tokens')
    process.exit(1)
  }

  console.log('Updating Nod Notes Auth email branding…')
  const response = await fetch(
    `https://api.supabase.com/v1/projects/${PROJECT_REF}/config/auth`,
    {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0',
      },
      body: JSON.stringify({
        smtp_sender_name: 'Nod Notes', // From display name
        mailer_subjects_confirmation: 'Verify your Nod Notes account',
        mailer_subjects_magic_link: 'Sign in to Nod Notes',
        mailer_subjects_invite: 'You’re invited to Nod Notes',
        mailer_subjects_recovery: 'Reset your Nod Notes password',
        mailer_templates_confirmation_content: CONFIRM_HTML,
        mailer_templates_magic_link_content: MAGIC_HTML,
      }),
    }
  )

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${await response.text()}`)
  }

  console.log('Auth email branding updated (Nod Notes).')
}

updateEmailTemplate().catch((err) => {
  console.error(err.message || err)
  process.exit(1)
})
