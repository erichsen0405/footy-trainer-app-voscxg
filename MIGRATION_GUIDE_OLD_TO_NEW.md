
# Migration Guide: Old Architecture → New Unstable UID Architecture

## Overview

This guide helps you migrate from the old `events_external` / `events_local_meta` architecture to the new unstable UID matching architecture.

## Pre-Migration Checklist

- [ ] Backup all data from `events_external` and `events_local_meta`
- [ ] Verify new tables are created (`external_events`, `external_event_mappings`, `local_event_meta`)
- [ ] Test new Edge Functions (`match-external-event`, `sync-external-calendar-v2`)
- [ ] Inform users about potential downtime
- [ ] Prepare rollback plan

## Migration Steps

### Step 1: Backup Existing Data

```sql
-- Create backup tables
CREATE TABLE events_external_backup AS SELECT * FROM events_external;
CREATE TABLE events_local_meta_backup AS SELECT * FROM events_local_meta;

-- Verify backup
SELECT COUNT(*) FROM events_external_backup;
SELECT COUNT(*) FROM events_local_meta_backup;
```

### Step 2: Migrate External Events

```sql
-- Migrate external events to new schema
INSERT INTO external_events (
  provider,
  primary_provider_uid,
  dtstart_utc,
  summary,
  location,
  external_last_modified,
  raw_payload,
  first_seen,
  last_seen,
  deleted
)
SELECT
  provider,
  provider_event_uid,
  -- Combine date and time into UTC timestamp
  (start_date::text || ' ' || start_time::text)::timestamptz,
  title,
  location,
  external_last_modified,
  -- Convert JSONB to TEXT
  raw_payload::text,
  created_at,
  updated_at,
  false  -- Not deleted
FROM events_external
ON CONFLICT DO NOTHING;

-- Verify migration
SELECT COUNT(*) FROM external_events;
```

### Step 3: Create Initial Mappings

```sql
-- Create initial mappings for all migrated events
INSERT INTO external_event_mappings (
  external_event_id,
  provider,
  provider_uid,
  mapped_at
)
SELECT
  ee.id,
  oe.provider,
  oe.provider_event_uid,
  oe.created_at
FROM events_external oe
JOIN external_events ee ON 
  ee.provider = oe.provider 
  AND ee.primary_provider_uid = oe.provider_event_uid
ON CONFLICT DO NOTHING;

-- Verify mappings
SELECT COUNT(*) FROM external_event_mappings;
```

### Step 4: Migrate Local Metadata

```sql
-- Migrate local metadata to new schema
INSERT INTO local_event_meta (
  external_event_id,
  user_id,
  category_id,
  overrides,
  last_local_modified
)
SELECT
  ee.id,
  elm.user_id,
  elm.category_id,
  -- Combine all override fields into JSONB
  jsonb_build_object(
    'title', elm.local_title_override,
    'description', elm.local_description,
    'start', elm.local_start_override,
    'end', elm.local_end_override,
    'reminders', elm.reminders,
    'pinned', elm.pinned,
    'custom_fields', elm.custom_fields,
    'manually_set_category', elm.manually_set_category
  ),
  elm.last_local_modified
FROM events_local_meta elm
JOIN events_external oe ON oe.id::text = elm.external_event_id::text
JOIN external_events ee ON 
  ee.provider = oe.provider 
  AND ee.primary_provider_uid = oe.provider_event_uid
ON CONFLICT DO NOTHING;

-- Verify local metadata
SELECT COUNT(*) FROM local_event_meta;
```

### Step 5: Verify Data Integrity

```sql
-- Check for missing events
SELECT 
  oe.id,
  oe.title,
  oe.provider_event_uid
FROM events_external oe
LEFT JOIN external_events ee ON 
  ee.provider = oe.provider 
  AND ee.primary_provider_uid = oe.provider_event_uid
WHERE ee.id IS NULL;

-- Check for missing mappings
SELECT 
  ee.id,
  ee.summary,
  ee.primary_provider_uid
FROM external_events ee
LEFT JOIN external_event_mappings eem ON eem.external_event_id = ee.id
WHERE eem.id IS NULL;

-- Check for missing local metadata
SELECT 
  elm.id,
  elm.user_id,
  elm.external_event_id
FROM events_local_meta elm
LEFT JOIN local_event_meta lem ON 
  lem.user_id = elm.user_id 
  AND lem.external_event_id::text IN (
    SELECT ee.id::text 
    FROM external_events ee
    JOIN events_external oe ON 
      ee.provider = oe.provider 
      AND ee.primary_provider_uid = oe.provider_event_uid
    WHERE oe.id::text = elm.external_event_id::text
  )
WHERE lem.id IS NULL;
```

### Step 6: Update Application Code

Update `ExternalCalendarManager.tsx` to use the new sync function:

```typescript
// OLD
const { data, error } = await supabase.functions.invoke('sync-external-calendar', {
  body: { calendarId },
});

// NEW
const { data, error } = await supabase.functions.invoke('sync-external-calendar-v2', {
  body: { calendarId },
});
```

### Step 7: Test New System

1. **Test Sync**: Sync an existing calendar and verify no duplicates
2. **Test Matching**: Check logs for match methods used
3. **Test Categories**: Verify user categories are preserved
4. **Test New Events**: Add new events to iCal and sync
5. **Test Deletions**: Remove events from iCal and sync

### Step 8: Monitor and Validate

```sql
-- Monitor sync activity
SELECT 
  DATE_TRUNC('hour', mapped_at) as hour,
  COUNT(*) as new_mappings
FROM external_event_mappings
WHERE mapped_at > NOW() - INTERVAL '24 hours'
GROUP BY hour
ORDER BY hour DESC;

-- Check for issues
SELECT 
  ee.summary,
  COUNT(DISTINCT eem.provider_uid) as uid_count
FROM external_events ee
JOIN external_event_mappings eem ON eem.external_event_id = ee.id
GROUP BY ee.id, ee.summary
HAVING COUNT(DISTINCT eem.provider_uid) > 5  -- Flag events with many UIDs
ORDER BY uid_count DESC;
```

### Step 9: Cleanup (After Verification)

```sql
-- After confirming everything works, you can optionally drop old tables
-- WARNING: Only do this after thorough testing!

-- DROP TABLE events_external CASCADE;
-- DROP TABLE events_local_meta CASCADE;

-- Keep backups for a while
-- DROP TABLE events_external_backup;
-- DROP TABLE events_local_meta_backup;
```

## Rollback Plan

If issues occur, you can rollback:

```sql
-- Restore from backup
TRUNCATE external_events CASCADE;
TRUNCATE external_event_mappings CASCADE;
TRUNCATE local_event_meta CASCADE;

-- Restore old tables
DROP TABLE events_external;
DROP TABLE events_local_meta;

CREATE TABLE events_external AS SELECT * FROM events_external_backup;
CREATE TABLE events_local_meta AS SELECT * FROM events_local_meta_backup;

-- Restore indexes and constraints
-- (Run original table creation SQL)
```

## Post-Migration Tasks

### Update Documentation

- [ ] Update user guides with new features
- [ ] Update API documentation
- [ ] Update troubleshooting guides

### Monitor Performance

- [ ] Track sync times
- [ ] Monitor match rates
- [ ] Check for errors

### User Communication

- [ ] Notify users of migration completion
- [ ] Provide updated guides
- [ ] Collect feedback

## Common Migration Issues

### Issue: Missing Events After Migration

**Cause**: UUID vs BIGINT mismatch in joins

**Solution**: Ensure proper type casting in migration SQL:

```sql
-- Use explicit casting
WHERE oe.id::text = elm.external_event_id::text
```

### Issue: Duplicate Events Created

**Cause**: Mappings not created properly

**Solution**: Verify all events have at least one mapping:

```sql
SELECT ee.id, ee.summary
FROM external_events ee
LEFT JOIN external_event_mappings eem ON eem.external_event_id = ee.id
WHERE eem.id IS NULL;
```

### Issue: Lost User Categories

**Cause**: Local metadata not migrated correctly

**Solution**: Check and re-run local metadata migration:

```sql
-- Check for missing local metadata
SELECT COUNT(*) 
FROM events_local_meta elm
LEFT JOIN local_event_meta lem ON lem.user_id = elm.user_id
WHERE lem.id IS NULL;
```

## Validation Queries

### Verify Event Count Matches

```sql
SELECT 
  'Old' as source,
  COUNT(*) as count
FROM events_external
UNION ALL
SELECT 
  'New' as source,
  COUNT(*) as count
FROM external_events;
```

### Verify User Data Preserved

```sql
SELECT 
  u.email,
  COUNT(DISTINCT elm.id) as old_count,
  COUNT(DISTINCT lem.id) as new_count
FROM auth.users u
LEFT JOIN events_local_meta elm ON elm.user_id = u.id
LEFT JOIN local_event_meta lem ON lem.user_id = u.id
GROUP BY u.id, u.email
HAVING COUNT(DISTINCT elm.id) != COUNT(DISTINCT lem.id);
```

### Verify Categories Preserved

```sql
SELECT 
  ac.name,
  COUNT(DISTINCT elm.id) as old_count,
  COUNT(DISTINCT lem.id) as new_count
FROM activity_categories ac
LEFT JOIN events_local_meta elm ON elm.category_id = ac.id
LEFT JOIN local_event_meta lem ON lem.category_id = ac.id
GROUP BY ac.id, ac.name
HAVING COUNT(DISTINCT elm.id) != COUNT(DISTINCT lem.id);
```

## Timeline

### Week 1: Preparation
- Create new tables
- Deploy new Edge Functions
- Test with sample data

### Week 2: Migration
- Backup data
- Run migration scripts
- Verify data integrity

### Week 3: Testing
- Test all functionality
- Monitor for issues
- Collect user feedback

### Week 4: Cleanup
- Remove old code
- Update documentation
- Archive backups

## Success Criteria

✅ All events migrated successfully
✅ All mappings created
✅ All user metadata preserved
✅ No duplicates created
✅ Sync performance maintained or improved
✅ User categories preserved
✅ No data loss

## Support

For migration support:

1. Check migration logs
2. Run validation queries
3. Review error messages
4. Contact development team

## Conclusion

This migration enables robust handling of unstable UIDs while preserving all existing data and user customizations. Follow the steps carefully and verify at each stage to ensure a smooth transition.
