import { extractVideoKey, resolveVideoUrl } from '../utils/videoKey';

describe('videoKey utils', () => {
  it('extracts key from public storage URL', () => {
    const input =
      'https://lhpczofddvwcyrgotzha.supabase.co/storage/v1/object/public/drill-videos/focus/first-touch.mp4';
    expect(extractVideoKey(input)).toBe('drill-videos/focus/first-touch.mp4');
  });

  it('keeps plain key as key', () => {
    expect(extractVideoKey('drill-videos/focus/run.mp4')).toBe('drill-videos/focus/run.mp4');
    expect(extractVideoKey('focus/run.mp4')).toBe('focus/run.mp4');
  });

  it('keeps external https URL when key cannot be extracted', () => {
    const input = 'https://cdn.example.com/video.mp4';
    expect(extractVideoKey(input)).toBe(input);
  });

  it('does not throw on malformed encoded public URL keys', () => {
    const input =
      'https://lhpczofddvwcyrgotzha.supabase.co/storage/v1/object/public/drill-videos/focus/%E0%A4%A.mp4';
    expect(() => extractVideoKey(input)).not.toThrow();
    expect(extractVideoKey(input)).toBe('drill-videos/focus/%E0%A4%A.mp4');
  });

  it('resolves a key to public supabase URL', () => {
    expect(resolveVideoUrl('drill-videos/focus/run.mp4')).toBe(
      'https://lhpczofddvwcyrgotzha.supabase.co/storage/v1/object/public/drill-videos/focus/run.mp4'
    );
    expect(resolveVideoUrl('focus/run.mp4')).toBe(
      'https://lhpczofddvwcyrgotzha.supabase.co/storage/v1/object/public/drill-videos/focus/run.mp4'
    );
  });

  it('keeps https URL unchanged when resolving', () => {
    const input = 'https://cdn.example.com/video.mp4';
    expect(resolveVideoUrl(input)).toBe(input);
  });
});
