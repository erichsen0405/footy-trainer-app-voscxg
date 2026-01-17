/**
 * BINARY SEARCH TEST - GROUP 1 (First half of imports)
 * Testing: commonStyles, IconSymbol, supabase, TeamPlayerContext
 */

import React from 'react';
import { Platform } from 'react-native';
import { Redirect } from 'expo-router';

// GROUP 1 - TESTING THESE:
import { colors, getColors } from '@/styles/commonStyles';
import { IconSymbol } from '@/components/IconSymbol';
import { supabase } from '@/integrations/supabase/client';
import { useTeamPlayer } from '@/contexts/TeamPlayerContext';

// GROUP 2 - STILL COMMENTED:
// import { useUserRole } from '@/hooks/useUserRole';
// import { useAdmin } from '@/contexts/AdminContext';
// import { useFocusEffect } from '@react-navigation/native';
// import SmartVideoPlayer from '@/components/SmartVideoPlayer';
// import { AdminContextWrapper } from '@/components/AdminContextWrapper';

export default function Library() {
  if (Platform.OS === 'web') {
    return null;
  }
  return null;
}

export function LegacyLibraryRoute() {
  return <Redirect href="/(tabs)/library" />;
}
