export interface TokenizedComment {
  id: string;
  text: string;
  tokens: number[]; // placeholder ids
}

export async function tokenizeComments(
  items: Array<{ id: string; text: string }>
): Promise<TokenizedComment[]> {
  // Placeholder tokenizer: replace with a real BPE
  return items.map((x) => ({
    id: x.id,
    text: x.text,
    tokens: fakeBpe(x.text),
  }));
}

function fakeBpe(text: string): number[] {
  // Not real tokenization; splits on whitespace and hashes
  return text
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => Math.abs(hashString(w)) % 50257);
}

function hashString(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (h << 5) - h + str.charCodeAt(i);
    h |= 0;
  }
  return h;
}
