import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { MapRole } from '@/types';

interface AcceptInviteResult {
  mapId: string;
  mapName: string;
  role: MapRole;
}

export interface InviteError extends Error {
  code?: string;
}

export function useAcceptInvite() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (token: string): Promise<AcceptInviteResult> => {
      const { data, error } = await supabase.functions.invoke('accept-invite', {
        body: { token },
      });

      if (error) {
        let message = 'Failed to accept invite';
        let code: string | undefined;

        if (error.context instanceof Response) {
          try {
            const body = await error.context.json();
            if (typeof body.error === 'string') {
              message = body.error;
            }
            if (typeof body.code === 'string') {
              code = body.code;
            }
          } catch {
            // Response body wasn't valid JSON
          }
        }

        const err: InviteError = new Error(message);
        err.code = code;
        throw err;
      }

      return data as AcceptInviteResult;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['maps'] });
      queryClient.invalidateQueries({ queryKey: ['profile'] });
    },
  });
}
