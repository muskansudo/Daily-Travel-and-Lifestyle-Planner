// Wardrobe AI vision tagging
// - Sends the uploaded clothing image to Groq's vision model
// - Asks for JSON output strictly constrained to our wardrobe vocabulary
// - Falls back to a safe, empty-tag response if Groq fails so the UX never blocks

import {
  WARDROBE_CATEGORIES,
  WARDROBE_COLORS,
  WARDROBE_OCCASIONS,
  WARDROBE_SEASONS,
  type WardrobeCategoryId,
  type WardrobeColorId,
  type WardrobeOccasionId,
  type WardrobeSeasonId,
} from "@/lib/constants/wardrobe";

// Model is a constant so we can swap if Groq deprecates the current vision SKU.
// llama-3.2-11b-vision is the smaller / faster option; bump to 90b for richer tags.
const GROQ_VISION_MODEL = "meta-llama/llama-4-scout-17b-16e-instruct";
const GROQ_ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";

const CATEGORY_IDS = WARDROBE_CATEGORIES.map((c) => c.id);
const COLOR_IDS = WARDROBE_COLORS.map((c) => c.id);
const OCCASION_IDS = WARDROBE_OCCASIONS.map((c) => c.id);
const SEASON_IDS = WARDROBE_SEASONS.map((c) => c.id);

export interface WardrobeAITags {
  category: WardrobeCategoryId | null;
  colors: WardrobeColorId[];
  occasions: WardrobeOccasionId[];
  seasons: WardrobeSeasonId[];
  aiTagged: boolean;
}

const EMPTY_TAGS: WardrobeAITags = {
  category: null,
  colors: [],
  occasions: [],
  seasons: [],
  aiTagged: false,
};

function buildPrompt(): string {
  return `You are a clothing tagger for an Indian lifestyle planner app.
Look at the image and return ONLY a JSON object — no prose, no markdown, no code fences.

Schema (all values MUST come from the listed options, lowercase, exact spelling):
{
  "category": one of [${CATEGORY_IDS.join(", ")}] or null if not clothing,
  "colors": array of 1-3 from [${COLOR_IDS.join(", ")}],
  "occasions": array of 1-3 from [${OCCASION_IDS.join(", ")}],
  "seasons": array of 1-2 from [${SEASON_IDS.join(", ")}]
}

Rules:
- "kurta", "kurti", "saree blouse worn alone", "anarkali" -> category "dress"
- Salwar, palazzo, jeans, trousers, shorts -> "bottom"
- Sandals, juttis, sneakers -> "footwear"
- If image is blurry or not clothing, set category to null and arrays to [].
- Prefer "all_season" only when fabric/style is genuinely year-round in Delhi.
- Be honest about colors — pick the 1-2 most dominant, add a 3rd only if a clear accent exists.
Return ONLY the JSON.`;
}

// Convert an uploaded File buffer + MIME type into a Groq-compatible data URL.
function bufferToDataUrl(buffer: Buffer, mimeType: string): string {
  const safeMime = mimeType.startsWith("image/") ? mimeType : "image/jpeg";
  return `data:${safeMime};base64,${buffer.toString("base64")}`;
}

// Filter a candidate array down to our vocabulary, dedupe, cap length.
function sanitiseArray<T extends string>(
  raw: unknown,
  allowed: readonly T[],
  max: number
): T[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<T>();
  for (const value of raw) {
    if (typeof value !== "string") continue;
    const lower = value.toLowerCase().trim();
    if ((allowed as readonly string[]).includes(lower)) {
      seen.add(lower as T);
    }
    if (seen.size >= max) break;
  }
  return Array.from(seen);
}

function sanitiseCategory(raw: unknown): WardrobeCategoryId | null {
  if (typeof raw !== "string") return null;
  const lower = raw.toLowerCase().trim();
  return (CATEGORY_IDS as readonly string[]).includes(lower)
    ? (lower as WardrobeCategoryId)
    : null;
}

// Strip markdown fences / preambles if the model returned them anyway,
// then try to JSON-parse the trimmed payload.
function extractJson(text: string): Record<string, unknown> | null {
  const cleaned = text
    .replace(/```json\s*/gi, "")
    .replace(/```\s*$/g, "")
    .trim();

  // If there's prose before the JSON, grab the first {...} block.
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;

  try {
    return JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    return null;
  }
}

/**
 * Tag an uploaded clothing photo using Groq's vision model.
 * Returns sanitised tags constrained to our vocabulary, or empty tags
 * (aiTagged: false) when Groq is misconfigured / unreachable / hallucinates.
 *
 * The caller treats `aiTagged: false` as a UX hint: show the photo, prompt
 * the user to add tags manually. Demo-safe by design.
 */
export async function tagWardrobeImage(
  imageBuffer: Buffer,
  mimeType: string
): Promise<WardrobeAITags> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    console.error("missing groq_api_key in env.local");
    return EMPTY_TAGS;
  }

  const dataUrl = bufferToDataUrl(imageBuffer, mimeType);

  let response: Response;
  try {
    response = await fetch(GROQ_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: GROQ_VISION_MODEL,
        temperature: 0.1,
        max_tokens: 256,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: buildPrompt() },
              { type: "image_url", image_url: { url: dataUrl } },
            ],
          },
        ],
      }),
    });
  } catch (e) {
    console.error("groq vision req failed:", e);
    return EMPTY_TAGS;
  }

  if (!response.ok) {
    console.error("groq api error:", response.status, await response.text());
    return EMPTY_TAGS;
  }

  let payload: { choices?: Array<{ message?: { content?: string } }> };
  try {
    payload = await response.json();
  } catch {
    return EMPTY_TAGS;
  }

  const content = payload.choices?.[0]?.message?.content;
  if (!content) return EMPTY_TAGS;

  const parsed = extractJson(content);
  if (!parsed) return EMPTY_TAGS;

  const category = sanitiseCategory(parsed.category);
  const colors = sanitiseArray<WardrobeColorId>(
    parsed.colors,
    COLOR_IDS as readonly WardrobeColorId[],
    3
  );
  const occasions = sanitiseArray<WardrobeOccasionId>(
    parsed.occasions,
    OCCASION_IDS as readonly WardrobeOccasionId[],
    3
  );
  const seasons = sanitiseArray<WardrobeSeasonId>(
    parsed.seasons,
    SEASON_IDS as readonly WardrobeSeasonId[],
    2
  );

  // If the model returned literally nothing usable, treat as fallback.
  const anyTags =
    category !== null ||
    colors.length > 0 ||
    occasions.length > 0 ||
    seasons.length > 0;

  return {
    category,
    colors,
    occasions,
    seasons,
    aiTagged: anyTags,
  };
}
