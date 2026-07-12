export type ProgramTemplatePickerFilter = 'all' | 'task' | 'exercise' | 'session';

type SearchableProgramTemplate = {
  templateType: string;
  title: string;
  description?: string | null;
  focusAreas?: string[] | null;
};

export function filterProgramTemplates<T extends SearchableProgramTemplate>(
  templates: T[],
  filter: ProgramTemplatePickerFilter,
  query: string,
): T[] {
  const normalizedQuery = query.trim().toLocaleLowerCase();

  return templates
    .filter((template) => ['task', 'exercise', 'session'].includes(template.templateType))
    .filter((template) => filter === 'all' || template.templateType === filter)
    .filter((template) => {
      if (!normalizedQuery) return true;
      return [template.title, template.description, ...(template.focusAreas ?? [])]
        .filter(Boolean)
        .join(' ')
        .toLocaleLowerCase()
        .includes(normalizedQuery);
    });
}
