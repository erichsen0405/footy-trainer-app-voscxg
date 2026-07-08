import * as ImagePicker from 'expo-image-picker';
import { Platform } from 'react-native';

import { supabase } from '@/integrations/supabase/client';

const OWNER_BRAND_BUCKET = 'owner-brand-assets';
const MAX_BRAND_IMAGE_BYTES = 10 * 1024 * 1024;

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

export type OwnerBrandAssetKind = 'logo' | 'cover';

export type UploadedOwnerBrandAsset = {
  path: string;
  publicUrl: string;
  fileName: string;
  contentType: string;
};

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

function buildStoragePath(asset: ImagePicker.ImagePickerAsset, ownerAccountId: string, kind: OwnerBrandAssetKind) {
  const extension = inferImageExtension(asset);
  const contentType = inferImageContentType(asset, extension);
  const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const fileName = `${kind}-${uniqueSuffix}.${extension}`;

  return {
    path: `${ownerAccountId}/${fileName}`,
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
    throw new Error('Could not read the image from the device.');
  }

  if (typeof response.arrayBuffer === 'function') {
    return response.arrayBuffer();
  }

  return response.blob();
}

export async function uploadOwnerBrandAsset({
  asset,
  ownerAccountId,
  kind,
}: {
  asset: ImagePicker.ImagePickerAsset;
  ownerAccountId: string;
  kind: OwnerBrandAssetKind;
}): Promise<UploadedOwnerBrandAsset> {
  const normalizedOwnerAccountId = ownerAccountId.trim();
  if (!normalizedOwnerAccountId) {
    throw new Error('Choose a workspace before uploading brand assets.');
  }

  if (!asset.uri) {
    throw new Error('The image could not be read.');
  }

  if (asset.type && asset.type !== 'image') {
    throw new Error('Select an image file.');
  }

  if (typeof asset.fileSize === 'number' && asset.fileSize > MAX_BRAND_IMAGE_BYTES) {
    throw new Error('Image is too large to upload. Maximum size is 10 MB.');
  }

  const { path, fileName, contentType } = buildStoragePath(asset, normalizedOwnerAccountId, kind);
  const body = await readUploadBody(asset);

  const { error } = await supabase.storage
    .from(OWNER_BRAND_BUCKET)
    .upload(path, body as any, {
      cacheControl: '3600',
      contentType,
      upsert: false,
    });

  if (error) {
    throw new Error(`Could not upload brand image: ${error.message}`);
  }

  const { data } = supabase.storage.from(OWNER_BRAND_BUCKET).getPublicUrl(path);
  if (!data?.publicUrl) {
    throw new Error('The image was uploaded, but the URL could not be created.');
  }

  return {
    path,
    publicUrl: data.publicUrl,
    fileName,
    contentType,
  };
}

async function launchBrandImagePicker(kind: OwnerBrandAssetKind, source: 'camera' | 'library') {
  if (source === 'camera') {
    const hasPermission = await ensureCameraPermission();
    if (!hasPermission) {
      throw new Error('Giv adgang til kameraet for at tage et brandbillede.');
    }

    return ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: kind === 'logo' ? [1, 1] : [16, 9],
      quality: 0.85,
    });
  }

  const hasPermission = await ensureMediaLibraryPermission();
  if (!hasPermission) {
    throw new Error('Allow access to the photo library to select a brand image.');
  }

  return ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: true,
    allowsMultipleSelection: false,
    aspect: kind === 'logo' ? [1, 1] : [16, 9],
    quality: 0.85,
  });
}

export async function pickAndUploadOwnerBrandAsset(
  ownerAccountId: string,
  kind: OwnerBrandAssetKind,
  source: 'camera' | 'library'
): Promise<UploadedOwnerBrandAsset | null> {
  const result = await launchBrandImagePicker(kind, source);
  if (result.canceled) return null;

  const asset = result.assets?.[0] ?? null;
  if (!asset) {
    throw new Error('Der blev ikke valgt et billede.');
  }

  return uploadOwnerBrandAsset({ asset, ownerAccountId, kind });
}
