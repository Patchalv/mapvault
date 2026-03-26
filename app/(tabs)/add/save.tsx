import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getTagDisplayName } from '@/lib/get-tag-display-name';
import {
  View,
  Text,
  TextInput,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Alert,
  Keyboard,
  TouchableWithoutFeedback,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { BottomSheetModal } from '@gorhom/bottom-sheet';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useActiveMap } from '@/hooks/use-active-map';
import { useTags } from '@/hooks/use-tags';
import { useAddPlace } from '@/hooks/use-add-place';
import { useCreateTag } from '@/hooks/use-manage-tags';
import { TagEditor } from '@/components/tag-editor/tag-editor';
import { useFreemiumGate } from '@/hooks/use-freemium-gate';
import { useAppReview } from '@/hooks/use-app-review';
import { track } from '@/lib/analytics';
import { supabase } from '@/lib/supabase';
import { getPlaceDetails } from '@/lib/google-places';
import { MapPickerSheet } from '@/components/map-picker-sheet/map-picker-sheet';

export default function SaveScreen() {
  const { t } = useTranslation();
  const { placeId, name, address } = useLocalSearchParams<{
    placeId: string;
    name: string;
    address: string;
  }>();

  const { activeMapId, activeMapName, isAllMaps, maps } = useActiveMap();
  const [overrideMapId, setOverrideMapId] = useState<string | null>(null);
  const mapPickerRef = useRef<BottomSheetModal>(null);

  const effectiveMapId = isAllMaps ? overrideMapId : activeMapId;
  const effectiveMapName = isAllMaps
    ? (maps.find((m) => m.id === overrideMapId)?.name ?? null)
    : activeMapName;

  const { data: tags } = useTags(effectiveMapId);
  const addPlace = useAddPlace();
  const createTag = useCreateTag();
  const tagEditorRef = useRef<BottomSheetModal>(null);
  const [tagEditorKey, setTagEditorKey] = useState(0);
  // Ref so onSuccess can read the live effectiveMapId — mutate()'s inline callbacks
  // capture a stale closure from the render when mutate() was called, not when it settles
  const effectiveMapIdRef = useRef<string | null>(effectiveMapId);
  effectiveMapIdRef.current = effectiveMapId;
  const { handleMutationError } = useFreemiumGate();
  const { maybeRequestReview } = useAppReview();
  const didSaveRef = useRef(false);

  // Track abandonment on unmount
  useEffect(() => {
    return () => {
      if (!didSaveRef.current) {
        track('place_save_abandoned', {});
      }
    };
  }, []);

  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const [visited, setVisited] = useState(false);
  const [placeDetails, setPlaceDetails] = useState<{
    latitude: number;
    longitude: number;
    types: string[];
  } | null>(null);
  const [isLoadingDetails, setIsLoadingDetails] = useState(true);

  useEffect(() => {
    if (!placeId) return;

    let cancelled = false;
    setIsLoadingDetails(true);

    getPlaceDetails(placeId)
      .then((details) => {
        if (!cancelled) setPlaceDetails(details);
      })
      .catch(() => {
        if (!cancelled) Alert.alert(t('common.error'), t('savePlace.failedToLoadDetails'));
      })
      .finally(() => {
        if (!cancelled) setIsLoadingDetails(false);
      });

    return () => {
      cancelled = true;
    };
  }, [placeId, t]);

  // Reset selected tags when the effective map changes (tags are per-map)
  useEffect(() => {
    setSelectedTagIds([]);
  }, [effectiveMapId]);

  const toggleTag = (tagId: string) => {
    setSelectedTagIds((prev) =>
      prev.includes(tagId)
        ? prev.filter((id) => id !== tagId)
        : [...prev, tagId]
    );
  };

  const googleCategory = placeDetails?.types?.[0]?.replace(/_/g, ' ') ?? null;

  const handleSave = () => {
    if (!effectiveMapId || !placeDetails || !placeId || !name) return;

    addPlace.mutate(
      {
        googlePlaceId: placeId,
        name,
        address: address ?? '',
        latitude: placeDetails.latitude,
        longitude: placeDetails.longitude,
        googleCategory,
        mapId: effectiveMapId,
        note,
        tagIds: selectedTagIds,
        visited,
      },
      {
        onSuccess: () => {
          didSaveRef.current = true;
          const tagNames = tags
            ?.filter((t) => selectedTagIds.includes(t.id))
            .map((t) => t.name) ?? [];
          track('place_saved', {
            map_id: effectiveMapId!,
            tag_count: selectedTagIds.length,
            tags: tagNames,
            has_note: !!note.trim(),
            visited,
            google_category: googleCategory,
          });
          // Dismiss keyboard first, then navigate after it has had a tick to
          // begin its animation — prevents keyboard flash during screen transition
          Keyboard.dismiss();
          setTimeout(() => {
            router.dismiss();
            router.replace({
              pathname: '/(tabs)/explore',
              params: {
                focusLat: String(placeDetails.latitude),
                focusLng: String(placeDetails.longitude),
              },
            });
          }, 0);
          // Check if this is the user's 10th saved place
          setTimeout(async () => {
            try {
              const { data: { user: currentUser } } = await supabase.auth.getUser();
              if (!currentUser) return;
              const { count } = await supabase
                .from('map_places')
                .select('*', { count: 'exact', head: true })
                .eq('added_by', currentUser.id);
              if (count === 10) {
                maybeRequestReview('places_saved_milestone');
              }
            } catch {
              // Non-critical — silently ignore
            }
          }, 1500);
        },
        onError: (error) => {
          handleMutationError(error);
        },
      }
    );
  };

  const canSave = !isLoadingDetails && !!placeDetails && !!effectiveMapId;

  return (
    <>
      <TouchableWithoutFeedback
        onPress={Keyboard.dismiss}
        accessible={false} // prevents VoiceOver treating the whole screen as one element
      >
        <View className="flex-1 bg-white">
          <SafeAreaView className="flex-1 bg-white" edges={['top']}>
            <View className="flex-row items-center justify-between px-4 pb-2 pt-2">
              <Pressable onPress={() => router.back()} hitSlop={8}>
                <Text className="text-base text-blue-500">{t('common.cancel')}</Text>
              </Pressable>
              <Text className="text-lg font-semibold">{t('savePlace.title')}</Text>
              <View className="w-14" />
            </View>

            <ScrollView
              className="flex-1 px-4"
              keyboardDismissMode="interactive"
              keyboardShouldPersistTaps="handled"
              contentContainerClassName="pb-8"
            >
              {/* Place preview */}
              <View className="mt-4 rounded-xl bg-gray-50 p-4">
                <Text className="text-lg font-semibold">{name}</Text>
                {address ? (
                  <Text className="mt-1 text-sm text-gray-500">{address}</Text>
                ) : null}
                {googleCategory && (
                  <Text className="mt-1 text-xs capitalize text-gray-400">
                    {googleCategory}
                  </Text>
                )}
                {isLoadingDetails && (
                  <ActivityIndicator
                    size="small"
                    className="mt-2 self-start"
                    color="#9CA3AF"
                  />
                )}
              </View>

              {/* Tags */}
              {effectiveMapId && (
                <View className="mt-6">
                  <Text className="mb-2 text-sm font-medium text-gray-500">
                    {t('savePlace.tags')}
                  </Text>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerClassName="gap-2"
                  >
                    {tags?.map((tag) => {
                      const isSelected = selectedTagIds.includes(tag.id);
                      return (
                        <Pressable
                          key={tag.id}
                          onPress={() => toggleTag(tag.id)}
                          className={`flex-row items-center rounded-full px-3 py-1.5 ${
                            isSelected ? 'bg-blue-500' : 'bg-gray-100'
                          }`}
                        >
                          {tag.emoji && (
                            <Text className="mr-1 text-sm">{tag.emoji}</Text>
                          )}
                          <Text
                            className={`text-sm font-medium ${
                              isSelected ? 'text-white' : 'text-gray-700'
                            }`}
                          >
                            {getTagDisplayName(tag)}
                          </Text>
                        </Pressable>
                      );
                    })}
                    <Pressable
                      onPress={() => tagEditorRef.current?.present()}
                      className="flex-row items-center rounded-full bg-gray-100 px-3 py-1.5"
                    >
                      <Text className="text-sm font-medium text-gray-500">
                        + {t('savePlace.newTag')}
                      </Text>
                    </Pressable>
                  </ScrollView>
                </View>
              )}

              {/* Note */}
              <View className="mt-6">
                <Text className="mb-2 text-sm font-medium text-gray-500">{t('savePlace.note')}</Text>
                <TextInput
                  className="min-h-[80px] rounded-xl bg-gray-50 px-4 py-3 text-base"
                  placeholder={t('savePlace.notePlaceholder')}
                  placeholderTextColor="#9CA3AF"
                  value={note}
                  onChangeText={setNote}
                  multiline
                  textAlignVertical="top"
                />
              </View>

              {/* Visited toggle */}
              <Pressable
                className="mt-6 flex-row items-center justify-between rounded-xl bg-gray-50 px-4 py-3"
                onPress={() => setVisited((v) => !v)}
              >
                <Text className="text-base">{t('savePlace.alreadyVisited')}</Text>
                <View
                  className={`h-6 w-6 items-center justify-center rounded-md ${
                    visited ? 'bg-blue-500' : 'border-2 border-gray-300'
                  }`}
                >
                  {visited && <Text className="text-xs text-white">✓</Text>}
                </View>
              </Pressable>

              {/* Map label */}
              {isAllMaps ? (
                <Pressable
                  className="mt-6 flex-row items-center justify-center"
                  onPress={() => mapPickerRef.current?.present()}
                >
                  <Text className="text-center text-sm text-blue-500">
                    {effectiveMapName
                      ? t('savePlace.savingTo', { mapName: effectiveMapName })
                      : t('savePlace.tapToSelectMap')}
                  </Text>
                  <FontAwesome
                    name="chevron-down"
                    size={10}
                    color="#3B82F6"
                    style={{ marginLeft: 6 }}
                  />
                </Pressable>
              ) : activeMapName ? (
                <Text className="mt-6 text-center text-sm text-gray-400">
                  {t('savePlace.savingTo', { mapName: activeMapName })}
                </Text>
              ) : null}

              {/* Save button */}
              <Pressable
                className={`mt-6 items-center rounded-xl py-3.5 ${
                  canSave && !addPlace.isPending
                    ? 'bg-blue-500 active:bg-blue-600'
                    : 'bg-gray-200'
                }`}
                onPress={handleSave}
                disabled={!canSave || addPlace.isPending}
              >
                {addPlace.isPending ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text
                    className={`text-base font-semibold ${
                      canSave ? 'text-white' : 'text-gray-400'
                    }`}
                  >
                    {t('savePlace.saveButton')}
                  </Text>
                )}
              </Pressable>
            </ScrollView>
          </SafeAreaView>
        </View>
      </TouchableWithoutFeedback>
      <MapPickerSheet
        ref={mapPickerRef}
        maps={maps}
        selectedMapId={overrideMapId}
        onSelectMap={setOverrideMapId}
      />
      {effectiveMapId && (
        <TagEditor
          key={tagEditorKey}
          ref={tagEditorRef}
          mapId={effectiveMapId}
          editingTag={null}
          onCreateTag={({ mapId: initiatingMapId, name, emoji, color }) => {
            createTag.mutate({ mapId: initiatingMapId, name, emoji, color }, {
              onSuccess: (newTag) => {
                // Use ref to read the live effectiveMapId — closure would be stale
                if (effectiveMapIdRef.current === initiatingMapId) {
                  setSelectedTagIds((prev) => [...prev, newTag.id]);
                }
                tagEditorRef.current?.dismiss();
                setTagEditorKey((k) => k + 1);
              },
              onError: (err) => Alert.alert(t('common.error'), err.message),
            });
          }}
          onUpdateTag={() => {}} // create-only mode
          onDeleteTag={() => {}} // create-only mode
          isPending={createTag.isPending}
        />
      )}
    </>
  );
}
