import { View, Text } from 'react-native';

interface FeatureRowProps {
  label: string;
  free: string;
  premium: string;
}

export function FeatureRow({ label, free, premium }: FeatureRowProps) {
  return (
    <View className="flex-row border-t border-gray-200 py-3">
      <Text className="flex-1 text-sm text-gray-900">{label}</Text>
      <Text className="w-20 text-center text-sm text-gray-400">{free}</Text>
      <Text className="w-20 text-center text-sm font-semibold text-gray-900">
        {premium}
      </Text>
    </View>
  );
}
