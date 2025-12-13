
# Undersøgelse af Invitation Email Problem

## Problem
Invitation emails bliver ikke sendt når der oprettes nye spillere gennem `create-player` Edge Function.

## Analyse

### 1. Edge Function Implementation ✅
Edge Function `create-player` er korrekt implementeret:
- Bruger `auth.admin.inviteUserByEmail()` metoden (korrekt)
- Sender `redirectTo` parameter
- Logger viser succesfulde opkald (HTTP 200 status)
- Returnerer success beskeder

### 2. Logs Analyse
Fra Edge Function logs:
```
POST | 200 | create-player (flere succesfulde opkald)
```
Dette viser at funktionen kører uden fejl og returnerer success.

### 3. Root Cause: SMTP Konfiguration ⚠️

**Supabase's Standard Email Service har begrænsninger:**

#### For Hosted Projekter (som dit):
Supabase leverer en standard email service MED BEGRÆNSNINGER:

1. **Kun til autoriserede adresser**: 
   - Emails sendes KUN til medlemmer af projektets organisation
   - Andre email adresser får fejlen: "Email address not authorized"
   
2. **Rate limits**:
   - Maksimum 30 emails per time
   - Kan ændres uden varsel
   
3. **Ingen SLA garanti**:
   - Best-effort levering
   - Kun til test/udvikling

#### Hvorfor virker det ikke?
Når du prøver at invitere en spiller med en email der IKKE er medlem af din Supabase organisation, bliver emailen blokeret af Supabase's standard SMTP service.

## Løsning

### Option 1: Tilføj Test Emails til Organisation (Hurtig Test)
For at teste systemet:
1. Gå til [Team tab](https://supabase.com/dashboard/org/pcfobkhxwssokwikcvja/team)
2. Tilføj test email adresser som medlemmer
3. Prøv at oprette spillere med disse emails

**Begrænsning**: Kun brugbart til test, ikke produktion.

### Option 2: Konfigurer Custom SMTP (Anbefalet til Produktion) ⭐

#### Trin 1: Vælg en Email Service Provider
Anbefalede services:
- **Resend** (populær, nem at sætte op)
- **AWS SES** (billig, pålidelig)
- **Postmark** (god til transactional emails)
- **Twilio SendGrid**
- **Brevo**

#### Trin 2: Opsæt SMTP i Supabase
1. Gå til [Authentication Settings](https://supabase.com/dashboard/project/lhpczofddvwcyrgotzha/settings/auth)
2. Find "SMTP Settings" sektionen
3. Aktiver "Enable Custom SMTP"
4. Indtast dine SMTP credentials:
   - SMTP Host (f.eks. `smtp.resend.com`)
   - SMTP Port (typisk 587)
   - SMTP User
   - SMTP Password
   - Sender Email (f.eks. `no-reply@dindomæne.dk`)
   - Sender Name (f.eks. "Soccer Planner")

#### Trin 3: Juster Rate Limits
Efter SMTP opsætning:
1. Gå til [Rate Limits](https://supabase.com/dashboard/project/lhpczofddvwcyrgotzha/auth/rate-limits)
2. Juster email rate limit fra 30/time til passende værdi

#### Eksempel: Opsætning med Resend

1. **Opret Resend konto**: https://resend.com
2. **Få API key**: Dashboard → API Keys
3. **SMTP credentials**:
   ```
   Host: smtp.resend.com
   Port: 587
   Username: resend
   Password: [din API key]
   ```

#### Eksempel: Opsætning med AWS SES

1. **Opret AWS konto og verificer domæne**
2. **Opret SMTP credentials** i SES console
3. **SMTP credentials**:
   ```
   Host: email-smtp.[region].amazonaws.com
   Port: 587
   Username: [SMTP username]
   Password: [SMTP password]
   ```

## Test Plan

### Efter SMTP Opsætning:
1. Opret en test spiller med en ny email adresse
2. Check email indbakke (også spam folder)
3. Verificer at invitation email er modtaget
4. Klik på invitation link
5. Verificer at spilleren kan oprette password

### Debugging hvis det stadig ikke virker:
1. Check Supabase Auth logs:
   - Gå til [Logs](https://supabase.com/dashboard/project/lhpczofddvwcyrgotzha/logs/auth-logs)
   - Søg efter email send events
   
2. Check SMTP provider logs:
   - Log ind på din SMTP provider
   - Check for send failures eller bounces

## Best Practices

### Email Template Konfiguration
1. Gå til [Email Templates](https://supabase.com/dashboard/project/lhpczofddvwcyrgotzha/auth/templates)
2. Tilpas "Invite user" template:
   ```html
   <h2>Du er inviteret til Soccer Planner</h2>
   <p>Klik på linket nedenfor for at oprette din adgangskode:</p>
   <p><a href="{{ .ConfirmationURL }}">Opret adgangskode</a></p>
   ```

### Sikkerhed
- Brug separate domæner for auth emails (`auth.dindomæne.dk`)
- Konfigurer DKIM, DMARC og SPF records
- Brug ikke samme SMTP til marketing emails

### Monitoring
- Overvåg email delivery rates
- Sæt alerts op for failed sends
- Check spam rates regelmæssigt

## Næste Skridt

1. **Umiddelbart** (for test):
   - Tilføj test emails til organisation
   - Verificer at invitation flow virker

2. **Før produktion**:
   - Vælg og opsæt custom SMTP provider
   - Test grundigt med forskellige email providers
   - Konfigurer email templates
   - Sæt passende rate limits

3. **Produktion**:
   - Overvåg email delivery
   - Håndter bounces og failures
   - Implementer retry logic hvis nødvendigt

## Ressourcer

- [Supabase Custom SMTP Guide](https://supabase.com/docs/guides/auth/auth-smtp)
- [Email Templates Guide](https://supabase.com/docs/guides/auth/auth-email-templates)
- [Resend Documentation](https://resend.com/docs)
- [AWS SES Documentation](https://docs.aws.amazon.com/ses/)

## Konklusion

Problemet er IKKE i din kode - Edge Function virker perfekt! 

Problemet er at Supabase's standard email service kun sender til autoriserede email adresser (organisation medlemmer). For at sende invitation emails til spillere skal du opsætte en custom SMTP provider.

Dette er en standard begrænsning i Supabase for at forhindre spam og beskytte deres email reputation.
