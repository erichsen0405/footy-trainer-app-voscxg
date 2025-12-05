
# 🍎 iOS Notification Troubleshooting Guide

## Problem: Notifikationer virker ikke på iPhone

Dette dokument indeholder en komplet guide til at løse notifikationsproblemer på iOS.

---

## ✅ IMPLEMENTEREDE LØSNINGER

### 1. iOS-Specifik Notification Handler
**Problem:** iOS kræver eksplicit konfiguration af notification handler.

**Løsning:**
```typescript
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    // iOS specific
    ...(Platform.OS === 'ios' && {
      shouldShowAlert: true,
    }),
  }),
});
```

### 2. iOS Notification Categories
**Problem:** iOS kræver notification categories for at vise actions.

**Løsning:**
```typescript
await Notifications.setNotificationCategoryAsync('task-reminder', [
  {
    identifier: 'mark-complete',
    buttonTitle: 'Marker som færdig',
    options: {
      opensAppToForeground: false,
    },
  },
  {
    identifier: 'view-task',
    buttonTitle: 'Se opgave',
    options: {
      opensAppToForeground: true,
    },
  },
]);
```

### 3. Eksplicit iOS Permission Request
**Problem:** iOS kræver eksplicitte permissions for alerts, badges og sounds.

**Løsning:**
```typescript
const requestOptions = Platform.OS === 'ios' ? {
  ios: {
    allowAlert: true,
    allowBadge: true,
    allowSound: true,
    allowDisplayInCarPlay: false,
    allowCriticalAlerts: false,
    provideAppNotificationSettings: false,
    allowProvisional: false,
    allowAnnouncements: false,
  },
} : {};

const { status } = await Notifications.requestPermissionsAsync(requestOptions);
```

### 4. iOS Background Modes
**Problem:** iOS kræver background modes for at håndtere notifikationer.

**Løsning i app.json:**
```json
"ios": {
  "infoPlist": {
    "UIBackgroundModes": [
      "remote-notification"
    ]
  }
}
```

### 5. Forbedret Error Logging
**Problem:** Fejl blev ikke logget tilstrækkeligt detaljeret.

**Løsning:**
- Tilføjet omfattende logging i alle notification funktioner
- Logger platform-specifik information
- Logger fejldetaljer med JSON.stringify

---

## 🔍 DEBUGGING STEPS

### Step 1: Verificer Permissions
```typescript
// I admin panel eller console
const { status } = await Notifications.getPermissionsAsync();
console.log('Permission status:', status);
```

**Forventet output:** `granted`

**Hvis ikke granted:**
1. Åbn iPhone Settings
2. Gå til Football Coach app
3. Tryk på Notifications
4. Aktiver "Allow Notifications"
5. Aktiver "Sounds", "Badges" og "Banners"

### Step 2: Test Notification
```typescript
// Brug test notification knappen i admin panel
await testNotification();
```

**Forventet resultat:**
- Notifikation vises efter 2 sekunder
- Lyd afspilles
- Badge vises på app icon

**Hvis notifikation ikke vises:**
- Check console logs for fejl
- Verificer at appen ikke er i Do Not Disturb mode
- Verificer at iPhone ikke er i Silent mode

### Step 3: Verificer Scheduled Notifications
```typescript
const notifications = await getAllScheduledNotifications();
console.log('Scheduled notifications:', notifications.length);
```

**Forventet output:**
- Liste over alle schedulerede notifikationer
- Hver notifikation har en trigger date
- Trigger date er i fremtiden

**Hvis ingen notifikationer:**
- Check om opgaver har påmindelser
- Check om aktiviteter er i fremtiden
- Check console logs for scheduling fejl

### Step 4: Check Notification Stats
```typescript
const stats = await getNotificationStats();
console.log('Stats:', stats);
```

**Forventet output:**
```json
{
  "scheduled": 5,
  "stored": 5,
  "orphaned": 0,
  "upcoming": [...]
}
```

**Hvis orphaned > 0:**
- Kør sync funktion: `await syncNotifications()`

---

## 🐛 COMMON ISSUES

### Issue 1: "Permission denied" i logs
**Symptom:** Notifikationer scheduleres ikke, logs viser "No notification permissions"

**Løsning:**
1. Åbn iPhone Settings → Football Coach → Notifications
2. Aktiver "Allow Notifications"
3. Genstart appen
4. Kør `await requestNotificationPermissions()` igen

### Issue 2: Notifikationer scheduleres men fyrer ikke
**Symptom:** Notifikationer vises i scheduled list, men fyrer ikke

**Mulige årsager:**
1. **iPhone i Low Power Mode:**
   - iOS kan forsinke notifikationer i Low Power Mode
   - Deaktiver Low Power Mode

2. **App lukket for længe:**
   - iOS kan annullere notifikationer hvis app er lukket længe
   - Åbn appen regelmæssigt

3. **Forkert timezone:**
   - Check at notification time er korrekt i logs
   - Sammenlign med device tid

**Løsning:**
```typescript
// Check notification time i logs
console.log('Notification Time (local):', notificationTime.toString());
console.log('Current Time:', new Date().toString());
```

### Issue 3: Notifikationer vises ikke i foreground
**Symptom:** Notifikationer fyrer kun når app er lukket

**Løsning:**
- Verificer at notification handler er sat korrekt
- Check at `shouldShowBanner: true` i handler
- iOS viser som standard ikke notifikationer i foreground uden eksplicit konfiguration

### Issue 4: "Notification not found in schedule queue"
**Symptom:** Notifikation scheduleres men findes ikke i queue

**Mulige årsager:**
1. **iOS rejected notification:**
   - Notification time er for langt i fremtiden (>64 notifikationer)
   - Notification content er invalid

2. **Scheduling fejl:**
   - Check error logs for detaljer

**Løsning:**
```typescript
// Check antal schedulerede notifikationer
const notifications = await getAllScheduledNotifications();
console.log('Total scheduled:', notifications.length);

// iOS har limit på 64 notifikationer
if (notifications.length >= 64) {
  console.log('⚠️ iOS notification limit reached!');
  // Cancel gamle notifikationer
  await cancelAllNotifications();
  // Reschedule kun kommende notifikationer
}
```

---

## 📱 iOS-SPECIFIC LIMITATIONS

### 1. Notification Limit
**iOS har et limit på 64 schedulerede notifikationer.**

**Løsning:**
- Prioriter notifikationer (nærmeste først)
- Cancel gamle notifikationer automatisk
- Reschedule når app åbnes

### 2. Background Execution
**iOS begrænser background execution.**

**Implikationer:**
- Notifikationer kan forsinkes hvis app er lukket længe
- Notifikationer kan annulleres af iOS
- App skal åbnes regelmæssigt for at opdatere notifikationer

**Løsning:**
- Implementer background fetch (fremtidig forbedring)
- Reschedule notifikationer når app åbnes

### 3. Do Not Disturb
**iOS Do Not Disturb mode blokerer notifikationer.**

**Løsning:**
- Informer brugeren om at deaktivere Do Not Disturb
- Eller konfigurer app til at bryde igennem (kræver critical alerts permission)

### 4. Silent Mode
**iOS Silent mode kan mute notification sounds.**

**Løsning:**
- Notifikationer vises stadig, men uden lyd
- Informer brugeren om at deaktivere Silent mode for lyde

---

## 🧪 TESTING CHECKLIST

### Pre-Test Setup
- [ ] iPhone er ikke i Do Not Disturb mode
- [ ] iPhone er ikke i Silent mode
- [ ] iPhone er ikke i Low Power Mode
- [ ] App har notification permissions
- [ ] Notifications er aktiveret i iPhone Settings

### Test 1: Permission Request
- [ ] Åbn appen første gang
- [ ] Permission dialog vises
- [ ] Tryk "Allow"
- [ ] Verificer at permissions er granted

### Test 2: Test Notification
- [ ] Gå til Admin panel
- [ ] Tryk "Test notification"
- [ ] Vent 2 sekunder
- [ ] Notifikation vises
- [ ] Lyd afspilles
- [ ] Badge vises på app icon

### Test 3: Schedule Task Notification
- [ ] Opret en aktivitet for i morgen kl. 15:00
- [ ] Tilføj en opgave med påmindelse 30 min før
- [ ] Check console logs for scheduling
- [ ] Verificer at notifikation er i queue
- [ ] Vent til notifikation skal fyre (eller ændre tid til om 5 min for test)
- [ ] Notifikation fyrer på korrekt tidspunkt

### Test 4: Update Task Notification
- [ ] Opdater opgavens påmindelse til 60 min før
- [ ] Check console logs for rescheduling
- [ ] Verificer at gammel notifikation er cancelled
- [ ] Verificer at ny notifikation er scheduleret

### Test 5: Complete Task
- [ ] Marker opgave som completed
- [ ] Check console logs for cancellation
- [ ] Verificer at notifikation er cancelled

### Test 6: App Restart
- [ ] Luk appen helt (swipe up i app switcher)
- [ ] Åbn appen igen
- [ ] Check console logs for sync
- [ ] Verificer at notifikationer stadig er scheduleret

---

## 📊 EXPECTED LOG OUTPUT

### Successful Notification Scheduling
```
📅 ========== SCHEDULING NOTIFICATION ==========
  Task: Pak fodboldstøvler
  Activity: Træning
  Platform: ios
  Reminder Minutes: 30
🔍 Checking notification permissions...
🔍 System permission status: granted
📅 ========== CALCULATING NOTIFICATION TIME ==========
  Platform: ios
  ⏰ Notification will fire in 1 days, 7 hours, 30 minutes
========== CALCULATION SUCCESS ==========
📤 Scheduling notification with Expo Notifications API...
  Trigger date: 2024-12-06T17:30:00.000Z
  Notification content: {...}
  Trigger config: {...}
✅ Notification scheduled successfully with ID: abc-123-def
✅ Verified notification is in schedule queue
💾 Saving notification identifier...
✅ Notification identifier saved
========== NOTIFICATION SCHEDULED SUCCESSFULLY ==========
```

### Failed Notification Scheduling (No Permission)
```
📅 ========== SCHEDULING NOTIFICATION ==========
  Platform: ios
🔍 Checking notification permissions...
🔍 System permission status: denied
⚠️ No notification permissions, skipping scheduling
========== SCHEDULING ABORTED (NO PERMISSION) ==========
```

### Failed Notification Scheduling (Past Time)
```
📅 ========== CALCULATING NOTIFICATION TIME ==========
  Platform: ios
  Current Time: Fri Dec 06 2024 18:00:00 GMT+0100
  Notification Time: Fri Dec 06 2024 17:30:00 GMT+0100
⚠️ Notification time is 30 minutes in the past, skipping
========== CALCULATION FAILED (PAST TIME) ==========
```

---

## 🔧 MANUAL FIXES

### Fix 1: Reset Notification Permissions
```typescript
// I admin panel eller console
await AsyncStorage.removeItem('@notification_permission_status');
await requestNotificationPermissions();
```

### Fix 2: Clear All Notifications
```typescript
// I admin panel eller console
await cancelAllNotifications();
await clearAllNotificationIdentifiers();
```

### Fix 3: Reschedule All Notifications
```typescript
// I admin panel eller console
await cancelAllNotifications();
// Trigger refresh i useFootballData
setRefreshTrigger(prev => prev + 1);
```

### Fix 4: Sync Notifications
```typescript
// I admin panel eller console
await syncNotifications();
```

---

## 📞 SUPPORT INFORMATION

### Hvis notifikationer stadig ikke virker efter alle fixes:

1. **Check iOS Version:**
   - iOS 15+ er påkrævet for alle features
   - Ældre versioner kan have begrænsninger

2. **Check Device Settings:**
   - Settings → Notifications → Football Coach
   - Verificer at ALLE notification options er aktiveret

3. **Check Console Logs:**
   - Kør appen med Expo Go eller development build
   - Check alle logs for fejl
   - Send logs til support

4. **Test på anden enhed:**
   - Test på en anden iPhone
   - Verificer om problemet er device-specifikt

5. **Rebuild App:**
   - Slet appen fra iPhone
   - Rebuild med `expo prebuild -p ios`
   - Installer igen

---

## 🎯 NEXT STEPS

Hvis du har fulgt alle steps og notifikationer stadig ikke virker:

1. **Dokumenter problemet:**
   - Tag screenshots af Settings
   - Kopier console logs
   - Noter iOS version og device model

2. **Test med minimal setup:**
   - Opret en simpel test app med kun notifications
   - Verificer at notifications virker i test app

3. **Check Expo Notifications version:**
   - Verificer at du bruger seneste version
   - Check Expo docs for breaking changes

4. **Contact Expo Support:**
   - Post på Expo forums
   - Inkluder alle logs og screenshots

---

**Sidst opdateret:** 5. december 2024  
**Version:** 1.0  
**Status:** 🍎 iOS-SPECIFIC FIXES IMPLEMENTED
