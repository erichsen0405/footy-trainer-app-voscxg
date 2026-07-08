import { FunctionsHttpError } from '@supabase/functions-js';
import { supabase } from '@/integrations/supabase/client';

export type OwnerCrmStatus = 'active' | 'paused' | 'former' | 'trial';
export type OwnerType = 'club' | 'private_coach_business';
export type GuardianRelation = 'parent' | 'guardian' | 'other';
export type GuardianStatus = 'active' | 'pending' | 'inactive' | 'removed';
export type GuardianInviteStatus = 'pending' | 'accepted' | 'cancelled' | 'expired' | 'revoked';
export type GuardianAccessStatus = 'active' | 'pending' | 'inactive' | 'removed';

export interface OwnerPlayerCrmOwner {
  ownerAccountId: string;
  ownerType: OwnerType;
  name: string;
  status: string;
  coachAccountId: string | null;
  clubId: string | null;
}

export interface OwnerPlayerCrmWorkspace extends OwnerPlayerCrmOwner {
  roles: string[];
  canAccessCrm: boolean;
}

export interface OwnerPlayerCrmTag {
  id: string;
  name: string;
  color: string;
}

export interface OwnerPlayerCrmTeam {
  id: string;
  name: string;
  description: string | null;
  memberCount?: number;
}

export interface OwnerPlayerCrmPlayer {
  ownerPlayerId: string;
  playerId: string;
  displayName: string;
  ownerRosterStatus: string;
  source: string;
  crmStatus: OwnerCrmStatus;
  positions: string[];
  primaryPosition: string | null;
  playingLevel: string | null;
  clubName: string | null;
  dateOfBirth: string | null;
  age: number | null;
  phoneNumber: string | null;
  email: string | null;
  emailVisibleToStaff: boolean;
  phoneVisibleToStaff: boolean;
  tags: OwnerPlayerCrmTag[];
  teams: OwnerPlayerCrmTeam[];
  guardianContactsCount: number;
  notesCount: number;
  latestNotePreview: string | null;
  updatedAt: string | null;
}

export interface OwnerPlayerCrmNote {
  id: string;
  body: string;
  visibility: 'coach_private';
  createdBy: string;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface OwnerPlayerCrmGuardianContact {
  id: string;
  guardianUserId: string | null;
  fullName: string;
  email: string | null;
  phoneNumber: string | null;
  relation: GuardianRelation;
  status: GuardianStatus;
  notes: string | null;
  permissions: Record<string, unknown>;
  inviteId: string | null;
  inviteStatus: GuardianInviteStatus | null;
  inviteExpiresAt: string | null;
  inviteLastSentAt: string | null;
  accessId: string | null;
  accessStatus: GuardianAccessStatus | null;
  createdAt: string;
  updatedAt: string;
}

export interface GuardianInviteDeliveryResult {
  status: 'sent' | 'skipped' | 'failed';
  authLinkType: 'invite' | 'magiclink' | null;
  ownerName: string | null;
  playerName: string | null;
  landingUrl: string | null;
  provider: 'aws_ses' | 'none';
  warning: string | null;
}

export interface OwnerPlayerCrmTimelineEntry {
  id: string;
  type: 'activity' | 'feedback';
  title: string;
  subtitle: string | null;
  occurredAt: string;
}

export interface OwnerPlayerCrmContext {
  isPlatformAdmin: boolean;
  workspaces: OwnerPlayerCrmWorkspace[];
  defaultOwnerAccountId: string | null;
}

export interface OwnerPlayerCrmList {
  ownerAccount: OwnerPlayerCrmOwner;
  players: OwnerPlayerCrmPlayer[];
  tags: OwnerPlayerCrmTag[];
  teams: OwnerPlayerCrmTeam[];
}

export interface OwnerPlayerCrmDetail extends OwnerPlayerCrmList {
  player: OwnerPlayerCrmPlayer;
  notes: OwnerPlayerCrmNote[];
  guardianContacts: OwnerPlayerCrmGuardianContact[];
  timeline: OwnerPlayerCrmTimelineEntry[];
  guardianInviteDelivery?: GuardianInviteDeliveryResult | null;
}

export interface OwnerPlayerCrmProfileInput {
  crmStatus: OwnerCrmStatus;
  positions: string[];
  playingLevel: string | null;
  clubName: string | null;
  dateOfBirth: string | null;
  phoneNumber: string | null;
  email: string | null;
  emailVisibleToStaff: boolean;
  phoneVisibleToStaff: boolean;
}

type OwnerPlayerCrmEnvelope<T> = {
  success?: boolean;
  data?: T;
  error?: string | { code?: string; message?: string };
};

function normalizeErrorBody(body: unknown): string | null {
  const payload = body as OwnerPlayerCrmEnvelope<unknown> | null;
  if (!payload || typeof payload !== 'object') return null;
  if (typeof payload.error === 'string') return payload.error;
  if (payload.error?.message) return payload.error.message;
  return null;
}

async function extractFunctionError(error: unknown, fallback: string): Promise<string> {
  if (error instanceof FunctionsHttpError && error.context) {
    try {
      const body = await error.context.clone().json();
      return normalizeErrorBody(body) || fallback;
    } catch {
      return fallback;
    }
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  return fallback;
}

async function invokeOwnerPlayerCrm<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('manageOwnerPlayerCrm', { body });

  if (error) {
    throw new Error(await extractFunctionError(error, 'Could not complete the CRM action.'));
  }

  const envelope = data as OwnerPlayerCrmEnvelope<T> | T | null;
  if (envelope && typeof envelope === 'object' && 'success' in envelope) {
    const typedEnvelope = envelope as OwnerPlayerCrmEnvelope<T>;
    if (typedEnvelope.success === false) {
      throw new Error(normalizeErrorBody(typedEnvelope) || 'Could not complete the CRM action.');
    }
    if (typedEnvelope.data !== undefined) {
      return typedEnvelope.data;
    }
  }

  return envelope as T;
}

export function fetchOwnerPlayerCrmContext(): Promise<OwnerPlayerCrmContext> {
  return invokeOwnerPlayerCrm<OwnerPlayerCrmContext>({ action: 'context' });
}

export function fetchOwnerPlayerCrmList(ownerAccountId: string): Promise<OwnerPlayerCrmList> {
  return invokeOwnerPlayerCrm<OwnerPlayerCrmList>({
    action: 'list',
    ownerAccountId,
  });
}

export function fetchOwnerPlayerCrmDetail(args: {
  ownerAccountId: string;
  playerId: string;
}): Promise<OwnerPlayerCrmDetail> {
  return invokeOwnerPlayerCrm<OwnerPlayerCrmDetail>({
    action: 'detail',
    ownerAccountId: args.ownerAccountId,
    playerId: args.playerId,
  });
}

export function updateOwnerPlayerCrmProfile(args: {
  ownerAccountId: string;
  playerId: string;
  profile: OwnerPlayerCrmProfileInput;
}): Promise<OwnerPlayerCrmDetail> {
  return invokeOwnerPlayerCrm<OwnerPlayerCrmDetail>({
    action: 'updateProfile',
    ownerAccountId: args.ownerAccountId,
    playerId: args.playerId,
    profile: args.profile,
  });
}

export function createOwnerPlayerCrmNote(args: {
  ownerAccountId: string;
  playerId: string;
  body: string;
}): Promise<OwnerPlayerCrmDetail> {
  return invokeOwnerPlayerCrm<OwnerPlayerCrmDetail>({
    action: 'createNote',
    ownerAccountId: args.ownerAccountId,
    playerId: args.playerId,
    body: args.body,
  });
}

export function deleteOwnerPlayerCrmNote(args: {
  ownerAccountId: string;
  playerId: string;
  noteId: string;
}): Promise<OwnerPlayerCrmDetail> {
  return invokeOwnerPlayerCrm<OwnerPlayerCrmDetail>({
    action: 'deleteNote',
    ownerAccountId: args.ownerAccountId,
    playerId: args.playerId,
    noteId: args.noteId,
  });
}

export function upsertOwnerPlayerCrmTag(args: {
  ownerAccountId: string;
  name: string;
  color: string;
}): Promise<OwnerPlayerCrmList> {
  return invokeOwnerPlayerCrm<OwnerPlayerCrmList>({
    action: 'upsertTag',
    ownerAccountId: args.ownerAccountId,
    name: args.name,
    color: args.color,
  });
}

export function deleteOwnerPlayerCrmTag(args: {
  ownerAccountId: string;
  tagId: string;
}): Promise<OwnerPlayerCrmList> {
  return invokeOwnerPlayerCrm<OwnerPlayerCrmList>({
    action: 'deleteTag',
    ownerAccountId: args.ownerAccountId,
    tagId: args.tagId,
  });
}

export function setOwnerPlayerCrmTags(args: {
  ownerAccountId: string;
  playerId: string;
  tagIds: string[];
}): Promise<OwnerPlayerCrmDetail> {
  return invokeOwnerPlayerCrm<OwnerPlayerCrmDetail>({
    action: 'setPlayerTags',
    ownerAccountId: args.ownerAccountId,
    playerId: args.playerId,
    tagIds: args.tagIds,
  });
}

export function saveOwnerPlayerGuardianContact(args: {
  ownerAccountId: string;
  playerId: string;
  contactId?: string | null;
  fullName: string;
  email: string | null;
  phoneNumber: string | null;
  relation: GuardianRelation;
  status: GuardianStatus;
  notes: string | null;
}): Promise<OwnerPlayerCrmDetail> {
  return invokeOwnerPlayerCrm<OwnerPlayerCrmDetail>({
    action: args.contactId ? 'updateGuardianContact' : 'createGuardianContact',
    ownerAccountId: args.ownerAccountId,
    playerId: args.playerId,
    contactId: args.contactId,
    fullName: args.fullName,
    email: args.email,
    phoneNumber: args.phoneNumber,
    relation: args.relation,
    status: args.status,
    notes: args.notes,
  });
}

export function deleteOwnerPlayerGuardianContact(args: {
  ownerAccountId: string;
  playerId: string;
  contactId: string;
}): Promise<OwnerPlayerCrmDetail> {
  return invokeOwnerPlayerCrm<OwnerPlayerCrmDetail>({
    action: 'deleteGuardianContact',
    ownerAccountId: args.ownerAccountId,
    playerId: args.playerId,
    contactId: args.contactId,
  });
}

export function inviteOwnerPlayerGuardianContact(args: {
  ownerAccountId: string;
  playerId: string;
  contactId: string;
}): Promise<OwnerPlayerCrmDetail> {
  return invokeOwnerPlayerCrm<OwnerPlayerCrmDetail>({
    action: 'inviteGuardianContact',
    ownerAccountId: args.ownerAccountId,
    playerId: args.playerId,
    contactId: args.contactId,
  });
}

export function resendOwnerPlayerGuardianInvite(args: {
  ownerAccountId: string;
  playerId: string;
  inviteId: string;
}): Promise<OwnerPlayerCrmDetail> {
  return invokeOwnerPlayerCrm<OwnerPlayerCrmDetail>({
    action: 'resendGuardianInvite',
    ownerAccountId: args.ownerAccountId,
    playerId: args.playerId,
    inviteId: args.inviteId,
  });
}

export function cancelOwnerPlayerGuardianInvite(args: {
  ownerAccountId: string;
  playerId: string;
  inviteId: string;
}): Promise<OwnerPlayerCrmDetail> {
  return invokeOwnerPlayerCrm<OwnerPlayerCrmDetail>({
    action: 'cancelGuardianInvite',
    ownerAccountId: args.ownerAccountId,
    playerId: args.playerId,
    inviteId: args.inviteId,
  });
}

export function revokeOwnerPlayerGuardianAccess(args: {
  ownerAccountId: string;
  playerId: string;
  contactId: string;
}): Promise<OwnerPlayerCrmDetail> {
  return invokeOwnerPlayerCrm<OwnerPlayerCrmDetail>({
    action: 'revokeGuardianAccess',
    ownerAccountId: args.ownerAccountId,
    playerId: args.playerId,
    contactId: args.contactId,
  });
}
