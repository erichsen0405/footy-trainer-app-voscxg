import {
  extractFirstPlayableVideoUrl,
  isPlayableVideoUrl,
  parseVideoUrl,
} from '@/utils/videoUrlParser';

describe('videoUrlParser', () => {
  it('parses YouTube watch URLs even when v is not the first query parameter', () => {
    const parsed = parseVideoUrl('https://www.youtube.com/watch?si=share-token&v=dQw4w9WgXcQ');

    expect(parsed.platform).toBe('youtube');
    expect(parsed.videoId).toBe('dQw4w9WgXcQ');
    expect(parsed.thumbnailUrl).toBe('https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg');
  });

  it('parses YouTube live URLs', () => {
    const parsed = parseVideoUrl('https://www.youtube.com/live/dQw4w9WgXcQ?feature=share');

    expect(parsed.platform).toBe('youtube');
    expect(parsed.videoId).toBe('dQw4w9WgXcQ');
  });

  it('treats Instagram reel URLs as supported videos', () => {
    const parsed = parseVideoUrl('https://www.instagram.com/reel/C7N2KQ2uV9x/?igsh=MWQ=');

    expect(parsed.platform).toBe('instagram');
    expect(parsed.videoId).toBe('C7N2KQ2uV9x');
    expect(parsed.thumbnailUrl).toBe('https://www.instagram.com/reel/C7N2KQ2uV9x/media/?size=l');
    expect(isPlayableVideoUrl('https://www.instagram.com/reel/C7N2KQ2uV9x/?igsh=MWQ=')).toBe(true);
    expect(
      extractFirstPlayableVideoUrl('Se denne video https://www.instagram.com/reel/C7N2KQ2uV9x/?igsh=MWQ=')
    ).toBe('https://www.instagram.com/reel/C7N2KQ2uV9x/?igsh=MWQ=');
  });

  it('does not treat ordinary links as playable video', () => {
    expect(isPlayableVideoUrl('https://example.com/guide')).toBe(false);
    expect(extractFirstPlayableVideoUrl('Laes mere her https://example.com/guide')).toBeNull();
  });
});
