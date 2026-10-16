import { getServerEnv } from './lib/env';

// Runs once when the server starts, so missing configuration is caught before any request.
export function register() {
  getServerEnv();
}
