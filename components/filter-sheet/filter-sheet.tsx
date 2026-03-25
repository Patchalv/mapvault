import { forwardRef, useCallback, useMemo } from 'react';
import { View, Text, Pressable } from 'react-native';
import { BottomSheetModal, BottomSheetTextInput, BottomSheetScrollView } from '@gorhom/bottom-sheet';
import type { BottomSheetModalProps } from '@gorhom/bottom-sheet';
import { useTranslation } from 'react-i18next';
import type { Tag, VisitedFilter } from '@/types';

interface FilterSheetProps {
  tags: Tag[];
  selectedTagIds: string[];
  onToggleTag: (tagId: string) => void;
  visitedFilter: VisitedFilter;
  onSetVisitedFilter: (filter: VisitedFilter) => void;
  searchQuery: string;
  onSetSearchQuery: (query: string) => void;
  onClearAll: () => void;
  isAllMaps?: boolean;
  onChange?: BottomSheetModalProps['onChange'];
}

export const FilterSheet = forwardRef<BottomSheetModal, FilterSheetProps>(
  function FilterSheet(
    {
      tags,
      selectedTagIds,
      onToggleTag,
      visitedFilter,
      onSetVisitedFilter,
      searchQuery,
      onSetSearchQuery,
      onClearAll,
      isAllMaps,
      onChange,
    },
    ref
  ) {
    const { t } = useTranslation();

    const VISITED_OPTIONS = useMemo<{ value: VisitedFilter; label: string }[]>(() => [
      { value: 'all', label: t('filterSheet.all') },
      { value: 'visited', label: t('filterSheet.visited') },
      { value: 'not_visited', label: t('filterSheet.notVisited') },
    ], [t]);

    const handleDismiss = useCallback(() => {
      // No-op — filters apply in real time
    }, []);

    return (
      <BottomSheetModal
        ref={ref}
        snapPoints={['55%', '80%']}
        onDismiss={handleDismiss}
        onChange={onChange}
        backgroundStyle={{ backgroundColor: '#FFFFFF', borderRadius: 24 }}
        handleIndicatorStyle={{ backgroundColor: '#D1D5DB', width: 40 }}
      >
        <BottomSheetScrollView
          contentContainerStyle={{ padding: 20, paddingTop: 4 }}
        >
          {/* Header */}
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 20,
            }}
          >
            <Text style={{ fontSize: 18, fontWeight: '700', color: '#111827' }}>
              {t('filterSheet.title')}
            </Text>
            <Pressable onPress={onClearAll}>
              <Text style={{ fontSize: 14, fontWeight: '500', color: '#3B82F6' }}>
                {t('filterSheet.clearAll')}
              </Text>
            </Pressable>
          </View>

          {/* Search */}
          <BottomSheetTextInput
            placeholder={t('filterSheet.searchPlaceholder')}
            value={searchQuery}
            onChangeText={onSetSearchQuery}
            style={{
              backgroundColor: '#F3F4F6',
              borderRadius: 12,
              paddingHorizontal: 16,
              paddingVertical: 12,
              fontSize: 15,
              color: '#111827',
              marginBottom: 20,
            }}
            placeholderTextColor="#9CA3AF"
          />

          {/* Tags */}
          {isAllMaps ? (
            <View style={{ marginBottom: 20 }}>
              <Text
                style={{
                  fontSize: 14,
                  fontWeight: '600',
                  color: '#6B7280',
                  marginBottom: 10,
                  textTransform: 'uppercase',
                  letterSpacing: 0.5,
                }}
              >
                {t('filterSheet.tagsLabel')}
              </Text>
              <Text style={{ fontSize: 14, color: '#9CA3AF' }}>
                {t('filterSheet.tagsAllMapsHint')}
              </Text>
            </View>
          ) : tags.length > 0 && (
            <View style={{ marginBottom: 20 }}>
              <Text
                style={{
                  fontSize: 14,
                  fontWeight: '600',
                  color: '#6B7280',
                  marginBottom: 10,
                  textTransform: 'uppercase',
                  letterSpacing: 0.5,
                }}
              >
                {t('filterSheet.tagsLabel')}
              </Text>
              <View
                style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}
              >
                {tags.map((tag) => {
                  const isSelected = selectedTagIds.includes(tag.id);
                  const color = tag.color ?? '#6B7280';
                  return (
                    <Pressable
                      key={tag.id}
                      onPress={() => onToggleTag(tag.id)}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        borderWidth: 2,
                        borderColor: isSelected ? color : '#E5E7EB',
                        backgroundColor: isSelected ? `${color}15` : '#FFFFFF',
                        borderRadius: 20,
                        paddingHorizontal: 12,
                        paddingVertical: 6,
                      }}
                    >
                      {tag.emoji && (
                        <Text style={{ fontSize: 14, marginRight: 4 }}>
                          {tag.emoji}
                        </Text>
                      )}
                      <Text
                        style={{
                          fontSize: 14,
                          fontWeight: isSelected ? '600' : '400',
                          color: isSelected ? color : '#374151',
                        }}
                      >
                        {tag.name}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          )}

          {/* Visited Filter */}
          <View>
            <Text
              style={{
                fontSize: 14,
                fontWeight: '600',
                color: '#6B7280',
                marginBottom: 10,
                textTransform: 'uppercase',
                letterSpacing: 0.5,
              }}
            >
              {t('filterSheet.statusLabel')}
            </Text>
            <View
              style={{
                flexDirection: 'row',
                backgroundColor: '#F3F4F6',
                borderRadius: 12,
                padding: 4,
              }}
            >
              {VISITED_OPTIONS.map((option) => {
                const isActive = visitedFilter === option.value;
                return (
                  <Pressable
                    key={option.value}
                    onPress={() => onSetVisitedFilter(option.value)}
                    style={{
                      flex: 1,
                      alignItems: 'center',
                      paddingVertical: 8,
                      borderRadius: 8,
                      backgroundColor: isActive ? '#FFFFFF' : 'transparent',
                      ...(isActive
                        ? {
                            shadowColor: '#000',
                            shadowOffset: { width: 0, height: 1 },
                            shadowOpacity: 0.1,
                            shadowRadius: 2,
                            elevation: 2,
                          }
                        : {}),
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 14,
                        fontWeight: isActive ? '600' : '400',
                        color: isActive ? '#111827' : '#6B7280',
                      }}
                    >
                      {option.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        </BottomSheetScrollView>
      </BottomSheetModal>
    );
  }
);
