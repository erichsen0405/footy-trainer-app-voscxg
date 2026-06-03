import {
  createClubActivityCategoryAction,
  deleteClubActivityCategoryAction,
  listClubActivityCategoriesAction,
  parseCreateClubActivityCategoryBody,
  parseUpdateClubActivityCategoryBody,
  updateClubActivityCategoryAction,
} from '../supabase/functions/_shared/clubCategories';

const clubId = '11111111-1111-4111-8111-111111111111';
const categoryId = '22222222-2222-4222-8222-222222222222';
const actorUserId = '33333333-3333-4333-8333-333333333333';

function createRpcClient(result: { data: unknown; error: { message?: string } | null }) {
  return {
    rpc: jest.fn().mockResolvedValue(result),
  };
}

const categoryPayload = {
  id: categoryId,
  clubId,
  name: 'Recovery',
  displayName: 'Recovery (klub)',
  color: '#4ECDC4',
  emoji: 'R',
  memberCopyCount: 12,
  createdAt: '2026-06-01T10:00:00.000Z',
  updatedAt: '2026-06-01T10:00:00.000Z',
};

describe('club category backend helpers', () => {
  it('normalizes create payloads with defaults', () => {
    expect(
      parseCreateClubActivityCategoryBody({
        clubId,
        name: '  Recovery  ',
      })
    ).toEqual({
      clubId,
      name: 'Recovery',
      color: '#4ECDC4',
      emoji: '⚽',
    });
  });

  it('normalizes update payloads', () => {
    expect(
      parseUpdateClubActivityCategoryBody({
        categoryId,
        clubId,
        name: 'Strength',
        color: '#FF6B6B',
        emoji: 'S',
      })
    ).toEqual({
      categoryId,
      clubId,
      name: 'Strength',
      color: '#FF6B6B',
      emoji: 'S',
    });
  });

  it('returns normalized list payloads', async () => {
    const client = createRpcClient({
      data: {
        clubId,
        categories: [categoryPayload],
      },
      error: null,
    });

    await expect(listClubActivityCategoriesAction(client, actorUserId, { clubId })).resolves.toEqual({
      clubId,
      categories: [categoryPayload],
    });
  });

  it('creates categories through the expected RPC contract', async () => {
    const client = createRpcClient({
      data: categoryPayload,
      error: null,
    });

    await expect(
      createClubActivityCategoryAction(client, actorUserId, {
        clubId,
        name: 'Recovery',
        color: '#4ECDC4',
        emoji: 'R',
      })
    ).resolves.toEqual(categoryPayload);

    expect(client.rpc).toHaveBeenCalledWith('create_club_activity_category', {
      p_actor_user_id: actorUserId,
      p_club_id: clubId,
      p_name: 'Recovery',
      p_color: '#4ECDC4',
      p_emoji: 'R',
    });
  });

  it('maps duplicate names to a stable app error', async () => {
    const client = createRpcClient({
      data: null,
      error: { message: 'CLUB_CATEGORY_ALREADY_EXISTS' },
    });

    await expect(
      createClubActivityCategoryAction(client, actorUserId, {
        clubId,
        name: 'Recovery',
      })
    ).rejects.toMatchObject({
      code: 'CLUB_CATEGORY_ALREADY_EXISTS',
      message: 'A club category with this name already exists.',
    });
  });

  it('updates categories through the expected RPC contract', async () => {
    const client = createRpcClient({
      data: categoryPayload,
      error: null,
    });

    await expect(
      updateClubActivityCategoryAction(client, actorUserId, {
        categoryId,
        clubId,
        name: 'Recovery',
        color: '#4ECDC4',
        emoji: 'R',
      })
    ).resolves.toEqual(categoryPayload);

    expect(client.rpc).toHaveBeenCalledWith('update_club_activity_category', {
      p_actor_user_id: actorUserId,
      p_category_id: categoryId,
      p_name: 'Recovery',
      p_color: '#4ECDC4',
      p_emoji: 'R',
    });
  });

  it('deletes categories through the expected RPC contract', async () => {
    const client = createRpcClient({
      data: {
        clubId,
        categoryId,
        deleted: true,
      },
      error: null,
    });

    await expect(deleteClubActivityCategoryAction(client, actorUserId, { categoryId })).resolves.toEqual({
      clubId,
      categoryId,
      deleted: true,
    });

    expect(client.rpc).toHaveBeenCalledWith('delete_club_activity_category', {
      p_actor_user_id: actorUserId,
      p_category_id: categoryId,
    });
  });
});
