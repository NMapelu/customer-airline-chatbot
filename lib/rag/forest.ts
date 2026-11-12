import { getCloudflareContext } from '@opennextjs/cloudflare';
import type { Turn } from './types';

// The Random Forest scope check, trained in Google Colab on public datasets plus our own examples.
// It runs before the gpt-4o scope check and decides alone only when it is confident. Inside the
// "not sure" band, or if anything fails, it answers 'unsure' and the gpt-4o check runs as before.
// The model lives in Cloudflare KV, not in the code: the Worker is close to the free plan's 3 MB
// limit, and keeping the trees out of the public bundle makes it harder to craft messages that fool them.
export type ForestTree = { feature: number[]; threshold: number[]; left: number[]; right: number[]; p_off: number[] };
export type Forest = { band: [number, number]; trees: ForestTree[] };
export type ForestScope = 'in_scope' | 'off_topic' | 'unsure';

const KV_KEY = 'scope-forest';
// The model the forest was trained with in Colab (BAAI/bge-small-en-v1.5, which uses CLS pooling).
const EMBEDDING_MODEL = '@cf/baai/bge-small-en-v1.5';

// One tree: from the root, go left when the feature is at most the threshold, until a leaf (left = -1).
export function treeProbability(tree: ForestTree, vector: number[]): number {
  let node = 0;
  while (tree.left[node] !== -1) {
    node = vector[tree.feature[node]] <= tree.threshold[node] ? tree.left[node] : tree.right[node];
  }
  return tree.p_off[node];
}

// The forest's answer is the average of its trees, as in scikit-learn's predict_proba.
export function offTopicProbability(forest: Forest, vector: number[]): number {
  let sum = 0;
  for (const tree of forest.trees) sum += treeProbability(tree, vector);
  return sum / forest.trees.length;
}

export function decideFromProbability(p: number, [low, high]: [number, number]): ForestScope {
  if (p > high) return 'off_topic';
  if (p < low) return 'in_scope';
  return 'unsure';
}

// Colab used normalize_embeddings=True, so the vector is scaled to length 1 here too.
export function normalise(vector: number[]): number[] {
  const length = Math.sqrt(vector.reduce((sum, x) => sum + x * x, 0));
  return length > 0 ? vector.map((x) => x / length) : vector;
}

type Bindings = {
  AI?: { run(model: string, input: unknown): Promise<{ data: number[][] }> };
  SCOPE_FOREST?: { get(key: string, type: 'json'): Promise<unknown> };
};

// Read from KV once per Worker instance, then kept in memory.
let loading: Promise<Forest | null> | undefined;

async function loadForest(kv: NonNullable<Bindings['SCOPE_FOREST']>): Promise<Forest | null> {
  const forest = (await kv.get(KV_KEY, 'json')) as Forest | null;
  return forest && Array.isArray(forest.trees) && forest.trees.length > 0 ? forest : null;
}

// Labels the user's latest message. Never throws: every failure is 'unsure'.
export async function forestScope(turns: Turn[]): Promise<ForestScope> {
  try {
    const latest = turns.findLast((t) => t.role === 'user')?.text;
    const env = getCloudflareContext().env as unknown as Bindings;
    if (!latest || !env.AI || !env.SCOPE_FOREST) return 'unsure';
    loading ??= loadForest(env.SCOPE_FOREST);
    const forest = await loading;
    if (!forest) {
      loading = undefined;
      return 'unsure';
    }
    const { data } = await env.AI.run(EMBEDDING_MODEL, { text: [latest], pooling: 'cls' });
    const p = offTopicProbability(forest, normalise(data[0]));
    const decision = decideFromProbability(p, forest.band);
    // The probability and decision only, never the message.
    console.log('scope forest', { p: Math.round(p * 1000) / 1000, decision });
    return decision;
  } catch (error) {
    loading = undefined;
    console.error('scope forest failed, using the gpt-4o check', error);
    return 'unsure';
  }
}
