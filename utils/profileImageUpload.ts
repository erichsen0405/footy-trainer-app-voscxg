import * as ImagePicker from 'expo-image-picker';
import { Platform } from 'react-native';

import { supabase } from '@/integrations/supabase/client';

const PROFILE_IMAGE_BUCKET = 'profile-images';
const MAX_PROFILE_IMAGE_BYTES = 8 * 1024 * 1024;

const EXTENSION_BY_MIME: Record<string, string> = {
  'image/heic': 'heic',
  'image/heif': 'heif',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

const MIME_BY_EXTENSION: Record<string, string> = {
  heic: 'image/heic',
  heif: 'image/heif',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

export type UploadedProfileImage = {
  path: string;
  publicUrl: string;
  fileName: string;
  contentType: string;
};

function sanitizePathSegment(value: string): string {
  return value.trim().replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'unknown';
}

function extensionFromFilename(value?: string | null): string | null {
  if (!value) return null;
  const withoutQuery = value.split('?')[0]?.split('#')[0] ?? value;
  const match = withoutQuery.match(/\.([a-zA-Z0-9]+)$/);
  return match?.[1]?.toLowerCase() ?? null;
}

function inferImageExtension(asset: ImagePicker.ImagePickerAsset): string {
  const mimeExtension = asset.mimeType ? EXTENSION_BY_MIME[asset.mimeType.toLowerCase()] : null;
  const filenameExtension = extensionFromFilename(asset.fileName) ?? extensionFromFilename(asset.uri);
  const extension = mimeExtension ?? filenameExtension ?? 'jpg';
  return MIME_BY_EXTENSION[extension] ? extension : 'jpg';
}

function inferImageContentType(asset: ImagePicker.ImagePickerAsset, extension: string): string {
  const mimeType = asset.mimeType?.toLowerCase();
  if (mimeType?.startsWith('image/')) return mimeType;
  return MIME_BY_EXTENSION[extension] ?? 'image/jpeg';
}

function buildStoragePath(asset: ImagePicker.ImagePickerAsset, userId: string) {
  const extension = inferImageExtension(asset);
  const contentType = inferImageContentType(asset, extension);
  const ownerFolder = sanitizePathSegment(userId);
  const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const fileName = `avatar-${uniqueSuffix}.${extension}`;

  return {
    path: `${ownerFolder}/${fileName}`,
    fileName,
    contentType,
  };
}

async function ensureCameraPermission(): Promise<boolean> {
  if (Platform.OS === 'web') return true;
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  return permission.granted;
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
    throw new Error('Kunne ikke læse billedet fra enheden.');
  }

  if (typeof response.arrayBuffer === 'function') {
    return response.arrayBuffer();
  }

  return response.blob();
}

export async function uploadProfileImageAsset({
  asset,
  userId,
}: {
  asset: ImagePicker.ImagePickerAsset;
  userId: string;
}): Promise<UploadedProfileImage> {
  const normalizedUserId = userId.trim();
  if (!normalizedUserId) {
    throw new Error('Du skal være logget ind for at uploade profilbillede.');
  }

  if (!asset.uri) {
    throw new Error('Billedet kunne ikke læses.');
  }

  if (asset.type && asset.type !== 'image') {
    throw new Error('Vælg en billedfil.');
  }

  if (typeof asset.fileSize === 'number' && asset.fileSize > MAX_PROFILE_IMAGE_BYTES) {
    throw new Error('Billedet er for stort til upload. Maksimal størrelse er 8 MB.');
  }

  const { path, fileName, contentType } = buildStoragePath(asset, normalizedUserId);
  const body = await readUploadBody(asset);

  const { error } = await supabase.storage
    .from(PROFILE_IMAGE_BUCKET)
    .upload(path, body as any, {
      cacheControl: '3600',
      contentType,
      upsert: false,
    });

  if (error) {
    throw new Error(`Kunne ikke uploade profilbillede: ${error.message}`);
  }

  const { data } = supabase.storage.from(PROFILE_IMAGE_BUCKET).getPublicUrl(path);
  if (!data?.publicUrl) {
    throw new Error('Billedet blev uploadet, men URL kunne ikke oprettes.');
  }

  return {
    path,
    publicUrl: data.publicUrl,
    fileName,
    contentType,
  };
}

async function launchProfileImagePicker(source: 'camera' | 'library') {
  if (source === 'camera') {
    const hasPermission = await ensureCameraPermission();
    if (!hasPermission) {
      throw new Error('Giv adgang til kameraet for at tage et profilbillede.');
    }

    return ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.85,
    });
  }

  const hasPermission = await ensureMediaLibraryPermission();
  if (!hasPermission) {
    throw new Error('Giv adgang til fotobiblioteket for at vælge et profilbillede.');
  }

  return ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: true,
    allowsMultipleSelection: false,
    aspect: [1, 1],
    quality: 0.85,
  });
}

export async function pickAndUploadProfileImage(
  userId: string,
  source: 'camera' | 'library'
): Promise<UploadedProfileImage | null> {
  const result = await launchProfileImagePicker(source);
  if (result.canceled) return null;

  const asset = result.assets?.[0] ?? null;
  if (!asset) {
    throw new Error('Der blev ikke valgt et billede.');
  }

  return uploadProfileImageAsset({ asset, userId });
}
