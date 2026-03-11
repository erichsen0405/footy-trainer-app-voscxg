# Club Admin Invite Flow

## Backend status

Supabase backend does now:

- create/resend club invites with secure tokens
- send real invite emails via AWS SES
- generate Supabase auth links server-side
- choose auth flow per invitee email:
  - `invite` for users that do not exist in `auth.users`
  - `magiclink` for users that already exist
- keep seat, license and email-match checks server-side

## Required env vars for edge functions

- `AWS_SES_REGION`
- `AWS_SES_ACCESS_KEY_ID`
- `AWS_SES_SECRET_ACCESS_KEY`
- `AWS_SES_SESSION_TOKEN` optional
- `CLUB_INVITE_FROM_EMAIL`
- `CLUB_INVITE_FROM_NAME` optional
- `CLUB_INVITE_APP_NAME` optional
- `CLUB_INVITE_LANDING_URL`
- `CLUB_INVITE_AUTH_REDIRECT_URL`

## Frontend contract

### 1. Invite landing page

URL:

- `CLUB_INVITE_LANDING_URL?token=<club_invite_token>`

Expected behavior:

- read `token`
- call `getClubInviteByToken`
- show club name, role and invited email
- if no Supabase session: show login/signup CTA
- if session exists: call `acceptClubInvite`

### 2. Auth callback page

URL:

- `CLUB_INVITE_AUTH_REDIRECT_URL?clubInviteToken=<club_invite_token>&...supabase_auth_params`

Expected behavior:

- complete Supabase auth session from callback params
- read `clubInviteToken`
- if callback type is `invite`, send user to password setup before acceptance
- if callback type is `magiclink`, continue directly to invite acceptance

### 3. Password setup for new invited users

Expected behavior:

- after `invite` callback, user has a temporary authenticated session
- frontend should let the user set a password with `supabase.auth.updateUser({ password })`
- afterwards call `acceptClubInvite({ token, fullName? })`

### 4. Acceptance

Backend checks in `acceptClubInvite`:

- invite exists
- invite is still pending
- invite email matches `auth.users.email`
- license is active
- seat is available

On success:

- `club_members` is inserted or reactivated
- invite is marked `accepted`
- frontend should call `getCurrentUserClubContext`
