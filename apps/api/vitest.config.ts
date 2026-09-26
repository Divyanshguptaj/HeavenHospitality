import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    // Set before any module loads, so `config/env.ts` validates successfully at
    // import time. These are throwaway values and never resemble real secrets.
    env: {
      NODE_ENV: 'test',
      // Placeholder: the unit suite never opens a connection. Integration tests
      // that need a real database run against a dedicated Neon branch and supply
      // their own DATABASE_URL.
      DATABASE_URL: 'postgresql://placeholder:placeholder@localhost:5432/heaven_test',
      JWT_ACCESS_SECRET: 'test-access-secret-that-is-long-enough-000000',
      JWT_REFRESH_SECRET: 'test-refresh-secret-that-is-long-enough-00000',
      LOG_LEVEL: 'silent',
      CORS_ALLOWED_ORIGINS: 'http://localhost:5173',
      // Vite loads the repo-root `.env` into the test process. A developer who
      // set OTP_DEV_FIXED_CODE for convenience would otherwise pin every
      // generated code to the same value, and "a new code replaces the old one"
      // would pass whether or not the code actually changed. Blanked here so the
      // suite always exercises the real CSPRNG path.
      OTP_DEV_FIXED_CODE: '',
      // Real Fast2SMS credentials or provider choice must never reach the suite;
      // every outbound call in tests goes through a stubbed fetch.
      MESSAGING_PROVIDER: 'mock',
      OTP_PROVIDER: 'mock',
      FAST2SMS_API_KEY: 'test-key',
      FAST2SMS_SENDER_ID: 'TESTHH',
      FAST2SMS_OTP_TEMPLATE_ID: '111111',
      FAST2SMS_WHATSAPP_PHONE_NUMBER_ID: '999',
      FAST2SMS_WA_RENT_DUE_MESSAGE_ID: '11',
      FAST2SMS_WA_RENT_OVERDUE_MESSAGE_ID: '12',
    },
  },
});
