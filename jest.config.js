/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.js'],
  verbose: true,
  // Ensure tmp_data directory exists before tests run
  globalSetup: '<rootDir>/tests/jestGlobalSetup.js',
};
