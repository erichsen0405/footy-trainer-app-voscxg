
# Library and Task Template Enhancements

## Overview
This document describes the implementation of the new Library page for players and the enhancement of task templates to support video links and subtasks, making them functionally equivalent to exercises.

## Changes Implemented

### 1. Library Page for Players (`app/(tabs)/library.tsx`)

#### Trainer View
- **Exercise Management**: Trainers can create, edit, duplicate, and delete exercises
- **Exercise Features**:
  - Title
  - Description
  - Video URL (YouTube links supported)
  - Subtasks (ordered list)
- **Assignment**: Trainers can assign exercises to individual players or teams
- **Video Playback**: Click on "Afspil video" to watch videos in a modal with WebView

#### Player View
- **View Assigned Exercises**: Players see all exercises assigned to them by their trainer
- **Copy to Tasks**: Players can copy any exercise to their task templates with the "Kopier til opgaver" button
- **Video Playback**: Players can watch exercise videos directly in the app
- **Subtasks**: View all subtasks associated with each exercise

### 2. Enhanced Task Templates (`app/(tabs)/tasks.tsx`)

#### New Features
- **Video URL Support**: Task templates now support video links (same as exercises)
- **Subtasks**: Task templates can have multiple subtasks (same as exercises)
- **Video Playback**: Click on "Afspil video" to watch videos in a modal
- **Unified Interface**: Same editing experience as exercises

#### Existing Features (Retained)
- **Reminder Times**: Set notification reminders before activities
- **Activity Categories**: Assign task templates to specific activity categories
- **Auto-linking**: Tasks automatically appear on activities with matching categories

### 3. Database Changes

#### Migration: `add_video_url_to_task_templates`
```sql
ALTER TABLE task_templates ADD COLUMN IF NOT EXISTS video_url TEXT;
```

This adds video URL support to task templates, making them functionally equivalent to exercises.

### 4. Type Updates (`types/index.ts`)

Added `videoUrl` field to the `Task` interface:
```typescript
export interface Task {
  id: string;
  title: string;
  description: string;
  completed: boolean;
  isTemplate: boolean;
  categoryIds: string[];
  reminder?: number;
  subtasks: Subtask[];
  videoUrl?: string; // NEW
}
```

### 5. Data Hook Updates (`hooks/useFootballData.ts`)

- **Load Task Templates**: Now fetches `video_url` from database
- **Create Task Template**: Saves `video_url` when creating new templates
- **Update Task Template**: Updates `video_url` when editing templates

## Feature Comparison

### Exercises vs Task Templates

| Feature | Exercises | Task Templates |
|---------|-----------|----------------|
| Title | ✅ | ✅ |
| Description | ✅ | ✅ |
| Video URL | ✅ | ✅ |
| Subtasks | ✅ | ✅ |
| Reminder Time | ❌ | ✅ |
| Activity Categories | ❌ | ✅ |
| Assignment to Players | ✅ | ❌ |
| Copy to Tasks | N/A | N/A |

## User Workflows

### Trainer Workflow
1. **Create Exercise**: Go to Library → Click "Ny øvelse" → Fill in details → Save
2. **Assign to Player**: Click person icon on exercise → Select player → Confirm
3. **Assign to Team**: Click person icon on exercise → Select team → Confirm

### Player Workflow
1. **View Exercises**: Go to Library → See all assigned exercises
2. **Watch Video**: Click "Afspil video" on any exercise
3. **Copy to Tasks**: Click "Kopier til opgaver" → Exercise becomes a task template
4. **Customize Task**: Go to Tasks → Edit the copied task → Add categories/reminders

## Technical Details

### Video URL Handling
- Supports YouTube URLs (both `youtube.com/watch?v=` and `youtu.be/` formats)
- Automatically converts to embed format for WebView playback
- Uses `react-native-webview` for video playback

### Subtasks Management
- Stored in `task_template_subtasks` table
- Ordered by `sort_order` field
- Can add/remove subtasks dynamically in the UI
- Minimum of 1 subtask field always shown

### Copy Exercise to Task
When a player copies an exercise to their tasks:
1. Creates a new task template with the same title, description, and video URL
2. Copies all subtasks with their order preserved
3. Sets the player as the owner (`player_id`)
4. Does not copy exercise assignments or trainer information

## Benefits

1. **Unified Experience**: Exercises and tasks now have the same core features
2. **Flexibility**: Players can customize exercises after copying them
3. **Video Support**: Both exercises and tasks support instructional videos
4. **Subtasks**: Break down complex exercises/tasks into smaller steps
5. **Trainer Control**: Trainers maintain their exercise library while players can personalize

## Future Enhancements

Potential improvements for future versions:
- Sync updates from exercises to copied tasks
- Exercise categories (similar to task categories)
- Exercise templates for trainers
- Progress tracking on subtasks
- Video upload support (currently only URLs)
- Exercise history and analytics
