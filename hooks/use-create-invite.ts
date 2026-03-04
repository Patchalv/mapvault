import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/use-auth';
import { track } from '@/lib/analytics';
import { EdgeFunctionError } from '@/lib/edge-function-error';
import type { MapInvite } from '@/types';

interface CreateInviteInput {
  mapId: string;
  role?: 'contributor' | 'member';
  expiresInDays?: number | null;
  maxUses?: number | null;
}

interface CreateInviteResult {
  invite: MapInvite;
  link: string;
}

export function useCreateInvite() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (input: CreateInviteInput): Promise<CreateInviteResult> => {
      if (!user) throw new Error('Not authenticated');

      const { data, error } = await supabase.functions.invoke('create-invite', {
        body: {
          mapId: input.mapId,
          role: input.role ?? 'contributor',
          expiresInDays: input.expiresInDays ?? null,
          maxUses: input.maxUses ?? null,
        },
      });

      if (error) {
        let message = 'Failed to create invite';
        let code: string | null = null;

        if (error.context instanceof Response) {
          try {
            const body = await error.context.json();
            if (typeof body.error === 'string') message = body.error;
            if (typeof body.code === 'string') code = body.code;
          } catch {
            // Response body wasn't valid JSON
          }
        }

        throw new EdgeFunctionError(message, code);
      }

      return data as CreateInviteResult;
    },
    onSuccess: (_data, variables) => {
      track('invite_link_created', { map_id: variables.mapId });
      queryClient.invalidateQueries({ queryKey: ['invites', variables.mapId] });
    },
  });
}
