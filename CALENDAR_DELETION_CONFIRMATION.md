
# Calendar Deletion Confirmation Implementation

## Overview
This document describes the implementation of the calendar deletion confirmation dialog that asks users whether they want to keep or delete associated activities when removing an external calendar.

## Implementation Date
January 2025

## Changes Made

### 1. Enhanced Calendar Deletion Dialog

The `ExternalCalendarManager.tsx` component now includes an improved deletion flow:

#### When Calendar Has Activities
When a user attempts to delete a calendar that has associated activities, the system:

1. **Counts Activities**: Queries the database to count how many activities are linked to the calendar
2. **Shows Confirmation Dialog**: Displays a three-option dialog:
   - **Annuller** (Cancel): Cancels the deletion
   - **Behold aktiviteter** (Keep Activities): Deletes the calendar but keeps activities as regular (non-external) activities
   - **Slet alt** (Delete All): Deletes both the calendar and all associated activities

#### When Calendar Has No Activities
If the calendar has no activities, a simpler two-option dialog is shown:
- **Annuller** (Cancel): Cancels the deletion
- **Slet** (Delete): Deletes the calendar

### 2. Two Deletion Modes

#### Mode 1: Delete Calendar Only (Keep Activities)
```typescript
deleteCalendarOnly(calendarId, calendarName, activityCount)
```

This function:
- Updates all activities to remove the `external_calendar_id` reference
- Sets `is_external` to `false` for all affected activities
- Deletes the calendar record
- Shows success message indicating activities were kept

**Result**: Activities remain in the user's app as regular activities, no longer linked to the external calendar.

#### Mode 2: Delete Calendar and Activities
```typescript
deleteCalendarWithActivities(calendarId, calendarName)
```

This function:
- Calls `deleteExternalActivitiesForCalendar()` to delete all activities
- Deletes the calendar record
- Shows success message with count of deleted activities

**Result**: Both calendar and all associated activities are permanently removed.

### 3. Enhanced Logging

Both deletion modes now include comprehensive console logging:
- Activity counts before deletion
- Confirmation of operations
- Success/error messages
- User-friendly alerts with detailed information

### 4. User Feedback

The implementation provides clear feedback to users:
- Activity counts in confirmation dialogs
- Detailed success messages explaining what was deleted/kept
- Error messages if operations fail
- Visual distinction between the two deletion options (destructive styling for "Delete All")

## Database Cleanup for nohrhoffmann@gmail.com

### Status Check
A database query was executed to check for external activities for user `nohrhoffmann@gmail.com` (user_id: `0e235b8c-0ad3-4aa2-9ad0-a7196afe4adf`):

```sql
SELECT COUNT(*) FROM activities 
WHERE user_id = '0e235b8c-0ad3-4aa2-9ad0-a7196afe4adf' 
AND is_external = true;
```

**Result**: 0 external activities found

The external activities for this user have already been cleaned up. No further action was needed.

## Utility Functions

### deleteExternalActivitiesForCalendar()
Located in `utils/deleteExternalActivities.ts`

Deletes all activities associated with a specific external calendar for the current user.

**Parameters**:
- `calendarId`: UUID of the external calendar

**Returns**:
```typescript
{
  success: boolean;
  count: number;
  error?: string;
}
```

### deleteAllExternalActivities()
Deletes all external activities for the current authenticated user.

**Returns**:
```typescript
{
  success: boolean;
  count: number;
  error?: string;
}
```

### deleteExternalActivitiesForUserByEmail() (Admin Function)
New admin function for cleaning up external activities for a specific user by email.

**Parameters**:
- `userEmail`: Email address of the user

**Returns**:
```typescript
{
  success: boolean;
  count: number;
  error?: string;
  userId?: string;
}
```

**Note**: This is an admin function and should be used carefully.

## User Experience Flow

### Scenario 1: Deleting Calendar with Activities

1. User clicks "Slet" (Delete) button on a calendar
2. System counts activities linked to the calendar
3. Dialog appears:
   ```
   Slet kalender
   
   Vil du slette kalenderen "Træningskalender"?
   
   Der er 15 aktiviteter tilknyttet denne kalender.
   
   ⚠️ Hvad vil du gøre med aktiviteterne?
   
   [Annuller] [Behold aktiviteter] [Slet alt]
   ```
4. User chooses an option:
   - **Behold aktiviteter**: Activities remain as regular activities
   - **Slet alt**: Everything is deleted
5. Success message confirms the action

### Scenario 2: Deleting Calendar without Activities

1. User clicks "Slet" button on a calendar
2. System detects no activities
3. Simple confirmation dialog appears:
   ```
   Slet kalender
   
   Er du sikker på at du vil slette kalenderen "Træningskalender"?
   
   Der er ingen aktiviteter tilknyttet denne kalender.
   
   [Annuller] [Slet]
   ```
4. User confirms or cancels
5. Success message confirms deletion

## Technical Details

### Database Operations

#### Keep Activities Mode
```typescript
// Remove calendar reference but keep activities
UPDATE activities 
SET 
  external_calendar_id = NULL,
  is_external = false
WHERE 
  external_calendar_id = calendarId 
  AND user_id = currentUserId;

// Delete calendar
DELETE FROM external_calendars 
WHERE id = calendarId AND user_id = currentUserId;
```

#### Delete All Mode
```typescript
// Delete all activities
DELETE FROM activities 
WHERE 
  external_calendar_id = calendarId 
  AND user_id = currentUserId;

// Delete calendar
DELETE FROM external_calendars 
WHERE id = calendarId AND user_id = currentUserId;
```

### Security

- All operations are scoped to the current authenticated user
- RLS policies ensure users can only delete their own calendars and activities
- User ID is verified before any deletion operations
- Error handling prevents partial deletions

## Testing Recommendations

1. **Test with Activities**: Create a calendar with multiple activities and test both deletion modes
2. **Test without Activities**: Create an empty calendar and test deletion
3. **Test Cancellation**: Verify that canceling the dialog doesn't delete anything
4. **Test Error Handling**: Simulate network errors to verify error messages
5. **Verify Data Integrity**: After "Keep Activities" mode, verify activities are properly converted to regular activities

## Future Enhancements

Potential improvements for future versions:

1. **Bulk Operations**: Allow selecting multiple calendars for deletion
2. **Undo Functionality**: Implement undo for accidental deletions
3. **Archive Mode**: Add option to archive instead of delete
4. **Export Before Delete**: Offer to export activities before deletion
5. **Scheduled Deletion**: Allow scheduling calendar deletion for a future date

## Related Files

- `components/ExternalCalendarManager.tsx` - Main calendar management UI
- `utils/deleteExternalActivities.ts` - Deletion utility functions
- `utils/calendarAutoSync.ts` - Auto-sync functionality
- `app/integrations/supabase/client.ts` - Supabase client configuration

## Support

For issues or questions about calendar deletion:
1. Check console logs for detailed error messages
2. Verify user authentication status
3. Check RLS policies in Supabase dashboard
4. Review activity counts before and after deletion
