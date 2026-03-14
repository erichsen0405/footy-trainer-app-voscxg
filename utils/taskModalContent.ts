import { supabase } from '@/integrations/supabase/client';
import { parseTemplateIdFromMarker } from '@/utils/afterTrainingMarkers';

function trimString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function getTaskModalVideoUrl(task: any): string | null {
  if (!task) return null;
  const camel = trimString(task.videoUrl);
  if (camel) return camel;
  const snake = trimString(task.video_url);
  return snake || null;
}

export function shouldHydrateTaskForModal(task: any): boolean {
  if (!task) return false;
  const templateId = getTaskModalTemplateId(task);
  if (!templateId) return false;
  const hasLocalDescription = trimString(task.description).length > 0;
  const hasLocalVideo = getTaskModalVideoUrl(task) !== null;
  return !hasLocalDescription || !hasLocalVideo;
}

export function getTaskModalTemplateId(task: any): string | null {
  if (!task) return null;

  const directTemplateId = trimString(task.task_template_id ?? task.taskTemplateId);
  if (directTemplateId) return directTemplateId;

  const feedbackTemplateId = trimString(task.feedback_template_id ?? task.feedbackTemplateId);
  if (feedbackTemplateId) return feedbackTemplateId;

  const markerTemplateId =
    parseTemplateIdFromMarker(typeof task.description === 'string' ? task.description : '') ||
    parseTemplateIdFromMarker(typeof task.title === 'string' ? task.title : '');

  return trimString(markerTemplateId) || null;
}

function normalizeTaskForModal<T extends Record<string, any>>(
  task: T,
  fallback: { title?: string | null; description?: string | null; video_url?: string | null }
): T {
  const localTitle = trimString(task.title);
  const localDescription = trimString(task.description);
  const localVideo = getTaskModalVideoUrl(task);

  const nextTitle = localTitle || trimString(fallback.title) || String(task.title ?? '');
  const nextDescription = localDescription || trimString(fallback.description);
  const nextVideo = localVideo || trimString(fallback.video_url) || null;

  return {
    ...task,
    title: nextTitle,
    description: nextDescription,
    video_url: nextVideo,
    videoUrl: nextVideo ?? undefined,
  };
}

export async function hydrateTaskForModal<T extends Record<string, any>>(task: T): Promise<T> {
  if (!task) return task;

  const templateId = getTaskModalTemplateId(task);

  if (!shouldHydrateTaskForModal(task) || !templateId) {
    return normalizeTaskForModal(task, {});
  }

  try {
    const { data, error } = await supabase
      .from('task_templates')
      .select('id, title, description, video_url')
      .eq('id', templateId)
      .maybeSingle();

    if (error || !data) {
      return normalizeTaskForModal(task, {});
    }

    return normalizeTaskForModal(task, {
      title: data.title ?? null,
      description: data.description ?? null,
      video_url: data.video_url ?? null,
    });
  } catch {
    return normalizeTaskForModal(task, {});
  }
}
