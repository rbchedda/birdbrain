import { MAX_DIARY_PHOTOS, MAX_PHOTO_BYTES, MAX_POST_PHOTOS, photoExtension, photoMimeType, validatePickedAsset } from '@/lib/photoRules';

describe('photo rules (bucket limits: 10 MB, jpeg/png/webp/heic)', () => {
  it('normalises MIME types and falls back to the file extension', () => {
    expect(photoMimeType('image/jpeg')).toBe('image/jpeg');
    expect(photoMimeType('image/jpg')).toBe('image/jpeg');
    expect(photoMimeType('IMAGE/PNG')).toBe('image/png');
    expect(photoMimeType('image/heif')).toBe('image/heic');
    expect(photoMimeType('image/gif')).toBeNull();
    expect(photoMimeType(null, 'file:///x/IMG_1.HEIC')).toBe('image/heic');
    expect(photoMimeType(undefined, 'file:///x/a.webp?x=1')).toBe('image/webp');
    expect(photoMimeType(undefined, 'file:///x/a.bmp')).toBeNull();
  });

  it('picks the storage extension from the type', () => {
    expect(photoExtension('image/jpeg')).toBe('jpg');
    expect(photoExtension('image/png')).toBe('png');
    expect(photoExtension('image/webp')).toBe('webp');
    expect(photoExtension('image/heic')).toBe('heic');
    expect(photoExtension(undefined)).toBe('jpg');
  });

  it('accepts allowed photos and rejects videos, other types and files over 10 MB', () => {
    expect(validatePickedAsset({ uri: 'file:///a.jpg', mimeType: 'image/jpeg', fileSize: 2_000_000, type: 'image' })).toBe('image/jpeg');
    expect(validatePickedAsset({ uri: 'file:///a', mimeType: undefined, fileSize: undefined, type: 'image' })).toBe('image/jpeg');
    expect(() => validatePickedAsset({ uri: 'file:///a.mov', mimeType: 'video/quicktime', type: 'video' })).toThrow(/not videos/);
    expect(() => validatePickedAsset({ uri: 'file:///a.gif', mimeType: 'image/gif', type: 'image' })).toThrow(/JPEG, PNG, WebP or HEIC/);
    expect(() => validatePickedAsset({ uri: 'file:///a.jpg', mimeType: 'image/jpeg', fileSize: MAX_PHOTO_BYTES + 1, type: 'image' })).toThrow(/over 10 MB/);
  });

  it('caps one photo per post (posts.photo_path is one column) and a few per diary entry', () => {
    expect(MAX_POST_PHOTOS).toBe(1);
    expect(MAX_DIARY_PHOTOS).toBeGreaterThan(1);
  });
});
