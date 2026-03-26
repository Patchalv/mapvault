import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { EdgeFunctionError } from '@/lib/edge-function-error';

interface AddPlaceInput {
  googlePlaceId: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  googleCategory: string | null;
  mapId: string;
  note: string;
  tagIds: string[];
  visited: boolean;
}

export function useAddPlace() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: AddPlaceInput) => {
      const { data, error } = await supabase.functions.invoke('add-place', {
        body: input,
      });

      if (error) {
        let message = 'Failed to save place';
        let code: string | null = null;
        if (error.context instanceof Response) {
          try {
            const body = await error.context.json();
            if (typeof body.error === 'string') {
              message = body.error;
            } else if (typeof body.message === 'string') {
              message = body.message;
            }
            if (typeof body.code === 'string') {
              code = body.code;
            }
          } catch {
            // Response body wasn't valid JSON
          }
        }
        throw new EdgeFunctionError(message, code);
      }

      return data.mapPlaceId as string;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['map-places', variables.mapId],
      });
      queryClient.invalidateQueries({ queryKey: ['place-count'] });
    },
  });
}
