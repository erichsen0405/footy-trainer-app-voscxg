
# Xcode Debug Guide - Find og Brug Xcode Projektet

## Oversigt
Denne guide forklarer hvordan du finder og bruger Xcode projektet til at debugge din Natively/Expo app. Xcode projektet findes **ikke** i GitHub som standard - det skal genereres lokalt.

## Forudsætninger
- Du skal have en Mac
- Xcode skal være installeret (download fra Mac App Store)
- Du skal have projekt-koden klonet fra GitHub
- Node.js og npm skal være installeret

## Trin 1: Generer iOS Projektet

Xcode projektet genereres ved at køre en "prebuild" kommando. Dette opretter en `ios/` mappe med alle native iOS filer.

### I din terminal, naviger til projekt-mappen og kør:

```bash
# Installer dependencies først (hvis ikke allerede gjort)
npm install

# Generer iOS projektet
npx expo prebuild -p ios
```

### Hvad sker der?
- Expo opretter en `ios/` mappe i din projekt-rod
- Denne mappe indeholder et komplet Xcode projekt
- Alle native konfigurationer fra `app.json` anvendes

**VIGTIGT:** `ios/` mappen er normalt i `.gitignore`, så den skal genereres på hver udvikler-maskine.

## Trin 2: Åbn Projektet i Xcode

Efter prebuild, finder du Xcode projektet her:

```
<dit-projekt>/ios/<projektnavn>.xcworkspace
```

### Åbn projektet:

**Metode 1 - Fra Terminal:**
```bash
# Naviger til projekt-mappen
cd <dit-projekt>

# Åbn workspace filen (IKKE .xcodeproj!)
open ios/*.xcworkspace
```

**Metode 2 - Fra Finder:**
1. Åbn Finder
2. Naviger til din projekt-mappe
3. Gå ind i `ios/` mappen
4. Find filen der ender med `.xcworkspace` (f.eks. `Natively.xcworkspace`)
5. Dobbeltklik på den

**VIGTIGT:** Åbn altid `.xcworkspace` filen, IKKE `.xcodeproj` filen! Workspace filen inkluderer alle dependencies.

## Trin 3: Konfigurer Signing i Xcode

Før du kan køre appen på en device eller simulator, skal du konfigurere code signing:

1. I Xcode, klik på projektnavnet i venstre sidebar (øverst)
2. Vælg target (samme navn som projektet)
3. Gå til "Signing & Capabilities" tab
4. Under "Signing":
   - Vælg dit development team (dit Apple ID)
   - Hvis du ikke har et team, tilføj dit Apple ID under Xcode > Settings > Accounts
   - Xcode opretter automatisk en development certificate

## Trin 4: Kør Appen i Debug Mode

### Start Metro Bundler Først (VIGTIGT!)

Expo apps har brug for Metro bundler til at køre. Start det i en separat terminal:

```bash
# I projekt-mappen
npm run ios
# ELLER
npx expo start
```

Lad denne terminal køre - den håndterer JavaScript bundling.

### Kør fra Xcode

1. I Xcode, vælg en destination (simulator eller din device) fra dropdown øverst
2. Tryk på "Play" knappen (▶️) eller tryk `Cmd + R`
3. Xcode bygger og installerer appen
4. Appen starter og forbinder til Metro bundler

## Trin 5: Se Logs og Debug

### Se Console Logs

**Console Logs (fra din app's console.log statements):**
1. Klik på "Debug area" knappen nederst i Xcode (eller tryk `Cmd + Shift + Y`)
2. Se output området nederst
3. Her ser du:
   - Native iOS logs
   - JavaScript console.log output (når Metro kører)
   - Build output
   - Runtime fejl

**Filtrer Logs:**
- Brug søgefeltet nederst til højre til at filtrere logs
- Skriv f.eks. "ERROR" eller "WARNING" for at finde problemer

### Avanceret Debugging

**Breakpoints:**
1. Klik på linjenummer i Xcode for at sætte et breakpoint
2. Når koden når breakpoint, pauses appen
3. Inspicér variable i Debug området

**View Hierarchy:**
1. Kør appen i debug mode
2. Klik på "Debug View Hierarchy" knappen (📱 ikon i debug toolbar)
3. Se 3D visualisering af alle UI elementer

**Memory og Performance:**
1. Product > Profile (eller `Cmd + I`)
2. Vælg "Instruments" template (Time Profiler, Allocations, etc.)
3. Analysér appens performance

## Trin 6: Håndter Almindelige Problemer

### Problem: "No signing certificate found"
**Løsning:** 
- Gå til Xcode > Settings > Accounts
- Tilføj dit Apple ID
- Vælg dit team under Signing & Capabilities

### Problem: "Could not connect to development server"
**Løsning:**
- Sørg for Metro bundler kører (`npx expo start`)
- Check at din Mac og simulator/device er på samme netværk
- Restart Metro bundler

### Problem: Appen crasher ved opstart
**Løsning:**
- Check Console logs i Xcode for error messages
- Kør `npx expo start --clear` for at rydde cache
- Genbyg projektet: Product > Clean Build Folder (`Cmd + Shift + K`)

### Problem: "ios/ mappe findes ikke"
**Løsning:**
- Kør `npx expo prebuild -p ios` igen
- Sørg for du er i projekt-roden

## Trin 7: Send Logs til AI Support

Når du har en fejl og vil dele logs:

### Console Logs:
1. Reproducer fejlen i Xcode
2. Se Console output nederst i Xcode
3. Højreklik på relevant log output > Copy
4. Indsæt i din support request

### Crash Logs:
1. Window > Devices and Simulators
2. Vælg din device/simulator
3. Se "Console" sektionen for crash logs
4. Kopiér relevante logs

### Full Log Export:
```bash
# I terminal, mens appen kører
xcrun simctl spawn booted log stream --level debug > app_logs.txt
```

## Workflow Oversigt

Din daglige debug workflow:

```bash
# Terminal 1 - Start Metro
npx expo start

# Terminal 2 - Åbn Xcode (første gang eller efter ændringer til native kode)
open ios/*.xcworkspace
```

Derefter i Xcode:
1. Vælg simulator/device
2. Tryk Play (▶️)
3. Se logs i Console området
4. Reproducer bugs og noter fejlbeskeder

## Hvornår Skal Du Regenere ios/ Mappen?

Regenerér med `npx expo prebuild -p ios` når:
- Du ændrer native konfiguration i `app.json`
- Du tilføjer native dependencies/plugins
- Du opdaterer Expo SDK version
- Native filer bliver korrupte

For normale kode-ændringer behøver du IKKE regenere - bare rebuild i Xcode.

## Yderligere Ressourcer

- Expo Prebuild Docs: https://docs.expo.dev/workflow/prebuild/
- Xcode Debugging Guide: https://developer.apple.com/documentation/xcode/debugging
- React Native Debugging: https://reactnative.dev/docs/debugging

## Hurtig Reference

| Handling | Kommando |
|----------|----------|
| Generer iOS projekt | `npx expo prebuild -p ios` |
| Åbn i Xcode | `open ios/*.xcworkspace` |
| Start Metro | `npx expo start` |
| Ryd cache | `npx expo start --clear` |
| Clean build | `Cmd + Shift + K` i Xcode |
| Rebuild | `Cmd + R` i Xcode |
| Toggle console | `Cmd + Shift + Y` i Xcode |

---

## Svar på Dit Specifikke Spørgsmål

**"Skal jeg finde denne fil i vores Github projekt?"**

**Nej!** Xcode projektet (`ios/` mappen) er normalt IKKE i GitHub. Den er i `.gitignore`.

**Hvad skal du gøre?**

1. Klon GitHub projektet til din Mac
2. Kør `npx expo prebuild -p ios` i projekt-mappen
3. Dette opretter `ios/` mappen lokalt på din Mac
4. Åbn `ios/*.xcworkspace` i Xcode
5. Nu kan du debugge!

**Hvorfor er det ikke i GitHub?**

Expo genererer native kode baseret på din konfiguration. Ved at holde den ude af Git:
- Holder vi repositoryet rent
- Undgår vi merge konflikter i native kode
- Kan hver udvikler generere projektet til deres specifikke setup

**Er der forbindelse til Natively?**

Natively bygger din app ved at:
1. Tage din kode fra GitHub
2. Køre `expo prebuild` på deres servere
3. Bygge appen med Xcode/Android Studio
4. Producere den færdige app

Du replicerer trin 1-2 lokalt for at kunne debugge!
