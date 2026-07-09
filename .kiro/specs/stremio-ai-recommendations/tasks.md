# Implementation Plan: Stremio AI Recommendations Add-on

## Overview

This plan implements a Cloudflare Worker-based Stremio add-on that generates AI-powered recommendations from Nuvio Sync watch history. Tasks are ordered: foundational infrastructure → core services → integration layers → frontend → testing. All code is TypeScript, tested with Vitest and fast-check, deployed on Cloudflare Workers.

## Tasks

- [x] 1. Project setup and Worker routing infrastructure
  - [x] 1.1 Initialize Cloudflare Worker project with Wrangler, configure `wrangler.toml` with environment variables (SUPABASE_URL, SUPABASE_SERVICE_KEY, UPSTASH_REDIS_URL, UPSTASH_REDIS_TOKEN, ENCRYPTION_KEY), install dependencies (vitest, fast-check, miniflare)
    - Configure TypeScript with strict mode
    - Set up project directory structure: `src/`, `src/services/`, `src/handlers/`, `src/middleware/`, `src/types/`, `tests/unit/`, `tests/integration/`, `tests/properties/`
    - _Requirements: 16.8_

  - [x] 1.2 Implement the Worker entry point router with route pattern matching for all endpoints: `GET /`, `GET /{UUID}/manifest.json`, `GET /{UUID}/catalog/{type}/{id}.json`, `GET /{UUID}/configure`, `POST /{UUID}/configure`, `POST /configure`
    - Define the `WorkerEnv` interface and `Route` type as specified in the design
    - Extract UUID path parameters using regex groups
    - Return 404 for unmatched routes
    - _Requirements: 14.1, 16.6_

- [x] 2. Input validation and security middleware
  - [x] 2.1 Implement input validation module (`src/services/input-validator.ts`) with UUID format validation (RFC 4122), SQL injection pattern detection, XSS/script tag rejection, and general string sanitization
    - UUID validator must use strict regex: `/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i`
    - Reject inputs containing SQL keywords in injection patterns, `<script>` tags, and null bytes
    - _Requirements: 16.6_

  - [x] 2.2 Implement security middleware (`src/middleware/security.ts`) that attaches security headers to all responses: `Content-Security-Policy`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Strict-Transport-Security`, and CORS headers restricted to `muxvyr.com` and Stremio client origins
    - CORS must validate `Origin` header against allowlist before setting `Access-Control-Allow-Origin`
    - _Requirements: 16.5, 16.9_

  - [x] 2.3 Implement rate limiting middleware (`src/middleware/rate-limiter.ts`) using Upstash Redis counters with key pattern `ratelimit:{ip}:{endpoint}` and 60-second sliding window. Return HTTP 429 when limit exceeded.
    - Configuration endpoint: 10 requests/minute
    - AI proxy (catalog) endpoint: 30 requests/minute
    - _Requirements: 16.7_

  - [x] 2.4 Write property test for input sanitization (Property 11)
    - **Property 11: Input sanitization rejects malicious input**
    - Generate random strings including SQL injection patterns, script tags, and invalid UUID formats; verify all are rejected before reaching downstream services
    - **Validates: Requirements 16.6**

  - [x] 2.5 Write property test for security headers (Property 12)
    - **Property 12: Security headers present on all responses**
    - Generate random request paths and methods; verify all responses contain required security headers and CORS is restricted to allowed origins
    - **Validates: Requirements 16.5, 16.9**

- [x] 3. Encryption service
  - [x] 3.1 Implement encryption service (`src/services/encryption.ts`) with `encrypt`, `decrypt`, and `importKey` methods using the Web Crypto API with AES-256-GCM algorithm
    - `encrypt` must generate a unique random IV per operation and return base64-encoded ciphertext + IV
    - `decrypt` must accept base64-encoded ciphertext and IV, return plaintext
    - `importKey` must import a hex-encoded 256-bit key as a `CryptoKey` object
    - _Requirements: 3.4, 13.1, 13.4_

  - [x] 3.2 Write property test for encryption round-trip (Property 3)
    - **Property 3: API key encryption round-trip**
    - Generate random strings (varying lengths, special characters, unicode); verify encrypt then decrypt produces original plaintext and ciphertext differs from plaintext
    - **Validates: Requirements 3.4, 13.1**

- [x] 4. Supabase database schema and configuration service
  - [x] 4.1 Create the Supabase SQL migration file with the `user_configurations` table schema, `update_updated_at` trigger function, Row Level Security policies (`service_role_all` and `deny_public`), and UUID extension as specified in the design
    - _Requirements: 16.2, 16.3, 16.10_

  - [x] 4.2 Implement configuration service (`src/services/configuration.ts`) with CRUD operations: `createConfiguration`, `getConfiguration`, `updateConfiguration`
    - `createConfiguration` generates a UUID via Supabase, encrypts API key and Nuvio credentials before storage, returns the new UUID
    - `getConfiguration` fetches by UUID, returns the stored configuration (API key remains encrypted)
    - `updateConfiguration` updates fields for an existing UUID, re-encrypts API key if changed, updates `updated_at` timestamp
    - _Requirements: 1.1, 2.1, 2.2_

  - [x] 4.3 Implement configuration validator (`src/services/config-validator.ts`) that enforces: `ai_provider` must be one of `gemini | openai | grok`, API key must be non-empty string, `languages` array must have at least one entry, Nuvio credentials must be non-empty. Return field-level error details on failure.
    - Optional fields (fine_tuning_params, country_filter, genre_exclusions, genre_preferences) may be omitted or empty
    - _Requirements: 3.2, 3.3, 4.1, 5.1_

  - [x] 4.4 Write property test for configuration validation (Property 2)
    - **Property 2: Configuration validation rejects incomplete submissions**
    - Generate random configurations with strategically missing required fields; verify rejection with appropriate error details for each missing field
    - **Validates: Requirements 3.2, 3.3, 4.1, 5.1**

- [x] 5. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. API key masking and response safety
  - [x] 6.1 Implement API key masking function (`src/services/api-key-masking.ts`) that replaces all characters except the last 4 with asterisks. For keys shorter than 4 characters, mask the entire key.
    - _Requirements: 3.5_

  - [x] 6.2 Implement response builder (`src/services/response-builder.ts`) that constructs all HTTP responses and ensures raw API keys, database credentials, and encryption keys never appear in response bodies or error messages
    - Use the masking function when including API key info in configuration responses
    - Sanitize AI provider error messages to remove key fragments
    - _Requirements: 13.3_

  - [x] 6.3 Write property test for API key masking (Property 4)
    - **Property 4: API key masking**
    - Generate random strings of varying lengths (0 to 256 chars); verify only last 4 characters are visible and preceding characters are masked. For keys < 4 chars, entire key is masked.
    - **Validates: Requirements 3.5**

  - [x] 6.4 Write property test for API key never exposed (Property 5)
    - **Property 5: API key never exposed in responses**
    - Generate random API keys combined with various response scenarios; verify raw key never appears in response bodies, error messages, or log output
    - **Validates: Requirements 13.3**

- [x] 7. Nuvio Sync client
  - [x] 7.1 Implement Nuvio Sync client (`src/services/nuvio-sync.ts`) that fetches user watch history from the Nuvio Sync API using decrypted credentials
    - Define `NuvioSyncClient` interface and `WatchHistoryItem` type as specified in design
    - Handle connection failures and authentication errors with descriptive error messages (code: `NUVIO_SYNC_FAILED`)
    - Implement watch history change detection by computing SHA-256 hash and comparing with stored hash in Redis (key: `watchhist:{uuid}:hash`)
    - _Requirements: 5.2, 5.4, 5.5_

- [x] 8. AI Recommendation Engine
  - [x] 8.1 Implement prompt builder (`src/services/prompt-builder.ts`) that constructs the system prompt from user configuration: includes all watch history titles, selected languages, and conditionally includes fine-tuning parameters, country filter, genre exclusions, and genre preferences sections
    - Use the system prompt template from the design document
    - Support two catalog types: `general` and `because-you-watched` (includes reference title)
    - _Requirements: 10.1, 4.2, 5.3, 6.2, 7.1, 8.1, 9.1_

  - [x] 8.2 Implement AI provider adapters (`src/services/ai-providers/`) with separate modules for Gemini, OpenAI, and Grok. Each adapter formats the request per provider's API spec, sends the prompt, and parses the JSON response into `RecommendedTitle[]`.
    - Gemini: POST to `generativelanguage.googleapis.com`, auth via `x-goog-api-key` header
    - OpenAI: POST to `api.openai.com/v1/chat/completions`, model `gpt-4o-mini`, auth via Bearer token
    - Grok: POST to `api.x.ai/v1/chat/completions`, model `grok-3`, auth via Bearer token
    - Implement 25-second timeout per request
    - Discard decrypted API key from memory after request completes
    - _Requirements: 10.2, 13.4_

  - [x] 8.3 Implement the AI recommendation engine orchestrator (`src/services/ai-engine.ts`) that selects the correct provider adapter based on user config, calls it with the constructed prompt, and returns `RecommendedTitle[]`
    - On AI provider error or timeout, return `null` to signal degraded mode
    - _Requirements: 10.2, 10.4_

  - [x] 8.4 Write property test for system prompt construction (Property 6)
    - **Property 6: System prompt construction completeness**
    - Generate random UserConfiguration objects with all field combinations; verify constructed prompt contains all watch history titles, all languages, and every configured optional field's values
    - **Validates: Requirements 4.2, 5.3, 6.2, 7.1, 8.1, 9.1, 10.1**

- [x] 9. Metadata resolver
  - [x] 9.1 Implement metadata resolver (`src/services/metadata-resolver.ts`) with waterfall resolution strategy: query TMDB first, then TVDB, then Cinemeta, then Anime Kitsu. Short-circuit on first successful match. Return `StremioMetaPreview` with `id`, `type`, `name`, `poster`, `description`.
    - If no source matches, return `null` (title will be omitted from catalog)
    - Include individual source adapter modules under `src/services/metadata-sources/`
    - _Requirements: 17.1, 17.2, 17.3_

  - [x] 9.2 Write property test for metadata resolution waterfall (Property 13)
    - **Property 13: Metadata resolution waterfall and completeness**
    - Generate random availability patterns across sources (which sources have data, which don't); verify priority order is respected, first match short-circuits, result includes poster/description/id, and titles with no match are omitted
    - **Validates: Requirements 17.1, 17.2, 17.3**

- [ ] 10. Cache service
  - [x] 10.1 Implement cache service (`src/services/cache.ts`) using Upstash Redis REST API with methods: `getCatalog`, `setCatalog`, `getMetadata`, `setMetadata`, `invalidateUser`
    - Use key patterns from design: `catalog:{uuid}:{catalogId}` (TTL: 6 hours), `meta:{imdbId}` (TTL: 24 hours)
    - `invalidateUser` must delete all keys matching `catalog:{uuid}:*`
    - Token-based auth over TLS for all Redis connections
    - _Requirements: 12.1, 12.2, 12.3, 16.4, 17.4_

- [x] 11. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 12. Manifest builder and catalog formatter
  - [x] 12.1 Implement manifest builder (`src/services/manifest-builder.ts`) that generates a Stremio-compatible manifest JSON per user. Include "AI Recommendations" catalogs for both movies and series, plus "Because you watched [Title]" catalogs derived from recent watch history items.
    - Manifest must include: `id`, `version`, `name`, `description`, `resources`, `types`, `catalogs`
    - Use watch history to generate BYW catalog entries (use most recent 3-5 titles)
    - _Requirements: 11.1, 11.2, 11.3, 14.1, 14.2_

  - [x] 12.2 Implement catalog formatter (`src/services/catalog-formatter.ts`) that takes an array of `StremioMetaPreview` objects and formats them as a Stremio-protocol-compliant catalog response with a `metas` array containing `id`, `type`, `name`, `poster`, and optional `description`, `releaseInfo`, `imdbRating`.
    - _Requirements: 11.4_

  - [x] 12.3 Write property test for manifest URL construction (Property 1)
    - **Property 1: Manifest URL construction**
    - Generate random valid UUIDs; verify constructed URL is exactly `muxvyr.com/{UUID}/manifest.json` with UUID unchanged
    - **Validates: Requirements 1.2**

  - [x] 12.4 Write property test for "Because you watched" catalogs (Property 7)
    - **Property 7: "Because you watched" catalogs derived from watch history**
    - Generate random non-empty watch history lists (1-50 items); verify at least one BYW catalog entry whose name includes a title from the watch history
    - **Validates: Requirements 11.2**

  - [x] 12.5 Write property test for manifest schema validity (Property 8)
    - **Property 8: Manifest schema validity**
    - Generate random UserConfiguration objects; verify generated manifest includes non-empty `id`, `version`, `name`, `description`, `resources`, `types`, and `catalogs` array with valid entries
    - **Validates: Requirements 11.3, 14.1, 14.2**

  - [x] 12.6 Write property test for catalog response format (Property 9)
    - **Property 9: Catalog response format compliance**
    - Generate random StremioMetaPreview arrays; verify formatted response is JSON with `metas` array where each item has `id`, `type`, `name`, and `poster`
    - **Validates: Requirements 11.4**

- [x] 13. Route handlers (wiring services together)
  - [x] 13.1 Implement manifest handler (`src/handlers/manifest.ts`): validate UUID input, fetch configuration from Supabase, fetch watch history from Nuvio Sync, build manifest using manifest builder, return JSON response with security headers. Return 404 for non-existent UUID.
    - _Requirements: 14.1, 14.2, 14.3_

  - [x] 13.2 Implement catalog handler (`src/handlers/catalog.ts`): validate UUID and catalog parameters, check cache first, on cache miss: fetch config, decrypt API key, fetch watch history, generate recommendations via AI engine, resolve metadata, cache result, format and return catalog response. On AI failure: return cached/stale catalog or empty catalog with error indicator.
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 12.1, 12.2_

  - [x] 13.3 Implement configuration page handler (`src/handlers/configure.ts`): `GET /{UUID}/configure` serves the configuration page HTML with pre-filled values (masked API key), `POST /{UUID}/configure` validates and updates the configuration, `POST /configure` creates a new configuration. Invalidate cache on config update.
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 2.1, 2.2, 2.3, 2.4, 12.3_

  - [x] 13.4 Write property test for non-existent UUID returns 404 (Property 10)
    - **Property 10: Non-existent UUID returns 404**
    - Generate random UUIDs not in mock database; verify both manifest and configure endpoints return HTTP 404
    - **Validates: Requirements 2.3, 14.3**

- [x] 14. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 15. Frontend configuration page
  - [x] 15.1 Implement the configuration page HTML/CSS (`src/frontend/configure.html` or inline in handler) using Material Design 3 styling with responsive layout (desktop + mobile)
    - Mandatory fields: AI provider selection (radio/select for Gemini, OpenAI, Grok), API key input, language multi-select, Nuvio Sync credentials input
    - Optional fields: fine-tuning parameters textarea, country filter multi-select (US, CA, AU, NZ, UK at minimum), genre exclusion multi-select, genre preference multi-select
    - Clearly indicate mandatory vs optional fields with visual markers
    - _Requirements: 15.1, 15.2, 15.3, 3.1, 7.2, 8.2, 9.2_

  - [x] 15.2 Implement client-side form logic: inline validation (required field checks before submission), API key masking display for saved configs (show last 4 chars only), form submission via fetch to POST endpoint, display generated Manifest URL on success, display error messages on failure
    - _Requirements: 15.4, 1.3, 1.4, 2.4, 3.5_

  - [x] 15.3 Implement the landing page (`GET /`) with brief add-on description and a "Create New Configuration" button that navigates to a fresh configuration form
    - _Requirements: 1.1_

- [x] 16. Integration tests
  - [x] 16.1 Write integration tests for the full catalog flow using Miniflare + Vitest: simulate Stremio catalog request → cache miss → config fetch → Nuvio sync → AI recommendation → metadata resolution → cache write → response
    - Mock external APIs (Nuvio, AI providers, metadata sources) with realistic responses
    - Verify end-to-end response format matches Stremio protocol
    - _Requirements: 10.1, 10.2, 10.3, 11.4, 12.1_

  - [x] 16.2 Write integration tests for configuration lifecycle: create config → retrieve config → update config → verify cache invalidation
    - Verify UUID generation, encrypted storage, masked retrieval, and update persistence
    - _Requirements: 1.1, 2.1, 2.2, 12.3_

  - [x] 16.3 Write integration tests for cache behavior: cache hit returns without AI call, cache miss triggers full pipeline, config update invalidates cache, watch history change invalidates cache
    - _Requirements: 12.1, 12.2, 12.3, 5.5_

  - [x] 16.4 Write integration tests for Nuvio Sync communication: successful fetch, auth failure handling, connection timeout handling
    - _Requirements: 5.2, 5.4_

- [x] 17. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation after each major phase
- Property tests validate universal correctness properties from the design document using fast-check
- All code is TypeScript, targeting Cloudflare Workers runtime (Web Crypto API, no Node.js built-ins)
- External service calls (Nuvio, AI providers, metadata APIs) should be abstracted behind interfaces for testability
