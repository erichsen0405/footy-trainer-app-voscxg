import { supabase } from '@/integrations/supabase/client';
import { parseTemplateIdFromMarker } from '@/utils/afterTrainingMarkers';
import { getPrimaryTaskVideoUrl, getTaskVideoUrls } from '@/utils/taskVideos';

function trimString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function getTaskModalVideoUrl(task: any): string | null {
  return getPrimaryTaskVideoUrl(task);
}

export function getTaskModalVideoUrls(task: any): string[] {
  return getTaskVideoUrls(task);
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
  fallback: { title?: string | null; description?: string | null; video_url?: string | null; video_urls?: string[] | null }
): T {
  const localTitle = trimString(task.title);
  const localDescription = trimString(task.description);
  const localVideos = getTaskModalVideoUrls(task);
  const fallbackVideos = getTaskModalVideoUrls(fallback);

  const nextTitle = localTitle || trimString(fallback.title) || String(task.title ?? '');
  const nextDescription = localDescription || trimString(fallback.description);
  const nextVideos = localVideos.length ? localVideos : fallbackVideos;
  const nextVideo = nextVideos[0] ?? null;

  return {
    ...task,
    title: nextTitle,
    description: nextDescription,
    video_url: nextVideo,
    videoUrl: nextVideo ?? undefined,
    video_urls: nextVideos.length ? nextVideos : null,
    videoUrls: nextVideos,
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
      .select('id, title, description, video_url, video_urls')
      .eq('id', templateId)
      .maybeSingle();

    if (error || !data) {
      return normalizeTaskForModal(task, {});
    }

    const row = data as any;
    return normalizeTaskForModal(task, {
      title: row.title ?? null,
      description: row.description ?? null,
      video_url: row.video_url ?? null,
      video_urls: Array.isArray(row.video_urls) ? row.video_urls : null,
    });
  } catch {
    return normalizeTaskForModal(task, {});
  }
}
