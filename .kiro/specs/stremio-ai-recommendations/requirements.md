# Requirements Document

## Introduction

A Stremio add-on that provides AI-powered content recommendations based on a user's watch history synced from Nuvio Sync. The add-on exposes personalized catalogs (e.g., "AI Recommendations", "Because you watched...") within Stremio, powered by configurable AI providers (Gemini, OpenAI, or Grok). Each user receives a unique manifest URL tied to their configuration, hosted on Cloudflare Workers with Supabase as the backend database and Upstash Redis for caching. The base domain is muxvyr.com.

## Glossary

- **Add-on**: A Stremio-compatible service that exposes catalogs and metadata via a manifest URL
- **Manifest_URL**: A unique URL per user in the format `muxvyr.com/{UUID}/manifest.json` that Stremio uses to load the add-on
- **Configuration_Page**: A web page at `muxvyr.com/{UUID}/configure` where users can view and modify their settings
- **UUID**: A universally unique identifier assigned to each user configuration
- **AI_Provider**: One of Gemini, OpenAI, or Grok — the language model service used to generate recommendations
- **API_Key**: A secret credential supplied by the user for authenticating with their chosen AI_Provider
- **Nuvio_Sync**: An external service that tracks a user's watched content history (reference: https://github.com/NuvioMedia/NuvioTV)
- **Watch_History**: The list of previously watched titles synced from Nuvio_Sync
- **Catalog**: A named list of content items exposed to Stremio (e.g., "AI Recommendations", "Because you watched...")
- **Metadata_Source**: An external API used to enrich recommendations with poster art, descriptions, and IDs (TVDB, TMDB, Cinemeta, Anime Kitsu)
- **Fine_Tuning_Parameters**: Optional user-defined settings that further adjust AI recommendation behavior
- **Country_Filter**: An optional restriction limiting recommendations to titles originating from specific countries
- **Genre_Exclusion**: An optional list of genres the user does not want recommended
- **Genre_Preference**: An optional list of genres the user wants the AI to favor
- **Language_Selection**: A mandatory setting that scopes recommendations to titles available in the chosen language
- **System_Prompt**: The internal prompt template sent to the AI_Provider that instructs it how to generate recommendations
- **Supabase**: The PostgreSQL-based backend database service storing user configurations and API keys
- **Upstash_Redis**: A serverless Redis cache used to store and serve previously generated recommendations
- **Cloudflare_Workers**: The serverless compute platform hosting the add-on frontend and API logic

## Requirements

### Requirement 1: User Configuration Creation

**User Story:** As a user, I want to create a personal add-on configuration so that I receive a unique manifest URL for Stremio.

#### Acceptance Criteria

1. WHEN a user clicks the "Save Add-on" button on the configuration page, THE Configuration_Page SHALL generate a new UUID and persist the user's settings to Supabase
2. WHEN a UUID is generated, THE Add-on SHALL construct a Manifest_URL in the format `muxvyr.com/{UUID}/manifest.json`
3. WHEN configuration creation succeeds, THE Configuration_Page SHALL display the generated Manifest_URL to the user
4. IF configuration creation fails due to a database error, THEN THE Configuration_Page SHALL display an error message describing the failure

### Requirement 2: User Configuration Retrieval and Editing

**User Story:** As a user, I want to access my existing configuration via a unique URL so that I can view and modify my settings.

#### Acceptance Criteria

1. WHEN a user navigates to `muxvyr.com/{UUID}/configure`, THE Configuration_Page SHALL retrieve the associated configuration from Supabase and display all current settings
2. WHEN a user modifies settings and clicks save, THE Configuration_Page SHALL persist the updated configuration to Supabase under the same UUID
3. IF a user navigates to a configure endpoint with an invalid or non-existent UUID, THEN THE Configuration_Page SHALL display a "Configuration not found" error message
4. WHEN configuration is saved successfully, THE Configuration_Page SHALL display a confirmation message

### Requirement 3: AI Provider Selection

**User Story:** As a user, I want to select my preferred AI provider and supply my API key so that the add-on can generate personalized recommendations.

#### Acceptance Criteria

1. THE Configuration_Page SHALL present a selection of exactly three AI_Provider options: Gemini, OpenAI, and Grok
2. THE Configuration_Page SHALL require the user to select exactly one AI_Provider before saving
3. THE Configuration_Page SHALL require the user to supply a valid API_Key for the selected AI_Provider before saving
4. WHEN an API_Key is stored, THE Add-on SHALL encrypt the API_Key before persisting it to Supabase
5. WHEN displaying a saved configuration, THE Configuration_Page SHALL mask the stored API_Key, showing only the last four characters

### Requirement 4: Language Selection

**User Story:** As a user, I want to select a language for my recommendations so that I only receive titles available in that language.

#### Acceptance Criteria

1. THE Configuration_Page SHALL require the user to select at least one language before saving
2. WHEN generating recommendations, THE Add-on SHALL scope results to titles available in the selected Language_Selection
3. THE Configuration_Page SHALL present a list of supported languages for the user to choose from

### Requirement 5: Nuvio Sync Integration

**User Story:** As a user, I want to connect my Nuvio Sync account so that recommendations are based on my actual watch history.

#### Acceptance Criteria

1. THE Configuration_Page SHALL require the user to provide Nuvio_Sync connection credentials before saving
2. WHEN generating recommendations, THE Add-on SHALL retrieve the user's Watch_History from Nuvio_Sync
3. WHEN Watch_History is retrieved, THE Add-on SHALL use the watched titles as input context for the AI_Provider System_Prompt
4. IF the Nuvio_Sync connection fails, THEN THE Add-on SHALL return a descriptive error indicating the sync failure
5. WHEN Watch_History changes are detected, THE Add-on SHALL invalidate the relevant cached recommendations in Upstash_Redis

### Requirement 6: Fine Tuning Parameters

**User Story:** As a user, I want to optionally provide fine-tuning parameters so that I can further customize my AI-generated recommendations.

#### Acceptance Criteria

1. WHERE Fine_Tuning_Parameters are configured, THE Configuration_Page SHALL include them in the saved configuration
2. WHERE Fine_Tuning_Parameters are configured, THE Add-on SHALL append them to the System_Prompt sent to the AI_Provider
3. THE Configuration_Page SHALL allow the user to save a valid configuration without specifying Fine_Tuning_Parameters

### Requirement 7: Country of Origin Filter

**User Story:** As a user, I want to optionally restrict recommendations to specific countries of origin so that I see content aligned with my cultural preferences.

#### Acceptance Criteria

1. WHERE Country_Filter is configured, THE Add-on SHALL restrict recommendations to titles originating from the specified countries
2. THE Configuration_Page SHALL present a multi-select list of countries including at minimum: United States, Canada, Australia, New Zealand, and United Kingdom
3. THE Configuration_Page SHALL allow the user to save a valid configuration without specifying a Country_Filter

### Requirement 8: Genre Exclusion

**User Story:** As a user, I want to optionally exclude specific genres so that I do not receive recommendations in genres I dislike.

#### Acceptance Criteria

1. WHERE Genre_Exclusion is configured, THE Add-on SHALL exclude titles matching any of the specified genres from recommendations
2. THE Configuration_Page SHALL present a multi-select list of available genres for exclusion
3. THE Configuration_Page SHALL allow the user to save a valid configuration without specifying Genre_Exclusion

### Requirement 9: Genre Preference

**User Story:** As a user, I want to optionally favor specific genres so that my recommendations lean toward content I enjoy.

#### Acceptance Criteria

1. WHERE Genre_Preference is configured, THE Add-on SHALL instruct the AI_Provider to favor titles in the specified genres when generating recommendations
2. THE Configuration_Page SHALL present a multi-select list of available genres for preference
3. THE Configuration_Page SHALL allow the user to save a valid configuration without specifying Genre_Preference

### Requirement 10: AI Recommendation Generation

**User Story:** As a user, I want the add-on to generate personalized recommendations so that I discover new content tailored to my viewing habits.

#### Acceptance Criteria

1. WHEN Stremio requests a catalog from the Add-on, THE Add-on SHALL construct a System_Prompt containing the user's Watch_History, Language_Selection, and any configured Fine_Tuning_Parameters, Country_Filter, Genre_Exclusion, and Genre_Preference
2. WHEN a System_Prompt is constructed, THE Add-on SHALL send it to the user's configured AI_Provider using the stored API_Key
3. WHEN the AI_Provider returns recommendations, THE Add-on SHALL resolve each title against at least one Metadata_Source (TVDB, TMDB, Cinemeta, or Anime Kitsu)
4. IF the AI_Provider returns an error or times out, THEN THE Add-on SHALL return a cached version of the catalog if available, or an empty catalog with an error indicator

### Requirement 11: Catalog Exposure

**User Story:** As a user, I want to see named catalogs in Stremio so that I can browse recommendations by category.

#### Acceptance Criteria

1. THE Add-on SHALL expose an "AI Recommendations" catalog containing general personalized suggestions
2. THE Add-on SHALL expose one or more "Because you watched [Title]" catalogs based on recently watched titles from Watch_History
3. WHEN Stremio loads the Manifest_URL, THE Add-on SHALL return a valid Stremio manifest listing all available catalogs
4. WHEN a catalog is requested, THE Add-on SHALL return results formatted according to the Stremio add-on protocol

### Requirement 12: Caching

**User Story:** As a user, I want fast catalog responses so that browsing recommendations in Stremio feels responsive.

#### Acceptance Criteria

1. WHEN recommendations are generated, THE Add-on SHALL store the results in Upstash_Redis with a configurable time-to-live
2. WHEN a catalog is requested and a valid cache entry exists in Upstash_Redis, THE Add-on SHALL return the cached results without calling the AI_Provider
3. WHEN a user updates their configuration, THE Add-on SHALL invalidate all cached recommendations for that user's UUID

### Requirement 13: API Key Security

**User Story:** As a user, I want my API keys stored securely so that they cannot be exposed in a data breach.

#### Acceptance Criteria

1. THE Add-on SHALL encrypt API_Key values at rest using AES-256 or equivalent encryption before storing them in Supabase
2. THE Add-on SHALL transmit API_Key values only over HTTPS
3. THE Add-on SHALL never include raw API_Key values in logs, error messages, or API responses
4. WHEN an API_Key is used for an AI_Provider request, THE Add-on SHALL decrypt it in memory and discard the plaintext after the request completes

### Requirement 14: Manifest Endpoint

**User Story:** As a user, I want the manifest endpoint to return a valid Stremio manifest so that Stremio can install and use my add-on.

#### Acceptance Criteria

1. WHEN Stremio requests `muxvyr.com/{UUID}/manifest.json`, THE Add-on SHALL return a JSON response conforming to the Stremio add-on manifest schema
2. THE manifest response SHALL include the add-on name, description, version, available catalogs, and supported resource types
3. IF the UUID does not exist, THEN THE Add-on SHALL return an HTTP 404 response

### Requirement 15: Frontend Design

**User Story:** As a user, I want a modern and visually appealing configuration interface so that setting up the add-on is intuitive.

#### Acceptance Criteria

1. THE Configuration_Page SHALL implement Material Design 3 styling with a modern color palette
2. THE Configuration_Page SHALL be responsive and usable on both desktop and mobile devices
3. THE Configuration_Page SHALL clearly indicate mandatory fields versus optional fields
4. THE Configuration_Page SHALL provide inline validation feedback for required fields before form submission

### Requirement 16: Infrastructure Security

**User Story:** As a user, I want the application to follow security best practices for its infrastructure so that my data and interactions are protected by default.

#### Acceptance Criteria

1. THE Add-on SHALL enforce HTTPS for all endpoints served via Cloudflare_Workers with TLS 1.2 or higher
2. THE Add-on SHALL configure Supabase Row Level Security (RLS) policies so that database operations are restricted to the owning UUID context
3. THE Add-on SHALL use Supabase service role keys only server-side and never expose them to the client
4. THE Add-on SHALL authenticate Upstash_Redis connections using token-based authentication over TLS
5. THE Add-on SHALL set appropriate CORS headers on all API responses, restricting origins to muxvyr.com and Stremio client origins
6. THE Add-on SHALL validate and sanitize all user-supplied input (UUID path parameters, configuration fields) to prevent injection attacks
7. THE Add-on SHALL apply rate limiting on configuration creation and AI_Provider proxy endpoints to mitigate abuse
8. THE Add-on SHALL store infrastructure secrets (Supabase keys, Upstash tokens, encryption keys) exclusively in Cloudflare Workers environment variables or secrets, never in source code
9. THE Add-on SHALL set security headers on all HTTP responses including Content-Security-Policy, X-Content-Type-Options, X-Frame-Options, and Strict-Transport-Security
10. THE Add-on SHALL ensure Supabase database credentials use least-privilege access, with separate roles for read and write operations where applicable

### Requirement 17: Metadata Resolution

**User Story:** As a user, I want recommendations enriched with metadata so that I see poster art, descriptions, and correct identifiers in Stremio.

#### Acceptance Criteria

1. WHEN resolving a recommended title, THE Add-on SHALL query Metadata_Sources in the following priority order: TMDB, TVDB, Cinemeta, Anime Kitsu
2. WHEN a Metadata_Source returns a match, THE Add-on SHALL include the poster image URL, title description, and Stremio-compatible content ID in the catalog response
3. IF no Metadata_Source returns a match for a recommended title, THEN THE Add-on SHALL omit that title from the catalog response
4. THE Add-on SHALL cache metadata lookups in Upstash_Redis to reduce redundant external API calls
