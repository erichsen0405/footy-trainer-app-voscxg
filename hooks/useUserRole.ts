
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
          setUserRole(null);
          setLoading(false);
          return;
        }

        const { data, error } = await supabase
          .from('user_roles')
          .select('role')
          .eq('user_id', user.id)
          .single();

        if (error) {
          console.error('Error fetching user role:', error);
          // Default to admin if no role is set
          setUserRole('admin');
        } else {
          setUserRole(data?.role as 'admin' | 'player');
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

  return { userRole, loading };
}
