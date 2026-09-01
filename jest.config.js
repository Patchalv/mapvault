/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  // Mirrors the "@/*" -> "./*" alias in tsconfig.json.
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
  // supabase/functions holds Deno tests, run by the separate deno-tests
  // workflow. The native project dirs and build output have no Jest tests.
  testPathIgnorePatterns: [
    '/node_modules/',
    '/supabase/',
    '/dist/',
    '/ios/',
    '/android/',
    '/.expo/',
  ],
  collectCoverageFrom: [
    'lib/**/*.{ts,tsx}',
    'hooks/**/*.{ts,tsx}',
    'components/**/*.{ts,tsx}',
    '!**/*.d.ts',
  ],
};
