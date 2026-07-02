import { reorderTaskMediaUrls } from '@/utils/taskMediaOrder';

describe('reorderTaskMediaUrls', () => {
  it('moves a media URL to the requested position', () => {
    expect(reorderTaskMediaUrls(['a', 'b', 'c'], 0, 2)).toEqual(['b', 'c', 'a']);
    expect(reorderTaskMediaUrls(['a', 'b', 'c'], 2, 0)).toEqual(['c', 'a', 'b']);
  });

  it('clamps destination indexes and keeps invalid moves unchanged', () => {
    expect(reorderTaskMediaUrls(['a', 'b', 'c'], 1, 99)).toEqual(['a', 'c', 'b']);
    expect(reorderTaskMediaUrls(['a', 'b', 'c'], -1, 1)).toEqual(['a', 'b', 'c']);
    expect(reorderTaskMediaUrls(['a', 'b', 'c'], 1, 1)).toEqual(['a', 'b', 'c']);
  });
});
