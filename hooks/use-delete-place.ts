import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { MapPlaceWithDetails } from '@/types';

export function useDeletePlace(activeMapId: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (mapPlaceId: string) => {
      const { error } = await supabase
        .from('map_places')
        .delete()
        .eq('id', mapPlaceId);

      if (error) throw error;
    },
    onMutate: async (mapPlaceId) => {
      const queryKey = ['map-places', activeMapId];
      await queryClient.cancelQueries({ queryKey });

      const previous =
        queryClient.getQueryData<MapPlaceWithDetails[]>(queryKey);

      queryClient.setQueryData<MapPlaceWithDetails[]>(queryKey, (old) =>
        old?.filter((p) => p.id !== mapPlaceId)
      );

      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(
          ['map-places', activeMapId],
          context.previous
        );
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: ['map-places', activeMapId],
      });
      queryClient.invalidateQueries({ queryKey: ['place-count'] });
    },
  });
}
