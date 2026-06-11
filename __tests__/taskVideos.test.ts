import {
  buildTaskVideoPayload,
  getTaskMediaType,
  getTaskVideoUrls,
  mergeTaskVideoUrls,
  normalizeTaskVideoUrls,
} from '@/utils/taskVideos';

describe('taskVideos', () => {
  it('normalizes plural task videos and keeps first video as legacy primary', () => {
    const payload = buildTaskVideoPayload([
      ['https://youtu.be/abc123'],
      'https://vimeo.com/123456',
      'https://youtu.be/abc123',
    ]);

    expect(payload.videoUrl).toBe('https://youtu.be/abc123');
    expect(payload.video_url).toBe('https://youtu.be/abc123');
    expect(payload.videoUrls).toEqual(['https://youtu.be/abc123', 'https://vimeo.com/123456']);
    expect(payload.video_urls).toEqual(['https://youtu.be/abc123', 'https://vimeo.com/123456']);
  });

  it('reads plural, legacy and description videos without duplicates', () => {
    expect(
      getTaskVideoUrls({
        video_urls: ['focus/one.mp4', 'focus/two.mp4'],
        video_url: 'focus/one.mp4',
        description: 'See also https://www.instagram.com/reel/C7N2KQ2uV9x/',
      })
    ).toEqual(['focus/one.mp4', 'focus/two.mp4', 'https://www.instagram.com/reel/C7N2KQ2uV9x/']);
  });

  it('appends uploaded videos to existing videos', () => {
    expect(mergeTaskVideoUrls(['focus/one.mp4'], 'focus/two.mp4')).toEqual([
      'focus/one.mp4',
      'focus/two.mp4',
    ]);
  });

  it('keeps videos, images, and PDFs in the task media payload', () => {
    const videoUrl = 'https://www.youtube.com/watch?v=abc123';
    const imageUrl = 'https://example.com/drill-photo.JPG?download=1';
    const pdfUrl = 'https://example.com/session-plan.pdf';

    expect(normalizeTaskVideoUrls([videoUrl, imageUrl, pdfUrl, imageUrl])).toEqual([
      videoUrl,
      imageUrl,
      pdfUrl,
    ]);

    expect(buildTaskVideoPayload([imageUrl, pdfUrl])).toEqual({
      videoUrl: imageUrl,
      videoUrls: [imageUrl, pdfUrl],
      video_url: imageUrl,
      video_urls: [imageUrl, pdfUrl],
    });
  });

  it('detects task media types and rejects loose file paths', () => {
    expect(getTaskMediaType('https://example.com/file.png')).toBe('image');
    expect(getTaskMediaType('https://example.com/file.pdf')).toBe('pdf');
    expect(getTaskMediaType('file.pdf')).toBe('unknown');
  });
});
