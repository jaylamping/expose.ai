/**
 * Bits-Per-Character (BPC) analyzer for fast AI text detection
 * Based on compression-based metrics and entropy analysis
 */

export interface BPCAnalysis {
  bpcScore: number; // Raw BPC score (entropy)
  normalizedScore: number; // Normalized 0-1 score (0=human, 1=bot)
  confidence: 'high' | 'medium' | 'low';
  isBot: boolean;
  isHuman: boolean;
  isInconclusive: boolean;
}

export interface BPCConfig {
  botThreshold: number; // BPC < this = likely bot (research: AI models ~1.24-1.32 BPC)
  humanThreshold: number; // BPC > this = likely human (human text typically higher entropy)
  minLength: number; // Minimum text length to analyze
}

const DEFAULT_CONFIG: BPCConfig = {
  botThreshold: 1.5, // Based on research: well-trained models achieve ~1.24-1.32 BPC
  humanThreshold: 2.5, // Human text typically has higher entropy than AI models
  minLength: 15, // Lowered to catch more Reddit/Twitter comments
};

// BPC normalization parameters based on research
const BPC_NORMALIZATION = {
  minBPC: 0.5, // Minimum realistic BPC (very repetitive text)
  maxBPC: 5.0, // Maximum realistic BPC (very random text)
  botRange: [0.5, 1.5], // BPC range where bots typically fall
  humanRange: [2.0, 5.0], // BPC range where humans typically fall
};

/**
 * Calculate BPC score for a text string
 * Based on research: well-trained neural models achieve ~1.24-1.32 BPC
 * Lower BPC = more repetitive/structured = more likely AI-generated
 * Higher BPC = more random/entropic = more likely human-written
 */
export function calculateBPC(text: string): number {
  if (text.length < DEFAULT_CONFIG.minLength) {
    return 0; // Not enough data
  }

  // Remove extra whitespace and normalize
  const normalized = text.replace(/\s+/g, ' ').trim();

  // Calculate character-level entropy (Shannon entropy)
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
  // Research shows: AI models ~1.24-1.32, human text typically higher
  return entropy;
}

/**
 * Normalize BPC score to 0-1 range where 0=human, 1=bot
 * Based on research: AI models ~1.24-1.32 BPC, humans typically higher
 */
export function normalizeBPCScore(rawBPC: number): number {
  if (rawBPC <= 0) return 0;

  // Clamp to realistic range
  const clampedBPC = Math.max(
    BPC_NORMALIZATION.minBPC,
    Math.min(BPC_NORMALIZATION.maxBPC, rawBPC)
  );

  // Normalize: lower BPC = higher bot probability
  // BPC 0.5-1.5 = bot range (0.8-1.0 normalized)
  // BPC 1.5-2.5 = inconclusive range (0.2-0.8 normalized)
  // BPC 2.5+ = human range (0.0-0.2 normalized)

  if (clampedBPC <= BPC_NORMALIZATION.botRange[1]) {
    // Bot range: BPC 0.5-1.5 maps to 0.8-1.0
    const botRange =
      BPC_NORMALIZATION.botRange[1] - BPC_NORMALIZATION.botRange[0];
    const position = (clampedBPC - BPC_NORMALIZATION.botRange[0]) / botRange;
    return 0.8 + 0.2 * position; // 0.8 to 1.0
  } else if (clampedBPC <= BPC_NORMALIZATION.humanRange[0]) {
    // Inconclusive range: BPC 1.5-2.5 maps to 0.2-0.8
    const inconclusiveRange =
      BPC_NORMALIZATION.humanRange[0] - BPC_NORMALIZATION.botRange[1];
    const position =
      (clampedBPC - BPC_NORMALIZATION.botRange[1]) / inconclusiveRange;
    return 0.2 + 0.6 * (1 - position); // 0.8 to 0.2
  } else {
    // Human range: BPC 2.5+ maps to 0.0-0.2
    const humanRange =
      BPC_NORMALIZATION.maxBPC - BPC_NORMALIZATION.humanRange[0];
    const position = Math.min(
      1,
      (clampedBPC - BPC_NORMALIZATION.humanRange[0]) / humanRange
    );
    return 0.2 * (1 - position); // 0.2 to 0.0
  }
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
      normalizedScore: 0,
      confidence: 'low',
      isBot: false,
      isHuman: false,
      isInconclusive: true,
    };
  }

  const bpcScore = calculateBPC(text);
  const normalizedScore = normalizeBPCScore(bpcScore);

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
    normalizedScore,
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
      averageNormalizedScore: 0,
      botCount: 0,
      humanCount: 0,
      inconclusiveCount: 0,
      confidence: 'low' as const,
    };
  }

  const averageBPC =
    validAnalyses.reduce((sum, a) => sum + a.analysis.bpcScore, 0) /
    validAnalyses.length;
  const averageNormalizedScore =
    validAnalyses.reduce((sum, a) => sum + a.analysis.normalizedScore, 0) /
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
    averageNormalizedScore,
    botCount,
    humanCount,
    inconclusiveCount,
    confidence,
  };
}
