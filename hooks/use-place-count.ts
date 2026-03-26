import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/use-auth';

export function usePlaceCount() {
  const { user } = useAuth();
  const userId = user?.id ?? null;

  return useQuery({
    queryKey: ['place-count', userId],
    queryFn: async () => {
      const { count, error } = await supabase
        .from('map_places')
        .select('*', { count: 'exact', head: true })
        .eq('added_by', userId!);

      if (error) throw error;
      return count ?? 0;
    },
    enabled: !!userId,
  });
}
