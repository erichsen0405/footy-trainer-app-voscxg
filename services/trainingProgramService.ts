import { FunctionsHttpError } from '@supabase/functions-js';
import { supabase } from '@/integrations/supabase/client';

export type TrainingProgramStatus = 'draft' | 'published' | 'archived';
export type ProgramEnrollmentStatus = 'active' | 'paused' | 'completed' | 'cancelled';
export interface ProgramPhase { id: string; title: string; description: string | null; week_offset: number; duration_weeks: number; sort_order: number }
export interface ProgramItem { id: string; phase_id: string | null; item_type: string; training_template_id: string | null; title: string; description: string | null; day_offset: number; sort_order: number; config: Record<string, unknown> }
export interface TrainingProgram { id: string; owner_account_id: string; title: string; description: string | null; audience: string | null; level: string | null; duration_weeks: number; status: TrainingProgramStatus; published_version: number; phases: ProgramPhase[]; items: ProgramItem[] }
export interface ProgramEnrollment { id: string; program_id: string; player_id: string; source_team_id: string | null; start_date: string; status: ProgramEnrollmentStatus }
export interface TrainingProgramsPayload { owner: { id: string; name: string; owner_type: string }; programs: TrainingProgram[]; enrollments: ProgramEnrollment[]; players: { player_id: string; status: string }[]; teams: { id: string; name: string }[] }
export interface PlayerProgramItem { id: string; scheduled_date: string; item_type: string; title: string; status: string }
export interface PlayerProgramEnrollment extends ProgramEnrollment { training_programs: { title: string; description: string | null; duration_weeks: number }; program_enrollment_items: PlayerProgramItem[] }
export interface TrainingProgramEnrollmentPreview { apiVersion: number; ownerAccountId: string; startDate: string; program: { id: string; title: string; description: string | null; audience: string | null; level: string | null; durationWeeks: number; status: TrainingProgramStatus; phases: { id: string; title: string; description: string | null; weekOffset: number; durationWeeks: number; startWeek: number; endWeek: number; startDate: string; endDate: string; sortOrder: number; items: { id: string; phaseId: string | null; itemType: string; trainingTemplateId: string | null; title: string; description: string | null; dayOffset: number; programDay: number; scheduledDate: string; sortOrder: number; config: Record<string, unknown> }[] }[]; unassignedItems: unknown[] }; players: { playerId: string; displayName: string; email: string | null; ownerRosterStatus: 'active' }[]; teams: { id: string; name: string; memberCount: number }[] }

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
export const fetchTrainingProgramEnrollmentPreview = (ownerAccountId: string, programId: string, startDate: string) => invoke<TrainingProgramEnrollmentPreview>({ action: 'enrollmentPreview', ownerAccountId, programId, startDate });
export const saveTrainingProgram = (input: { ownerAccountId: string; programId?: string; title: string; description?: string; audience?: string; level?: string; durationWeeks: number; phases: { id?: string; title: string; weekOffset: number; durationWeeks: number }[]; items: { phaseId?: string; itemType: string; trainingTemplateId?: string; title: string; dayOffset: number }[] }) => invoke<TrainingProgramsPayload>({ action: 'upsert', ...input });
export const publishTrainingProgram = (ownerAccountId: string, programId: string) => invoke<TrainingProgramsPayload>({ action: 'publish', ownerAccountId, programId });
export const enrollTrainingProgram = (input: { ownerAccountId: string; programId: string; playerIds?: string[]; teamId?: string; startDate: string }) => invoke<TrainingProgramsPayload>({ action: 'enroll', ...input });
export const setProgramEnrollmentStatus = (ownerAccountId: string, enrollmentId: string, status: ProgramEnrollmentStatus) => invoke<TrainingProgramsPayload>({ action: 'setEnrollmentStatus', ownerAccountId, enrollmentId, status });
export const archiveTrainingProgram = (ownerAccountId: string, programId: string) => invoke<TrainingProgramsPayload>({ action: 'archive', ownerAccountId, programId });
export const deleteTrainingProgram = (ownerAccountId: string, programId: string) => invoke<TrainingProgramsPayload>({ action: 'delete', ownerAccountId, programId });
