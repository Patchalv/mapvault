import { forwardRef, useCallback } from 'react';
import { View, Text, Pressable } from 'react-native';
import { BottomSheetModal, BottomSheetScrollView } from '@gorhom/bottom-sheet';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTranslation } from 'react-i18next';
import { useActiveMap } from '@/hooks/use-active-map';
import { ALL_MAPS_ID } from '@/lib/constants';

export const MapSwitcherSheet = forwardRef<BottomSheetModal>(
  function MapSwitcherSheet(_props, ref) {
    const { t } = useTranslation();
    const { maps, activeMapId, setActiveMap, isAllMaps } = useActiveMap();

    const handleSelect = useCallback(
      (mapId: string) => {
        // Dismiss first (optimistic), then mutate
        if (ref && typeof ref !== 'function' && ref.current) {
          ref.current.dismiss();
        }
        setActiveMap(mapId, { source: 'settings' });
      },
      [ref, setActiveMap],
    );

    const currentActiveId = isAllMaps ? ALL_MAPS_ID : activeMapId;

    return (
      <BottomSheetModal
        ref={ref}
        snapPoints={['40%']}
        backgroundStyle={{ backgroundColor: '#FFFFFF', borderRadius: 24 }}
        handleIndicatorStyle={{ backgroundColor: '#D1D5DB', width: 40 }}
      >
        <BottomSheetScrollView contentContainerStyle={{ padding: 20, paddingTop: 4 }}>
          <View style={{ marginBottom: 16 }}>
            <Text style={{ fontSize: 18, fontWeight: '700', color: '#111827' }}>
              {t('settings.rows.myMap')}
            </Text>
          </View>

          {/* All Maps option */}
          <Pressable
            onPress={() => handleSelect(ALL_MAPS_ID)}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingHorizontal: 16,
              paddingVertical: 14,
              borderRadius: 12,
              backgroundColor: currentActiveId === ALL_MAPS_ID ? '#F3F4F6' : 'transparent',
            }}
          >
            <Text
              style={{
                fontSize: 16,
                fontWeight: currentActiveId === ALL_MAPS_ID ? '600' : '400',
                color: currentActiveId === ALL_MAPS_ID ? '#111827' : '#374151',
              }}
            >
              {t('settings.rows.allMaps')}
            </Text>
            {currentActiveId === ALL_MAPS_ID && (
              <Ionicons name="checkmark" size={18} color="#22C55E" />
            )}
          </Pressable>

          {/* Per-map rows */}
          {maps.map((map) => {
            const isSelected = currentActiveId === map.id;
            return (
              <Pressable
                key={map.id}
                onPress={() => handleSelect(map.id)}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  paddingHorizontal: 16,
                  paddingVertical: 14,
                  borderRadius: 12,
                  backgroundColor: isSelected ? '#F3F4F6' : 'transparent',
                }}
              >
                <Text
                  style={{
                    fontSize: 16,
                    fontWeight: isSelected ? '600' : '400',
                    color: isSelected ? '#111827' : '#374151',
                  }}
                >
                  {map.name}
                </Text>
                {isSelected && (
                  <Ionicons name="checkmark" size={18} color="#22C55E" />
                )}
              </Pressable>
            );
          })}
        </BottomSheetScrollView>
      </BottomSheetModal>
    );
  },
);
