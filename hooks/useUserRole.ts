
import { useState, useEffect } from 'react';
import { supabase } from '@/app/integrations/supabase/client';

export function useUserRole() {
  const [userRole, setUserRole] = useState<'admin' | 'trainer' | 'player' | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchUserRole = async () => {
      try {
        const { data: { user }, error: userError } = await supabase.auth.getUser();
        
        if (userError || !user) {
          console.log('No user found or error:', userError);
          setUserRole(null);
          setLoading(false);
          return;
        }

        const { data, error } = await supabase
          .from('user_roles')
          .select('role')
          .eq('user_id', user.id)
          .maybeSingle();

        if (error) {
          console.error('Error fetching user role:', error);
          // If there's an error, default to player for new users
          // This ensures the app remains functional
          setUserRole('player');
        } else if (data) {
          setUserRole(data.role as 'admin' | 'trainer' | 'player');
        } else {
          // No role found - this is a new user, default to player
          console.log('No role found for user, defaulting to player');
          
          // Try to create a default player role for this user
          const { error: insertError } = await supabase
            .from('user_roles')
            .insert({ user_id: user.id, role: 'player' });
          
          if (insertError) {
            console.error('Error creating default role:', insertError);
          }
          
          setUserRole('player');
        }
      } catch (error) {
        console.error('Error in fetchUserRole:', error);
        setUserRole('player');
      } finally {
        setLoading(false);
      }
    };

    fetchUserRole();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session?.user) {
        fetchUserRole();
      } else {
        setUserRole(null);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // Export isAdmin as a computed property - includes both admin and trainer roles
  const isAdmin = userRole === 'admin' || userRole === 'trainer';

  return { userRole, loading, isAdmin };
}
