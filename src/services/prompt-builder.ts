/**
 * Prompt Builder
 *
 * Constructs the system prompt for AI recommendation generation based on
 * user configuration, watch history, and optional preference fields.
 *
 * @module prompt-builder
 * @requirements 10.1, 4.2, 5.3, 6.2, 7.1, 8.1, 9.1
 */

/**
 * Context needed to build a system prompt for AI recommendation generation.
 */
export interface WatchHistoryDetail {
  title: string;
  description?: string;
  genres?: string[];
  year?: number;
}

export interface PromptContext {
  /** List of titles from the user's watch history */
  watchHistory: string[];
  /** Rich details for watch history items (description, genres) fetched from Cinemeta */
  watchHistoryDetails?: WatchHistoryDetail[];
  /** Selected languages for recommendations (ISO 639-1 codes or language names) */
  languages: string[];
  /** Optional free-text fine-tuning instructions */
  fineTuningParams?: string;
  /** Optional country filter (ISO 3166-1 alpha-2 codes) */
  countryFilter?: string[];
  /** Optional genres to exclude from recommendations */
  genreExclusions?: string[];
  /** Optional genres to favor in recommendations */
  genrePreferences?: string[];
  /** Catalog type: general recommendations or "because you watched" */
  catalogType: "general" | "because-you-watched";
  /** Reference title for "because-you-watched" catalog type */
  referenceTitleForByw?: string;
  /** Rich description of the reference title for BYW */
  referenceTitleDescription?: string;
  /** Content type filter: only recommend this type */
  contentType?: "movie" | "series";
  /** Number of recommendations to request (default: 20) */
  count?: number;
}

/**
 * Builds the system prompt for an AI recommendation request.
 *
 * Constructs the prompt from the template defined in the design document,
 * conditionally including optional sections based on the provided context.
 *
 * @param context - The prompt context containing user preferences and watch history
 * @returns The fully constructed system prompt string
 */
export function buildSystemPrompt(context: PromptContext): string {
  const count = context.count ?? 20;
  const languages = context.languages.join(", ");

  // Build rich watch history section with descriptions and genres
  let watchHistorySection: string;
  if (context.watchHistoryDetails && context.watchHistoryDetails.length > 0) {
    watchHistorySection = context.watchHistoryDetails.map((item) => {
      let entry = `- "${item.title}"`;
      if (item.year) entry += ` (${item.year})`;
      if (item.genres && item.genres.length > 0) entry += ` [${item.genres.join(", ")}]`;
      if (item.description) entry += `\n  Synopsis: ${item.description.slice(0, 150)}`;
      return entry;
    }).join("\n");
  } else {
    watchHistorySection = context.watchHistory.map((title) => `- ${title}`).join("\n");
  }

  const countryFilterSection = buildCountryFilterSection(context.countryFilter);
  const genreExclusionSection = buildGenreExclusionSection(context.genreExclusions);
  const genrePreferenceSection = buildGenrePreferenceSection(context.genrePreferences);
  const fineTuningSection = buildFineTuningSection(context.fineTuningParams);

  // Build BYW section with rich description
  let bywSection = "";
  if (context.catalogType === "because-you-watched" && context.referenceTitleForByw) {
    bywSection = `\nREFERENCE TITLE: "${context.referenceTitleForByw}"`;
    if (context.referenceTitleDescription) {
      bywSection += `\nAbout this title: ${context.referenceTitleDescription}`;
    }
    bywSection += `\nRecommend titles that share similar THEMES, TONE, STYLE, and SUBJECT MATTER with this specific title. Focus on what makes this show/movie unique — its premise, humor style, emotional register, pacing, and target audience.\n`;
  }

  const contentTypeInstruction = context.contentType
    ? `\nCONTENT TYPE: ONLY recommend ${context.contentType === "movie" ? "MOVIES" : "TV SERIES"}. Every single item MUST be type "${context.contentType}". Zero exceptions.`
    : "";

  const prompt = `You are an expert content recommendation engine for a streaming media application. Your goal is to recommend titles that the user will ACTUALLY enjoy based on the specific themes, tone, humor, and subject matter of their watch history — not just the same broad genre.

WATCH HISTORY (what the user has recently watched):
${watchHistorySection}

LANGUAGE RESTRICTION: ${languages} ONLY.${contentTypeInstruction}
${countryFilterSection}${genreExclusionSection}${genrePreferenceSection}${fineTuningSection}${bywSection}
CRITICAL RULES:
1. Return EXACTLY ${count} unique recommendations as a JSON array
2. Each item must have: title, type ("${context.contentType || "movie or series"}"), year (integer)
3. NEVER recommend titles already in the watch history
4. ONLY recommend titles originally produced in or primarily available in: ${languages}
5. Do NOT recommend foreign-language content, anime, or non-English titles unless explicitly in the user's language list
6. ${context.countryFilter && context.countryFilter.length > 0 ? `ONLY recommend titles from these countries: ${context.countryFilter.join(", ")}. No exceptions — no Korean dramas, no Japanese anime, no Bollywood, no European art films unless from listed countries.` : "Focus on mainstream English-language content."}
7. Prioritize titles available on major streaming platforms (Netflix, Hulu, Prime, Disney+, HBO Max, Peacock, Paramount+, Apple TV+)
8. Recommendations must be THEMATICALLY related to the watch history — match the tone, subject matter, humor style, and target audience, not just the genre label
9. Include a mix of popular well-known titles AND hidden gems the user likely hasn't seen
10. Every recommendation must be a REAL title that actually exists

OUTPUT FORMAT (valid JSON array, nothing else):
[{"title": "...", "type": "${context.contentType || "movie"}", "year": 2024, "reason": "Brief explanation of why this matches"}]`;

  return prompt;
}

/**
 * Builds the COUNTRY FILTER section if country filter is configured.
 */
function buildCountryFilterSection(countryFilter?: string[]): string {
  if (!countryFilter || countryFilter.length === 0) {
    return "";
  }
  return `\nCOUNTRY FILTER: Only recommend titles from: ${countryFilter.join(", ")}\n`;
}

/**
 * Builds the GENRE EXCLUSION section if genre exclusions are configured.
 */
function buildGenreExclusionSection(genreExclusions?: string[]): string {
  if (!genreExclusions || genreExclusions.length === 0) {
    return "";
  }
  return `\nGENRE EXCLUSION: Do NOT recommend titles in these genres: ${genreExclusions.join(", ")}\n`;
}

/**
 * Builds the GENRE PREFERENCE section if genre preferences are configured.
 */
function buildGenrePreferenceSection(genrePreferences?: string[]): string {
  if (!genrePreferences || genrePreferences.length === 0) {
    return "";
  }
  return `\nGENRE PREFERENCE: Favor titles in these genres: ${genrePreferences.join(", ")}\n`;
}

/**
 * Builds the FINE TUNING section if fine-tuning parameters are configured.
 */
function buildFineTuningSection(fineTuningParams?: string): string {
  if (!fineTuningParams) {
    return "";
  }
  return `\nFINE TUNING: ${fineTuningParams}\n`;
}

// buildBywSection is now inline in the main prompt builder
