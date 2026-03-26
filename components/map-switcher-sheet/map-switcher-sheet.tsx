import { forwardRef, useCallback } from 'react';
import { View, Text, Pressable } from 'react-native';
import { BottomSheetModal, BottomSheetScrollView, BottomSheetBackdrop, type BottomSheetBackdropProps } from '@gorhom/bottom-sheet';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTranslation } from 'react-i18next';
import { useActiveMap } from '@/hooks/use-active-map';

export const MapSwitcherSheet = forwardRef<BottomSheetModal>(
  function MapSwitcherSheet(_props, ref) {
    const { t } = useTranslation();
    const { bottom } = useSafeAreaInsets();
    const { maps, activeMapId, setActiveMap } = useActiveMap();

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

    const renderBackdrop = useCallback(
      (props: BottomSheetBackdropProps) => (
        <BottomSheetBackdrop
          {...props}
          appearsOnIndex={0}
          disappearsOnIndex={-1}
          pressBehavior="close"
        />
      ),
      [],
    );

    return (
      <BottomSheetModal
        ref={ref}
        snapPoints={['40%']}
        backdropComponent={renderBackdrop}
        backgroundStyle={{ backgroundColor: '#FFFFFF', borderRadius: 24 }}
        handleIndicatorStyle={{ backgroundColor: '#D1D5DB', width: 40 }}
      >
        <BottomSheetScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 4, paddingBottom: bottom + 20 }}>
          <View className="mb-4">
            <Text className="text-lg font-bold text-gray-900">
              {t('settings.mapSwitcherSheet.title')}
            </Text>
          </View>

          {/* Per-map rows */}
          {maps.map((map) => {
            const isSelected = activeMapId === map.id;
            return (
              <Pressable
                key={map.id}
                onPress={() => handleSelect(map.id)}
                className={`flex-row items-center justify-between px-4 py-3.5 rounded-xl ${isSelected ? 'bg-gray-100' : ''}`}
              >
                <Text
                  className={`text-base ${isSelected ? 'font-semibold text-gray-900' : 'font-normal text-gray-700'}`}
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
