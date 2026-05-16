---
name: new-component
description: Scaffold a new React Native component following MapVault conventions. Use when creating reusable UI components.
---

Create a new component: $ARGUMENTS

## Steps

1. **Read existing components** in `components/` to match patterns and conventions
2. **Create the component directory** using the colocated pattern:
   ```
   components/<component-name>/
   └── <component-name>.tsx
   ```
3. **Write the component** following this structure:

```tsx
import { View, Text } from "react-native";

interface ComponentNameProps {
  // Define all props with TypeScript types — no `any`
}

export function ComponentName({}: ComponentNameProps) {
  return <View className="">{/* NativeWind classes for styling */}</View>;
}
```

4. **Add an index export** if the component will be widely imported:
   ```
   components/<component-name>/index.ts
   → export { ComponentName } from './<component-name>';
   ```
5. **Verify TypeScript** compiles: `npx tsc --noEmit`

## Conventions

- File name: kebab-case (`place-card.tsx`)
- Component export: PascalCase (`PlaceCard`)
- Functional components only — no class components
- Style with NativeWind `className` prop — no `StyleSheet.create`
- Props defined as a TypeScript interface, not inline
- If the component fetches data, extract that into a hook in `hooks/`
- Use `@gorhom/bottom-sheet` for bottom sheet components — follow existing patterns
