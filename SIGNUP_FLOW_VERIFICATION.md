
# Signup Flow Verification

## ✅ Current Implementation Status

### Main User Signup (Correct Implementation)
**Location:** `app/(tabs)/profile.tsx` (lines 285-310)

The signup flow is **correctly implemented** using client-side Supabase authentication:

```typescript
const { data, error } = await supabase.auth.signUp({
  email,
  password,
  options: {
    emailRedirectTo: 'natively://auth-callback'
  }
});
```

**✅ Follows all requirements:**
- Uses `supabase.auth.signUp()` from the client SDK
- Passes email and password directly
- Does NOT use admin APIs, service role keys, or Edge Functions
- Includes `emailRedirectTo` for Natively environment
- Relies on Supabase's built-in email confirmation flow
- Shows proper confirmation alert to users

### Expected Behavior
1. User fills in email and password in the app
2. `supabase.auth.signUp()` is called from the frontend
3. User is created with `email_confirmed = false`
4. Supabase automatically sends a confirmation email
5. User clicks the confirmation link in their email
6. User is redirected to `natively://auth-callback`
7. After confirmation, user can sign in normally
8. Upon first login, user is prompted to select their role (player/trainer)
9. If trainer, user is prompted to select a subscription

### Email Confirmation Alert
The app properly shows an alert after signup:
```typescript
Alert.alert(
  'Bekræft din email ✉️',
  `Vi har sendt en bekræftelsesmail til ${email}.\n\n` +
  `Tjek venligst din indbakke og klik på linket for at aktivere din konto.\n\n` +
  `⚠️ Bemærk: Tjek også din spam-mappe hvis du ikke kan finde emailen.\n\n` +
  `Når du bekræfter din email og logger ind, vil du blive bedt om at vælge din rolle (spiller eller træner).`,
  [{ text: 'OK' }]
);
```

## ⚠️ Separate Use Case: Player Creation by Admins

**Location:** `supabase/functions/create-player/index.ts`

This Edge Function is used when **admins/trainers create player accounts** for their team members. This is a different use case from the main signup flow and is acceptable because:

1. It's not used for the main user signup
2. It's only accessible to authenticated admins
3. It uses `inviteUserByEmail()` which sends an invitation email
4. Players still need to confirm their email and set their password
5. This is a legitimate admin function for team management

**This does NOT interfere with the main signup flow.**

## 🔍 Verification Steps

To verify the signup flow is working correctly:

1. **Create a new user from the app UI:**
   - Open the app
   - Go to Profile tab
   - Click "Opret konto" (Create account)
   - Enter email and password
   - Click "Opret konto" button

2. **Check Supabase Auth logs:**
   - Go to Supabase Dashboard → Authentication → Logs
   - Look for `user.signup` event
   - Look for `confirmation_email_sent` event

3. **Confirm email receipt:**
   - Check the email inbox for the confirmation email
   - Verify the email contains a clickable confirmation link

4. **Complete signup:**
   - Click the confirmation link in the email
   - Verify it redirects to the app (`natively://auth-callback`)
   - Log in with the email and password
   - Verify the role selection screen appears
   - Select a role (player or trainer)
   - If trainer, verify subscription selection appears

## 📋 Supabase Configuration Checklist

Ensure the following settings are configured in Supabase Dashboard:

### Authentication Settings
- **Email Confirmation:** Enabled (default)
- **Site URL:** `https://natively.dev` or your production URL
- **Redirect URLs:** Include `natively://auth-callback`

### Email Templates
Verify the confirmation email template includes:
- `{{ .ConfirmationURL }}` variable for the confirmation link
- Clear instructions for users

### RLS Policies
Ensure proper RLS policies are in place for:
- `user_roles` table
- `profiles` table
- `subscriptions` table
- `admin_player_relationships` table

## 🎯 Summary

**The main signup flow is correctly implemented and follows all requirements:**
- ✅ Client-side authentication only
- ✅ No admin APIs in signup flow
- ✅ No service role keys in frontend
- ✅ Email confirmation required
- ✅ Proper redirect URL for Natively
- ✅ Clear user feedback

**No changes needed to the signup implementation.**

The only admin API usage is in the `create-player` Edge Function, which is a separate use case for admins creating player accounts and is acceptable.
