import { defineConfig } from 'vite';
import { androidBuildConfig } from './scripts/android-build-config.js';

// Explicit settings only: never inherit production server secrets from .env files.
export default defineConfig(() => androidBuildConfig());
