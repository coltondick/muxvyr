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

      expect(prompt).toContain("- Inception");
      expect(prompt).toContain("- The Matrix");
      expect(prompt).toContain("- Interstellar");
    });

    it("includes all watch history titles under the WATCH HISTORY section", () => {
      const prompt = buildSystemPrompt(baseContext);

      expect(prompt).toContain("WATCH HISTORY:");
      const watchSection = prompt.split("WATCH HISTORY:")[1].split("LANGUAGE:")[0];
      expect(watchSection).toContain("Inception");
      expect(watchSection).toContain("The Matrix");
      expect(watchSection).toContain("Interstellar");
    });

    it("does not include BYW reference title instruction", () => {
      const prompt = buildSystemPrompt(baseContext);

      expect(prompt).not.toContain("Focus recommendations on titles similar to:");
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

      expect(prompt).toContain("Focus recommendations on titles similar to: Breaking Bad");
    });

    it("does not include BYW instruction when referenceTitleForByw is missing", () => {
      const context: PromptContext = {
        ...baseContext,
        catalogType: "because-you-watched",
      };

      const prompt = buildSystemPrompt(context);

      expect(prompt).not.toContain("Focus recommendations on titles similar to:");
    });
  });

  describe("language section", () => {
    it("lists all selected languages", () => {
      const prompt = buildSystemPrompt(baseContext);

      expect(prompt).toContain("LANGUAGE: Recommend only titles available in: English, Spanish");
    });

    it("handles a single language", () => {
      const context: PromptContext = {
        ...baseContext,
        languages: ["French"],
      };

      const prompt = buildSystemPrompt(context);

      expect(prompt).toContain("LANGUAGE: Recommend only titles available in: French");
    });

    it("handles multiple languages", () => {
      const context: PromptContext = {
        ...baseContext,
        languages: ["English", "Spanish", "French", "German"],
      };

      const prompt = buildSystemPrompt(context);

      expect(prompt).toContain("Recommend only titles available in: English, Spanish, French, German");
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
  });

  describe("output format section", () => {
    it("contains required OUTPUT FORMAT section", () => {
      const prompt = buildSystemPrompt(baseContext);

      expect(prompt).toContain("OUTPUT FORMAT:");
      expect(prompt).toContain('"title"');
      expect(prompt).toContain('"type"');
      expect(prompt).toContain('"year"');
      expect(prompt).toContain('"reason"');
    });

    it("contains RULES section", () => {
      const prompt = buildSystemPrompt(baseContext);

      expect(prompt).toContain("RULES:");
      expect(prompt).toContain("Do not recommend titles already in the watch history");
    });
  });

  describe("count behavior", () => {
    it("defaults count to 10 when not specified", () => {
      const prompt = buildSystemPrompt(baseContext);

      expect(prompt).toContain("suggest 10 titles");
      expect(prompt).toContain("Return exactly 10 recommendations");
    });

    it("uses custom count when specified", () => {
      const context: PromptContext = {
        ...baseContext,
        count: 5,
      };

      const prompt = buildSystemPrompt(context);

      expect(prompt).toContain("suggest 5 titles");
      expect(prompt).toContain("Return exactly 5 recommendations");
    });

    it("uses custom count of 20", () => {
      const context: PromptContext = {
        ...baseContext,
        count: 20,
      };

      const prompt = buildSystemPrompt(context);

      expect(prompt).toContain("suggest 20 titles");
      expect(prompt).toContain("Return exactly 20 recommendations");
    });
  });
});
