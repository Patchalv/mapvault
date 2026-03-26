import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { MapPlaceWithDetails } from '@/types';

export function useUpdatePlaceNote(activeMapId: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      mapPlaceId,
      note,
    }: {
      mapPlaceId: string;
      note: string | null;
    }) => {
      const { error } = await supabase
        .from('map_places')
        .update({ note })
        .eq('id', mapPlaceId);

      if (error) throw error;
    },
    onMutate: async ({ mapPlaceId, note }) => {
      const queryKey = ['map-places', activeMapId];
      await queryClient.cancelQueries({ queryKey });

      const previous =
        queryClient.getQueryData<MapPlaceWithDetails[]>(queryKey);

      queryClient.setQueryData<MapPlaceWithDetails[]>(queryKey, (old) =>
        old?.map((p) => (p.id === mapPlaceId ? { ...p, note } : p))
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
      queryClient.invalidateQueries({ queryKey: ['map-places', activeMapId] });
    },
  });
}
