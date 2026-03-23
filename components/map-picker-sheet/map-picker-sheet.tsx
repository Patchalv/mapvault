import { forwardRef, useCallback } from 'react';
import { View, Text, Pressable } from 'react-native';
import { BottomSheetModal, BottomSheetScrollView } from '@gorhom/bottom-sheet';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useTranslation } from 'react-i18next';

interface MapPickerSheetProps {
  maps: { id: string; name: string }[];
  selectedMapId: string | null;
  onSelectMap: (mapId: string) => void;
}

export const MapPickerSheet = forwardRef<BottomSheetModal, MapPickerSheetProps>(
  function MapPickerSheet({ maps, selectedMapId, onSelectMap }, ref) {
    const { t } = useTranslation();
    const handleSelect = useCallback(
      (mapId: string) => {
        onSelectMap(mapId);
        if (ref && typeof ref !== 'function' && ref.current) {
          ref.current.dismiss();
        }
      },
      [onSelectMap, ref]
    );

    return (
      <BottomSheetModal
        ref={ref}
        snapPoints={['40%']}
        backgroundStyle={{ backgroundColor: '#FFFFFF', borderRadius: 24 }}
        handleIndicatorStyle={{ backgroundColor: '#D1D5DB', width: 40 }}
      >
        <BottomSheetScrollView
          contentContainerStyle={{ padding: 20, paddingTop: 4 }}
        >
          {/* Header */}
          <View style={{ marginBottom: 16 }}>
            <Text style={{ fontSize: 18, fontWeight: '700', color: '#111827' }}>
              {t('mapPickerSheet.title')}
            </Text>
            <Text
              style={{ fontSize: 14, color: '#6B7280', marginTop: 4 }}
            >
              {t('mapPickerSheet.subtitle')}
            </Text>
          </View>

          {/* Map list */}
          {maps.map((map) => {
            const isSelected = selectedMapId === map.id;
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
                  <FontAwesome name="check" size={16} color="#3B82F6" />
                )}
              </Pressable>
            );
          })}
        </BottomSheetScrollView>
      </BottomSheetModal>
    );
  }
);
