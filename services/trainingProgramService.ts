import { FunctionsHttpError } from '@supabase/functions-js';
import { supabase } from '@/integrations/supabase/client';

export type TrainingProgramStatus = 'draft' | 'published' | 'archived';
export type ProgramEnrollmentStatus = 'active' | 'paused' | 'completed' | 'cancelled';
export interface ProgramPhase { id: string; title: string; description: string | null; week_offset: number; duration_weeks: number; sort_order: number }
export interface ProgramItem { id: string; phase_id: string | null; item_type: string; training_template_id: string | null; title: string; description: string | null; day_offset: number; sort_order: number; config: Record<string, unknown> }
export interface TrainingProgram { id: string; owner_account_id: string; title: string; description: string | null; audience: string | null; level: string | null; duration_weeks: number; status: TrainingProgramStatus; published_version: number; phases: ProgramPhase[]; items: ProgramItem[] }
export interface ProgramEnrollment { id: string; program_id: string; player_id: string; source_team_id: string | null; start_date: string; status: ProgramEnrollmentStatus }
export interface TrainingProgramsPayload { owner: { id: string; name: string; owner_type: string }; programs: TrainingProgram[]; enrollments: ProgramEnrollment[]; players: { player_id: string; status: string }[]; teams: { id: string; name: string }[]; savedProgramId?: string; savedProgram?: TrainingProgram; phaseIdMap?: Record<string, string> }
export interface PlayerProgramItem { id: string; scheduled_date: string; item_type: string; title: string; status: string }
export interface PlayerProgramEnrollment extends ProgramEnrollment { training_programs: { title: string; description: string | null; duration_weeks: number }; program_enrollment_items: PlayerProgramItem[] }
export type PlayerProgramItemStatus = 'completed' | 'skipped' | 'overdue' | 'today' | 'upcoming';
export interface PlayerProgramExperienceItem { id: string; scheduledDate: string; itemType: string; title: string; description: string | null; reminderMinutes: number | null; categoryIds: string[]; phaseTitle: string | null; weekNumber: number; status: PlayerProgramItemStatus; activityId: string | null; taskId: string | null }
export interface PlayerProgramExperienceEnrollment {
  id: string;
  owner: { id: string; ownerType: 'club' | 'private_coach_business'; name: string; displayName: string; logoUrl: string | null; brandColors: { primary: string; accent: string } };
  program: { id: string; title: string; description: string | null; durationWeeks: number };
  startDate: string;
  endDate: string;
  status: ProgramEnrollmentStatus;
  progress: { completedItems: number; totalItems: number; percent: number };
  nextItem: PlayerProgramExperienceItem | null;
  items: PlayerProgramExperienceItem[];
}
export interface PlayerProgramExperience {
  apiVersion: 2;
  generatedAt: string;
  today: string;
  activeEnrollmentId: string | null;
  nextAction: (PlayerProgramExperienceItem & { enrollmentId: string }) | null;
  enrollments: PlayerProgramExperienceEnrollment[];
}
export interface TrainingProgramEnrollmentPreview { apiVersion: number; ownerAccountId: string; startDate: string; program: { id: string; title: string; description: string | null; audience: string | null; level: string | null; durationWeeks: number; status: TrainingProgramStatus; phases: { id: string; title: string; description: string | null; weekOffset: number; durationWeeks: number; startWeek: number; endWeek: number; startDate: string; endDate: string; sortOrder: number; items: { id: string; phaseId: string | null; itemType: string; trainingTemplateId: string | null; title: string; description: string | null; dayOffset: number; programDay: number; weekInPhase: number; weekday: string; weekdayLabel: string; scheduledDate: string; sortOrder: number; config: Record<string, unknown> }[] }[]; unassignedItems: unknown[] }; players: { playerId: string; displayName: string; email: string | null; ownerRosterStatus: 'active' }[]; teams: { id: string; name: string; memberCount: number }[] }
export interface TrainingProgramEnrollmentList { apiVersion: 1; ownerAccountId: string; program: { id: string; title: string; durationWeeks: number; status: TrainingProgramStatus }; enrollments: { enrollmentId: string; programId: string; programVersionId: string; versionNumber: number; player: { playerId: string; displayName: string; email: string | null; ownerRosterStatus: string }; sourceTeam: { teamId: string; name: string | null } | null; startDate: string; endDate: string; durationWeeks: number; status: ProgramEnrollmentStatus; pausedAt: string | null; completedAt: string | null; createdAt: string; updatedAt: string; items: { id: string; programItemId: string | null; scheduledDate: string; itemType: string; title: string; status: string; activityId: string | null; taskId: string | null; createdAt: string; updatedAt: string }[]; scheduledItemCount: number; linkedActivityItemCount: number; linkedTaskItemCount: number; allowedActions: ('pause' | 'resume' | 'complete' | 'cancel')[] }[]; summary: { total: number; active: number; paused: number; completed: number; cancelled: number } }

async function invoke<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('manageTrainingPrograms', { body });
  if (error) {
    if (error instanceof FunctionsHttpError && error.context) {
      try { const payload = await error.context.clone().json(); throw new Error(payload?.error?.message || error.message); } catch (parsed) { if (parsed instanceof Error && parsed !== error) throw parsed; }
    }
    throw error;
  }
  return data?.data ?? data;
}
export const fetchTrainingPrograms = (ownerAccountId: string) => invoke<TrainingProgramsPayload>({ action: 'list', ownerAccountId });
export const fetchMyTrainingPrograms = () => invoke<{ enrollments: PlayerProgramEnrollment[] }>({ action: 'playerMine' });
export const fetchPlayerProgramExperience = () => invoke<PlayerProgramExperience>({ action: 'playerExperience' });
export const setPlayerProgramItemCompletion = (itemId: string, completed: boolean) => invoke<PlayerProgramExperience>({ action: 'setPlayerItemCompletion', itemId, completed });
export const fetchTrainingProgramEnrollmentPreview = (ownerAccountId: string, programId: string, startDate: string) => invoke<TrainingProgramEnrollmentPreview>({ action: 'enrollmentPreview', ownerAccountId, programId, startDate });
export const fetchTrainingProgramEnrollments = (ownerAccountId: string, programId: string) => invoke<TrainingProgramEnrollmentList>({ action: 'programEnrollments', ownerAccountId, programId });
export const saveTrainingProgram = (input: { ownerAccountId: string; programId?: string; title: string; description?: string; audience?: string; level?: string; durationWeeks: number; phases: { id?: string; title: string; startsInWeek: number; durationWeeks: number }[]; items: { phaseId: string; itemType: string; trainingTemplateId?: string; title: string; weekday: string; weekInPhase: number }[] }) => invoke<TrainingProgramsPayload>({ action: 'upsert', ...input });
export const publishTrainingProgram = (ownerAccountId: string, programId: string) => invoke<TrainingProgramsPayload>({ action: 'publish', ownerAccountId, programId });
export const enrollTrainingProgram = (input: { ownerAccountId: string; programId: string; playerIds?: string[]; teamId?: string; startDate: string }) => invoke<TrainingProgramsPayload>({ action: 'enroll', ...input });
export const setProgramEnrollmentStatus = (ownerAccountId: string, enrollmentId: string, status: ProgramEnrollmentStatus) => invoke<TrainingProgramsPayload>({ action: 'setEnrollmentStatus', ownerAccountId, enrollmentId, status });
export const archiveTrainingProgram = (ownerAccountId: string, programId: string) => invoke<TrainingProgramsPayload>({ action: 'archive', ownerAccountId, programId });
export const deleteTrainingProgram = (ownerAccountId: string, programId: string) => invoke<TrainingProgramsPayload>({ action: 'delete', ownerAccountId, programId });
