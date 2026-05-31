import {
  buildTaskVideoPayload,
  getTaskVideoUrls,
  mergeTaskVideoUrls,
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
        description: 'Se også https://www.instagram.com/reel/C7N2KQ2uV9x/',
      })
    ).toEqual(['focus/one.mp4', 'focus/two.mp4', 'https://www.instagram.com/reel/C7N2KQ2uV9x/']);
  });

  it('appends uploaded videos to existing videos', () => {
    expect(mergeTaskVideoUrls(['focus/one.mp4'], 'focus/two.mp4')).toEqual([
      'focus/one.mp4',
      'focus/two.mp4',
    ]);
  });
});
