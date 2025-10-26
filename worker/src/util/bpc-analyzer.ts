/**
 * Bits-Per-Character (BPC) analyzer for fast AI text detection
 * Based on compression-based metrics and entropy analysis
 */

export interface BPCAnalysis {
  bpcScore: number;
  confidence: 'high' | 'medium' | 'low';
  isBot: boolean;
  isHuman: boolean;
  isInconclusive: boolean;
}

export interface BPCConfig {
  botThreshold: number; // BPC < this = likely bot
  humanThreshold: number; // BPC > this = likely human
  minLength: number; // Minimum text length to analyze
}

const DEFAULT_CONFIG: BPCConfig = {
  botThreshold: 2.0,
  humanThreshold: 4.5,
  minLength: 15, // Lowered to catch more Reddit/Twitter comments
};

/**
 * Calculate BPC score for a text string
 * Lower BPC = more repetitive/structured = more likely AI-generated
 * Higher BPC = more random/entropic = more likely human-written
 */
export function calculateBPC(text: string): number {
  if (text.length < DEFAULT_CONFIG.minLength) {
    return 0; // Not enough data
  }

  // Remove extra whitespace and normalize
  const normalized = text.replace(/\s+/g, ' ').trim();

  // Calculate character-level entropy
  const charFreq = new Map<string, number>();
  for (const char of normalized) {
    charFreq.set(char, (charFreq.get(char) || 0) + 1);
  }

  const totalChars = normalized.length;
  let entropy = 0;

  for (const freq of charFreq.values()) {
    const probability = freq / totalChars;
    entropy -= probability * Math.log2(probability);
  }

  // Calculate BPC as entropy (bits per character)
  return entropy;
}

/**
 * Analyze text using BPC and return classification
 */
export function analyzeBPC(
  text: string,
  config: Partial<BPCConfig> = {}
): BPCAnalysis {
  const finalConfig = { ...DEFAULT_CONFIG, ...config };

  if (text.length < finalConfig.minLength) {
    return {
      bpcScore: 0,
      confidence: 'low',
      isBot: false,
      isHuman: false,
      isInconclusive: true,
    };
  }

  const bpcScore = calculateBPC(text);

  const isBot = bpcScore < finalConfig.botThreshold;
  const isHuman = bpcScore > finalConfig.humanThreshold;
  const isInconclusive = !isBot && !isHuman;

  let confidence: 'high' | 'medium' | 'low';
  if (isBot || isHuman) {
    // High confidence if clearly in bot or human range
    confidence = 'high';
  } else if (isInconclusive) {
    // Medium confidence for borderline cases
    confidence = 'medium';
  } else {
    confidence = 'low';
  }

  return {
    bpcScore,
    confidence,
    isBot,
    isHuman,
    isInconclusive,
  };
}

/**
 * Batch analyze multiple texts
 */
export function batchAnalyzeBPC(
  texts: Array<{ id: string; text: string }>,
  config: Partial<BPCConfig> = {}
): Array<{ id: string; analysis: BPCAnalysis }> {
  return texts.map(({ id, text }) => ({
    id,
    analysis: analyzeBPC(text, config),
  }));
}

/**
 * Get aggregate BPC statistics for a user
 */
export function getAggregateBPCStats(
  analyses: Array<{ analysis: BPCAnalysis }>
) {
  const validAnalyses = analyses.filter((a) => a.analysis.bpcScore > 0);

  if (validAnalyses.length === 0) {
    return {
      averageBPC: 0,
      botCount: 0,
      humanCount: 0,
      inconclusiveCount: 0,
      confidence: 'low' as const,
    };
  }

  const averageBPC =
    validAnalyses.reduce((sum, a) => sum + a.analysis.bpcScore, 0) /
    validAnalyses.length;
  const botCount = validAnalyses.filter((a) => a.analysis.isBot).length;
  const humanCount = validAnalyses.filter((a) => a.analysis.isHuman).length;
  const inconclusiveCount = validAnalyses.filter(
    (a) => a.analysis.isInconclusive
  ).length;

  // Overall confidence based on majority
  const total = validAnalyses.length;
  const botRatio = botCount / total;
  const humanRatio = humanCount / total;

  let confidence: 'high' | 'medium' | 'low';
  if (botRatio > 0.7 || humanRatio > 0.7) {
    confidence = 'high';
  } else if (botRatio > 0.4 || humanRatio > 0.4) {
    confidence = 'medium';
  } else {
    confidence = 'low';
  }

  return {
    averageBPC,
    botCount,
    humanCount,
    inconclusiveCount,
    confidence,
  };
}
