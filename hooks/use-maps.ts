import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/use-auth';

export function useMaps() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['maps'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('map_members')
        .select('map_id, role, maps(id, name, created_by, map_members(*), map_places(*))')
        .eq('user_id', user!.id);

      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });
}
