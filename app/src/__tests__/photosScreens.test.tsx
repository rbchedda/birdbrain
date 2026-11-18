import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import { fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';

import { backend } from '@/data';
import { setShareToCommunity } from '@/lib/shareToCommunity';

jest.mock('expo-image-picker', () => ({
  UIImagePickerPreferredAssetRepresentationMode: { Automatic: 'automatic', Compatible: 'compatible', Current: 'current' },
  requestCameraPermissionsAsync: jest.fn(async () => ({ granted: true })),
  requestMediaLibraryPermissionsAsync: jest.fn(),
  launchCameraAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
}));
jest.mock('@/lib/photoStore', () => ({
  keepPhoto: jest.fn(async (_uri: string, name: string) => `file:///docs/photos/${name}`),
  resolveLocalPhoto: (u: string | null | undefined) => u ?? null,
}));

const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };
jest.mock('react-native-safe-area-context', () => {
  const real = jest.requireActual('react-native-safe-area-context');
  return { ...real, SafeAreaProvider: (p: object) => <real.SafeAreaProvider initialMetrics={metrics} {...p} /> };
});

const IP = ImagePicker as jest.Mocked<typeof ImagePicker>;
const picked = (uri = 'file:///cache/ImagePicker/a.jpg') => ({
  canceled: false as const,
  assets: [{ uri, width: 4032, height: 3024, type: 'image' as const, mimeType: 'image/jpeg', fileSize: 1_500_000 }],
});
const open = (url: string) => renderRouter('./src/app', { initialUrl: url });

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
});
afterEach(() => setShareToCommunity(false));

describe('post composer photo', () => {
  it('no longer says photos are coming soon; adds, previews, removes and posts one photo', async () => {
    await setShareToCommunity(true);
    IP.launchImageLibraryAsync.mockResolvedValue(picked());
    await open('/new/post?placeId=stock-sample-1');
    expect(await screen.findByText('Pheasant stocking (sample B)')).toBeTruthy();
    expect(screen.queryByText(/coming soon/i)).toBeNull();
    expect(screen.getByText(/Photos are shared as uploaded/)).toBeTruthy();

    await fireEvent.press(screen.getByLabelText('Choose photo'));
    expect(await screen.findByTestId('photo-preview-0')).toBeTruthy();
    // One photo per post: the add buttons go away.
    expect(screen.queryByLabelText('Choose photo')).toBeNull();
    await fireEvent.press(screen.getByLabelText('Remove photo 1'));
    expect(screen.queryByTestId('photo-preview-0')).toBeNull();

    IP.launchCameraAsync.mockResolvedValue(picked('file:///cache/cam.jpg'));
    await fireEvent.press(screen.getByLabelText('Take photo'));
    expect(IP.requestCameraPermissionsAsync).toHaveBeenCalled();
    expect(await screen.findByTestId('photo-preview-0')).toBeTruthy();

    await fireEvent.changeText(screen.getByLabelText('Notes'), 'Photo post');
    const createPost = jest.spyOn(backend, 'createPost');
    await fireEvent.press(screen.getByText('Share tomorrow (12h+ delay)'));
    expect(await screen.findByText(/Posted\. Goes public at/)).toBeTruthy();
    expect(createPost.mock.calls[0][0].photo).toMatchObject({ mimeType: 'image/jpeg' });
    expect(createPost.mock.calls[0][0].photo!.localUri).toMatch(/^file:\/\/\/docs\/photos\/.+\.jpg$/);
    createPost.mockRestore();

    // Shows on the author's card in My posts.
    await open('/profile/my-posts');
    expect(await screen.findByText('Photo post')).toBeTruthy();
    expect(await screen.findByTestId('post-photo')).toBeTruthy();
  });

  it('shows a picker error in plain words', async () => {
    await setShareToCommunity(true);
    IP.requestCameraPermissionsAsync.mockResolvedValueOnce({ granted: false } as ImagePicker.CameraPermissionResponse);
    await open('/new/post');
    await fireEvent.press(await screen.findByLabelText('Take photo'));
    expect(await screen.findByText(/Camera access is off/)).toBeTruthy();
  });
});

describe('diary photos', () => {
  it('adds photos to a new entry, shows them on the entry, and the backup uploads them with their type', async () => {
    IP.launchImageLibraryAsync.mockResolvedValueOnce(picked('file:///c/1.jpg')).mockResolvedValueOnce(picked('file:///c/2.jpg'));
    await open('/diary/new');
    await fireEvent.press(await screen.findByLabelText('Choose photo'));
    expect(await screen.findByTestId('photo-preview-0')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Choose photo'));
    expect(await screen.findByTestId('photo-preview-1')).toBeTruthy();
    expect(screen.getByText(/Up to 6 photos/)).toBeTruthy();
    await fireEvent.press(screen.getByText('Save to diary'));

    expect(await screen.findByTestId('diary-photo-0')).toBeTruthy();
    expect(screen.getByTestId('diary-photo-1')).toBeTruthy();
    expect(screen.queryByText(/2 private$/)).toBeNull();

    // Edit: remove one photo.
    await fireEvent.press(screen.getByText('Edit entry'));
    await fireEvent.press(await screen.findByLabelText('Remove photo 2'));
    await fireEvent.press(screen.getByText('Save changes'));
    await waitFor(() => expect(screen.queryByTestId('diary-photo-1')).toBeNull());
    expect(screen.getByTestId('diary-photo-0')).toBeTruthy();
  });
});
