import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View, Text, Pressable, ActivityIndicator } from 'react-native';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import BottomSheet, { BottomSheetModal } from '@gorhom/bottom-sheet';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import * as Location from 'expo-location';
import Mapbox from '@/lib/mapbox';
import { useLocation } from '@/hooks/use-location';
import { useActiveMap } from '@/hooks/use-active-map';
import { useMapPlaces } from '@/hooks/use-map-places';
import { useAllMapPlaces } from '@/hooks/use-all-map-places';
import { useTags } from '@/hooks/use-tags';
import { useFilteredPlaces } from '@/hooks/use-filtered-places';
import { useToggleVisited } from '@/hooks/use-toggle-visited';
import { useUpdatePlaceTags } from '@/hooks/use-update-place-tags';
import { useDeletePlace } from '@/hooks/use-delete-place';
import { useUpdatePlaceNote } from '@/hooks/use-update-place-note';
import { useOnboarding } from '@/hooks/use-onboarding';
import { useAppReview } from '@/hooks/use-app-review';
import { track } from '@/lib/analytics';
import { ExploreHeader } from '@/components/explore-header/explore-header';
import { MapMarkers } from '@/components/map-markers/map-markers';
import { PlaceDetailSheet } from '@/components/place-detail-sheet/place-detail-sheet';
import { FilterSheet } from '@/components/filter-sheet/filter-sheet';
import { PlaceList } from '@/components/place-list/place-list';
import { EmptyState } from '@/components/empty-state/empty-state';
import { ErrorState } from '@/components/error-state/error-state';
import { SpotlightTooltip } from '@/components/spotlight-tooltip/spotlight-tooltip';
import type { Tag, ViewMode, VisitedFilter } from '@/types';

// Madrid fallback coordinates
const DEFAULT_CENTER: [number, number] = [-3.7038, 40.4168];

export default function ExploreScreen() {
  const { t } = useTranslation();
  const { focusLat, focusLng } = useLocalSearchParams<{
    focusLat?: string;
    focusLng?: string;
  }>();
  const cameraRef = useRef<Mapbox.Camera>(null);
  const lastFocusedRef = useRef<string | null>(null);
  const { location } = useLocation();
  const { activeMapId, activeMapName, canEditActiveMap, mapMembers, maps, setActiveMap, isAllMaps } =
    useActiveMap();

  // Use different queries based on All Maps mode
  const singleMapQuery = useMapPlaces(isAllMaps ? null : activeMapId);
  const allMapsQuery = useAllMapPlaces(isAllMaps);
  const activePlacesQuery = isAllMaps ? allMapsQuery : singleMapQuery;

  const {
    data: places,
    isLoading: isLoadingPlaces,
    isError: isErrorPlaces,
    isRefetching,
    refetch,
  } = activePlacesQuery;

  const { data: tags } = useTags(isAllMaps ? null : activeMapId);
  const { mutate: toggleVisited } = useToggleVisited(activeMapId);
  const { mutate: updatePlaceTag } = useUpdatePlaceTags(activeMapId);
  const { mutate: deletePlace } = useDeletePlace(activeMapId);
  const { mutate: updatePlaceNote } = useUpdatePlaceNote(activeMapId);
  const { maybeRequestReview } = useAppReview();

  // View state
  const [viewMode, setViewMode] = useState<ViewMode>('map');

  // Filter state
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [visitedFilter, setVisitedFilter] = useState<VisitedFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Selected place
  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(null);

  // Refs
  const detailSheetRef = useRef<BottomSheet>(null);
  const filterSheetRef = useRef<BottomSheetModal>(null);
  const filterButtonRef = useRef<View>(null);
  const hasInitializedLocationRef = useRef(false);

  // Derived
  const filteredPlaces = useFilteredPlaces({
    places,
    selectedTagIds: isAllMaps ? [] : selectedTagIds,
    visitedFilter,
    searchQuery,
  });

  const selectedPlace = filteredPlaces.find((p) => p.id === selectedPlaceId) ?? null;

  // Determine edit permission for the selected place
  const selectedPlaceCanEdit = (() => {
    if (!selectedPlace) return true;
    if (!isAllMaps) return canEditActiveMap ?? false;
    // All Maps mode: look up role for the place's map
    const membership = mapMembers.find((m) => m.map_id === selectedPlace.map_id);
    return membership?.role === 'owner' || membership?.role === 'contributor';
  })();

  // Fetch tags for the selected place's map (handles All Maps mode)
  const selectedPlaceMapId = selectedPlace?.map_id ?? null;
  const { data: selectedPlaceTags } = useTags(
    isAllMaps ? selectedPlaceMapId : activeMapId
  );

  const center: [number, number] = location
    ? [location.longitude, location.latitude]
    : DEFAULT_CENTER;

  // Fly to newly added place when focus params are present
  useEffect(() => {
    if (focusLat && focusLng) {
      const key = `${focusLat},${focusLng}`;
      if (lastFocusedRef.current === key) return;
      lastFocusedRef.current = key;

      const lat = parseFloat(focusLat);
      const lng = parseFloat(focusLng);
      if (!isNaN(lat) && !isNaN(lng)) {
        const timer = setTimeout(() => {
          cameraRef.current?.setCamera({
            centerCoordinate: [lng, lat],
            zoomLevel: 15,
            animationDuration: 800,
          });
        }, 300);
        return () => clearTimeout(timer);
      }
    }
  }, [focusLat, focusLng]);

  // Fly to user location once it becomes available (initial load only)
  useEffect(() => {
    if (location && !hasInitializedLocationRef.current) {
      hasInitializedLocationRef.current = true;
      // Don't override if we're already focusing on a newly added place
      if (focusLat && focusLng) return;
      cameraRef.current?.setCamera({
        centerCoordinate: [location.longitude, location.latitude],
        zoomLevel: 13,
        animationDuration: 600,
      });
    }
  }, [location, focusLat, focusLng]);

  // Analytics: explore_viewed with 30-second cooldown
  const lastExploreViewedRef = useRef(0);
  useFocusEffect(
    useCallback(() => {
      const now = Date.now();
      if (now - lastExploreViewedRef.current > 30_000) {
        lastExploreViewedRef.current = now;
        track('explore_viewed', {
          view_mode: viewMode,
          active_map: isAllMaps ? 'all' : 'single',
        });
      }
    }, [viewMode, isAllMaps])
  );

  // Analytics: filter_applied
  const prevFiltersRef = useRef({ selectedTagIds, visitedFilter, searchQuery });
  const isInitialMountRef = useRef(true);
  useEffect(() => {
    if (isInitialMountRef.current) {
      isInitialMountRef.current = false;
      return;
    }

    const prev = prevFiltersRef.current;
    prevFiltersRef.current = { selectedTagIds, visitedFilter, searchQuery };

    const tagsChanged = prev.selectedTagIds !== selectedTagIds;
    const visitedChanged = prev.visitedFilter !== visitedFilter;
    const searchChanged = prev.searchQuery !== searchQuery;

    if (!tagsChanged && !visitedChanged && !searchChanged) return;

    // If all filters cleared, filter_cleared handles that
    if (selectedTagIds.length === 0 && visitedFilter === 'all' && !searchQuery) return;

    const filterType = tagsChanged ? 'tag' : visitedChanged ? 'visited' : 'search';
    const activeTagNames = tags
      ?.filter((t) => selectedTagIds.includes(t.id))
      .map((t) => t.name) ?? [];

    track('filter_applied', {
      filter_type: filterType,
      active_tags: activeTagNames,
      visited_filter: visitedFilter,
      has_search_query: !!searchQuery,
      results_count: filteredPlaces.length,
    });
  }, [selectedTagIds, visitedFilter, searchQuery, tags, filteredPlaces.length]);

  const activeFilterCount =
    (isAllMaps ? 0 : selectedTagIds.length) +
    (visitedFilter !== 'all' ? 1 : 0) +
    (searchQuery ? 1 : 0);

  // Onboarding
  const { showEmptyState, showFilterSpotlight, dismissSpotlight } =
    useOnboarding({
      placesData: places,
      activeFilterCount,
    });

  const [filterButtonRect, setFilterButtonRect] = useState<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);

  useEffect(() => {
    if (showFilterSpotlight) {
      // Small delay to ensure layout is complete after data loads
      const timer = setTimeout(() => {
        filterButtonRef.current?.measureInWindow((x, y, width, height) => {
          if (width > 0 && height > 0) {
            setFilterButtonRect({ x, y, width, height });
          }
        });
      }, 300);
      return () => clearTimeout(timer);
    } else {
      setFilterButtonRect(null);
    }
  }, [showFilterSpotlight]);

  // Reset filters when switching maps
  useEffect(() => {
    setSelectedTagIds([]);
    setVisitedFilter('all');
    setSearchQuery('');
    setSelectedPlaceId(null);
    detailSheetRef.current?.close();
  }, [activeMapId]);

  // Handlers
  const handlePlacePress = useCallback((mapPlaceId: string) => {
    const place = filteredPlaces.find((p) => p.id === mapPlaceId);
    if (place) {
      track('place_detail_viewed', {
        map_place_id: mapPlaceId,
        has_note: !!place.note,
        is_visited: place.place_visits[0]?.visited ?? false,
      });
    }
    setSelectedPlaceId(mapPlaceId);
    detailSheetRef.current?.snapToIndex(0);
  }, [filteredPlaces]);

  const handleCloseDetail = useCallback(() => {
    setSelectedPlaceId(null);
  }, []);

  const handleToggleView = useCallback(() => {
    setViewMode((prev) => {
      const newMode = prev === 'map' ? 'list' : 'map';
      track('view_mode_switched', { new_mode: newMode });
      return newMode;
    });
  }, []);

  const handleOpenFilters = useCallback(() => {
    filterSheetRef.current?.present();
  }, []);

  const handleToggleTag = useCallback((tagId: string) => {
    setSelectedTagIds((prev) =>
      prev.includes(tagId) ? prev.filter((id) => id !== tagId) : [...prev, tagId]
    );
  }, []);

  const handleClearFilters = useCallback(() => {
    setSelectedTagIds([]);
    setVisitedFilter('all');
    setSearchQuery('');
    track('filter_cleared', {});
  }, []);

  const handleToggleVisited = useCallback(
    (mapPlaceId: string, visited: boolean) => {
      toggleVisited(
        { mapPlaceId, visited },
        {
          onSuccess: () => {
            if (!visited) return;
            setTimeout(() => {
              void maybeRequestReview('place_visited');
            }, 1500);
          },
        }
      );
    },
    [toggleVisited, maybeRequestReview]
  );

  const handleTogglePlaceTag = useCallback(
    (mapPlaceId: string, tagId: string, tag: Tag, currentlyAssigned: boolean) => {
      updatePlaceTag({ mapPlaceId, tagId, tag, currentlyAssigned });
    },
    [updatePlaceTag]
  );

  const handleUpdateNote = useCallback(
    (mapPlaceId: string, note: string | null) => {
      updatePlaceNote({ mapPlaceId, note });
    },
    [updatePlaceNote]
  );

  const handleDeletePlace = useCallback(
    (mapPlaceId: string) => {
      deletePlace(mapPlaceId);
      detailSheetRef.current?.close();
      setSelectedPlaceId(null);
    },
    [deletePlace]
  );

  const isRecenteringRef = useRef(false);
  const handleRecenter = useCallback(async () => {
    if (isRecenteringRef.current) return;
    isRecenteringRef.current = true;
    try {
      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      cameraRef.current?.setCamera({
        centerCoordinate: [position.coords.longitude, position.coords.latitude],
        zoomLevel: 14,
        animationDuration: 600,
      });
    } catch (error) {
      if (__DEV__) {
        console.warn('Recenter failed:', error);
      }
    } finally {
      isRecenteringRef.current = false;
    }
  }, []);

  const handleRefresh = useCallback(() => {
    refetch();
  }, [refetch]);

  const handleSelectMap = useCallback(
    (mapId: string) => {
      setActiveMap(mapId);
    },
    [setActiveMap]
  );

  return (
    <View style={{ flex: 1 }}>
      {viewMode === 'map' ? (
        <>
          <Mapbox.MapView
            style={{ flex: 1 }}
            styleURL={Mapbox.StyleURL.Street}
            logoEnabled={false}
            attributionEnabled={false}
            scaleBarEnabled={false}
          >
            <Mapbox.Camera
              ref={cameraRef}
              defaultSettings={{
                centerCoordinate: center,
                zoomLevel: 13,
              }}
            />
            <Mapbox.LocationPuck puckBearingEnabled puckBearing="heading" />
            <MapMarkers places={filteredPlaces} onPlacePress={handlePlacePress} />
          </Mapbox.MapView>
          {showEmptyState && <EmptyState variant="map" />}
          {isLoadingPlaces && !showEmptyState && (
            <View
              pointerEvents="none"
              className="absolute inset-0 z-[5] items-center justify-center"
            >
              <View className="rounded-2xl bg-white/90 p-4 shadow-lg">
                <ActivityIndicator size="large" color="#3B82F6" />
              </View>
            </View>
          )}
          {isErrorPlaces && !isLoadingPlaces && !showEmptyState && (
            <View
              pointerEvents="box-none"
              className="absolute inset-0 z-[5] items-center justify-center"
            >
              <View className="mx-8 items-center rounded-2xl bg-white/95 px-6 py-8 shadow-lg">
                <View className="mb-4 h-16 w-16 items-center justify-center rounded-full bg-red-100">
                  <FontAwesome name="exclamation-circle" size={32} color="#EF4444" />
                </View>
                <Text className="mb-2 text-center text-lg font-semibold text-gray-900">
                  {t('explore.couldntLoadPlaces')}
                </Text>
                <Text className="mb-6 text-center text-sm text-gray-500">
                  {t('explore.checkConnectionRetry')}
                </Text>
                <Pressable
                  onPress={handleRefresh}
                  className="rounded-full bg-blue-500 px-6 py-3 active:bg-blue-600"
                >
                  <Text className="text-base font-semibold text-white">{t('common.tryAgain')}</Text>
                </Pressable>
              </View>
            </View>
          )}
        </>
      ) : showEmptyState ? (
        <EmptyState variant="list" />
      ) : isLoadingPlaces ? (
        <View style={{ flex: 1, backgroundColor: '#F3F4F6' }} className="items-center justify-center">
          <ActivityIndicator size="large" color="#3B82F6" />
        </View>
      ) : isErrorPlaces ? (
        <ErrorState
          message={t('explore.couldntLoadPlacesFull')}
          onRetry={handleRefresh}
        />
      ) : (
        <View style={{ flex: 1, backgroundColor: '#F3F4F6' }}>
          <PlaceList
            places={filteredPlaces}
            onPlacePress={handlePlacePress}
            isRefreshing={isRefetching}
            onRefresh={handleRefresh}
          />
        </View>
      )}

      {/* Header overlay */}
      <ExploreHeader
        mapName={activeMapName}
        maps={maps.map((m) => ({ id: m.id, name: m.name }))}
        activeMapId={activeMapId}
        onSelectMap={handleSelectMap}
        viewMode={viewMode}
        onToggleView={handleToggleView}
        onOpenFilters={handleOpenFilters}
        activeFilterCount={activeFilterCount}
        onRecenter={viewMode === 'map' ? handleRecenter : undefined}
        onRefresh={viewMode === 'map' ? handleRefresh : undefined}
        filterButtonRef={filterButtonRef}
      />

      {/* Place Detail Sheet */}
      <PlaceDetailSheet
        ref={detailSheetRef}
        place={selectedPlace}
        availableTags={selectedPlaceTags ?? []}
        canEdit={selectedPlaceCanEdit}
        onToggleVisited={handleToggleVisited}
        onToggleTag={handleTogglePlaceTag}
        onUpdateNote={handleUpdateNote}
        onDelete={handleDeletePlace}
        onClose={handleCloseDetail}
      />

      {/* Filter Sheet */}
      <FilterSheet
        ref={filterSheetRef}
        tags={tags ?? []}
        selectedTagIds={selectedTagIds}
        onToggleTag={handleToggleTag}
        visitedFilter={visitedFilter}
        onSetVisitedFilter={setVisitedFilter}
        searchQuery={searchQuery}
        onSetSearchQuery={setSearchQuery}
        onClearAll={handleClearFilters}
        isAllMaps={isAllMaps}
      />

      {/* Filter spotlight tooltip (onboarding step 2) */}
      {showFilterSpotlight && filterButtonRect && (
        <SpotlightTooltip
          targetRect={filterButtonRect}
          title={t('explore.filterTitle')}
          description={t('explore.filterDescription')}
          onDismiss={dismissSpotlight}
        />
      )}
    </View>
  );
}
