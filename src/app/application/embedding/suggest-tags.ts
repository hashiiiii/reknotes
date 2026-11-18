import type { ITagRepository } from "../../domain/tag/tag-repository";
import { dotProduct } from "../../domain/tag/tag-suggestion";
import type { IEmbeddingProvider } from "../port/embedding-provider";

const MAX_TAGS = 3;

// A relative cutoff follows score scales across local ONNX and Cloudflare models
// and quantization methods; a fixed cutoff such as 0.30 needs separate tuning.
// Earlier measurements put related words at 60–100% of the best score, unrelated
// existing tags at 30–45%, and function words at 20–40%. A cutoff of 0.5 separates
// those groups while retaining related candidates.
const SCORE_CUTOFF_RATIO = 0.5;

// Maximal Marginal Relevance avoids spending all three slots on near-synonyms
// such as TypeScript, TS, and types: mmr = lambda * relevance - (1 - lambda) * redundancy.
// Relevance is similarity to the note; redundancy is maximum similarity to a
// selected tag. A lambda of 1.0 ignores diversity, while 0.0 ignores relevance.
// The chosen 0.7 favors relevance while penalizing repeated meanings.
const MMR_LAMBDA = 0.7;

// Segmentation can leave incomplete Japanese verb fragments, such as 「読み終」.
// Requiring kanji or katakana and allowing hiragana only at the end filters those
// fragments while retaining words such as 「好き」. Printable ASCII names pass unchanged.
function isQualityCandidate(word: string): boolean {
  if (/^[\x21-\x7e]+$/.test(word)) return true;
  const chars = [...word];
  if (chars.length === 0) return false;
  const kanjiKata = chars.filter((c) => /[一-鿿㐀-䶿゠-ヿ]/.test(c)).length;
  if (kanjiKata === 0) return false;
  const middleChars = chars.slice(0, -1);
  const middleHiragana = middleChars.filter((c) => /[ぁ-ゖ]/.test(c)).length;
  return middleHiragana === 0;
}

// CJK Unified Ideographs and Extension A cover the single-kanji affixes used in compounds.
function isKanji(char: string): boolean {
  const code = char.codePointAt(0);
  if (code === undefined) return false;
  return (code >= 0x4e00 && code <= 0x9fff) || (code >= 0x3400 && code <= 0x4dbf);
}

// Code variables and formulas add noisy tag candidates. Remove fenced blocks
// only for candidate extraction; note embeddings still include the original text.
function stripCodeBlocks(text: string): string {
  return text.replace(/```[\s\S]*?```/g, " ");
}

// The 2–20 character limit excludes single-character particles; longer function
// words can be rejected by the similarity cutoff. Joining adjacent word segments
// when one is a single kanji and the other has at least two characters recovers
// compounds such as 「ホーナー法」 and 「計算量」 without joining hiragana particles.
function extractCandidateWords(text: string): string[] {
  const segmenter = new Intl.Segmenter("ja", { granularity: "word" });
  const allSegments = [...segmenter.segment(text)];

  const candidates = new Set<string>();

  for (const seg of allSegments) {
    if (seg.isWordLike && seg.segment.length >= 2 && seg.segment.length <= 20) {
      candidates.add(seg.segment);
    }
  }

  for (let i = 0; i < allSegments.length - 1; i++) {
    if (!allSegments[i].isWordLike || !allSegments[i + 1].isWordLike) continue;

    const left = allSegments[i].segment;
    const right = allSegments[i + 1].segment;

    const leftIsOneCharKanji = left.length === 1 && isKanji(left);
    const rightIsOneCharKanji = right.length === 1 && isKanji(right);

    const shouldJoin = (leftIsOneCharKanji && right.length >= 2) || (rightIsOneCharKanji && left.length >= 2);
    if (!shouldJoin) continue;

    const compound = left + right;
    if (compound.length >= 2 && compound.length <= 20) {
      candidates.add(compound);
      // Prefer the complete compound over its less specific constituent word.
      candidates.delete(leftIsOneCharKanji ? right : left);
    }
  }

  return [...candidates];
}

type Candidate = { name: string; embedding: Float32Array; score: number };

function mmrSelect(candidates: Candidate[], maxTags: number): Candidate[] {
  const selected: Candidate[] = [];
  const remaining = [...candidates];

  while (selected.length < maxTags && remaining.length > 0) {
    let bestIdx = -1;
    let bestScore = -Infinity;

    for (let i = 0; i < remaining.length; i++) {
      const c = remaining[i];
      // The closest selected tag determines the redundancy penalty.
      let maxSim = 0;
      for (const s of selected) {
        const sim = dotProduct(c.embedding, s.embedding);
        if (sim > maxSim) maxSim = sim;
      }
      const mmrScore = MMR_LAMBDA * c.score - (1 - MMR_LAMBDA) * maxSim;
      if (mmrScore > bestScore) {
        bestScore = mmrScore;
        bestIdx = i;
      }
    }

    selected.push(remaining[bestIdx]);
    remaining.splice(bestIdx, 1);
  }

  return selected;
}

export async function suggestTags(
  embeddingProvider: IEmbeddingProvider,
  tagRepo: ITagRepository,
  title: string,
  body: string,
): Promise<string[]> {
  const text = `${title}\n${body}`.slice(0, 512);
  if (!text.trim()) return [];

  // Retrieval models compare short queries with longer documents. The body can
  // dilute the title's topic, so either embedding may supply a candidate's best score.
  const noteEmbedding = await embeddingProvider.embedNote(text);
  const titleEmbedding = title.trim() ? await embeddingProvider.embedNote(title) : noteEmbedding;
  const score = (emb: Float32Array) => Math.max(dotProduct(noteEmbedding, emb), dotProduct(titleEmbedding, emb));

  const candidates: Candidate[] = [];

  // Existing tags compete without a reuse bonus, which previously favored weak
  // matches. Apply the quality filter here too so old noisy tags are not selected again.
  const existingTags = await tagRepo.findAll();
  const allowedExisting = existingTags.filter((t) => isQualityCandidate(t.name));
  if (allowedExisting.length > 0) {
    await embeddingProvider.buildTagCache(allowedExisting.map((t) => t.name));
    for (const tag of allowedExisting) {
      const embedding = await embeddingProvider.embedTag(tag.name);
      candidates.push({ name: tag.name, embedding, score: score(embedding) });
    }
  }

  const textForCandidates = stripCodeBlocks(text);
  const contentWords = extractCandidateWords(textForCandidates);
  const existingTagNames = new Set(existingTags.map((t) => t.name.toLowerCase()));

  for (const word of contentWords) {
    if (existingTagNames.has(word.toLowerCase())) continue;
    if (!isQualityCandidate(word)) continue;
    const embedding = await embeddingProvider.embedTag(word);
    candidates.push({ name: word, embedding, score: score(embedding) });
  }

  if (candidates.length === 0) return [];

  const maxScore = Math.max(...candidates.map((c) => c.score));
  const filtered = candidates.filter((c) => c.score >= maxScore * SCORE_CUTOFF_RATIO);
  const selected = mmrSelect(filtered, MAX_TAGS);
  return selected.map((c) => c.name);
}
