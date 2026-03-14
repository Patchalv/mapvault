import { useState, type RefObject } from 'react';
import { View, Text, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useTranslation } from 'react-i18next';
import { ALL_MAPS_ID } from '@/lib/constants';
import type { ViewMode } from '@/types';

interface MapOption {
  id: string;
  name: string;
}

interface ExploreHeaderProps {
  mapName: string | null;
  maps: MapOption[];
  activeMapId: string | null;
  onSelectMap: (mapId: string) => void;
  viewMode: ViewMode;
  onToggleView: () => void;
  onOpenFilters: () => void;
  activeFilterCount: number;
  onRecenter?: () => void;
  onRefresh?: () => void;
  filterButtonRef?: RefObject<View | null>;
}

export function ExploreHeader({
  mapName,
  maps,
  activeMapId,
  onSelectMap,
  viewMode,
  onToggleView,
  onOpenFilters,
  activeFilterCount,
  onRecenter,
  onRefresh,
  filterButtonRef,
}: ExploreHeaderProps) {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const [dropdownOpen, setDropdownOpen] = useState(false);

  return (
    <View
      style={{ paddingTop: insets.top + 8 }}
      className="absolute left-0 right-0 top-0 z-10 px-4 pb-3"
    >
      <View className="flex-row items-center justify-between">
        {/* Map Switcher */}
        <View className="relative">
          <Pressable
            className="flex-row items-center rounded-full bg-white/90 px-4 py-2 shadow-sm"
            onPress={() => setDropdownOpen(!dropdownOpen)}
          >
            <Text className="mr-2 text-base font-semibold text-gray-900">
              {mapName ?? t('exploreHeader.noMap')}
            </Text>
            <FontAwesome
              name={dropdownOpen ? 'chevron-up' : 'chevron-down'}
              size={12}
              color="#6B7280"
            />
          </Pressable>

          {/* Dropdown */}
          {dropdownOpen && maps.length > 0 && (
            <View className="absolute left-0 top-full mt-1 min-w-[200px] rounded-xl bg-white p-2 shadow-lg">
              {/* All Maps option */}
              <Pressable
                className={`rounded-lg px-3 py-2.5 ${
                  activeMapId === ALL_MAPS_ID ? 'bg-gray-100' : ''
                }`}
                onPress={() => {
                  onSelectMap(ALL_MAPS_ID);
                  setDropdownOpen(false);
                }}
              >
                <Text
                  className={`text-sm ${
                    activeMapId === ALL_MAPS_ID
                      ? 'font-semibold text-gray-900'
                      : 'text-gray-700'
                  }`}
                >
                  {t('exploreHeader.allMaps')}
                </Text>
              </Pressable>

              {/* Divider */}
              <View className="mx-2 my-1 border-b border-gray-200" />

              {/* Individual maps */}
              {maps.map((map) => (
                <Pressable
                  key={map.id}
                  className={`rounded-lg px-3 py-2.5 ${
                    activeMapId === map.id ? 'bg-gray-100' : ''
                  }`}
                  onPress={() => {
                    onSelectMap(map.id);
                    setDropdownOpen(false);
                  }}
                >
                  <Text
                    className={`text-sm ${
                      activeMapId === map.id
                        ? 'font-semibold text-gray-900'
                        : 'text-gray-700'
                    }`}
                  >
                    {map.name}
                  </Text>
                </Pressable>
              ))}
            </View>
          )}
        </View>

        {/* Right controls */}
        <View className="flex-row items-center gap-2">
          {/* Refresh button (map view only) */}
          {viewMode === 'map' && onRefresh && (
            <Pressable
              className="h-10 w-10 items-center justify-center rounded-full bg-white/90 shadow-sm"
              onPress={onRefresh}
            >
              <FontAwesome name="refresh" size={16} color="#374151" />
            </Pressable>
          )}

          {/* Recenter button (map view only) */}
          {viewMode === 'map' && onRecenter && (
            <Pressable
              className="h-10 w-10 items-center justify-center rounded-full bg-white/90 shadow-sm"
              onPress={onRecenter}
            >
              <FontAwesome name="crosshairs" size={16} color="#374151" />
            </Pressable>
          )}

          {/* Filter button */}
          <View ref={filterButtonRef} collapsable={false}>
            <Pressable
              className="relative h-10 w-10 items-center justify-center rounded-full bg-white/90 shadow-sm"
              onPress={onOpenFilters}
            >
              <FontAwesome name="sliders" size={16} color="#374151" />
              {activeFilterCount > 0 && (
                <View className="absolute -right-1 -top-1 h-5 w-5 items-center justify-center rounded-full bg-blue-500">
                  <Text className="text-xs font-bold text-white">
                    {activeFilterCount}
                  </Text>
                </View>
              )}
            </Pressable>
          </View>

          {/* View toggle */}
          <Pressable
            className="h-10 w-10 items-center justify-center rounded-full bg-white/90 shadow-sm"
            onPress={onToggleView}
          >
            <FontAwesome
              name={viewMode === 'map' ? 'list' : 'map'}
              size={16}
              color="#374151"
            />
          </Pressable>
        </View>
      </View>
    </View>
  );
}
