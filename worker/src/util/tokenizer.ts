import { encode } from 'gpt-tokenizer';

export interface TokenizedComment {
  id: string;
  text: string;
  tokens: number[];
  tokenCount: number;
}

export async function tokenizeComments(
  items: Array<{ id: string; text: string }>
): Promise<TokenizedComment[]> {
  return items.map((x) => {
    const tokens = encode(x.text);
    return {
      id: x.id,
      text: x.text,
      tokens,
      tokenCount: tokens.length,
    };
  });
}

/**
 * Calculate token count for a text without full tokenization
 */
export function getTokenCount(text: string): number {
  return encode(text).length;
}
