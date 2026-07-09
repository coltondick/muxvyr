/**
 * Unit tests for the Prompt Builder service.
 *
 * Tests cover system prompt construction for both general and BYW catalog types,
 * conditional inclusion of optional sections, and default/custom count behavior.
 *
 * @requirements 10.1, 4.2, 5.3, 6.2, 7.1, 8.1, 9.1
 */

import { describe, it, expect } from "vitest";
import { buildSystemPrompt, PromptContext } from "../../src/services/prompt-builder";

describe("Prompt Builder", () => {
  const baseContext: PromptContext = {
    watchHistory: ["Inception", "The Matrix", "Interstellar"],
    languages: ["English", "Spanish"],
    catalogType: "general",
  };

  describe("general catalog type", () => {
    it("includes all watch history titles in the prompt", () => {
      const prompt = buildSystemPrompt(baseContext);

      expect(prompt).toContain("Inception");
      expect(prompt).toContain("The Matrix");
      expect(prompt).toContain("Interstellar");
    });

    it("includes all watch history titles under the WATCH HISTORY section", () => {
      const prompt = buildSystemPrompt(baseContext);

      expect(prompt).toContain("WATCH HISTORY");
      const watchSection = prompt.split("WATCH HISTORY")[1].split("LANGUAGE")[0];
      expect(watchSection).toContain("Inception");
      expect(watchSection).toContain("The Matrix");
      expect(watchSection).toContain("Interstellar");
    });

    it("does not include BYW reference title instruction", () => {
      const prompt = buildSystemPrompt(baseContext);

      expect(prompt).not.toContain("REFERENCE TITLE:");
    });
  });

  describe("because-you-watched catalog type", () => {
    it("includes reference title instruction", () => {
      const context: PromptContext = {
        ...baseContext,
        catalogType: "because-you-watched",
        referenceTitleForByw: "Breaking Bad",
      };

      const prompt = buildSystemPrompt(context);

      expect(prompt).toContain('REFERENCE TITLE: "Breaking Bad"');
    });

    it("does not include BYW instruction when referenceTitleForByw is missing", () => {
      const context: PromptContext = {
        ...baseContext,
        catalogType: "because-you-watched",
      };

      const prompt = buildSystemPrompt(context);

      expect(prompt).not.toContain("REFERENCE TITLE:");
    });
  });

  describe("language section", () => {
    it("lists all selected languages", () => {
      const prompt = buildSystemPrompt(baseContext);

      expect(prompt).toContain("LANGUAGE RESTRICTION: English, Spanish ONLY");
    });

    it("handles a single language", () => {
      const context: PromptContext = {
        ...baseContext,
        languages: ["French"],
      };

      const prompt = buildSystemPrompt(context);

      expect(prompt).toContain("LANGUAGE RESTRICTION: French ONLY");
    });

    it("handles multiple languages", () => {
      const context: PromptContext = {
        ...baseContext,
        languages: ["English", "Spanish", "French", "German"],
      };

      const prompt = buildSystemPrompt(context);

      expect(prompt).toContain("English, Spanish, French, German ONLY");
    });
  });

  describe("optional sections", () => {
    it("includes country filter section when configured", () => {
      const context: PromptContext = {
        ...baseContext,
        countryFilter: ["US", "UK"],
      };

      const prompt = buildSystemPrompt(context);

      expect(prompt).toContain("COUNTRY FILTER: Only recommend titles from: US, UK");
    });

    it("does not include country filter section when not configured", () => {
      const prompt = buildSystemPrompt(baseContext);

      expect(prompt).not.toContain("COUNTRY FILTER");
    });

    it("does not include country filter section when array is empty", () => {
      const context: PromptContext = {
        ...baseContext,
        countryFilter: [],
      };

      const prompt = buildSystemPrompt(context);

      expect(prompt).not.toContain("COUNTRY FILTER");
    });

    it("includes genre exclusion section when configured", () => {
      const context: PromptContext = {
        ...baseContext,
        genreExclusions: ["Horror", "Romance"],
      };

      const prompt = buildSystemPrompt(context);

      expect(prompt).toContain("GENRE EXCLUSION: Do NOT recommend titles in these genres: Horror, Romance");
    });

    it("does not include genre exclusion section when not configured", () => {
      const prompt = buildSystemPrompt(baseContext);

      expect(prompt).not.toContain("GENRE EXCLUSION");
    });

    it("includes genre preference section when configured", () => {
      const context: PromptContext = {
        ...baseContext,
        genrePreferences: ["Sci-Fi", "Thriller"],
      };

      const prompt = buildSystemPrompt(context);

      expect(prompt).toContain("GENRE PREFERENCE: Favor titles in these genres: Sci-Fi, Thriller");
    });

    it("does not include genre preference section when not configured", () => {
      const prompt = buildSystemPrompt(baseContext);

      expect(prompt).not.toContain("GENRE PREFERENCE");
    });

    it("includes fine-tuning section when configured", () => {
      const context: PromptContext = {
        ...baseContext,
        fineTuningParams: "Prefer recent releases from the last 3 years",
      };

      const prompt = buildSystemPrompt(context);

      expect(prompt).toContain("FINE TUNING: Prefer recent releases from the last 3 years");
    });

    it("does not include fine-tuning section when not configured", () => {
      const prompt = buildSystemPrompt(baseContext);

      expect(prompt).not.toContain("FINE TUNING");
    });

    it("includes all optional sections when all are configured", () => {
      const context: PromptContext = {
        ...baseContext,
        countryFilter: ["US", "CA"],
        genreExclusions: ["Horror"],
        genrePreferences: ["Action", "Comedy"],
        fineTuningParams: "Focus on critically acclaimed titles",
      };

      const prompt = buildSystemPrompt(context);

      expect(prompt).toContain("COUNTRY FILTER");
      expect(prompt).toContain("GENRE EXCLUSION");
      expect(prompt).toContain("GENRE PREFERENCE");
      expect(prompt).toContain("FINE TUNING");
    });

    it("includes already recommended section when provided", () => {
      const context: PromptContext = {
        ...baseContext,
        alreadyRecommended: ["The Dark Knight", "Pulp Fiction"],
      };

      const prompt = buildSystemPrompt(context);

      expect(prompt).toContain("ALREADY RECOMMENDED");
      expect(prompt).toContain("The Dark Knight");
      expect(prompt).toContain("Pulp Fiction");
    });

    it("does not include already recommended section when empty", () => {
      const prompt = buildSystemPrompt(baseContext);

      // The section header with the list should not appear (rule #11 will mention it generically)
      expect(prompt).not.toContain("ALREADY RECOMMENDED (do NOT suggest these again):");
    });

    it("includes dismissed section when provided", () => {
      const context: PromptContext = {
        ...baseContext,
        dismissedTitles: ["Bad Movie", "Boring Show"],
      };

      const prompt = buildSystemPrompt(context);

      expect(prompt).toContain("DISMISSED BY USER");
      expect(prompt).toContain("Bad Movie");
      expect(prompt).toContain("Boring Show");
    });

    it("does not include dismissed section when empty", () => {
      const prompt = buildSystemPrompt(baseContext);

      expect(prompt).not.toContain("DISMISSED BY USER");
    });
  });

  describe("output format section", () => {
    it("contains required OUTPUT FORMAT section", () => {
      const prompt = buildSystemPrompt(baseContext);

      expect(prompt).toContain("OUTPUT FORMAT");
      expect(prompt).toContain('"title"');
      expect(prompt).toContain('"type"');
      expect(prompt).toContain('"year"');
      expect(prompt).toContain('"reason"');
    });

    it("contains CRITICAL RULES section", () => {
      const prompt = buildSystemPrompt(baseContext);

      expect(prompt).toContain("CRITICAL RULES:");
      expect(prompt).toContain("NEVER recommend titles already in the watch history");
    });
  });

  describe("count behavior", () => {
    it("defaults count to 20 when not specified", () => {
      const prompt = buildSystemPrompt(baseContext);

      expect(prompt).toContain("Return EXACTLY 20 unique recommendations");
    });

    it("uses custom count when specified", () => {
      const context: PromptContext = {
        ...baseContext,
        count: 5,
      };

      const prompt = buildSystemPrompt(context);

      expect(prompt).toContain("Return EXACTLY 5 unique recommendations");
    });

    it("uses custom count of 30", () => {
      const context: PromptContext = {
        ...baseContext,
        count: 30,
      };

      const prompt = buildSystemPrompt(context);

      expect(prompt).toContain("Return EXACTLY 30 unique recommendations");
    });
  });

  describe("recency markers", () => {
    it("includes recency markers in watch history details", () => {
      const context: PromptContext = {
        ...baseContext,
        watchHistoryDetails: [
          { title: "Recent Movie", year: 2024, recencyMarker: "[CURRENT]" },
          { title: "Last Month", year: 2023, recencyMarker: "[RECENT]" },
          { title: "Old Movie", year: 2020 },
        ],
      };

      const prompt = buildSystemPrompt(context);

      expect(prompt).toContain('[CURRENT] "Recent Movie"');
      expect(prompt).toContain('[RECENT] "Last Month"');
      expect(prompt).toContain('"Old Movie"');
      expect(prompt).not.toContain('[CURRENT] "Old Movie"');
      expect(prompt).not.toContain('[RECENT] "Old Movie"');
    });

    it("includes note about weighting CURRENT and RECENT items", () => {
      const prompt = buildSystemPrompt(baseContext);

      expect(prompt).toContain("[CURRENT]");
      expect(prompt).toContain("[RECENT]");
      expect(prompt).toContain("Weight these MORE HEAVILY");
    });
  });
});
