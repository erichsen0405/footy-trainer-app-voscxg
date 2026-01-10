import { supabase } from '@/app/integrations/supabase/client';

export interface UpdateActivityIntensityParams {
  activityId: string;
  intensity: number | null;
  enableIntensity?: boolean;
  isExternal?: boolean;
}

export async function updateActivityIntensity({
  activityId,
  intensity,
  enableIntensity = true,
  isExternal = false,
}: UpdateActivityIntensityParams): Promise<void> {
  if (!activityId) {
    throw new Error('activityId is required to update intensity');
  }

  const timestamp = new Date().toISOString();
  const payload = {
    activity_intensity: typeof intensity === 'number' ? intensity : null,
    activity_intensity_enabled: enableIntensity,
    updated_at: timestamp,
  };

  if (isExternal) {
    const { error } = await supabase
      .from('events_local_meta')
      .update({
        ...payload,
        last_local_modified: timestamp,
      })
      .eq('id', activityId);

    if (error) {
      throw error;
    }
    return;
  }

  const { error } = await supabase
    .from('activities')
    .update(payload)
    .eq('id', activityId);

  if (error) {
    throw error;
  }
}
