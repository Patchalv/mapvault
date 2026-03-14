import { Pressable, View, Text, useWindowDimensions } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface SpotlightTooltipProps {
  targetRect: Rect;
  title: string;
  description: string;
  onDismiss: () => void;
}

const PADDING = 6;
const OVERLAY_COLOR = 'rgba(0,0,0,0.5)';
const TOOLTIP_MAX_WIDTH = 260;
const ARROW_SIZE = 8;

export function SpotlightTooltip({
  targetRect,
  title,
  description,
  onDismiss,
}: SpotlightTooltipProps) {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const { t } = useTranslation();

  // Cutout area with padding
  const cutout = {
    x: targetRect.x - PADDING,
    y: targetRect.y - PADDING,
    width: targetRect.width + PADDING * 2,
    height: targetRect.height + PADDING * 2,
  };

  // Position tooltip below the cutout, right-aligned to the cutout
  const tooltipTop = cutout.y + cutout.height + ARROW_SIZE + 8;
  const tooltipRight = screenWidth - (cutout.x + cutout.width);

  return (
    <Animated.View
      entering={FadeIn.duration(250)}
      exiting={FadeOut.duration(200)}
      style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 50 }}
    >
      <Pressable
        style={{ flex: 1 }}
        onPress={onDismiss}
      >
        {/* Top overlay */}
        <View
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: cutout.y,
            backgroundColor: OVERLAY_COLOR,
          }}
        />
        {/* Bottom overlay */}
        <View
          style={{
            position: 'absolute',
            top: cutout.y + cutout.height,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: OVERLAY_COLOR,
          }}
        />
        {/* Left overlay */}
        <View
          style={{
            position: 'absolute',
            top: cutout.y,
            left: 0,
            width: cutout.x,
            height: cutout.height,
            backgroundColor: OVERLAY_COLOR,
          }}
        />
        {/* Right overlay */}
        <View
          style={{
            position: 'absolute',
            top: cutout.y,
            left: cutout.x + cutout.width,
            right: 0,
            height: cutout.height,
            backgroundColor: OVERLAY_COLOR,
          }}
        />

        {/* White ring around cutout */}
        <View
          style={{
            position: 'absolute',
            top: cutout.y - 2,
            left: cutout.x - 2,
            width: cutout.width + 4,
            height: cutout.height + 4,
            borderRadius: (cutout.height + 4) / 2,
            borderWidth: 2,
            borderColor: 'white',
          }}
        />

        {/* Tooltip bubble */}
        <View
          style={{
            position: 'absolute',
            top: tooltipTop,
            right: tooltipRight,
            maxWidth: TOOLTIP_MAX_WIDTH,
          }}
        >
          {/* Arrow */}
          <View
            style={{
              position: 'absolute',
              top: -ARROW_SIZE,
              right: cutout.width / 2 - ARROW_SIZE,
              width: 0,
              height: 0,
              borderLeftWidth: ARROW_SIZE,
              borderRightWidth: ARROW_SIZE,
              borderBottomWidth: ARROW_SIZE,
              borderLeftColor: 'transparent',
              borderRightColor: 'transparent',
              borderBottomColor: 'white',
            }}
          />
          <View className="rounded-xl bg-white px-4 py-3 shadow-lg">
            <Text className="mb-1 text-sm font-bold text-gray-900">
              {title}
            </Text>
            <Text className="mb-2 text-xs leading-4 text-gray-500">
              {description}
            </Text>
            <Text className="text-xs text-gray-400">
              {t('spotlightTooltip.tapToDismiss')}
            </Text>
          </View>
        </View>
      </Pressable>
    </Animated.View>
  );
}
