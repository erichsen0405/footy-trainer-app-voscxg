import { RestRequest } from 'msw';
import {
  fixtureActivityWithTasks,
  fixtureFeedbackSaved,
  fixtureUsers,
} from './fixtures';

type TableName =
  | 'profiles'
  | 'user_roles'
  | 'activities'
  | 'activity_tasks'
  | 'task_template_self_feedback';

type MockScenario = {
  entitledUserId: string;
  nonEntitledUserId: string;
  feedbackSaved: typeof fixtureFeedbackSaved;
  activityWithTasks: typeof fixtureActivityWithTasks;
  userRoles: Record<string, 'player' | 'trainer' | 'admin'>;
};

const baseScenario: MockScenario = {
  entitledUserId: fixtureUsers.entitled.id,
  nonEntitledUserId: fixtureUsers.notEntitled.id,
  feedbackSaved: fixtureFeedbackSaved,
  activityWithTasks: fixtureActivityWithTasks,
  userRoles: {
    [fixtureUsers.entitled.id]: 'trainer',
    [fixtureUsers.notEntitled.id]: 'player',
  },
};

const requestLog: { method: string; table: string; url: string; body?: unknown }[] = [];
let scenario: MockScenario = {
  ...baseScenario,
  userRoles: { ...baseScenario.userRoles },
};

function cloneFeedback() {
  return { ...scenario.feedbackSaved };
}

function cloneActivityWithTasks() {
  return {
    ...scenario.activityWithTasks,
    activity_tasks: scenario.activityWithTasks.activity_tasks.map(task => ({ ...task })),
  };
}

function maybeSingleFromArray<T>(items: T[], req: RestRequest) {
  if (req.headers.get('accept')?.includes('application/vnd.pgrst.object+json')) {
    return items[0] ?? null;
  }
  return items;
}

function readReqBody(req: RestRequest) {
  const contentType = req.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) {
    return null;
  }

  const rawBody = req.body as unknown;
  if (rawBody && typeof rawBody === 'object') {
    return rawBody;
  }

  try {
    return rawBody ? JSON.parse(String(rawBody)) : null;
  } catch {
    return null;
  }
}

function logRequest(req: RestRequest, table: string) {
  requestLog.push({
    method: req.method.toUpperCase(),
    table,
    url: req.url.toString(),
    body: readReqBody(req),
  });
}

export function resetMockApiState() {
  requestLog.length = 0;
  scenario = {
    ...baseScenario,
    userRoles: { ...baseScenario.userRoles },
  };
}

export function useMockScenario(next: Partial<MockScenario>) {
  scenario = {
    ...scenario,
    ...next,
    userRoles: next.userRoles ? { ...next.userRoles } : { ...scenario.userRoles },
  };
}

export function getMockApiRequestLog() {
  return requestLog.map(entry => ({ ...entry }));
}

export function handleSupabaseTable(req: RestRequest, table: string) {
  const normalizedTable = table as TableName;
  logRequest(req, normalizedTable);

  if (normalizedTable === 'profiles' && req.method === 'GET') {
    const idFilter = req.url.searchParams.get('id');
    const userId = idFilter?.replace(/^eq\./, '') ?? '';

    if (userId === scenario.entitledUserId) {
      return maybeSingleFromArray(
        [
          {
            subscription_tier: fixtureUsers.entitled.subscription_tier,
            subscription_product_id: fixtureUsers.entitled.subscription_product_id,
          },
        ],
        req
      );
    }

    if (userId === scenario.nonEntitledUserId) {
      return maybeSingleFromArray(
        [
          {
            subscription_tier: null,
            subscription_product_id: null,
          },
        ],
        req
      );
    }

    return maybeSingleFromArray([], req);
  }

  if (normalizedTable === 'profiles' && req.method === 'POST') {
    const body = readReqBody(req);
    return Array.isArray(body) ? body : [body];
  }

  if (normalizedTable === 'user_roles' && req.method === 'GET') {
    const userFilter = req.url.searchParams.get('user_id');
    const userId = userFilter?.replace(/^eq\./, '') ?? '';
    const role = scenario.userRoles[userId];
    return maybeSingleFromArray(role ? [{ role }] : [], req);
  }

  if (normalizedTable === 'user_roles' && req.method === 'POST') {
    const body = readReqBody(req);
    const row = Array.isArray(body) ? body[0] : body;
    const userId = String((row as any)?.user_id ?? '').trim();
    const role = (row as any)?.role as 'player' | 'trainer' | 'admin' | undefined;
    if (userId && role) {
      scenario.userRoles[userId] = role;
    }
    return [row];
  }

  if (normalizedTable === 'activities' && req.method === 'GET') {
    const idFilter = req.url.searchParams.get('id');
    const activityId = idFilter?.replace(/^eq\./, '') ?? '';
    if (activityId === scenario.activityWithTasks.id) {
      return maybeSingleFromArray([cloneActivityWithTasks()], req);
    }
    return maybeSingleFromArray([], req);
  }

  if (normalizedTable === 'activities' && req.method === 'POST') {
    const body = readReqBody(req);
    const row = Array.isArray(body) ? body[0] : body;
    return maybeSingleFromArray(
      [{ ...(row as Record<string, unknown>), id: 'activity-duplicate-001' }],
      req
    );
  }

  if (normalizedTable === 'activity_tasks' && req.method === 'POST') {
    const body = readReqBody(req);
    return Array.isArray(body) ? body : [body];
  }

  if (normalizedTable === 'task_template_self_feedback' && req.method === 'GET') {
    const userFilter = req.url.searchParams.get('user_id')?.replace(/^eq\./, '') ?? '';
    const templateFilter = req.url.searchParams.get('task_template_id') ?? '';
    if (
      userFilter === scenario.feedbackSaved.user_id &&
      templateFilter.includes(scenario.feedbackSaved.task_template_id)
    ) {
      return [cloneFeedback()];
    }
    return [];
  }

  if (normalizedTable === 'task_template_self_feedback' && req.method === 'POST') {
    return maybeSingleFromArray([cloneFeedback()], req);
  }

  return null;
}
