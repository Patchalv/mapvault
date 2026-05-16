---
name: add-screen
description: Create a new screen for the MapVault app. Use when adding a new route/page to the app.
---

Create a new screen: $ARGUMENTS

## Steps

1. **Read existing screens** in `app/` to understand routing patterns and layout conventions
2. **Read the technical plan** in `docs/technical-plan.md` for the screen's data requirements, components, and behavior
3. **Read the PRD** in `docs/prd.md` if you need clarity on the feature's purpose
4. **Create the route file** in the appropriate `app/` subdirectory:
   - Authenticated screens go in `app/(tabs)/`
   - Unauthenticated screens go in `app/(auth)/`
   - Modal screens go at `app/` root level
5. **Create components** in `components/` following the colocated pattern:
   - `components/screen-name/screen-name.tsx`
   - Use NativeWind for styling (`className` prop)
   - Use `@gorhom/bottom-sheet` for bottom sheets — follow existing patterns
6. **Create hooks** in `hooks/` for any data fetching:
   - Wrap Supabase queries in TanStack Query hooks
   - Always handle the error case from Supabase
   - Name as `use-[resource].ts` (kebab-case)
7. **Add types** in `types/` if new data shapes are introduced
8. **Verify TypeScript** compiles: `npx tsc --noEmit`

## Conventions

- File naming: kebab-case for files, PascalCase for component exports
- All data fetching through custom hooks, never inline in components
- Functional components only, no class components
- Destructured imports: `import { View } from 'react-native'`
