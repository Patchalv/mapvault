import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { track } from '@/lib/analytics';
import type { MapRole } from '@/types';

interface RemoveMemberInput {
  memberId: string;
  mapId: string;
  role: Exclude<MapRole, 'owner'>;
}

export function useRemoveMember() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ memberId, mapId }: RemoveMemberInput) => {
      const { error, count } = await supabase
        .from('map_members')
        .delete({ count: 'exact' })
        .eq('id', memberId)
        .eq('map_id', mapId);

      if (error) throw error;
      if (count === 0) throw new Error('Member not found or already removed');
    },
    onSuccess: (_data, variables) => {
      track('member_removed', {
        map_id: variables.mapId,
        role: variables.role,
      });
      queryClient.invalidateQueries({ queryKey: ['map-members', variables.mapId] });
      queryClient.invalidateQueries({ queryKey: ['maps'] });
    },
  });
}
