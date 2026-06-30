import * as ImagePicker from 'expo-image-picker';
import { Alert, Platform } from 'react-native';

import { supabase } from '@/integrations/supabase/client';

const TASK_VIDEO_BUCKET = 'drill-videos';
const TASK_VIDEO_FOLDER = 'task-videos';
const MAX_TASK_VIDEO_SIZE_MB = 150;
export const MAX_TASK_VIDEO_BYTES = MAX_TASK_VIDEO_SIZE_MB * 1024 * 1024;

const EXTENSION_BY_MIME: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/jpg': 'jpg',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'video/mp4': 'mp4',
  'video/mpeg': 'mpeg',
  'video/quicktime': 'mov',
  'video/x-m4v': 'm4v',
  'video/webm': 'webm',
  'video/ogg': 'ogv',
};

const MIME_BY_EXTENSION: Record<string, string> = {
  jpeg: 'image/jpeg',
  jpg: 'image/jpeg',
  m4v: 'video/x-m4v',
  mov: 'video/quicktime',
  mp4: 'video/mp4',
  mpeg: 'video/mpeg',
  ogv: 'video/ogg',
  pdf: 'application/pdf',
  png: 'image/png',
  webm: 'video/webm',
};

const IMAGE_EXTENSIONS = new Set(['jpeg', 'jpg', 'png']);
const PDF_EXTENSIONS = new Set(['pdf']);
const VIDEO_EXTENSIONS = new Set(['m4v', 'mov', 'mp4', 'mpeg', 'ogv', 'webm']);
const SUPPORTED_UPLOAD_EXTENSIONS = new Set([
  ...Array.from(IMAGE_EXTENSIONS),
  ...Array.from(PDF_EXTENSIONS),
  ...Array.from(VIDEO_EXTENSIONS),
]);

export type UploadedTaskVideo = {
  path: string;
  publicUrl: string;
  fileName: string;
  contentType: string;
};

export type UploadedTaskMedia = UploadedTaskVideo;

type TaskUploadAsset = {
  uri: string;
  fileName?: string | null;
  name?: string | null;
  mimeType?: string | null;
  fileSize?: number | null;
  size?: number | null;
  file?: File;
  type?: string | null;
};

type DocumentPickerModule = typeof import('expo-document-picker');

function sanitizePathSegment(value: string): string {
  return value.trim().replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'unknown';
}

function sanitizeFileBase(value: string): string {
  const withoutExtension = value.replace(/\.[^/.]+$/, '');
  return sanitizePathSegment(withoutExtension).slice(0, 64) || 'task-media';
}

function extensionFromFilename(value?: string | null): string | null {
  if (!value) return null;
  const withoutQuery = value.split('?')[0]?.split('#')[0] ?? value;
  const match = withoutQuery.match(/\.([a-zA-Z0-9]+)$/);
  return match?.[1]?.toLowerCase() ?? null;
}

function getAssetName(asset: TaskUploadAsset): string {
  return asset.fileName ?? asset.name ?? asset.uri.split('/').pop() ?? 'task-media';
}

function inferTaskMediaExtension(asset: TaskUploadAsset): string {
  const mimeExtension = asset.mimeType ? EXTENSION_BY_MIME[asset.mimeType.toLowerCase()] : null;
  const filenameExtension = extensionFromFilename(asset.fileName ?? asset.name) ?? extensionFromFilename(asset.uri);
  const fallbackExtension = asset.type === 'image' ? 'jpg' : asset.type === 'video' ? 'mp4' : 'pdf';
  const extension = mimeExtension ?? filenameExtension ?? fallbackExtension;
  return MIME_BY_EXTENSION[extension] ? extension : fallbackExtension;
}

function inferTaskMediaContentType(asset: TaskUploadAsset, extension: string): string {
  const mimeType = asset.mimeType?.toLowerCase();
  if (mimeType && EXTENSION_BY_MIME[mimeType]) return mimeType;
  return MIME_BY_EXTENSION[extension] ?? 'application/octet-stream';
}

function hasSupportedUploadType(asset: TaskUploadAsset): boolean {
  const mimeType = asset.mimeType?.toLowerCase();
  const filenameExtension = extensionFromFilename(asset.fileName ?? asset.name) ?? extensionFromFilename(asset.uri);

  if (mimeType) {
    const mimeExtension = EXTENSION_BY_MIME[mimeType];
    if (mimeExtension) return true;
    if (mimeType.startsWith('video/')) return true;
    return false;
  }

  if (filenameExtension) {
    return SUPPORTED_UPLOAD_EXTENSIONS.has(filenameExtension);
  }

  return asset.type === 'video';
}

function buildStoragePath(asset: TaskUploadAsset, userId: string): {
  path: string;
  fileName: string;
  contentType: string;
} {
  const extension = inferTaskMediaExtension(asset);
  const contentType = inferTaskMediaContentType(asset, extension);
  const originalName = getAssetName(asset);
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

async function readUploadBody(asset: TaskUploadAsset): Promise<Blob | File | ArrayBuffer> {
  if (Platform.OS === 'web' && asset.file) {
    return asset.file;
  }

  const response = await fetch(asset.uri);
  if (!response.ok && response.status > 0) {
    throw new Error('Could not read the selected file from the phone.');
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
  asset: TaskUploadAsset;
  userId: string;
}): Promise<UploadedTaskVideo> {
  const normalizedUserId = userId.trim();
  if (!normalizedUserId) {
    throw new Error('You must be logged in to upload files.');
  }

  if (!asset.uri) {
    throw new Error('The selected file could not be read.');
  }

  const fileSize = typeof asset.fileSize === 'number' ? asset.fileSize : asset.size;
  if (typeof fileSize === 'number' && fileSize > MAX_TASK_VIDEO_BYTES) {
    throw new Error(`The file is too large to upload. Maximum size is ${MAX_TASK_VIDEO_SIZE_MB} MB.`);
  }

  if (!hasSupportedUploadType(asset)) {
    throw new Error('Select a JPG, PNG, PDF, or supported video file.');
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
    throw new Error(`Could not upload file: ${error.message}`);
  }

  const { data } = supabase.storage.from(TASK_VIDEO_BUCKET).getPublicUrl(path);
  if (!data?.publicUrl) {
    throw new Error('The file was uploaded, but the URL could not be created.');
  }

  return {
    path,
    publicUrl: data.publicUrl,
    fileName,
    contentType,
  };
}

export async function pickAndUploadTaskImageOrVideo(userId: string): Promise<UploadedTaskMedia | null> {
  const hasPermission = await ensureMediaLibraryPermission();
  if (!hasPermission) {
    throw new Error('Access the photo and video library to select media.');
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images', 'videos'],
    allowsEditing: false,
    allowsMultipleSelection: false,
    quality: 1,
  });

  if (result.canceled) return null;

  const asset = result.assets?.[0] ?? null;
  if (!asset) {
    throw new Error('No file was selected.');
  }

  if (asset.type && asset.type !== 'image' && asset.type !== 'video') {
    throw new Error('Select an image or video file.');
  }

  return uploadTaskVideoAsset({ asset, userId });
}

export async function pickAndUploadTaskPdf(userId: string): Promise<UploadedTaskMedia | null> {
  let DocumentPicker: DocumentPickerModule;
  try {
    DocumentPicker = await import('expo-document-picker');
  } catch {
    throw new Error('PDF upload requires an app build with document picker support.');
  }

  const result = await DocumentPicker.getDocumentAsync({
    type: 'application/pdf',
    multiple: false,
    copyToCacheDirectory: true,
  });

  if (result.canceled) return null;

  const asset = result.assets?.[0] ?? null;
  if (!asset) {
    throw new Error('No PDF was selected.');
  }

  const extension = extensionFromFilename(asset.name) ?? extensionFromFilename(asset.uri);
  if (asset.mimeType !== 'application/pdf' && extension !== 'pdf') {
    throw new Error('Select a PDF file.');
  }

  return uploadTaskVideoAsset({ asset, userId });
}

function chooseTaskMediaSource(): Promise<'library' | 'pdf' | null> {
  if (Platform.OS === 'web') {
    return Promise.resolve('library');
  }

  return new Promise((resolve) => {
    let resolved = false;
    const finish = (value: 'library' | 'pdf' | null) => {
      if (resolved) return;
      resolved = true;
      resolve(value);
    };

    Alert.alert(
      'Choose media',
      'Add an image, video, or PDF to the task.',
      [
        { text: 'Photo or video', onPress: () => finish('library') },
        { text: 'PDF', onPress: () => finish('pdf') },
        { text: 'Cancel', style: 'cancel', onPress: () => finish(null) },
      ],
      { cancelable: true, onDismiss: () => finish(null) },
    );
  });
}

export async function pickAndUploadTaskMedia(userId: string): Promise<UploadedTaskMedia | null> {
  const source = await chooseTaskMediaSource();
  if (source === 'pdf') {
    return pickAndUploadTaskPdf(userId);
  }
  if (source === 'library') {
    return pickAndUploadTaskImageOrVideo(userId);
  }
  return null;
}

export async function pickAndUploadTaskVideo(userId: string): Promise<UploadedTaskVideo | null> {
  const hasPermission = await ensureMediaLibraryPermission();
  if (!hasPermission) {
    throw new Error('Access the photo and video library to select a video.');
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
    throw new Error('Select a video file.');
  }

  return uploadTaskVideoAsset({ asset, userId });
}
