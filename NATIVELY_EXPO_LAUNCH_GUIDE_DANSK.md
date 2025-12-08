
# Guide til Natively med GitHub Integration og Expo Launch

Denne guide forklarer hvordan du bruger Natively til at udvikle din app med GitHub integration og deployer den med Expo Launch. Guiden er specifikt rettet mod debugging og fejlfinding.

## 1. Forudsætninger

Før du starter, skal du sikre dig at du har:

- En Natively konto med et aktivt projekt
- En GitHub konto
- En Expo konto (opret en på [https://expo.dev/signup](https://expo.dev/signup))
- Expo CLI installeret globalt: `npm install -g expo-cli`

## 2. GitHub Integration i Natively

### 2.1 Verificer GitHub Connection
1. Log ind på din Natively konto på [https://natively.dev](https://natively.dev)
2. Åbn dit projekt
3. Gå til projekt indstillinger
4. Verificer at dit projekt er forbundet til dit GitHub repository
5. Alle ændringer du laver i Natively bliver automatisk committet til GitHub

### 2.2 Tjek Repository Status
- Gå til dit GitHub repository
- Verificer at de seneste ændringer fra Natively er synlige
- Tjek at alle filer er opdateret (især `app.json`, `package.json`, og dine source filer)

## 3. Lokal Udvikling med Expo Development Server

### 3.1 Clone Repository Lokalt
```bash
# Clone dit GitHub repository
git clone https://github.com/DIT-BRUGERNAVN/DIT-REPO-NAVN.git
cd DIT-REPO-NAVN

# Installer dependencies
npm install
```

### 3.2 Start Expo Development Server
```bash
# Start development server
npx expo start
```

Dette åbner Expo Developer Tools i din browser og viser en QR kode.

### 3.3 Test på Din Enhed

**Med Expo Go (Hurtig test):**
1. Download Expo Go app på din iPhone/Android
2. Scan QR koden fra terminalen
3. Appen loader på din enhed

**Med Development Build (Anbefalet til debugging):**
```bash
# Byg en development build
npx expo run:ios
# eller
npx expo run:android
```

## 4. Debugging Workflow

### 4.1 Samle Logs fra Expo Development Server

Når du kører `npx expo start`, vil du se logs i terminalen:

```bash
# Logs vises automatisk i terminalen
# Eksempel output:
› Opening on iPhone 15 Pro
› Opening exp://192.168.1.100:8081 on iPhone 15 Pro
› Press ? │ show all commands

LOG  [useFootballData] Loading activities...
LOG  [useFootballData] Loaded 15 activities
ERROR [ActivityDetails] Failed to load activity: Network error
```

### 4.2 Kopier Logs til Debugging

1. **Kopier logs fra terminalen:**
   - Marker og kopier relevante log linjer
   - Inkluder både LOG, WARN, og ERROR beskeder
   - Inkluder timestamps hvis muligt

2. **Brug Console Logs komponenten:**
   - Din app har en `/console-logs` route
   - Naviger til denne side i appen for at se logs
   - Logs kan kopieres direkte herfra

3. **Send logs til AI assistenten:**
   ```
   Her er logs fra min Expo development server:
   
   [Indsæt logs her]
   
   Problemet er: [Beskriv problemet]
   ```

### 4.3 Detaljeret Debugging

**For iOS specifik debugging:**
```bash
# Byg og kør i Xcode for mere detaljerede logs
npx expo prebuild -p ios
cd ios
open .
# Åbn .xcworkspace filen i Xcode
# Kør appen fra Xcode og se logs i Console
```

**For Android specifik debugging:**
```bash
# Byg og kør i Android Studio
npx expo prebuild -p android
cd android
# Åbn projektet i Android Studio
# Kør appen og se Logcat
```

## 5. Deployment med Expo Launch

### 5.1 Forbered til Deployment

1. **Sync med GitHub:**
   - Gå til Natively web interface
   - Verificer at alle ændringer er gemt
   - Tjek at GitHub repository er opdateret

2. **Verificer app.json:**
   - Tjek at `version` er korrekt
   - Verificer `bundleIdentifier` (iOS) og `package` (Android)
   - Sikr at `name` og `slug` er korrekte

### 5.2 Konfigurer EAS (Expo Application Services)

```bash
# Log ind på Expo
expo login

# Initialiser EAS (hvis ikke allerede gjort)
eas build:configure
```

Dette opretter en `eas.json` fil i dit projekt.

### 5.3 Byg til Production

**For iOS:**
```bash
# Byg til App Store
eas build --platform ios --profile production

# Eller byg til TestFlight
eas build --platform ios --profile preview
```

**For Android:**
```bash
# Byg til Google Play
eas build --platform android --profile production

# Eller byg til intern test
eas build --platform android --profile preview
```

### 5.4 Monitor Build Process

1. **I terminalen:**
   - Du får et link til build status
   - Eksempel: `https://expo.dev/accounts/USERNAME/projects/PROJECT/builds/BUILD_ID`

2. **På Expo Dashboard:**
   - Gå til [https://expo.dev](https://expo.dev)
   - Naviger til dit projekt
   - Klik på "Builds" i sidemenuen
   - Se build status, logs, og download links

### 5.5 Download og Test Build

Når build er færdig:

1. **iOS (.ipa fil):**
   - Download fra Expo dashboard
   - Upload til TestFlight via App Store Connect
   - Test på rigtige enheder

2. **Android (.aab eller .apk fil):**
   - Download fra Expo dashboard
   - Upload til Google Play Console (Internal Testing)
   - Test på rigtige enheder

## 6. Natively Workflow Integration

### 6.1 Udviklings Cyklus

```
1. Lav ændringer i Natively web interface
   ↓
2. Ændringer committes automatisk til GitHub
   ↓
3. Pull ændringer lokalt: git pull
   ↓
4. Test med Expo Development Server: npx expo start
   ↓
5. Samle logs og debug
   ↓
6. Hvis fejl: Send logs til AI assistent
   ↓
7. AI laver fixes i Natively
   ↓
8. Gentag fra trin 2
```

### 6.2 Når Klar til Deployment

```
1. Verificer alle ændringer er i GitHub
   ↓
2. Test grundigt med development build
   ↓
3. Opdater version i app.json
   ↓
4. Kør EAS build: eas build --platform all --profile production
   ↓
5. Monitor build på Expo dashboard
   ↓
6. Download og test builds
   ↓
7. Submit til app stores: eas submit
```

## 7. Troubleshooting

### 7.1 Build Fejler

**Problem:** EAS build fejler med "Missing credentials"
**Løsning:**
```bash
# Generer credentials
eas credentials
# Følg prompten for at oprette nye credentials
```

**Problem:** Build fejler med "Dependency error"
**Løsning:**
```bash
# Ryd cache og reinstaller
rm -rf node_modules package-lock.json
npm install
```

### 7.2 Runtime Fejl

**Problem:** App crasher ved opstart
**Løsning:**
1. Kør `npx expo start --clear` for at rydde cache
2. Tjek logs i Expo development server
3. Verificer at alle dependencies er installeret korrekt

**Problem:** Funktionalitet virker ikke som forventet
**Løsning:**
1. Samle detaljerede logs fra development server
2. Tjek console logs i appen (`/console-logs` route)
3. Send logs til AI assistent med beskrivelse af problemet

### 7.3 GitHub Sync Issues

**Problem:** Ændringer fra Natively vises ikke i GitHub
**Løsning:**
1. Tjek Natively projekt indstillinger
2. Verificer GitHub connection
3. Kontakt Natively support hvis problemet fortsætter

## 8. Best Practices

### 8.1 Udvikling
- Commit ofte til GitHub (Natively gør dette automatisk)
- Test på rigtige enheder, ikke kun simulator
- Brug development builds til debugging, ikke Expo Go
- Hold logs organiserede og læsbare

### 8.2 Debugging
- Tilføj console.log statements strategisk i koden
- Brug try-catch blokke med detaljeret error logging
- Test på både iOS og Android
- Dokumenter fejl og løsninger

### 8.3 Deployment
- Test grundigt før production build
- Opdater version nummer for hver release
- Gem build logs for reference
- Test downloaded builds før submission til stores

## 9. Nyttige Kommandoer

```bash
# Start development server
npx expo start

# Start med cleared cache
npx expo start --clear

# Byg development build
npx expo run:ios
npx expo run:android

# Log ind på Expo
expo login

# Tjek EAS build status
eas build:list

# Submit til app stores
eas submit --platform ios
eas submit --platform android

# Se projekt info
eas project:info

# Pull seneste ændringer fra GitHub
git pull origin main
```

## 10. Ressourcer

- **Natively Documentation:** [https://natively.dev/docs](https://natively.dev/docs)
- **Expo Documentation:** [https://docs.expo.dev](https://docs.expo.dev)
- **EAS Build Documentation:** [https://docs.expo.dev/build/introduction/](https://docs.expo.dev/build/introduction/)
- **EAS Submit Documentation:** [https://docs.expo.dev/submit/introduction/](https://docs.expo.dev/submit/introduction/)
- **Expo Development Builds:** [https://docs.expo.dev/develop/development-builds/introduction/](https://docs.expo.dev/develop/development-builds/introduction/)

## 11. Support

Hvis du støder på problemer:

1. **Tjek logs først** - De fleste problemer kan diagnosticeres fra logs
2. **Søg i Expo documentation** - Mange almindelige problemer er dokumenteret
3. **Send detaljerede logs til AI assistent** - Inkluder:
   - Fulde error logs
   - Beskrivelse af hvad du forsøgte at gøre
   - Hvilke trin du har taget for at løse problemet
   - Platform (iOS/Android) og version
4. **Kontakt Natively support** - For platform-specifikke problemer

---

**Vigtig Note:** Denne guide antager at du bruger Natively's managed workflow. Hvis du har brug for native code modifications, skal du muligvis bruge `npx expo prebuild` for at generere native projekter, men dette kan påvirke Natively's automatiske build process.
