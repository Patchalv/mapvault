import { Pressable, Text, View } from 'react-native';
import FontAwesome from '@expo/vector-icons/FontAwesome';

export const LINK_CARD_ICON_SIZE = 22;
export const LINK_CARD_ICON_COLOR = '#6B7280';

interface LinkCardProps {
  icon?: React.ReactNode;
  title: string;
  subtitle?: string;
  onPress: () => void;
}

export function LinkCard({ icon, title, subtitle, onPress }: LinkCardProps) {
  return (
    <Pressable
      onPress={onPress}
      className="w-full flex-row items-center rounded-xl bg-gray-50 px-4 py-3"
    >
      {icon && <View className="mr-3">{icon}</View>}
      <View className="flex-1">
        <Text className="text-base font-semibold text-gray-900">{title}</Text>
        {subtitle && (
          <Text className="mt-0.5 text-sm text-gray-500">{subtitle}</Text>
        )}
      </View>
      <FontAwesome name="chevron-right" size={12} color="#9CA3AF" />
    </Pressable>
  );
}
