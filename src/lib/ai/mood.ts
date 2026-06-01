// L1 Mood extraction — Saanjh's vision-to-mood layer
//
// Input: any user-uploaded "vibe image" — a screenshot of their feed, a photo
// they took that morning, a saved reel still, anything that captures how they're
// feeling RIGHT NOW.
//
// Output: 1-3 vibe tags from VENUE_VIBES vocabulary + a confidence score.
//
// Why this exists:
//   - The user shouldn't have to choose "chill" vs "productive" from a dropdown.
//   - A photo carries more signal than a tap. Saanjh reads it.
//   - Output feeds directly into rag.ts as inputs.moodVibes — same closed
//     vocabulary, no translation step. Set-overlap join with venue.vibe_tags.
//
// Architecture mirror:
//   - This is structurally a clone of src/lib/ai/vision.ts (wardrobe tagging).
//     Same Groq vision call, same JSON extraction, same sanitisation, same
//     graceful fallback. The pattern is deliberate: a generalised Vision LLM
//     tagging primitive applied to two different domains.

import { VENUE_VIBES, type VenueVibeId } from "@/lib/constants/venues";

// Same model and endpoint as vision.ts — keep them in sync if Groq deprecates.
const GROQ_VISION_MODEL = "meta-llama/llama-4-scout-17b-16e-instruct";
const GROQ_ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";

const VIBE_IDS = VENUE_VIBES;

export interface MoodResult {
  vibes: VenueVibeId[];        // 1-3 vibes from the closed vocabulary
  confidence: number;           // 0..1, model's self-reported confidence
  aiExtracted: boolean;         // false when we fell back (Groq down, garbage, no key)
}

const EMPTY_MOOD: MoodResult = {
  vibes: [],
  confidence: 0,
  aiExtracted: false,
};

function buildPrompt(): string {
  return `You are a mood reader for an Indian lifestyle planner app.
The user uploaded an image that captures how they're feeling right now — it might be a screenshot of their feed, a photo from their day, a saved reel still, a sunset, a coffee table, anything.

Look at the image and return ONLY a JSON object — no prose, no markdown, no code fences.

Schema (all vibe values MUST come from the listed options, lowercase, exact spelling):
{
  "vibes": array of 1-3 from [${VIBE_IDS.join(", ")}],
  "confidence": number between 0 and 1
}

How to read the image:
- Warm light, soft focus, slow scenes -> "chill" or "contemplative"
- People mid-laughter, a crowded table, party energy -> "social" or "lively"
- A desk with notebook/laptop/coffee, organized morning -> "productive"
- Solo walking, empty street, low contrast -> "quiet" or "contemplative"
- Candles, dim warm tones, two cups -> "romantic"
- Mountain trail, action shot, motion blur -> "adventurous"
- A clean focused workspace at dawn -> "productive" + "quiet"

Rules:
- Pick the 1-2 most dominant vibes. Add a 3rd only if the image is clearly multi-layered.
- confidence: 0.9 if the mood is unmistakable, 0.6 if you're inferring, 0.3 if it's a stretch.
- If the image is too abstract, blurry, or doesn't carry a clear mood, return {"vibes": [], "confidence": 0}.
- Indian context welcome — chai morning, monsoon window, festival lights — but map to the vocabulary above.

Return ONLY the JSON.`;
}

// Convert an uploaded File buffer + MIME type into a Groq-compatible data URL.
function bufferToDataUrl(buffer: Buffer, mimeType: string): string {
  const safeMime = mimeType.startsWith("image/") ? mimeType : "image/jpeg";
  return `data:${safeMime};base64,${buffer.toString("base64")}`;
}

// Filter a candidate vibes array down to our vocabulary, dedupe, cap length.
function sanitiseVibes(raw: unknown, max: number): VenueVibeId[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<VenueVibeId>();
  for (const value of raw) {
    if (typeof value !== "string") continue;
    const lower = value.toLowerCase().trim();
    if ((VIBE_IDS as readonly string[]).includes(lower)) {
      seen.add(lower as VenueVibeId);
    }
    if (seen.size >= max) break;
  }
  return Array.from(seen);
}

// Clamp confidence into [0, 1]. Drop NaN / strings / nonsense.
function sanitiseConfidence(raw: unknown): number {
  const num = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(num)) return 0;
  return Math.max(0, Math.min(1, num));
}

// Strip markdown fences if the model wrapped output anyway, grab the first {...} block.
function extractJson(text: string): Record<string, unknown> | null {
  const cleaned = text
    .replace(/```json\s*/gi, "")
    .replace(/```\s*$/g, "")
    .trim();

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
 * Extract a mood from a user-uploaded vibe image.
 * Returns sanitised vibes constrained to VENUE_VIBES, or empty mood
 * (aiExtracted: false) when Groq is misconfigured / unreachable / hallucinates.
 *
 * The plan generator treats aiExtracted: false as "skip the vibe-scoring leg
 * of RAG and rely on interest tags + distance only" — demo-safe by design.
 */
export async function extractMoodFromImage(
  imageBuffer: Buffer,
  mimeType: string
): Promise<MoodResult> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    // No key — return safely. Plan generator will skip vibe scoring.
    return EMPTY_MOOD;
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
        temperature: 0.2,
        max_tokens: 128,
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
  } catch {
    return EMPTY_MOOD;
  }

  if (!response.ok) return EMPTY_MOOD;

  let payload: { choices?: Array<{ message?: { content?: string } }> };
  try {
    payload = await response.json();
  } catch {
    return EMPTY_MOOD;
  }

  const content = payload.choices?.[0]?.message?.content;
  if (!content) return EMPTY_MOOD;

  const parsed = extractJson(content);
  if (!parsed) return EMPTY_MOOD;

  const vibes = sanitiseVibes(parsed.vibes, 3);
  const confidence = sanitiseConfidence(parsed.confidence);

  // If nothing survived sanitisation, treat as fallback so the caller knows.
  if (vibes.length === 0) {
    return { ...EMPTY_MOOD };
  }

  return {
    vibes,
    confidence,
    aiExtracted: true,
  };
}
