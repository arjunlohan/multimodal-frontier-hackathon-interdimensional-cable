import { z } from "zod";

// ─────────────────────────────────────────────────────────────────────────────
// Pass 1 Schemas
// ─────────────────────────────────────────────────────────────────────────────

export const PremiseAngleTypeSchema = z.enum([
  "absurdist_escalation",
  "hypocrisy_exposure",
  "paranoid_wonder",
  "surreal_literalism",
  "apocalyptic_nihilism",
]);

export const FactCategorySchema = z.enum([
  "statistic",
  "historical_trivia",
  "institutional_quote",
  "technical_detail",
  "policy_absurdity",
]);

export const AbsurdityTypeSchema = z.enum([
  "stated_vs_actual",
  "scale_mismatch",
  "bureaucratic_nightmare",
  "unintended_consequence",
  "existential_banality",
]);

export const GroundedFactSchema = z.object({
  id: z.string().min(1),
  fact: z.string().min(5),
  sourceUrl: z.string().url().optional(),
  sourceTitle: z.string().optional(),
  verified: z.boolean().default(true),
  category: FactCategorySchema,
  absurdityScore: z.number().min(1).max(10).default(5),
  bizarreMetric: z.string().optional(),
});

export const IncongruitySeedSchema = z.object({
  id: z.string().min(1),
  setupFact: z.string().min(5),
  contradiction: z.string().min(5),
  absurdityType: AbsurdityTypeSchema,
  comedicPotential: z.string().min(5),
  relatedFactIds: z.array(z.string()).optional(),
});

export const ComedicPremiseAngleSchema = z.object({
  id: z.string().min(1),
  angleType: PremiseAngleTypeSchema,
  title: z.string().min(3),
  logline: z.string().min(10),
  thematicHook: z.string().min(5),
  anchorFacts: z.array(z.string()).min(1),
  escalationLadder: z.tuple([
    z.string().min(3),
    z.string().min(3),
    z.string().min(3),
  ]),
  targetArchetypeFit: z.object({
    writersRoomDesk: z.number().min(0.0).max(1.0),
    conversationalPodcast: z.number().min(0.0).max(1.0),
  }),
  suggestedAnalogies: z.array(z.string()).min(1),
  recommendedActSpineMapping: z.object({
    act1Thesis: z.string(),
    act2Escalation: z.string(),
    act3ClimaxOrCTA: z.string(),
  }).optional(),
  comedicPremise: z.string().optional(),
  angle: z.string().optional(),
});

export const SearchGroundingMetadataSchema = z.object({
  enabled: z.boolean(),
  searchQueriesUsed: z.array(z.string()).default([]),
  groundingSources: z.array(z.object({
    title: z.string(),
    url: z.string(),
  })).default([]),
  groundingChunkCount: z.number().int().nonnegative().default(0),
});

export const ResearchBriefSchema = z.object({
  topic: z.string().min(1),
  topicType: z.enum(["custom", "news_link", "hacker_news", "trend", "freetext"]).default("custom"),
  summary: z.string().min(10),
  groundedFacts: z.array(GroundedFactSchema).min(1),
  incongruitySeeds: z.array(IncongruitySeedSchema).min(1),
  premiseAngles: z.array(ComedicPremiseAngleSchema).min(1),
  selectedAngleId: z.string().min(1),
  selectedAngle: ComedicPremiseAngleSchema,
  searchMetadata: SearchGroundingMetadataSchema,
  familiarityLevel: z.enum(["beginner", "familiar", "expert"]).default("familiar"),
  generatedAt: z.string(),
  isMocked: z.boolean().default(false),
});

// ─────────────────────────────────────────────────────────────────────────────
// Pass 2 Schemas
// ─────────────────────────────────────────────────────────────────────────────

export const ComedicMechanismSchema = z.enum([
  "setup_misdirection",
  "rule_of_three",
  "escalating_analogy",
  "rapid_tag",
  "callback",
  "character_act_out",
  "rhetorical_crescendo",
  "theatrical_cta",
]);

export const ComedicBeatSchema = z.object({
  id: z.string(),
  actId: z.string(),
  actName: z.string(),
  clipIndex: z.number().int().nonnegative(),
  startTimeSeconds: z.number().nonnegative(),
  endTimeSeconds: z.number().positive(),
  durationSeconds: z.number().positive(),
  targetWordCount: z.number().int().positive(),
  actualWordCount: z.number().int().positive(),
  speaker: z.string().min(1),
  setup: z.string().min(1),
  punchline: z.string().min(1),
  tags: z.array(z.string()).optional(),
  fullText: z.string().min(1),
  mechanism: ComedicMechanismSchema,
  plantedCallbackMotif: z.string().optional(),
  resolvedCallbackMotif: z.string().optional(),
  visualPrompt: z.string().min(5),
  actingDirection: z.string().optional(),
  visualPromptSeed: z.string().optional(),
});

export const TurnTypeSchema = z.enum([
  "inquiry",
  "speculative_riff",
  "diatribe",
  "ping_pong",
  "backchannel",
  "tangent_pivot",
  "snapback",
]);

export const PodcastTurnSchema = z.object({
  id: z.string(),
  turnIndex: z.number().int().nonnegative(),
  speaker: z.string().min(1),
  role: z.string(),
  ttsVoice: z.string(),
  turnType: TurnTypeSchema,
  text: z.string().min(1),
  acousticTags: z.array(z.string()).default([]),
  wordCount: z.number().int().positive(),
  estimatedDurationSeconds: z.number().positive(),
  currentNodeId: z.string().min(1),
  isTangent: z.boolean().default(false),
  driftDepth: z.number().int().nonnegative().default(0),
  snapbackTriggered: z.boolean().optional(),
});

export const CallbackLinkSchema = z.object({
  plantedInBeatId: z.string(),
  resolvedInBeatId: z.string(),
  motif: z.string(),
});

export const HeadWriterDraftSchema = z.object({
  archetype: z.enum(["writers_room_desk", "conversational_podcast"]),
  showId: z.string(),
  showTitle: z.string(),
  topic: z.string(),
  selectedPremise: ComedicPremiseAngleSchema,
  beats: z.array(ComedicBeatSchema).optional(),
  turns: z.array(PodcastTurnSchema).optional(),
  callbacks: z.array(CallbackLinkSchema).default([]),
  callbacksPlanted: z.array(z.string()).optional(),
  metrics: z.object({
    totalDurationSeconds: z.number().positive(),
    totalWordCount: z.number().int().positive(),
    estimatedLpm: z.number().nonnegative(),
    jokeCount: z.number().int().nonnegative(),
    callbackCount: z.number().int().nonnegative(),
    ruleOfThreeCount: z.number().int().nonnegative(),
    tangentCount: z.number().int().nonnegative().optional(),
    maxDriftDepthReached: z.number().int().nonnegative().optional(),
  }),
  pass1Context: z.object({
    verifiedFactsCount: z.number().int().nonnegative(),
    incongruitySeedsCount: z.number().int().nonnegative(),
  }),
  totalEstimatedSeconds: z.number().positive().optional(),
});

// ─────────────────────────────────────────────────────────────────────────────
// Pass 3 Schemas
// ─────────────────────────────────────────────────────────────────────────────

export const TableReadJokeEvaluationSchema = z.object({
  beatIndex: z.number().int().nonnegative(),
  setup: z.string(),
  punchline: z.string(),
  incongruityScore: z.number().min(1).max(10),
  punchinessScore: z.number().min(1).max(10),
  timingScore: z.number().min(1).max(10),
  compositeScore: z.number().min(1).max(10),
  critique: z.string(),
  passed: z.boolean(),
  revised: z.boolean(),
  originalPunchline: z.string().optional(),
});

export const TableReadReportSchema = z.object({
  totalJokes: z.number().int().nonnegative(),
  passedJokes: z.number().int().nonnegative(),
  prunedCount: z.number().int().nonnegative(),
  revisedCount: z.number().int().nonnegative(),
  averageScore: z.number().min(0).max(10),
  evaluations: z.array(TableReadJokeEvaluationSchema),
  laughsPerMinute: z.number().nonnegative(),
});

export const VeoRaiSanitizationReportSchema = z.object({
  originalLength: z.number().int().nonnegative(),
  sanitizedLength: z.number().int().nonnegative(),
  replacementsApplied: z.array(z.object({
    pattern: z.string(),
    replacement: z.string(),
  })),
  isCleanForVeo: z.boolean(),
});

export const FinalScriptSegmentSchema = z.object({
  clipIndex: z.number().int().nonnegative(),
  speaker: z.string().min(1),
  text: z.string().min(1),
  visualPrompt: z.string().min(5),
  actingDirection: z.string().optional(),
  startTimeSeconds: z.number().nonnegative(),
  endTimeSeconds: z.number().positive(),
  durationSeconds: z.number().positive(),
  acousticTags: z.array(z.string()).optional(),
  wordCount: z.number().int().positive().optional(),
  position: z.string().optional(),
});

export const FinalScriptSchema = z.object({
  title: z.string().min(1),
  archetype: z.enum(["writers_room_desk", "conversational_podcast"]),
  showType: z.enum(["monologue", "conversation"]),
  totalDurationSeconds: z.number().positive(),
  segments: z.array(FinalScriptSegmentSchema).min(1),
  transcriptPlainText: z.string().min(1),
  tableReadReport: TableReadReportSchema,
  voiceTuningReport: z.object({
    meanSentenceLengthWords: z.number().positive(),
    targetSentenceLengthWords: z.number().positive(),
    profanityCompliance: z.boolean(),
    catchphrasesUsed: z.array(z.string()),
    outrageAffabilityScore: z.number().min(0).max(1).optional(),
  }),
  sanitizationReport: VeoRaiSanitizationReportSchema,
});

export const DramaturgyResultSchema = z.object({
  showId: z.string().min(1),
  skill: z.any(),
  researchBrief: ResearchBriefSchema,
  headWriterDraft: HeadWriterDraftSchema,
  finalScript: FinalScriptSchema,
  executionMetrics: z.object({
    totalDurationMs: z.number().nonnegative(),
    pass1DurationMs: z.number().nonnegative(),
    pass2DurationMs: z.number().nonnegative(),
    pass3DurationMs: z.number().nonnegative(),
    jokesEvaluated: z.number().int().nonnegative(),
    jokesPrunedOrRevised: z.number().int().nonnegative(),
    tableReadAvgScore: z.number().min(0).max(10),
  }),
});
