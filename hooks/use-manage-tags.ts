import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { track } from '@/lib/analytics';
import type { Tag } from '@/types';

interface CreateTagInput {
  mapId: string;
  name: string;
  emoji: string;
  color: string;
}

interface UpdateTagInput {
  tagId: string;
  mapId: string;
  name: string;
  emoji: string;
  color: string;
  default_key: string | null;
}

interface DeleteTagInput {
  tagId: string;
  mapId: string;
}

export function useCreateTag() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ mapId, name, emoji, color }: CreateTagInput) => {
      // Get max position
      const { data: existing, error: fetchError } = await supabase
        .from('tags')
        .select('position')
        .eq('map_id', mapId)
        .order('position', { ascending: false })
        .limit(1);

      if (fetchError) throw fetchError;

      const nextPosition = existing && existing.length > 0 ? existing[0].position + 1 : 0;

      const { data, error } = await supabase
        .from('tags')
        .insert({
          map_id: mapId,
          name: name.trim(),
          emoji,
          color,
          position: nextPosition,
        })
        .select()
        .single();

      if (error) {
        if (error.code === '23505') {
          throw new Error('A tag with this name already exists on this map');
        }
        throw error;
      }

      return data as Tag;
    },
    onSuccess: (_data, variables) => {
      track('tag_created', { map_id: variables.mapId, tag_name: variables.name });
      queryClient.invalidateQueries({ queryKey: ['tags', variables.mapId] });
    },
  });
}

export function useUpdateTag() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ tagId, mapId, name, emoji, color, default_key }: UpdateTagInput) => {
      const { error } = await supabase
        .from('tags')
        .update({ name: name.trim(), emoji, color, default_key })
        .eq('id', tagId);

      if (error) {
        if (error.code === '23505') {
          throw new Error('A tag with this name already exists on this map');
        }
        throw error;
      }
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['tags', variables.mapId] });
      queryClient.invalidateQueries({ queryKey: ['map-places', variables.mapId] });
    },
  });
}

export function useDeleteTag() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ tagId }: DeleteTagInput) => {
      const { error } = await supabase
        .from('tags')
        .delete()
        .eq('id', tagId);

      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['tags', variables.mapId] });
      queryClient.invalidateQueries({ queryKey: ['map-places', variables.mapId] });
    },
  });
}
