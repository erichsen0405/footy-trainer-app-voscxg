import { supabase } from '@/integrations/supabase/client';
import { MAX_TASK_VIDEO_BYTES, uploadTaskVideoAsset } from '@/utils/taskVideoUpload';

jest.mock('@/integrations/supabase/client', () => ({
  supabase: {
    storage: {
      from: jest.fn(),
    },
  },
}));

const mockUpload = jest.fn();
const mockGetPublicUrl = jest.fn();
const mockStorageFrom = supabase.storage.from as jest.Mock;

describe('taskVideoUpload', () => {
  beforeEach(() => {
    mockUpload.mockResolvedValue({ error: null });
    mockGetPublicUrl.mockReturnValue({ data: { publicUrl: 'https://example.com/task-video.mp4' } });
    mockStorageFrom.mockReturnValue({
      upload: mockUpload,
      getPublicUrl: mockGetPublicUrl,
    });
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      arrayBuffer: jest.fn().mockResolvedValue(new ArrayBuffer(8)),
    } as any);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    mockUpload.mockReset();
    mockGetPublicUrl.mockReset();
    mockStorageFrom.mockReset();
  });

  it('allows a task video at the 150 MB limit', async () => {
    const result = await uploadTaskVideoAsset({
      userId: 'user-1',
      asset: {
        uri: 'file:///training-video.mp4',
        fileName: 'training-video.mp4',
        mimeType: 'video/mp4',
        fileSize: MAX_TASK_VIDEO_BYTES,
        type: 'video',
      },
    });

    expect(result.publicUrl).toBe('https://example.com/task-video.mp4');
    expect(mockStorageFrom).toHaveBeenCalledWith('drill-videos');
    expect(mockUpload).toHaveBeenCalledWith(
      expect.stringMatching(/^task-videos\/user-1\/training-video-/),
      expect.any(ArrayBuffer),
      expect.objectContaining({
        cacheControl: '3600',
        contentType: 'video/mp4',
        upsert: false,
      }),
    );
  });

  it('rejects a task video above the 150 MB limit before uploading', async () => {
    await expect(
      uploadTaskVideoAsset({
        userId: 'user-1',
        asset: {
          uri: 'file:///training-video.mp4',
          fileName: 'training-video.mp4',
          mimeType: 'video/mp4',
          fileSize: MAX_TASK_VIDEO_BYTES + 1,
          type: 'video',
        },
      }),
    ).rejects.toThrow('Maximum size is 150 MB');

    expect(global.fetch).not.toHaveBeenCalled();
    expect(mockStorageFrom).not.toHaveBeenCalled();
    expect(mockUpload).not.toHaveBeenCalled();
  });
});
