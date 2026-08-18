module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  setupFiles: ['<rootDir>/jest.setup.js'],
  // The relativity tutor and the model router came over from the Snaptly backend as CommonJS, with
  // their tests, deliberately unchanged. ts-jest transforms the .ts; these two run as plain JS.
  testMatch: ['**/*.test.ts', '**/*.test.js'],
  transform: { '^.+\\.ts$': ['ts-jest', {}] },
};
