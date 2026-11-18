import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';

import { PICKER_OPTIONS, pickPhoto } from '@/lib/photos';

jest.mock('expo-image-picker', () => ({
  UIImagePickerPreferredAssetRepresentationMode: { Automatic: 'automatic', Compatible: 'compatible', Current: 'current' },
  requestCameraPermissionsAsync: jest.fn(),
  requestMediaLibraryPermissionsAsync: jest.fn(),
  launchCameraAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
}));
const kept: string[][] = [];
jest.mock('@/lib/photoStore', () => ({
  keepPhoto: jest.fn(async (uri: string, name: string) => {
    kept.push([uri, name]);
    return `file:///docs/photos/${name}`;
  }),
  resolveLocalPhoto: (u: string | null | undefined) => u ?? null,
}));

const IP = ImagePicker as jest.Mocked<typeof ImagePicker>;
const asset = (over: Partial<ImagePicker.ImagePickerAsset> = {}): ImagePicker.ImagePickerAsset => ({
  uri: 'file:///cache/ImagePicker/abc.jpg',
  width: 4032,
  height: 3024,
  type: 'image',
  mimeType: 'image/jpeg',
  fileSize: 2_400_000,
  ...over,
});

beforeEach(() => {
  jest.clearAllMocks();
  kept.length = 0;
});

describe('pickPhoto', () => {
  it('uses the system picker compression only: no editing, no EXIF read, HEIC → compatible JPEG', () => {
    expect(PICKER_OPTIONS).toMatchObject({ mediaTypes: ['images'], allowsEditing: false, exif: false, preferredAssetRepresentationMode: 'compatible' });
    expect(PICKER_OPTIONS.quality).toBeGreaterThan(0);
    expect(PICKER_OPTIONS.quality).toBeLessThan(1);
  });

  it('library: no permission prompt, keeps the picked file in app storage, returns its type', async () => {
    IP.launchImageLibraryAsync.mockResolvedValue({ canceled: false, assets: [asset()] });
    const p = await pickPhoto('library');
    expect(IP.requestMediaLibraryPermissionsAsync).not.toHaveBeenCalled();
    expect(IP.launchImageLibraryAsync).toHaveBeenCalledWith(PICKER_OPTIONS);
    expect(p).toMatchObject({ mimeType: 'image/jpeg' });
    expect(p!.localUri).toBe(`file:///docs/photos/${p!.id}.jpg`);
    expect(kept).toEqual([['file:///cache/ImagePicker/abc.jpg', `${p!.id}.jpg`]]);
  });

  it('camera: asks for camera access first and explains a denial', async () => {
    IP.requestCameraPermissionsAsync.mockResolvedValue({ granted: false } as ImagePicker.CameraPermissionResponse);
    await expect(pickPhoto('camera')).rejects.toThrow(/Camera access is off/);
    expect(IP.launchCameraAsync).not.toHaveBeenCalled();

    IP.requestCameraPermissionsAsync.mockResolvedValue({ granted: true } as ImagePicker.CameraPermissionResponse);
    IP.launchCameraAsync.mockResolvedValue({ canceled: false, assets: [asset({ mimeType: 'image/png', uri: 'file:///c/x.png' })] });
    const p = await pickPhoto('camera');
    expect(p?.mimeType).toBe('image/png');
    expect(p?.localUri).toMatch(/\.png$/);
  });

  it('never asks for location', async () => {
    IP.launchImageLibraryAsync.mockResolvedValue({ canceled: false, assets: [asset()] });
    await pickPhoto('library');
    expect(Location.requestForegroundPermissionsAsync).not.toHaveBeenCalled();
  });

  it('cancel returns null; oversized or unsupported files are refused before anything is kept', async () => {
    IP.launchImageLibraryAsync.mockResolvedValue({ canceled: true, assets: null });
    expect(await pickPhoto('library')).toBeNull();
    IP.launchImageLibraryAsync.mockResolvedValue({ canceled: false, assets: [asset({ fileSize: 11 * 1024 * 1024 })] });
    await expect(pickPhoto('library')).rejects.toThrow(/over 10 MB/);
    IP.launchImageLibraryAsync.mockResolvedValue({ canceled: false, assets: [asset({ mimeType: 'image/gif' })] });
    await expect(pickPhoto('library')).rejects.toThrow(/isn’t supported/);
    expect(kept).toEqual([]);
  });
});
