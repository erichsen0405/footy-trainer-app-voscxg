import { activityService } from '@/services/activityService';
import { upsertSelfFeedback } from '@/services/feedbackService';
import { getProfileEntitlements } from '@/utils/profileEntitlements';
import {
  fixtureActivityWithTasks,
  fixtureFeedbackSaved,
  fixtureUsers,
  getMockApiRequestLog,
} from '../test-harness';

describe('API mocking harness (offline deterministic)', () => {
  it('returns user with entitlement from deterministic fixture', async () => {
    const result = await getProfileEntitlements(fixtureUsers.entitled.id);

    expect(result).toEqual({
      tier: fixtureUsers.entitled.subscription_tier,
      productId: fixtureUsers.entitled.subscription_product_id,
      hasEntitlement: true,
    });

    const log = getMockApiRequestLog();
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({ method: 'GET', table: 'profiles' });
  });

  it('returns user without entitlement from deterministic fixture', async () => {
    const result = await getProfileEntitlements(fixtureUsers.notEntitled.id);

    expect(result).toEqual({
      tier: null,
      productId: null,
      hasEntitlement: false,
    });

    const log = getMockApiRequestLog();
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({ method: 'GET', table: 'profiles' });
  });

  it('saves feedback via mocked POST/UPSERT and returns deterministic row', async () => {
    const result = await upsertSelfFeedback({
      templateId: fixtureFeedbackSaved.task_template_id,
      userId: fixtureFeedbackSaved.user_id,
      taskInstanceId: fixtureFeedbackSaved.task_instance_id,
      activity_id: fixtureFeedbackSaved.activity_id,
      rating: fixtureFeedbackSaved.rating,
      note: fixtureFeedbackSaved.note,
    });

    expect(result).toEqual({
      id: fixtureFeedbackSaved.id,
      userId: fixtureFeedbackSaved.user_id,
      taskTemplateId: fixtureFeedbackSaved.task_template_id,
      taskInstanceId: fixtureFeedbackSaved.task_instance_id,
      activityId: fixtureFeedbackSaved.activity_id,
      rating: fixtureFeedbackSaved.rating,
      note: fixtureFeedbackSaved.note,
      createdAt: fixtureFeedbackSaved.created_at,
      updatedAt: fixtureFeedbackSaved.updated_at,
    });

    const log = getMockApiRequestLog();
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({ method: 'POST', table: 'task_template_self_feedback' });
  });

  it('duplicates deterministic activity with tasks without real backend access', async () => {
    await activityService.duplicateActivity(
      fixtureActivityWithTasks.id,
      fixtureUsers.entitled.id,
      'player-001',
      'team-001',
    );

    const log = getMockApiRequestLog();
    expect(log.map(entry => `${entry.method}:${entry.table}`)).toEqual([
      'GET:activities',
      'POST:activities',
      'POST:activity_tasks',
    ]);

    const taskInsertBody = (log[2]?.body ?? []) as { title?: string; activity_id?: string }[];
    expect(Array.isArray(taskInsertBody)).toBe(true);
    expect(taskInsertBody).toHaveLength(2);
    expect(taskInsertBody[0]).toMatchObject({
      title: fixtureActivityWithTasks.activity_tasks[0].title,
      activity_id: 'activity-duplicate-001',
    });
    expect(taskInsertBody[1]).toMatchObject({
      title: fixtureActivityWithTasks.activity_tasks[1].title,
      activity_id: 'activity-duplicate-001',
    });
  });
});
