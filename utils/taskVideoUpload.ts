import * as ImagePicker from 'expo-image-picker';
import { Platform } from 'react-native';

import { supabase } from '@/integrations/supabase/client';

const TASK_VIDEO_BUCKET = 'drill-videos';
const TASK_VIDEO_FOLDER = 'task-videos';
const MAX_TASK_VIDEO_BYTES = 500 * 1024 * 1024;

const EXTENSION_BY_MIME: Record<string, string> = {
  'video/mp4': 'mp4',
  'video/mpeg': 'mpeg',
  'video/quicktime': 'mov',
  'video/x-m4v': 'm4v',
  'video/webm': 'webm',
  'video/ogg': 'ogv',
};

const MIME_BY_EXTENSION: Record<string, string> = {
  m4v: 'video/x-m4v',
  mov: 'video/quicktime',
  mp4: 'video/mp4',
  mpeg: 'video/mpeg',
  ogv: 'video/ogg',
  webm: 'video/webm',
};

export type UploadedTaskVideo = {
  path: string;
  publicUrl: string;
  fileName: string;
  contentType: string;
};

function sanitizePathSegment(value: string): string {
  return value.trim().replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'unknown';
}

function sanitizeFileBase(value: string): string {
  const withoutExtension = value.replace(/\.[^/.]+$/, '');
  return sanitizePathSegment(withoutExtension).slice(0, 64) || 'task-video';
}

function extensionFromFilename(value?: string | null): string | null {
  if (!value) return null;
  const withoutQuery = value.split('?')[0]?.split('#')[0] ?? value;
  const match = withoutQuery.match(/\.([a-zA-Z0-9]+)$/);
  return match?.[1]?.toLowerCase() ?? null;
}

function inferVideoExtension(asset: ImagePicker.ImagePickerAsset): string {
  const mimeExtension = asset.mimeType ? EXTENSION_BY_MIME[asset.mimeType.toLowerCase()] : null;
  const filenameExtension = extensionFromFilename(asset.fileName) ?? extensionFromFilename(asset.uri);
  const extension = mimeExtension ?? filenameExtension ?? 'mp4';
  return MIME_BY_EXTENSION[extension] ? extension : 'mp4';
}

function inferVideoContentType(asset: ImagePicker.ImagePickerAsset, extension: string): string {
  const mimeType = asset.mimeType?.toLowerCase();
  if (mimeType?.startsWith('video/')) return mimeType;
  return MIME_BY_EXTENSION[extension] ?? 'video/mp4';
}

function buildStoragePath(asset: ImagePicker.ImagePickerAsset, userId: string): {
  path: string;
  fileName: string;
  contentType: string;
} {
  const extension = inferVideoExtension(asset);
  const contentType = inferVideoContentType(asset, extension);
  const originalName = asset.fileName ?? asset.uri.split('/').pop() ?? `task-video.${extension}`;
  const fileBase = sanitizeFileBase(originalName);
  const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const fileName = `${fileBase}-${uniqueSuffix}.${extension}`;
  const ownerFolder = sanitizePathSegment(userId);

  return {
    path: `${TASK_VIDEO_FOLDER}/${ownerFolder}/${fileName}`,
    fileName,
    contentType,
  };
}

async function ensureMediaLibraryPermission(): Promise<boolean> {
  if (Platform.OS === 'web') return true;
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync(false);
  return permission.granted || permission.accessPrivileges === 'limited';
}

async function readUploadBody(asset: ImagePicker.ImagePickerAsset): Promise<Blob | File | ArrayBuffer> {
  if (Platform.OS === 'web' && asset.file) {
    return asset.file;
  }

  const response = await fetch(asset.uri);
  if (!response.ok && response.status > 0) {
    throw new Error('Kunne ikke læse videoen fra telefonen.');
  }

  if (typeof response.arrayBuffer === 'function') {
    return response.arrayBuffer();
  }

  return response.blob();
}

export async function uploadTaskVideoAsset({
  asset,
  userId,
}: {
  asset: ImagePicker.ImagePickerAsset;
  userId: string;
}): Promise<UploadedTaskVideo> {
  const normalizedUserId = userId.trim();
  if (!normalizedUserId) {
    throw new Error('Du skal være logget ind for at uploade video.');
  }

  if (!asset.uri) {
    throw new Error('Videoen kunne ikke læses.');
  }

  if (typeof asset.fileSize === 'number' && asset.fileSize > MAX_TASK_VIDEO_BYTES) {
    throw new Error('Videoen er for stor til upload. Maksimal størrelse er 500 MB.');
  }

  const { path, fileName, contentType } = buildStoragePath(asset, normalizedUserId);
  const body = await readUploadBody(asset);

  const { error } = await supabase.storage
    .from(TASK_VIDEO_BUCKET)
    .upload(path, body as any, {
      cacheControl: '3600',
      contentType,
      upsert: false,
    });

  if (error) {
    throw new Error(`Kunne ikke uploade video: ${error.message}`);
  }

  const { data } = supabase.storage.from(TASK_VIDEO_BUCKET).getPublicUrl(path);
  if (!data?.publicUrl) {
    throw new Error('Videoen blev uploadet, men URL kunne ikke oprettes.');
  }

  return {
    path,
    publicUrl: data.publicUrl,
    fileName,
    contentType,
  };
}

export async function pickAndUploadTaskVideo(userId: string): Promise<UploadedTaskVideo | null> {
  const hasPermission = await ensureMediaLibraryPermission();
  if (!hasPermission) {
    throw new Error('Giv adgang til foto- og videobiblioteket for at vælge en video.');
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['videos'],
    allowsEditing: false,
    allowsMultipleSelection: false,
    quality: 1,
  });

  if (result.canceled) return null;

  const asset = result.assets?.[0] ?? null;
  if (!asset) {
    throw new Error('Der blev ikke valgt en video.');
  }

  if (asset.type && asset.type !== 'video') {
    throw new Error('Vælg en videofil.');
  }

  return uploadTaskVideoAsset({ asset, userId });
}
