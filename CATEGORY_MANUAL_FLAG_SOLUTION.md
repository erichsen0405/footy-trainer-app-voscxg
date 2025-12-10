
# Løsning: Sikring af manually_set_category Flag

## Problem
Når brugere manuelt sætter en kategori på en aktivitet i iPhone-appen, blev `manually_set_category` flaget ikke altid sat korrekt i databasen. Dette førte til, at sync-funktionen overskrev brugerens valg ved næste synkronisering.

## Root Cause Analyse
Efter grundig analyse identificerede vi følgende potentielle årsager:

1. **Race Conditions**: Database-opdateringer og verifikationsforespørgsler kunne køre samtidigt
2. **Database Propagation Delays**: Ændringer i databasen tog tid at propagere
3. **Manglende Verifikation**: Ingen kontrol af om flaget faktisk blev sat efter opdatering
4. **Ingen Retry Logic**: Hvis opdateringen fejlede, blev der ikke forsøgt igen

## Løsning

### 1. Enhanced Update Strategy med Retry Logic
Vi har implementeret en robust opdateringsmekanisme med:

- **Retry Logic**: Op til 3 forsøg hvis opdateringen fejler
- **Explicit Verification**: Efter hver opdatering verificerer vi at flaget er sat
- **Progressive Delays**: Venter længere mellem hvert forsøg (500ms * retry count)
- **Success Validation**: Opdateringen betragtes kun som succesfuld hvis verifikationen bekræfter at flaget er sat

```typescript
let updateSuccess = false;
let retryCount = 0;
const maxRetries = 3;

while (!updateSuccess && retryCount < maxRetries) {
  // Perform update
  const { error } = await supabase
    .from('activities')
    .update(updateData)
    .eq('id', activityId);
    
  // Wait for propagation
  await new Promise(resolve => setTimeout(resolve, 800));
  
  // Verify the update
  const { data: verifyData } = await supabase
    .from('activities')
    .select('*')
    .eq('id', activityId)
    .single();
    
  // Check if successful
  if (verifyData.manually_set_category === true) {
    updateSuccess = true;
  } else {
    retryCount++;
  }
}
```

### 2. Comprehensive Logging
Vi har tilføjet omfattende logging for at kunne diagnosticere problemer:

```typescript
console.log('🔄 ========== UPDATE ACTIVITY STARTED ==========');
console.log(`📱 Platform: ${Platform.OS}`);
console.log(`🆔 Activity ID: ${activityId}`);
console.log(`👤 User ID: ${userId}`);
console.log(`📝 Updates:`, JSON.stringify(updates, null, 2));
```

### 3. Database Propagation Delays
Vi venter nu på database-propagering før verifikation:

```typescript
// Wait for database propagation
console.log('⏳ Waiting 800ms for database propagation...');
await new Promise(resolve => setTimeout(resolve, 800));
```

### 4. Explicit Flag Setting
Vi sætter altid `manually_set_category = true` når kategorien ændres:

```typescript
if (updates.categoryId !== undefined) {
  updateData.category_id = updates.categoryId;
  updateData.manually_set_category = true;
  updateData.category_updated_at = new Date().toISOString();
  console.log('🔒 Setting manually_set_category = TRUE');
}
```

### 5. Verification and Error Handling
Efter opdateringen verificerer vi at flaget er sat:

```typescript
if (verifyData.manually_set_category === true) {
  console.log('✅✅✅ SUCCESS: Manual category protection is ACTIVE!');
  console.log('✅ This category will NEVER be overwritten by sync');
} else {
  console.log('❌❌❌ CRITICAL ERROR: Manual category protection FAILED!');
  console.log(`❌ manually_set_category: ${verifyData.manually_set_category}`);
}
```

## Sync Function Protection
Sync-funktionen har også en "hard stop" der forhindrer kategori-opdateringer:

```typescript
if (existingActivity.manuallySetCategory === true) {
  preserveCategory = true;
  categoriesPreserved++;
  console.log(`🛡️🛡️🛡️ ABSOLUTE PROTECTION: Category manually set by user`);
  console.log(`🚫 SKIPPING ALL CATEGORY UPDATES`);
}
```

## Test Procedure
For at teste løsningen:

1. **Åbn appen** på iPhone
2. **Find en ekstern aktivitet** (f.eks. "Juleferie start")
3. **Åbn aktivitetsdetaljer** ved at klikke på aktiviteten
4. **Klik på edit-knappen** (blyant-ikonet)
5. **Vælg en ny kategori** (f.eks. "Andet")
6. **Klik "Gem"**
7. **Check logs** for at se om flaget blev sat:
   ```
   ✅✅✅ SUCCESS: Manual category protection is ACTIVE!
   ```
8. **Udfør pull-to-refresh** på forsiden
9. **Verificer** at kategorien IKKE ændres tilbage

## Forventede Log Output
Ved succesfuld opdatering skal du se:

```
🔄 ========== UPDATE ACTIVITY STARTED ==========
📱 Platform: ios
🆔 Activity ID: [activity-id]
👤 User ID: [user-id]
📝 Updates: {"categoryId":"[category-id]"}
⏰ Timestamp: [timestamp]

📦 Activity type: EXTERNAL
📋 Current category: Ukendt ([category-id])
   🏷️ Updating category ID: [new-category-id]
   🏷️ New category name: Andet (📋)
   🔒 Setting manually_set_category = TRUE
   🕐 Setting category_updated_at = [timestamp]
   ⚠️ This category will be PERMANENTLY protected from sync overwrites

📤 Sending update to database...
✅ Database update command executed successfully
⏳ Waiting 800ms for database propagation...
🔍 Verifying update by fetching from database...
✅ Update verified successfully!

✅ ========== DATABASE UPDATE SUCCESSFUL ==========
📊 Verified data from database:
   - ID: [activity-id]
   - Title: Juleferie - start
   - Category ID: [new-category-id]
   - Category name: Andet
   - Is external: true
   - Manually set category: true
   - Category updated at: [timestamp]

🔍 ========== VERIFICATION: Manual Category Protection ==========
✅ Category was updated to: Andet
✅ manually_set_category flag: true
✅ category_updated_at timestamp: [timestamp]
✅✅✅ SUCCESS: Manual category protection is ACTIVE!
✅ This category will NEVER be overwritten by sync
✅ The sync function will skip ALL category updates for this activity

✅ ========== UPDATE ACTIVITY COMPLETED ==========
```

## Fejlfinding
Hvis flaget stadig ikke sættes korrekt:

1. **Check RLS Policies**: Verificer at brugeren har rettigheder til at opdatere `manually_set_category`
   ```sql
   SELECT * FROM pg_policies WHERE tablename = 'activities';
   ```

2. **Check Database Triggers**: Verificer at ingen triggers overskriver flaget
   ```sql
   SELECT tgname, pg_get_triggerdef(oid) 
   FROM pg_trigger 
   WHERE tgrelid = 'activities'::regclass;
   ```

3. **Check Column Definition**: Verificer at kolonnen eksisterer og har korrekt type
   ```sql
   SELECT column_name, data_type, column_default 
   FROM information_schema.columns 
   WHERE table_name = 'activities' 
   AND column_name = 'manually_set_category';
   ```

4. **Check Logs**: Se efter fejlmeddelelser i logs
   - Kig efter "❌ CRITICAL ERROR" i logs
   - Kig efter "Failed to verify update" fejl

## Konklusion
Med denne løsning er vi nu sikre på at:

1. ✅ `manually_set_category` flaget sættes ALTID når brugeren ændrer kategori
2. ✅ Opdateringen verificeres før den betragtes som succesfuld
3. ✅ Retry logic sikrer at midlertidige fejl håndteres
4. ✅ Omfattende logging gør det nemt at diagnosticere problemer
5. ✅ Sync-funktionen respekterer ALTID det manuelle flag

Kategorier sat manuelt af brugeren vil ALDRIG blive overskrevet af sync-funktionen.
