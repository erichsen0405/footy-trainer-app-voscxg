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
};

const db = {
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
        return { error: null };
      }

      if (table === 'task_template_categories' && state.action === 'delete') {
        db.taskTemplateCategories = db.taskTemplateCategories.filter(
          (row) => !applyFilters([row], state.filters).length
        );
        return { error: null };
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
        state.action = 'select';
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
    ];
    db.activities = [
      { id: 'activity-keep', category_id: 'cat-keep' },
      { id: 'activity-remove', category_id: 'cat-remove' },
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
    ];
    db.externalMeta = [
      { id: 'meta-keep', category_id: 'cat-keep' },
      { id: 'meta-remove', category_id: 'cat-remove' },
    ];
    db.rpcCalls = [];
  });

  it('removes stale activity and external tasks when a template category is removed', async () => {
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
    ]);

    expect(db.externalEventTasks).toEqual([
      {
        id: 'external-task-keep',
        local_meta_id: 'meta-keep',
        task_template_id: 'template-1',
        feedback_template_id: null,
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
});
