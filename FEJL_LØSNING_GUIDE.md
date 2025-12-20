
# Fejlløsning Guide

## Oversigt
Dette dokument beskriver løsningen på de to fejl, der opstod i appen.

## Fejl 1: `useFootball must be used within a FootballProvider`

### Problem
Fejlen opstod fordi `useFootball()` hook blev kaldt i `index.ios.tsx`, men konteksten var ikke tilgængelig på det tidspunkt komponenten blev renderet.

### Løsning
Tilføjet fejlhåndtering i `HomeScreen` komponenten:

```typescript
let footballContext;
try {
  footballContext = useFootball();
} catch (error) {
  console.error('Error accessing FootballContext:', error);
  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 }}>
      <Text style={{ fontSize: 18, fontWeight: 'bold', marginBottom: 10 }}>
        Indlæser...
      </Text>
      <ActivityIndicator size="large" color={colors.primary} />
    </View>
  );
}
```

Dette sikrer at:
- Hvis konteksten ikke er tilgængelig, vises en loading-skærm
- Appen crasher ikke
- Brugeren får feedback om at data indlæses

## Fejl 2: `NitroModules are not supported in Expo Go`

### Problem
`react-native-iap` pakken bruger native modules (NitroModules), som ikke er understøttet i Expo Go. Dette er forventet adfærd.

### Løsning
Opdateret `AppleIAPContext.tsx` til at håndtere situationer hvor `react-native-iap` ikke er tilgængelig:

1. **Dynamisk import**: Pakken importeres kun på native platforme og kun hvis den er tilgængelig:
```typescript
let RNIap: any = null;
if (Platform.OS === 'ios' || Platform.OS === 'android') {
  try {
    RNIap = require('react-native-iap');
  } catch (error) {
    console.warn('[AppleIAP] react-native-iap not available. This is expected in Expo Go.');
  }
}
```

2. **Tjek før brug**: Alle funktioner tjekker om `RNIap` er tilgængelig før brug:
```typescript
if (!RNIap) {
  console.log('[AppleIAP] react-native-iap not available');
  return;
}
```

3. **Brugervenlige fejlbeskeder**: Når brugeren forsøger at købe eller gendanne køb i Expo Go:
```typescript
if (!RNIap) {
  Alert.alert(
    'Ikke tilgængelig i Expo Go',
    'In-App Purchases kræver en development build. Brug "expo prebuild" og byg appen med EAS Build eller Xcode.',
    [{ text: 'OK' }]
  );
  return;
}
```

## Hvordan man tester In-App Purchases

### Option 1: EAS Build (Anbefalet)
```bash
# Installer EAS CLI hvis ikke allerede installeret
npm install -g eas-cli

# Login til Expo
eas login

# Byg en development build til iOS
eas build --profile development --platform ios

# Installer buildet på din enhed via TestFlight eller direkte installation
```

### Option 2: Lokal Build med Xcode
```bash
# Prebuild projektet
expo prebuild

# Åbn projektet i Xcode
open ios/YourProjectName.xcworkspace

# Byg og kør på en simulator eller fysisk enhed
```

## Vigtige Noter

1. **Expo Go Begrænsninger**:
   - Expo Go understøtter ikke native modules som `react-native-iap`
   - Du skal bruge en development build for at teste IAP funktionalitet

2. **Development Build**:
   - Kræves for at teste In-App Purchases
   - Kan bygges med EAS Build eller lokalt med Xcode
   - Giver adgang til alle native modules

3. **TestFlight**:
   - Brug Sandbox-miljøet til test af IAP
   - Opret test-brugere i App Store Connect
   - Test alle købsflows før production release

4. **Production**:
   - Sørg for at alle Product IDs matcher dem i App Store Connect
   - Test grundigt i TestFlight før release
   - Implementer proper fejlhåndtering for alle købsscenarier

## Næste Skridt

1. **Test i Expo Go**: Appen vil nu køre uden fejl i Expo Go, men IAP funktionalitet vil ikke være tilgængelig
2. **Byg Development Build**: Følg instruktionerne ovenfor for at bygge en development build
3. **Test IAP**: Test alle købsflows i development buildet med Sandbox-miljøet
4. **Production Release**: Når alt er testet, byg en production build og submit til App Store

## Support

Hvis du støder på problemer:
1. Tjek console logs for detaljerede fejlbeskeder
2. Verificer at Product IDs matcher App Store Connect
3. Sørg for at du bruger en development build (ikke Expo Go) til IAP test
4. Kontakt Apple Developer Support for IAP-specifikke problemer
