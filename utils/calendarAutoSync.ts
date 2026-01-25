
import { supabase } from '@/integrations/supabase/client';
import { Platform } from 'react-native';

export async function triggerManualSync() {
  try {
    console.log('Manual calendar sync triggered');
    
    const { data: { session } } = await supabase.auth.getSession();
    
    if (!session) {
      throw new Error('Not authenticated');
    }

    const { data, error } = await supabase.functions.invoke('auto-sync-calendars', {
      body: {},
    });

    if (error) {
      console.error('Manual sync error:', error);
      throw error;
    }

    console.log('Manual sync result:', data);
    return data;
  } catch (error) {
    console.error('Manual sync exception:', error);
    throw error;
  }
}

export async function checkSyncStatus() {
  try {
    // For now, just return a simple status
    // In the future, this could check if background sync is enabled
    return {
      registered: false,
      available: Platform.OS !== 'web',
      status: 'manual',
    };
  } catch (error) {
    console.error('Error checking sync status:', error);
    return { registered: false, available: false, error };
  }
}

// Function to check if any calendars need syncing
export async function checkCalendarsNeedSync(): Promise<boolean> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return false;
    }

    const now = new Date();
    const { data: calendars } = await supabase
      .from('external_calendars')
      .select('*')
      .eq('user_id', user.id)
      .eq('enabled', true)
      .eq('auto_sync_enabled', true);

    if (!calendars || calendars.length === 0) {
      return false;
    }

    // Check if any calendar needs syncing
    const needsSync = calendars.some((calendar) => {
      if (!calendar.last_fetched) {
        return true;
      }

      const lastFetched = new Date(calendar.last_fetched);
      const syncIntervalMs = (calendar.sync_interval_minutes || 60) * 60 * 1000;
      const timeSinceLastSync = now.getTime() - lastFetched.getTime();

      return timeSinceLastSync >= syncIntervalMs;
    });

    return needsSync;
  } catch (error) {
    console.error('Error checking if calendars need sync:', error);
    return false;
  }
}
