import { taskService } from '@/services/taskService';

type TaskTemplateCategoryRow = {
  task_template_id: string;
  category_id: string;
};

type ActivityTaskRow = {
  id: string;
  activity_id: string;
  task_template_id: string | null;
  feedback_template_id: string | null;
};

type ActivityRow = {
  id: string;
  category_id: string | null;
  activity_date: string;
  activity_time: string;
};

type ExternalEventTaskRow = {
  id: string;
  local_meta_id: string;
  task_template_id: string | null;
  feedback_template_id: string | null;
};

type ExternalMetaRow = {
  id: string;
  category_id: string | null;
  local_start_override?: string | null;
  events_external?: {
    start_date: string;
    start_time: string;
  } | null;
};

type TaskTemplateRow = {
  id: string;
  user_id: string;
  auto_add_to_activities: boolean;
  focus_areas?: string[];
};

const db = {
  taskTemplates: [] as TaskTemplateRow[],
  taskTemplateCategories: [] as TaskTemplateCategoryRow[],
  activityTasks: [] as ActivityTaskRow[],
  activities: [] as ActivityRow[],
  externalEventTasks: [] as ExternalEventTaskRow[],
  externalMeta: [] as ExternalMetaRow[],
  rpcCalls: [] as { fn: string; args: Record<string, any> }[],
};

const applyFilters = <T extends Record<string, any>>(
  rows: T[],
  filters: { type: 'eq' | 'in'; column: string; value: any }[],
): T[] =>
  rows.filter((row) =>
    filters.every((filter) => {
      const currentValue = row[filter.column];
      if (filter.type === 'eq') {
        return currentValue === filter.value;
      }
      if (filter.type === 'in') {
        return Array.isArray(filter.value) && filter.value.includes(currentValue);
      }
      return true;
    })
  );

jest.mock('@/integrations/supabase/client', () => {
  const from = (table: string) => {
    const state: {
      action: 'select' | 'update' | 'insert' | 'delete' | null;
      filters: { type: 'eq' | 'in'; column: string; value: any }[];
      payload: any;
    } = {
      action: null,
      filters: [],
      payload: null,
    };

    const execute = async () => {
      if (table === 'task_templates' && state.action === 'update') {
        db.taskTemplates = db.taskTemplates.map((row) => {
          if (!applyFilters([row], state.filters).length) return row;
          return { ...row, ...state.payload };
        });
        return { data: [{ id: 'template-1' }], error: null };
      }

      if (table === 'task_templates' && state.action === 'select') {
        return {
          data: applyFilters(db.taskTemplates, state.filters),
          error: null,
        };
      }

      if (table === 'task_template_categories' && state.action === 'delete') {
        db.taskTemplateCategories = db.taskTemplateCategories.filter(
          (row) => !applyFilters([row], state.filters).length
        );
        return { error: null };
      }

      if (table === 'task_template_categories' && state.action === 'select') {
        return {
          data: applyFilters(db.taskTemplateCategories, state.filters),
          error: null,
        };
      }

      if (table === 'task_template_categories' && state.action === 'insert') {
        const rows = Array.isArray(state.payload) ? state.payload : [state.payload];
        db.taskTemplateCategories.push(...rows);
        return { error: null };
      }

      if (table === 'activity_tasks' && state.action === 'select') {
        return {
          data: applyFilters(db.activityTasks, state.filters),
          error: null,
        };
      }

      if (table === 'activity_tasks' && state.action === 'delete') {
        db.activityTasks = db.activityTasks.filter(
          (row) => !applyFilters([row], state.filters).length
        );
        return { error: null };
      }

      if (table === 'activities' && state.action === 'select') {
        return {
          data: applyFilters(db.activities, state.filters),
          error: null,
        };
      }

      if (table === 'external_event_tasks' && state.action === 'select') {
        return {
          data: applyFilters(db.externalEventTasks, state.filters),
          error: null,
        };
      }

      if (table === 'external_event_tasks' && state.action === 'delete') {
        db.externalEventTasks = db.externalEventTasks.filter(
          (row) => !applyFilters([row], state.filters).length
        );
        return { error: null };
      }

      if (table === 'events_local_meta' && state.action === 'select') {
        return {
          data: applyFilters(db.externalMeta, state.filters),
          error: null,
        };
      }

      return { data: [], error: null };
    };

    const builder: any = {
      select: () => {
        if (!state.action) {
          state.action = 'select';
        }
        return builder;
      },
      update: (payload: any) => {
        state.action = 'update';
        state.payload = payload;
        return builder;
      },
      insert: (payload: any) => {
        state.action = 'insert';
        state.payload = payload;
        return builder;
      },
      delete: () => {
        state.action = 'delete';
        return builder;
      },
      eq: (column: string, value: any) => {
        state.filters.push({ type: 'eq', column, value });
        return builder;
      },
      in: (column: string, value: any[]) => {
        state.filters.push({ type: 'in', column, value });
        return builder;
      },
      abortSignal: () => execute(),
    };

    return builder;
  };

  return {
    supabase: {
      from,
      rpc: async (fn: string, args: Record<string, any>) => {
        db.rpcCalls.push({ fn, args });
        return { data: null, error: null };
      },
    },
  };
});

describe('taskService.updateTask category sync cleanup', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    db.taskTemplateCategories = [
      { task_template_id: 'template-1', category_id: 'cat-keep' },
      { task_template_id: 'template-1', category_id: 'cat-remove' },
    ];
    db.taskTemplates = [
      { id: 'template-1', user_id: 'user-1', auto_add_to_activities: true },
    ];
    db.activityTasks = [
      {
        id: 'activity-task-keep',
        activity_id: 'activity-keep',
        task_template_id: 'template-1',
        feedback_template_id: null,
      },
      {
        id: 'activity-task-remove',
        activity_id: 'activity-remove',
        task_template_id: 'template-1',
        feedback_template_id: null,
      },
      {
        id: 'activity-feedback-remove',
        activity_id: 'activity-remove',
        task_template_id: null,
        feedback_template_id: 'template-1',
      },
      {
        id: 'activity-task-past-remove',
        activity_id: 'activity-past-remove',
        task_template_id: 'template-1',
        feedback_template_id: null,
      },
      {
        id: 'activity-feedback-past-remove',
        activity_id: 'activity-past-remove',
        task_template_id: null,
        feedback_template_id: 'template-1',
      },
    ];
    db.activities = [
      { id: 'activity-keep', category_id: 'cat-keep', activity_date: '2999-01-01', activity_time: '10:00:00' },
      { id: 'activity-remove', category_id: 'cat-remove', activity_date: '2999-01-01', activity_time: '10:00:00' },
      { id: 'activity-past-remove', category_id: 'cat-remove', activity_date: '2000-01-01', activity_time: '10:00:00' },
    ];
    db.externalEventTasks = [
      {
        id: 'external-task-keep',
        local_meta_id: 'meta-keep',
        task_template_id: 'template-1',
        feedback_template_id: null,
      },
      {
        id: 'external-task-remove',
        local_meta_id: 'meta-remove',
        task_template_id: 'template-1',
        feedback_template_id: null,
      },
      {
        id: 'external-feedback-remove',
        local_meta_id: 'meta-remove',
        task_template_id: null,
        feedback_template_id: 'template-1',
      },
      {
        id: 'external-task-past-remove',
        local_meta_id: 'meta-past-remove',
        task_template_id: 'template-1',
        feedback_template_id: null,
      },
      {
        id: 'external-feedback-past-remove',
        local_meta_id: 'meta-past-remove',
        task_template_id: null,
        feedback_template_id: 'template-1',
      },
    ];
    db.externalMeta = [
      {
        id: 'meta-keep',
        category_id: 'cat-keep',
        events_external: { start_date: '2999-01-01', start_time: '10:00:00' },
      },
      {
        id: 'meta-remove',
        category_id: 'cat-remove',
        events_external: { start_date: '2999-01-01', start_time: '10:00:00' },
      },
      {
        id: 'meta-past-remove',
        category_id: 'cat-remove',
        events_external: { start_date: '2000-01-01', start_time: '10:00:00' },
      },
    ];
    db.rpcCalls = [];
  });

  it('removes stale future activity and external tasks when a template category is removed', async () => {
    await taskService.updateTask('template-1', 'user-1', {
      categoryIds: ['cat-keep'],
    });

    expect(db.taskTemplateCategories).toEqual([
      { task_template_id: 'template-1', category_id: 'cat-keep' },
    ]);

    expect(db.activityTasks).toEqual([
      {
        id: 'activity-task-keep',
        activity_id: 'activity-keep',
        task_template_id: 'template-1',
        feedback_template_id: null,
      },
      {
        id: 'activity-task-past-remove',
        activity_id: 'activity-past-remove',
        task_template_id: 'template-1',
        feedback_template_id: null,
      },
      {
        id: 'activity-feedback-past-remove',
        activity_id: 'activity-past-remove',
        task_template_id: null,
        feedback_template_id: 'template-1',
      },
    ]);

    expect(db.externalEventTasks).toEqual([
      {
        id: 'external-task-keep',
        local_meta_id: 'meta-keep',
        task_template_id: 'template-1',
        feedback_template_id: null,
      },
      {
        id: 'external-task-past-remove',
        local_meta_id: 'meta-past-remove',
        task_template_id: 'template-1',
        feedback_template_id: null,
      },
      {
        id: 'external-feedback-past-remove',
        local_meta_id: 'meta-past-remove',
        task_template_id: null,
        feedback_template_id: 'template-1',
      },
    ]);

    expect(db.rpcCalls).toContainEqual({
      fn: 'update_all_tasks_from_template',
      args: {
        p_template_id: 'template-1',
        p_dry_run: false,
      },
    });
  });

  it('syncs future activities when a task template is archived', async () => {
    await taskService.setTaskTemplateArchived('template-1', 'user-1', true);

    expect(db.rpcCalls).toContainEqual({
      fn: 'update_all_tasks_from_template',
      args: {
        p_template_id: 'template-1',
        p_dry_run: false,
      },
    });
  });

  it('updates focus areas on a task template', async () => {
    await taskService.updateTask('template-1', 'user-1', {
      focusAreas: [' Teknik ', 'Afslutning', 'teknik'],
    });

    expect(db.taskTemplates[0].focus_areas).toEqual(['Teknik', 'Afslutning']);
  });

  it('does not sync matching activities when category changes and auto-add is off', async () => {
    db.taskTemplates = [
      { id: 'template-1', user_id: 'user-1', auto_add_to_activities: false },
    ];

    await taskService.updateTask('template-1', 'user-1', {
      categoryIds: ['cat-keep'],
    });

    expect(db.taskTemplateCategories).toEqual([
      { task_template_id: 'template-1', category_id: 'cat-keep' },
    ]);

    expect(db.rpcCalls).not.toContainEqual({
      fn: 'update_all_tasks_from_template',
      args: {
        p_template_id: 'template-1',
        p_dry_run: false,
      },
    });

    expect(db.activityTasks).toEqual([
      {
        id: 'activity-task-keep',
        activity_id: 'activity-keep',
        task_template_id: 'template-1',
        feedback_template_id: null,
      },
      {
        id: 'activity-task-remove',
        activity_id: 'activity-remove',
        task_template_id: 'template-1',
        feedback_template_id: null,
      },
      {
        id: 'activity-feedback-remove',
        activity_id: 'activity-remove',
        task_template_id: null,
        feedback_template_id: 'template-1',
      },
      {
        id: 'activity-task-past-remove',
        activity_id: 'activity-past-remove',
        task_template_id: 'template-1',
        feedback_template_id: null,
      },
      {
        id: 'activity-feedback-past-remove',
        activity_id: 'activity-past-remove',
        task_template_id: null,
        feedback_template_id: 'template-1',
      },
    ]);
  });

  it('removes future auto-added tasks when auto-add is disabled', async () => {
    await taskService.updateTask('template-1', 'user-1', {
      autoAddToActivities: false,
    });

    expect(db.taskTemplates[0].auto_add_to_activities).toBe(false);
    expect(db.activityTasks).toEqual([
      {
        id: 'activity-task-past-remove',
        activity_id: 'activity-past-remove',
        task_template_id: 'template-1',
        feedback_template_id: null,
      },
      {
        id: 'activity-feedback-past-remove',
        activity_id: 'activity-past-remove',
        task_template_id: null,
        feedback_template_id: 'template-1',
      },
    ]);
    expect(db.externalEventTasks).toEqual([
      {
        id: 'external-task-past-remove',
        local_meta_id: 'meta-past-remove',
        task_template_id: 'template-1',
        feedback_template_id: null,
      },
      {
        id: 'external-feedback-past-remove',
        local_meta_id: 'meta-past-remove',
        task_template_id: null,
        feedback_template_id: 'template-1',
      },
    ]);
  });

  it('does not clean up future tasks when auto-add remains off', async () => {
    db.taskTemplates = [
      { id: 'template-1', user_id: 'user-1', auto_add_to_activities: false },
    ];

    await taskService.updateTask('template-1', 'user-1', {
      title: 'Updated title',
      autoAddToActivities: false,
    });

    expect(db.activityTasks).toHaveLength(5);
    expect(db.externalEventTasks).toHaveLength(5);
  });
});
