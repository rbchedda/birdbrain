import * as ImagePicker from 'expo-image-picker';

import { newClientId } from '@/lib/localStore';
import { keepPhoto } from '@/lib/photoStore';
import { photoExtension, validatePickedAsset, PhotoError, type PhotoMimeType } from '@/lib/photoRules';

export * from '@/lib/photoRules';

/**
 * Hunt photos for posts and diary entries (v1).
 *
 * Photos are shared as uploaded: the app never strips EXIF/GPS metadata and
 * never blurs anything. The only processing is the system picker's own
 * re-encode (quality below 1, and iOS "compatible" mode turns HEIC into JPEG)
 * to keep files small and inside the buckets' MIME list. That re-encode is the
 * OS's, not ours; whether it keeps or drops metadata is up to the platform.
 */

/** A photo picked on this device and not necessarily uploaded yet. */
export interface PickedPhoto {
  id: string;
  localUri: string;
  mimeType: PhotoMimeType;
}

export type PhotoSource = 'camera' | 'library';

/** Picker options: images only, system compression, no editing, no EXIF read-back (we never inspect or alter it). */
export const PICKER_OPTIONS: ImagePicker.ImagePickerOptions = {
  mediaTypes: ['images'],
  allowsEditing: false,
  allowsMultipleSelection: false,
  quality: 0.7,
  exif: false,
  base64: false,
  // iOS: HEIC/HEIF comes back as JPEG.
  preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
};

/**
 * Open the camera or the photo library and return one photo, copied into app
 * storage so it survives until it uploads (offline-first). null = cancelled.
 * Never asks for location. The library uses the system picker, which needs no
 * photo-library permission; the camera asks for camera access first.
 */
export async function pickPhoto(source: PhotoSource): Promise<PickedPhoto | null> {
  if (source === 'camera') {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      throw new PhotoError('Camera access is off. Turn it on in Settings → BirdBrain to take a photo, or choose one from your library.');
    }
  }
  const result =
    source === 'camera' ? await ImagePicker.launchCameraAsync(PICKER_OPTIONS) : await ImagePicker.launchImageLibraryAsync(PICKER_OPTIONS);
  if (result.canceled || !result.assets?.length) return null;
  const asset = result.assets[0];
  const mimeType = validatePickedAsset(asset);
  const id = newClientId();
  const localUri = await keepPhoto(asset.uri, `${id}.${photoExtension(mimeType)}`);
  return { id, localUri, mimeType };
}
