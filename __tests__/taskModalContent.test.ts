import {
  getTaskModalVideoUrl,
  hydrateTaskForModal,
  shouldHydrateTaskForModal,
} from '@/utils/taskModalContent';

const mockMaybeSingle = jest.fn();
const mockEq = jest.fn(() => ({ maybeSingle: mockMaybeSingle }));
const mockSelect = jest.fn(() => ({ eq: mockEq }));
const mockFrom = jest.fn((_table?: string) => ({ select: mockSelect }));

jest.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (table: string) => mockFrom(table),
  },
}));

describe('taskModalContent', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('reads video URL from either camelCase or snake_case fields', () => {
    expect(getTaskModalVideoUrl({ videoUrl: 'focus/run.mp4' })).toBe('focus/run.mp4');
    expect(getTaskModalVideoUrl({ video_url: 'focus/run.mp4' })).toBe('focus/run.mp4');
  });

  it('only hydrates when template-backed fields are missing', () => {
    expect(
      shouldHydrateTaskForModal({
        task_template_id: 'template-1',
        description: '',
        video_url: null,
      })
    ).toBe(true);

    expect(
      shouldHydrateTaskForModal({
        task_template_id: 'template-1',
        description: 'Beskrivelse',
        video_url: 'focus/run.mp4',
      })
    ).toBe(false);
  });

  it('hydrates missing description and video from task template metadata', async () => {
    mockMaybeSingle.mockResolvedValue({
      data: {
        id: 'template-1',
        title: 'Teknik',
        description: 'Se videoen og øv teknikken',
        video_url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      },
      error: null,
    });

    const hydrated = await hydrateTaskForModal({
      id: 'task-1',
      title: 'Teknik',
      description: '',
      task_template_id: 'template-1',
      video_url: null,
    });

    expect(mockFrom).toHaveBeenCalledWith('task_templates');
    expect(hydrated.description).toBe('Se videoen og øv teknikken');
    expect(hydrated.video_url).toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    expect((hydrated as any).videoUrl).toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  });
});
