
# Invitation Email Analysis & Solution

## Problem Analysis

### Issue
When creating a new player through the admin interface, the player account was being created successfully, but **no invitation email was being sent** to the user. This meant that players had no way to set up their password and access the app.

### Root Cause
The `create-player` Edge Function was using `auth.admin.createUser()` which:
- ✅ Creates a user account in the database
- ✅ Sets user metadata (full name, phone number)
- ❌ **Does NOT send an invitation email**
- ❌ Requires manual password reset link generation

The code was attempting to send a password reset email using `auth.admin.generateLink()`, but this approach has several issues:
1. The link is only generated, not automatically sent
2. It requires additional email sending logic
3. It's not the intended method for user invitations

## Solution Implemented

### Changed Method
Replaced `auth.admin.createUser()` with `auth.admin.inviteUserByEmail()` which:
- ✅ Creates a user account in the database
- ✅ Sets user metadata (full name, phone number)
- ✅ **Automatically sends an invitation email**
- ✅ Includes a secure link for the user to set their password
- ✅ Uses Supabase's built-in email template system

### Code Changes

#### Before (Old Implementation)
```typescript
// Generate a temporary password
const tempPassword = `temp_${crypto.randomUUID()}`;

// Create the player account using admin client
const { data: signUpData, error: signUpError } = await supabaseAdmin.auth.admin.createUser({
  email,
  password: tempPassword,
  email_confirm: true,
  user_metadata: {
    full_name: fullName,
    phone_number: phoneNumber && phoneNumber.trim() ? phoneNumber : null,
  },
});

// Attempt to send password reset email (not reliable)
const { data: linkData, error: resetError } = await supabaseAdmin.auth.admin.generateLink({
  type: 'recovery',
  email: email,
  options: {
    redirectTo: 'https://natively.dev/email-confirmed',
  },
});
```

#### After (New Implementation)
```typescript
// Use inviteUserByEmail instead of createUser
// This will send an invitation email to the user
const { data: inviteData, error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(
  email,
  {
    data: {
      full_name: fullName,
      phone_number: phoneNumber && phoneNumber.trim() ? phoneNumber : null,
    },
    redirectTo: 'https://natively.dev/email-confirmed',
  }
);
```

## How It Works Now

### User Flow
1. **Admin creates player**: Admin fills out the form with player's name, email, and optional phone number
2. **Edge Function processes**: The `create-player` Edge Function:
   - Verifies admin authentication
   - Checks if email already exists
   - Calls `inviteUserByEmail()` with user metadata
   - Creates player profile in database
   - Assigns player role
   - Creates admin-player relationship
3. **Email sent automatically**: Supabase sends an invitation email to the player with:
   - A secure invitation link
   - Instructions to set up their password
   - Redirect to the app after completion
4. **Player accepts invitation**: Player clicks the link in the email and:
   - Sets their own password
   - Gets redirected to the app
   - Can now log in with their email and password

### Email Template
The invitation email uses Supabase's default `auth.email.template.invite` template which includes:
- **Subject**: "You have been invited"
- **Content**: Contains `{{ .ConfirmationURL }}` variable with the invitation link
- **Redirect**: After accepting, user is redirected to `https://natively.dev/email-confirmed`

## Benefits of This Solution

1. **Automatic Email Delivery**: No need for manual email sending logic
2. **Secure**: Uses Supabase's built-in security mechanisms
3. **User-Friendly**: Players receive a clear invitation with instructions
4. **Reliable**: Leverages Supabase's email infrastructure
5. **Customizable**: Email templates can be customized in Supabase Dashboard
6. **No Temporary Passwords**: Players set their own password from the start

## Testing the Solution

### To Test
1. Log in as an admin user
2. Navigate to the Admin/Profile section
3. Click "Opret Spillerprofil" (Create Player Profile)
4. Fill in:
   - Player name
   - Player email (use a real email you can access)
   - Optional phone number
5. Click "Send Invitation"
6. Check the email inbox for the invitation email
7. Click the link in the email
8. Set a password
9. Log in to the app with the new credentials

### Expected Results
- ✅ Player account created in database
- ✅ Invitation email received within 1-2 minutes
- ✅ Email contains a working invitation link
- ✅ Player can set their password
- ✅ Player can log in to the app
- ✅ Player has "player" role (limited access)
- ✅ Admin-player relationship established

## Email Configuration

### Default Settings
Supabase uses its own SMTP server by default, which should work out of the box.

### Custom SMTP (Optional)
If you want to use a custom email provider:
1. Go to Supabase Dashboard → Authentication → Email Templates
2. Configure SMTP settings
3. Customize email templates if needed

### Email Template Customization
To customize the invitation email:
1. Go to Supabase Dashboard → Authentication → Email Templates
2. Select "Invite user" template
3. Customize the subject and content
4. Use template variables:
   - `{{ .ConfirmationURL }}` - The invitation link
   - `{{ .Email }}` - The user's email
   - `{{ .SiteURL }}` - Your app's URL

## Troubleshooting

### If Email Is Not Received

1. **Check Spam Folder**: Invitation emails might be filtered as spam
2. **Verify Email Address**: Ensure the email address is correct
3. **Check Supabase Logs**: 
   ```bash
   # View Edge Function logs
   supabase functions logs create-player
   ```
4. **Check Auth Logs**: Go to Supabase Dashboard → Authentication → Logs
5. **Verify SMTP Settings**: Ensure email sending is enabled in your project
6. **Rate Limits**: Check if you've hit email sending rate limits

### Common Issues

**Issue**: "User already exists"
- **Solution**: The email is already registered. Use a different email or delete the existing user first.

**Issue**: Email not arriving
- **Solution**: 
  - Check spam folder
  - Verify email address is correct
  - Check Supabase email logs
  - Ensure email sending is enabled in project settings

**Issue**: Invitation link expired
- **Solution**: Invitation links expire after 24 hours. Create a new invitation.

## Additional Notes

### Security Considerations
- Invitation links are single-use and expire after 24 hours
- Links are cryptographically secure
- Users must set their own password (no default passwords)
- Admin verification is required before creating players

### Future Enhancements
- Custom email templates with branding
- Resend invitation functionality
- Invitation expiry notifications
- Bulk player invitations

## Deployment

The updated Edge Function has been deployed as version 7:
- **Function**: `create-player`
- **Version**: 7
- **Status**: ACTIVE
- **Deployment Date**: 2025-01-13

## Conclusion

The invitation email issue has been resolved by switching from `auth.admin.createUser()` to `auth.admin.inviteUserByEmail()`. This ensures that:
1. Players receive an invitation email automatically
2. The email contains a secure link to set up their account
3. The process is reliable and uses Supabase's built-in infrastructure
4. No manual email sending logic is required

The solution is now live and ready for testing.
