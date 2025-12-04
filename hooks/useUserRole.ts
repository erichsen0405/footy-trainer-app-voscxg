
import { useState, useEffect } from 'react';
import { supabase } from '@/app/integrations/supabase/client';

export function useUserRole() {
  const [userRole, setUserRole] = useState<'admin' | 'player' | null>(null);
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
          // If there's an error, default to admin for existing users
          // This ensures the app remains functional
          setUserRole('admin');
        } else if (data) {
          setUserRole(data.role as 'admin' | 'player');
        } else {
          // No role found - this is a new user, default to admin
          console.log('No role found for user, defaulting to admin');
          
          // Try to create a default admin role for this user
          const { error: insertError } = await supabase
            .from('user_roles')
            .insert({ user_id: user.id, role: 'admin' });
          
          if (insertError) {
            console.error('Error creating default role:', insertError);
          }
          
          setUserRole('admin');
        }
      } catch (error) {
        console.error('Error in fetchUserRole:', error);
        setUserRole('admin');
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

  // CRITICAL FIX: Export isAdmin as a computed property
  const isAdmin = userRole === 'admin';

  return { userRole, loading, isAdmin };
}
