import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { track } from '@/lib/analytics';
import type { MapRole } from '@/types';

interface UpdateMemberRoleInput {
  memberId: string;
  mapId: string;
  newRole: Exclude<MapRole, 'owner'>;
}

export function useUpdateMemberRole() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ memberId, mapId, newRole }: UpdateMemberRoleInput) => {
      const { error } = await supabase
        .from('map_members')
        .update({ role: newRole })
        .eq('id', memberId)
        .eq('map_id', mapId);

      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      track('member_role_changed', {
        map_id: variables.mapId,
        new_role: variables.newRole,
      });
      queryClient.invalidateQueries({ queryKey: ['map-members', variables.mapId] });
      queryClient.invalidateQueries({ queryKey: ['maps'] });
    },
  });
}
