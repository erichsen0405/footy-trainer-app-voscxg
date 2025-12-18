
# External Activity Deletion Update

## Summary

This update implements the requested changes for managing external activity deletion:

1. **Manual deletion of external activities from activity modal** - Users can now delete individual external activities when editing them
2. **Restricted deletion function** - The `deleteExternalActivitiesForUserByEmail()` admin function has been removed and replaced with user-scoped functions
3. **Profile page deletion button** - Added a "Delete all external activities" button to the user's profile page

## Changes Made

### 1. Updated `utils/deleteExternalActivities.ts`

**Removed:**
- `deleteExternalActivitiesForUserByEmail()` - Admin function that could delete external activities for any user

**Added:**
- `deleteSingleExternalActivity(activityId)` - Allows users to delete a single external activity by ID
  - Verifies the activity belongs to the current user
  - Verifies the activity is actually an external activity
  - Only deletes activities owned by the authenticated user

**Kept:**
- `deleteAllExternalActivities()` - Deletes all external activities for the current user only
- `deleteExternalActivitiesForCalendar(calendarId)` - Deletes all activities for a specific calendar

### 2. Updated `app/activity-details.tsx`

**Added:**
- Import for `deleteSingleExternalActivity` function
- `handleDeleteExternalActivity()` function to handle deletion of external activities
- Modified `handleDeleteClick()` to show appropriate dialog for external activities
- Delete button is now available for external activities when in edit mode
- Confirmation dialog explains that external activities will be re-imported on next sync unless the calendar is removed

**Key Features:**
- External activities can be deleted manually from the activity modal
- Clear warning that activities will be re-imported unless calendar is removed
- Proper error handling and user feedback
- Navigation back to home screen after successful deletion

### 3. Updated `app/(tabs)/profile.tsx` and `app/(tabs)/profile.ios.tsx`

**Added:**
- Import for `deleteAllExternalActivities` function
- State variable `isDeletingExternalActivities` to track deletion progress
- `handleDeleteAllExternalActivities()` function with confirmation dialog
- "Delete all external activities" button in the Calendar Sync section
- Button is only visible when the Calendar Sync section is expanded
- Loading indicator while deletion is in progress

**Key Features:**
- Button placed in the Calendar Sync collapsible section on profile page
- Clear warning dialog before deletion
- Shows count of deleted activities
- Handles case where user has no external activities
- Proper error handling and user feedback

## User Experience

### Deleting a Single External Activity

1. User opens an external activity
2. User clicks "Edit" button
3. User scrolls down and clicks "Delete activity" button
4. System shows confirmation dialog explaining:
   - The activity will be deleted from the app
   - It will be re-imported on next sync unless calendar is removed
5. User confirms deletion
6. Activity is deleted and user is navigated to home screen
7. Success message is shown

### Deleting All External Activities

1. User goes to Profile page
2. User expands "Calendar Sync" section
3. User scrolls down to see "Delete all external activities" button
4. User clicks the button
5. System shows confirmation dialog with strong warning
6. User confirms deletion
7. All external activities are deleted
8. Success message shows count of deleted activities

## Security & Data Isolation

- **User-scoped deletion**: All deletion functions now only work on the current user's data
- **No admin override**: Admins cannot delete external activities for other users
- **Proper authentication**: All functions verify user authentication before proceeding
- **RLS compliance**: All database operations respect Row Level Security policies

## Technical Details

### Database Operations

All deletion operations use Supabase client with proper user authentication:

```typescript
const { data: { user } } = await supabase.auth.getUser();

// Verify user is authenticated
if (!user) {
  return { success: false, error: 'User not authenticated' };
}

// Delete only user's own activities
await supabase
  .from('activities')
  .delete()
  .eq('user_id', user.id)
  .eq('is_external', true);
```

### Error Handling

- All functions return structured response objects with success/error status
- User-friendly error messages are displayed via Alert dialogs
- Console logging for debugging purposes
- Loading states prevent duplicate operations

## Testing Recommendations

1. **Single Activity Deletion**
   - Test deleting an external activity from activity modal
   - Verify activity is removed from the app
   - Verify activity is re-imported on next calendar sync
   - Test canceling the deletion dialog

2. **Bulk Deletion**
   - Test deleting all external activities from profile page
   - Verify correct count is shown in success message
   - Test when user has no external activities
   - Verify activities are re-imported on next calendar sync

3. **Security**
   - Verify users cannot delete other users' external activities
   - Verify proper authentication is required
   - Test with multiple users to ensure data isolation

4. **Edge Cases**
   - Test deleting activity that doesn't exist
   - Test deleting non-external activity (should fail)
   - Test network errors during deletion
   - Test rapid clicking of delete buttons

## Migration Notes

- No database migrations required
- No breaking changes to existing functionality
- Backward compatible with existing external activities
- No changes to RLS policies needed

## Future Enhancements

Potential improvements for future versions:

1. **Selective deletion**: Allow users to select multiple external activities to delete
2. **Calendar-specific deletion**: Add delete button for each calendar in the calendar manager
3. **Undo functionality**: Implement a temporary "trash" for deleted activities
4. **Sync prevention**: Option to prevent specific activities from being re-imported
5. **Batch operations**: Optimize deletion of large numbers of activities

## Conclusion

This update successfully implements the requested features while maintaining security and data isolation. Users now have full control over their external activities with clear warnings about the implications of deletion.
