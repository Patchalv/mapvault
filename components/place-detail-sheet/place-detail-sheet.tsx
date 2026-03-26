import { forwardRef, useCallback, useEffect, useRef, useState } from 'react';
import { getTagDisplayName } from '@/lib/get-tag-display-name';
import { View, Text, Pressable, Alert, ScrollView } from 'react-native';
import BottomSheet, {
  BottomSheetModal,
  BottomSheetScrollView,
  BottomSheetTextInput,
} from '@gorhom/bottom-sheet';
import { useCreateTag } from '@/hooks/use-manage-tags';
import { TagEditor } from '@/components/tag-editor/tag-editor';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useTranslation } from 'react-i18next';
import type { MapPlaceWithDetails, Tag } from '@/types';
import { openDirections } from '@/lib/directions';
import { track } from '@/lib/analytics';

interface PlaceDetailSheetProps {
  place: MapPlaceWithDetails | null;
  availableTags: Tag[];
  mapId: string;
  canEdit?: boolean;
  onToggleVisited: (mapPlaceId: string, visited: boolean) => void;
  onToggleTag: (
    mapPlaceId: string,
    tagId: string,
    tag: Tag,
    currentlyAssigned: boolean
  ) => void;
  onUpdateNote: (mapPlaceId: string, note: string | null) => void;
  onDelete: (mapPlaceId: string) => void;
  onClose: () => void;
}

export const PlaceDetailSheet = forwardRef<BottomSheet, PlaceDetailSheetProps>(
  function PlaceDetailSheet(
    { place, availableTags, mapId, canEdit = true, onToggleVisited, onToggleTag, onUpdateNote, onDelete, onClose },
    ref
  ) {
    const { t } = useTranslation();
    const isVisited = place?.place_visits[0]?.visited ?? false;
    const [isEditingTags, setIsEditingTags] = useState(false);
    const tagEditorRef = useRef<BottomSheetModal>(null);
    const createTag = useCreateTag();
    const [tagEditorKey, setTagEditorKey] = useState(0);
    const [isEditingNote, setIsEditingNote] = useState(false);
    const [draftNote, setDraftNote] = useState('');

    // Reset edit mode when place changes
    useEffect(() => {
      setIsEditingTags(false);
      setIsEditingNote(false);
    }, [place?.id]);

    const assignedTagIds = new Set(
      place?.map_place_tags.map((mpt) => mpt.tag_id) ?? []
    );

    const handleDirections = useCallback(() => {
      if (!place) return;
      track('directions_opened', { map_place_id: place.id });
      openDirections(
        place.places.latitude,
        place.places.longitude,
        place.places.name
      );
    }, [place]);

    const handleToggleVisited = useCallback(() => {
      if (!place) return;
      onToggleVisited(place.id, !isVisited);
    }, [place, isVisited, onToggleVisited]);

    const handleStartEditingNote = useCallback(() => {
      setDraftNote(place?.note ?? '');
      setIsEditingNote(true);
    }, [place?.note]);

    const handleSaveNote = useCallback(() => {
      if (!place) return;
      const trimmed = draftNote.trim();
      onUpdateNote(place.id, trimmed || null);
      setIsEditingNote(false);
    }, [place, draftNote, onUpdateNote]);

    const handleCancelNote = useCallback(() => {
      setIsEditingNote(false);
    }, []);

    const handleDelete = useCallback(() => {
      if (!place) return;
      Alert.alert(
        t('placeDetailSheet.deletePlaceTitle'),
        t('placeDetailSheet.deletePlaceMessage', { placeName: place.places.name }),
        [
          { text: t('common.cancel'), style: 'cancel' },
          {
            text: t('common.delete'),
            style: 'destructive',
            onPress: () => onDelete(place.id),
          },
        ]
      );
    }, [place, onDelete, t]);

    return (
      <>
      <BottomSheet
        ref={ref}
        index={-1}
        snapPoints={['30%', '60%']}
        enablePanDownToClose
        onClose={onClose}
        backgroundStyle={{ backgroundColor: '#FFFFFF', borderRadius: 24 }}
        handleIndicatorStyle={{ backgroundColor: '#D1D5DB', width: 40 }}
      >
        <BottomSheetScrollView
          contentContainerStyle={{ padding: 20, paddingTop: 4 }}
        >
          {place && (
            <>
              {/* Name */}
              <Text
                style={{
                  fontSize: 20,
                  fontWeight: '700',
                  color: '#111827',
                  marginBottom: 4,
                }}
              >
                {place.places.name}
              </Text>

              {/* Address */}
              {place.places.address && (
                <Text
                  style={{
                    fontSize: 14,
                    color: '#6B7280',
                    marginBottom: 12,
                  }}
                >
                  {place.places.address}
                </Text>
              )}

              {/* Tags */}
              {isEditingTags ? (
                <View style={{ marginBottom: 16 }}>
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginBottom: 8,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 13,
                        fontWeight: '500',
                        color: '#6B7280',
                      }}
                    >
                      {t('placeDetailSheet.editTags')}
                    </Text>
                    <Pressable
                      onPress={() => setIsEditingTags(false)}
                      hitSlop={8}
                    >
                      <FontAwesome name="check" size={16} color="#10B981" />
                    </Pressable>
                  </View>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={{ gap: 8 }}
                  >
                    {availableTags.map((tag) => {
                      const isAssigned = assignedTagIds.has(tag.id);
                      return (
                        <Pressable
                          key={tag.id}
                          onPress={() =>
                            onToggleTag(place.id, tag.id, tag, isAssigned)
                          }
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            backgroundColor: isAssigned
                              ? `${tag.color ?? '#6B7280'}20`
                              : '#F3F4F6',
                            borderRadius: 16,
                            paddingHorizontal: 10,
                            paddingVertical: 4,
                            borderWidth: isAssigned ? 1.5 : 1,
                            borderColor: isAssigned
                              ? (tag.color ?? '#6B7280')
                              : '#E5E7EB',
                          }}
                        >
                          {tag.emoji && (
                            <Text style={{ fontSize: 12, marginRight: 4 }}>
                              {tag.emoji}
                            </Text>
                          )}
                          <Text
                            style={{
                              fontSize: 13,
                              fontWeight: '500',
                              color: isAssigned
                                ? (tag.color ?? '#6B7280')
                                : '#9CA3AF',
                            }}
                          >
                            {getTagDisplayName(tag)}
                          </Text>
                        </Pressable>
                      );
                    })}
                    <Pressable
                      onPress={() => tagEditorRef.current?.present()}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        backgroundColor: '#F3F4F6',
                        borderRadius: 16,
                        paddingHorizontal: 10,
                        paddingVertical: 4,
                        borderWidth: 1,
                        borderColor: '#E5E7EB',
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 13,
                          fontWeight: '500',
                          color: '#6B7280',
                        }}
                      >
                        + {t('placeDetailSheet.newTag')}
                      </Text>
                    </Pressable>
                  </ScrollView>
                </View>
              ) : (
                <View
                  style={{
                    flexDirection: 'row',
                    flexWrap: 'wrap',
                    alignItems: 'center',
                    gap: 8,
                    marginBottom:
                      place.map_place_tags.length > 0 || availableTags.length > 0
                        ? 16
                        : 0,
                  }}
                >
                  {place.map_place_tags.map((mpt) => (
                    <View
                      key={mpt.tag_id}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        backgroundColor: `${mpt.tags.color ?? '#6B7280'}20`,
                        borderRadius: 16,
                        paddingHorizontal: 10,
                        paddingVertical: 4,
                      }}
                    >
                      {mpt.tags.emoji && (
                        <Text style={{ fontSize: 12, marginRight: 4 }}>
                          {mpt.tags.emoji}
                        </Text>
                      )}
                      <Text
                        style={{
                          fontSize: 13,
                          fontWeight: '500',
                          color: mpt.tags.color ?? '#6B7280',
                        }}
                      >
                        {getTagDisplayName(mpt.tags)}
                      </Text>
                    </View>
                  ))}
                  {canEdit && (
                    <Pressable
                      onPress={() => setIsEditingTags(true)}
                      hitSlop={8}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        backgroundColor: '#F3F4F6',
                        borderRadius: 16,
                        paddingHorizontal: 10,
                        paddingVertical: 4,
                        gap: 4,
                      }}
                    >
                      <FontAwesome name="pencil" size={11} color="#9CA3AF" />
                      <Text
                        style={{
                          fontSize: 13,
                          fontWeight: '500',
                          color: '#9CA3AF',
                        }}
                      >
                        {place.map_place_tags.length > 0 ? t('placeDetailSheet.editTagsButton') : t('placeDetailSheet.addTagsButton')}
                      </Text>
                    </Pressable>
                  )}
                </View>
              )}

              {/* Note */}
              {!canEdit ? (
                place.note ? (
                  <View
                    style={{
                      backgroundColor: '#F9FAFB',
                      borderRadius: 12,
                      padding: 12,
                      marginBottom: 16,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 14,
                        color: '#374151',
                        lineHeight: 20,
                      }}
                    >
                      {place.note}
                    </Text>
                  </View>
                ) : null
              ) : isEditingNote ? (
                <View style={{ marginBottom: 16 }}>
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginBottom: 8,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 13,
                        fontWeight: '500',
                        color: '#6B7280',
                      }}
                    >
                      {t('placeDetailSheet.editNote')}
                    </Text>
                    <View style={{ flexDirection: 'row', gap: 16 }}>
                      <Pressable onPress={handleCancelNote} hitSlop={8}>
                        <FontAwesome name="times" size={16} color="#EF4444" />
                      </Pressable>
                      <Pressable onPress={handleSaveNote} hitSlop={8}>
                        <FontAwesome name="check" size={16} color="#10B981" />
                      </Pressable>
                    </View>
                  </View>
                  <BottomSheetTextInput
                    value={draftNote}
                    onChangeText={setDraftNote}
                    placeholder={t('placeDetailSheet.notePlaceholder')}
                    multiline
                    style={{
                      backgroundColor: '#F9FAFB',
                      borderRadius: 12,
                      padding: 12,
                      fontSize: 14,
                      color: '#374151',
                      lineHeight: 20,
                      minHeight: 80,
                      textAlignVertical: 'top',
                      borderWidth: 1,
                      borderColor: '#D1D5DB',
                    }}
                  />
                </View>
              ) : (
                <Pressable
                  onPress={handleStartEditingNote}
                  style={{ marginBottom: 16 }}
                >
                  {place.note ? (
                    <View
                      style={{
                        backgroundColor: '#F9FAFB',
                        borderRadius: 12,
                        padding: 12,
                        flexDirection: 'row',
                        alignItems: 'flex-start',
                        gap: 8,
                      }}
                    >
                      <Text
                        style={{
                          flex: 1,
                          fontSize: 14,
                          color: '#374151',
                          lineHeight: 20,
                        }}
                      >
                        {place.note}
                      </Text>
                      <FontAwesome
                        name="pencil"
                        size={12}
                        color="#9CA3AF"
                        style={{ marginTop: 4 }}
                      />
                    </View>
                  ) : (
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        backgroundColor: '#F3F4F6',
                        borderRadius: 16,
                        paddingHorizontal: 10,
                        paddingVertical: 4,
                        gap: 4,
                        alignSelf: 'flex-start',
                      }}
                    >
                      <FontAwesome name="pencil" size={11} color="#9CA3AF" />
                      <Text
                        style={{
                          fontSize: 13,
                          fontWeight: '500',
                          color: '#9CA3AF',
                        }}
                      >
                        {t('placeDetailSheet.addNote')}
                      </Text>
                    </View>
                  )}
                </Pressable>
              )}

              {/* Action Buttons */}
              <View style={{ flexDirection: 'row', gap: 12 }}>
                {/* Visited Toggle */}
                <Pressable
                  onPress={handleToggleVisited}
                  style={{
                    flex: 1,
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: isVisited ? '#10B981' : '#F3F4F6',
                    borderRadius: 12,
                    paddingVertical: 12,
                    gap: 8,
                  }}
                >
                  <FontAwesome
                    name={isVisited ? 'check-circle' : 'circle-o'}
                    size={18}
                    color={isVisited ? '#FFFFFF' : '#6B7280'}
                  />
                  <Text
                    style={{
                      fontSize: 15,
                      fontWeight: '600',
                      color: isVisited ? '#FFFFFF' : '#374151',
                    }}
                  >
                    {isVisited ? t('placeDetailSheet.visited') : t('placeDetailSheet.notVisited')}
                  </Text>
                </Pressable>

                {/* Directions */}
                <Pressable
                  onPress={handleDirections}
                  style={{
                    flex: 1,
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: '#3B82F6',
                    borderRadius: 12,
                    paddingVertical: 12,
                    gap: 8,
                  }}
                >
                  <FontAwesome
                    name="location-arrow"
                    size={18}
                    color="#FFFFFF"
                  />
                  <Text
                    style={{ fontSize: 15, fontWeight: '600', color: '#FFFFFF' }}
                  >
                    {t('placeDetailSheet.directions')}
                  </Text>
                </Pressable>
              </View>

              {/* Delete Button */}
              {canEdit && (
                <Pressable
                  onPress={handleDelete}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'center',
                    paddingVertical: 12,
                    marginTop: 16,
                    borderRadius: 12,
                    backgroundColor: '#FEF2F2',
                    gap: 8,
                  }}
                >
                  <FontAwesome name="trash-o" size={16} color="#EF4444" />
                  <Text
                    style={{
                      fontSize: 15,
                      fontWeight: '600',
                      color: '#EF4444',
                    }}
                  >
                    {t('placeDetailSheet.deletePlace')}
                  </Text>
                </Pressable>
              )}
            </>
          )}
        </BottomSheetScrollView>
      </BottomSheet>
      {mapId && (
        <TagEditor
          key={tagEditorKey}
          ref={tagEditorRef}
          mapId={mapId}
          editingTag={null}
          onCreateTag={({ mapId: mId, name, emoji, color }) => {
            // Capture place.id synchronously — place may be null by the time onSuccess fires
            const placeId = place?.id;
            createTag.mutate({ mapId: mId, name, emoji, color }, {
              onSuccess: (newTag) => {
                if (placeId) onToggleTag(placeId, newTag.id, newTag, false);
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
);
