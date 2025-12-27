
/**
 * Permission helpers for admin mode
 * 
 * These helpers determine whether a trainer can manage (open/edit) specific items
 * when administering a player or team.
 * 
 * Core rule: In admin mode, trainers can only manage items they created.
 * In self mode, no restrictions apply.
 */

import { AdminMode } from '@/contexts/AdminContext';

export interface Activity {
  user_id: string;
  [key: string]: any;
}

export interface Task {
  user_id: string;
  [key: string]: any;
}

export interface ActivitySeries {
  user_id: string;
  [key: string]: any;
}

/**
 * Determines if a trainer can manage (open/edit) an activity in the current admin mode.
 * 
 * @param activity - The activity to check permissions for
 * @param trainerId - The ID of the current trainer
 * @param adminMode - The current admin mode ('self', 'player', or 'team')
 * @returns true if the trainer can manage the activity, false otherwise
 * 
 * @example
 * ```ts
 * const canManage = canTrainerManageActivity({
 *   activity: myActivity,
 *   trainerId: currentUser.id,
 *   adminMode: adminMode
 * });
 * 
 * if (!canManage) {
 *   // Block interaction
 *   return;
 * }
 * ```
 */
export function canTrainerManageActivity({
  activity,
  trainerId,
  adminMode,
}: {
  activity: Activity;
  trainerId: string;
  adminMode: AdminMode;
}): boolean {
  // In self mode, no restrictions
  if (adminMode === 'self') {
    return true;
  }

  // In admin mode (player or team), only allow if trainer created this activity
  return activity.user_id === trainerId;
}

/**
 * Determines if a trainer can manage (open/edit) a task template in the current admin mode.
 * 
 * @param task - The task template to check permissions for
 * @param trainerId - The ID of the current trainer
 * @param adminMode - The current admin mode ('self', 'player', or 'team')
 * @returns true if the trainer can manage the task, false otherwise
 * 
 * @example
 * ```ts
 * const canManage = canTrainerManageTask({
 *   task: myTask,
 *   trainerId: currentUser.id,
 *   adminMode: adminMode
 * });
 * 
 * if (!canManage) {
 *   // Block interaction
 *   return;
 * }
 * ```
 */
export function canTrainerManageTask({
  task,
  trainerId,
  adminMode,
}: {
  task: Task;
  trainerId: string;
  adminMode: AdminMode;
}): boolean {
  // In self mode, no restrictions
  if (adminMode === 'self') {
    return true;
  }

  // In admin mode (player or team), only allow if trainer created this task
  return task.user_id === trainerId;
}

/**
 * Determines if a trainer can manage (open/edit) an activity series in the current admin mode.
 * 
 * @param series - The activity series to check permissions for
 * @param trainerId - The ID of the current trainer
 * @param adminMode - The current admin mode ('self', 'player', or 'team')
 * @returns true if the trainer can manage the series, false otherwise
 * 
 * @example
 * ```ts
 * const canManage = canTrainerManageActivitySeries({
 *   series: mySeries,
 *   trainerId: currentUser.id,
 *   adminMode: adminMode
 * });
 * 
 * if (!canManage) {
 *   // Block interaction
 *   return;
 * }
 * ```
 */
export function canTrainerManageActivitySeries({
  series,
  trainerId,
  adminMode,
}: {
  series: ActivitySeries;
  trainerId: string;
  adminMode: AdminMode;
}): boolean {
  // In self mode, no restrictions
  if (adminMode === 'self') {
    return true;
  }

  // In admin mode (player or team), only allow if trainer created this series
  return series.user_id === trainerId;
}
