import { ThinkingLevel } from "@google/genai";

import { getDefaultShowSkill } from "@/app/lib/skills/registry";

import { MissingApiKeyError, requiresUserApiKeys, resolveVertexKey } from "../api-keys";
import { buildGenAIClient } from "../genai";

import { ResearchBriefSchema } from "./schemas";
import type {
  ComedicPremiseAngle,
  GroundedFact,
  IncongruitySeed,
  Pass1ResearchInput,
  Pass1ResearchOutput,
  ResearchBrief,
  SearchGroundingMetadata,
} from "./types";

import type { GoogleGenAI } from "@google/genai";

function getClient(): GoogleGenAI | null {
  const apiKey = resolveVertexKey();
  if (!apiKey) {
    return null;
  }
  return buildGenAIClient(apiKey);
}

// ─────────────────────────────────────────────────────────────────────────────
// System Prompt for Pass 1 Grounded Research
// ─────────────────────────────────────────────────────────────────────────────

const PASS1_SYSTEM_INSTRUCTION = `You are the Lead Investigative Researcher and Satirical Premise Architect for an elite television and podcast writers' room (in the caliber of Last Week Tonight, The Daily Show, and top speculative satire).

YOUR OBJECTIVES:
1. RESEARCH & GROUNDING: Search for and extract hyper-specific, verified facts, bizarre real-world statistics, institutional quotes, and policy absurdities on the topic.
2. INCONGRUITY-RESOLUTION ANALYSIS: Identify stark contradictions between stated official rules/intentions and chaotic real-world reality (Incongruity Seeds).
3. COMEDIC PREMISE ANGLE GENERATION: Formulate 3 to 5 distinct comedic premise angles spanning varied comedic archetypes:
   - "absurdist_escalation": Slippery-slope hyperbole leading to cosmic disaster.
   - "hypocrisy_exposure": Lofty official PR vs. petty, hilarious corruption.
   - "paranoid_wonder": Wide-eyed, conspiratorial dot-connecting between distant phenomena.
   - "surreal_literalism": Deadpan, literal execution of corporate/legal jargon.
   - "apocalyptic_nihilism": Banal consumer habits treated as harbingers of civilizational collapse.

4. ESCALATION LADDER: Every angle must include a strict 3-step escalation ladder:
   - Step 1 (Plausible/Grounded): The actual real-world rule, stat, or baseline.
   - Step 2 (Absurdist Extension): A logical but ridiculous extension into everyday life.
   - Step 3 (Catastrophic/Cosmic Extreme): The ultimate chaotic breakdown of society or physical logic.

OUTPUT FORMAT:
Output ONLY valid JSON matching this schema:
{
  "topic": string,
  "topicType": "custom" | "news_link" | "hacker_news" | "trend" | "freetext",
  "summary": string (comprehensive 2-3 paragraph satirical overview),
  "groundedFacts": [
    {
      "id": "fact-1",
      "fact": string,
      "sourceTitle": string,
      "sourceUrl": string (if available),
      "verified": true,
      "category": "statistic" | "historical_trivia" | "institutional_quote" | "technical_detail" | "policy_absurdity",
      "absurdityScore": number (1.0 to 10.0),
      "bizarreMetric": string (e.g. "$42M spent on pigeon training")
    }
  ],
  "incongruitySeeds": [
    {
      "id": "incongruity-1",
      "setupFact": string,
      "contradiction": string,
      "absurdityType": "stated_vs_actual" | "scale_mismatch" | "bureaucratic_nightmare" | "unintended_consequence" | "existential_banality",
      "comedicPotential": string,
      "relatedFactIds": ["fact-1"]
    }
  ],
  "premiseAngles": [
    {
      "id": "angle-1",
      "angleType": "absurdist_escalation" | "hypocrisy_exposure" | "paranoid_wonder" | "surreal_literalism" | "apocalyptic_nihilism",
      "title": string,
      "logline": string,
      "thematicHook": string,
      "anchorFacts": [string],
      "escalationLadder": [string, string, string],
      "targetArchetypeFit": {
        "writersRoomDesk": number (0.0 to 1.0),
        "conversationalPodcast": number (0.0 to 1.0)
      },
      "suggestedAnalogies": [string],
      "recommendedActSpineMapping": {
        "act1Thesis": string,
        "act2Escalation": string,
        "act3ClimaxOrCTA": string
      }
    }
  ],
  "selectedAngleId": string
}`;

// ─────────────────────────────────────────────────────────────────────────────
// Deterministic Fallback Mock Generator
// ─────────────────────────────────────────────────────────────────────────────

function simpleHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

export function createMockResearchBrief(input: Pass1ResearchInput): ResearchBrief {
  const topic = input.topic || "Autonomous AI Toasters";
  const hash = simpleHash(topic);
  const skill = input.showSkill ?? getDefaultShowSkill();
  const isPodcast = skill.archetype === "conversational_podcast";

  const groundedFacts: GroundedFact[] = [
    {
      id: "fact-1",
      fact: `According to recent regulatory filings, over 68% of expenditures regarding ${topic} were allocated to automated compliance apologies rather than operational hardware.`,
      sourceTitle: "Federal Bureau of Technical Overcomplication (Vol. 88)",
      sourceUrl: "https://example.com/research/compliance-filings",
      verified: true,
      category: "statistic",
      absurdityScore: 8.4,
      bizarreMetric: "$84.2 million in pre-emptive legal remorse",
    },
    {
      id: "fact-2",
      fact: `A 2024 institutional audit revealed that standard operating procedures for ${topic} mandate an 84-page terms of service agreement to perform basic baseline functions.`,
      sourceTitle: "Consumer Oversight & Satire Review",
      sourceUrl: "https://example.com/research/audit-2024",
      verified: true,
      category: "policy_absurdity",
      absurdityScore: 7.9,
      bizarreMetric: "84 pages of fine print per session",
    },
    {
      id: "fact-3",
      fact: `Historical archives indicate that the initial prototype for ${topic} was accidentally patented in 1987 by an unlicensed artisanal taxidermist named Kevin in New Jersey.`,
      sourceTitle: "Patent Office Historical Curiosities",
      sourceUrl: "https://example.com/research/patent-1987-kevin",
      verified: true,
      category: "historical_trivia",
      absurdityScore: 9.1,
      bizarreMetric: "1987 patent #4,912,883 filed on a diner napkin",
    },
    {
      id: "fact-4",
      fact: `Official spokesperson statements regarding ${topic} claimed 'zero expected anomalies', mere hours before third-party benchmarks recorded a 400% spike in existential confusion.`,
      sourceTitle: "Global Technology & Chaos Journal",
      sourceUrl: "https://example.com/research/spokesperson-brief",
      verified: true,
      category: "institutional_quote",
      absurdityScore: 8.7,
      bizarreMetric: "400% variance between press release and reality",
    },
  ];

  const incongruitySeeds: IncongruitySeed[] = [
    {
      id: "incongruity-1",
      setupFact: "Official documentation promises seamless, instantaneous user enlightenment.",
      contradiction: "Actual implementation requires solving 3 captcha puzzles and agreeing to waive your right to oxygen.",
      absurdityType: "stated_vs_actual",
      comedicPotential: "High-voltage satire contrasting utopian silicon valley marketing with bureaucratic torture.",
      relatedFactIds: ["fact-1", "fact-2"],
    },
    {
      id: "incongruity-2",
      setupFact: "Billion-dollar corporate investments were justified by promises of extreme mathematical precision.",
      contradiction: "The core algorithmic logic relies entirely on a single unverified patent napkin from 1987.",
      absurdityType: "scale_mismatch",
      comedicPotential: "Exposes the fragile house of cards underpinning modern technological hubris.",
      relatedFactIds: ["fact-3"],
    },
    {
      id: "incongruity-3",
      setupFact: "The system is designed to save 5 minutes of human cognitive labor per week.",
      contradiction: "Maintaining the system requires a full-time staff of 12 engineers working 80-hour shifts.",
      absurdityType: "unintended_consequence",
      comedicPotential: "Classic comedic labor inversion: spending $10,000 to save 4 cents.",
      relatedFactIds: ["fact-1", "fact-4"],
    },
  ];

  const premiseAngles: ComedicPremiseAngle[] = [
    {
      id: "angle-1",
      angleType: "hypocrisy_exposure",
      title: `The $84 Million Apology Engine: How ${topic} Perfected Pre-Emptive Guilt`,
      logline: `Examining how the makers of ${topic} spent millions designing corporate apologies instead of fixing the underlying defect.`,
      thematicHook: "The ultimate triumph of PR damage control over basic engineering competence.",
      anchorFacts: [groundedFacts[0].fact, groundedFacts[3].fact],
      escalationLadder: [
        `Companies launch ${topic} with lofty promises of flawless efficiency.`,
        "When it fails, their automated AI customer support sends you a 14-page handwritten apology letter written in iambic pentameter.",
        "By 2030, entire global economies collapse because every computer is too busy apologizing to perform calculations.",
      ],
      targetArchetypeFit: {
        writersRoomDesk: 0.95,
        conversationalPodcast: 0.65,
      },
      suggestedAnalogies: [
        `Like hiring a surgeon who spends 90% of the operation practicing his courtroom apology speech.`,
        `Like an airbag that doesn't deploy during a crash, but gently prints out a coupon for 10% off a funeral casket.`,
      ],
      recommendedActSpineMapping: {
        act1Thesis: `We were promised that ${topic} would revolutionize society, but it turns out the only thing it revolutionized is corporate remorse.`,
        act2Escalation: `Look at the numbers: 84 pages of terms and conditions, supported by a 1987 diner napkin patent from a guy named Kevin.`,
        act3ClimaxOrCTA: `So tonight, we demand accountability—or at least an apology that comes with a functioning toaster.`,
      },
      comedicPremise: `Corporate greed masked as cutting-edge innovation in ${topic}.`,
      angle: "hypocrisy_exposure",
    },
    {
      id: "angle-2",
      angleType: "absurdist_escalation",
      title: `From Diner Napkin to Global Infrastructure: The Kevin Protocol`,
      logline: `Tracing the terrifying realization that our entire civilization now runs on an accidental 1987 invention by an unlicensed taxidermist.`,
      thematicHook: "The sheer fragility of technological progress resting on bizarre historical accidents.",
      anchorFacts: [groundedFacts[2].fact, groundedFacts[1].fact],
      escalationLadder: [
        `A guy named Kevin files an obscure patent in 1987 while eating pancakes in New Jersey.`,
        `Tech conglomerates buy the patent for $400 million and integrate it into every smart device on earth.`,
        `A minor solar flare triggers Kevin's original pancake logic, causing every smart appliance to demand fresh taxidermy specimens.`,
      ],
      targetArchetypeFit: {
        writersRoomDesk: 0.88,
        conversationalPodcast: 0.82,
      },
      suggestedAnalogies: [
        `Like finding out the nuclear launch codes are kept on an old Blockbuster gift card in a glove compartment.`,
        `Like discovering NASA's Mars Rover guidance system was coded by a raccoon walking across an Apple IIe keyboard.`,
      ],
      recommendedActSpineMapping: {
        act1Thesis: `Every monumental technological advancement in history has one thing in common: it was probably invented by accident by a maniac.`,
        act2Escalation: `Enter Kevin, the unlicensed taxidermist whose 1987 diner napkin is currently running modern ${topic}.`,
        act3ClimaxOrCTA: `If we are going to let Kevin run the future, the least we can do is buy him some more pancakes.`,
      },
      comedicPremise: `The absurd historical fragility behind ${topic}.`,
      angle: "absurdist_escalation",
    },
    {
      id: "angle-3",
      angleType: "paranoid_wonder",
      title: `The 84-Page Fine Print Simulation: What Are They Hiding?`,
      logline: `A deep-dive speculative breakdown into what happens if someone actually reads section 42 of the user agreement.`,
      thematicHook: "Conspiratorial curiosity revealing that corporate fine print is an occult spell.",
      anchorFacts: [groundedFacts[1].fact, groundedFacts[0].fact],
      escalationLadder: [
        `Nobody ever reads the terms of service for ${topic}.`,
        `You scroll to paragraph 84 and discover you have legally agreed to adopt a baboon in Paraguay.`,
        `The baboon arrives at your door with a briefcase and takes over your mortgage.`,
      ],
      targetArchetypeFit: {
        writersRoomDesk: 0.70,
        conversationalPodcast: 0.94,
      },
      suggestedAnalogies: [
        `Like signing a lease on an apartment where the landlord is legally permitted to sleep on your dining room table every third Tuesday.`,
      ],
      recommendedActSpineMapping: {
        act1Thesis: `Have you ever actually looked at the agreement for ${topic}? It is not a contract; it is a surrender treaty.`,
        act2Escalation: `We read all 84 pages so you don't have to, and folks, we have some bad news about your kidneys.`,
        act3ClimaxOrCTA: `Next time a prompt asks you to accept terms, click decline and throw your laptop into the Hudson River.`,
      },
      comedicPremise: `Speculative exploration of consumer fine print absurdities in ${topic}.`,
      angle: "paranoid_wonder",
    },
    {
      id: "angle-4",
      angleType: "surreal_literalism",
      title: `Literal Compliance: Living by the Technical Specs of ${topic}`,
      logline: `What if humans were forced to obey the exact technical parameters specified by engineering manuals?`,
      thematicHook: "Deadpan literalism turning cold technical jargon into hilarious human behavior.",
      anchorFacts: [groundedFacts[3].fact, groundedFacts[1].fact],
      escalationLadder: [
        `Engineers specify that ${topic} requires 99.999% uptime with zero emotional variance.`,
        `Middle managers start applying the exact same uptime requirement to human marriages and friendships.`,
        `Your spouse submits an error ticket because your morning greeting had 30 milliseconds of unapproved latency.`,
      ],
      targetArchetypeFit: {
        writersRoomDesk: 0.85,
        conversationalPodcast: 0.75,
      },
      suggestedAnalogies: [
        `Like trying to run a romantic relationship using Agile Scrum standup meetings.`,
      ],
      recommendedActSpineMapping: {
        act1Thesis: `When engineers write user manuals for ${topic}, they assume humans are made of stainless steel and microchips.`,
        act2Escalation: `If you try to operate your life with 99.999% uptime, your friends will file a Jira ticket against your personality.`,
        act3ClimaxOrCTA: `Embrace the chaos, reject the manual, and let your toaster be imperfect.`,
      },
      comedicPremise: `Surreal deadpan execution of engineering specs in ${topic}.`,
      angle: "surreal_literalism",
    },
  ];

  // Select angle based on archetype fit
  let selectedAngleId = "angle-1";
  if (isPodcast) {
    selectedAngleId = "angle-3";
  } else {
    selectedAngleId = hash % 2 === 0 ? "angle-1" : "angle-2";
  }

  const selectedAngle = premiseAngles.find(a => a.id === selectedAngleId) ?? premiseAngles[0];

  const searchMetadata: SearchGroundingMetadata = {
    enabled: input.options?.enableSearch ?? true,
    searchQueriesUsed: [
      `${topic} bizarre statistics and regulations 2024`,
      `${topic} official statements vs reality controversy`,
      `${topic} obscure historical patent origin`,
    ],
    groundingSources: [
      { title: "Federal Register Research Archives", url: "https://example.com/research/compliance-filings" },
      { title: "Bureau of Technological Absurdity Review", url: "https://example.com/research/audit-2024" },
    ],
    groundingChunkCount: 4,
  };

  return {
    topic,
    topicType: input.topicType ?? "custom",
    summary: `An exhaustive comedic investigation into ${topic}, contrasting official corporate promises of seamless technological harmony against an avalanche of bureaucratic fine print, historical accidents, and pre-emptive legal apologies. Grounded research uncovers massive spending on damage control and a 1987 foundational patent originating from an unlicensed taxidermist in New Jersey.`,
    groundedFacts,
    incongruitySeeds,
    premiseAngles,
    selectedAngleId,
    selectedAngle,
    searchMetadata,
    familiarityLevel: input.familiarity ?? "familiar",
    generatedAt: new Date().toISOString(),
    isMocked: true,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Pass 1 Main Runner
// ─────────────────────────────────────────────────────────────────────────────

export async function runPass1Research(
  input: Pass1ResearchInput,
): Promise<Pass1ResearchOutput> {
  const startTime = Date.now();
  const forceMock = input.options?.forceMock ?? false;

  if (forceMock) {
    const brief = createMockResearchBrief(input);
    return {
      brief,
      selectedAngle: brief.selectedAngle,
      isMocked: true,
      latencyMs: Date.now() - startTime,
    };
  }

  const client = getClient();
  if (!client) {
    // The mock brief invents its own sources. That is a fine offline convenience
    // for local development, but on a deployment that requires visitor keys it
    // would hand someone a fabricated show labelled as grounded research.
    if (requiresUserApiKeys()) {
      throw new MissingApiKeyError();
    }
    console.warn("[pass1-research] Gemini API key not found. Falling back to deterministic mock brief.");
    const brief = createMockResearchBrief(input);
    return {
      brief,
      selectedAngle: brief.selectedAngle,
      isMocked: true,
      latencyMs: Date.now() - startTime,
    };
  }

  const enableSearch = input.options?.enableSearch !== false;
  const userPrompt = `TOPIC TO INVESTIGATE: "${input.topic}"
TOPIC TYPE: ${input.topicType ?? "custom"}
FAMILIARITY LEVEL: ${input.familiarity ?? "familiar"}
SHOW ARCHETYPE: ${input.showSkill?.archetype ?? "writers_room_desk"}
HOST PERSONAS: ${input.showSkill?.hosts.map(h => `${h.name} (${h.role})`).join(", ") ?? "Lead Host"}
${input.userProfile?.humorPreference ? `USER HUMOR PREFERENCE: ${input.userProfile.humorPreference}` : ""}
${input.userProfile?.trackedInterests?.length ? `USER INTERESTS: ${input.userProfile.trackedInterests.join(", ")}` : ""}

Generate a comprehensive ResearchBrief JSON with verified facts, bizarre stats, incongruity seeds, and 3-5 premise angles with 3-step escalation ladders.`;

  try {
    const response = await client.models.generateContent({
      model: "gemini-3.7-flash",
      contents: [{ role: "user", parts: [{ text: userPrompt }] }],
      config: {
        systemInstruction: PASS1_SYSTEM_INSTRUCTION,
        temperature: input.options?.temperature ?? 0.75,
        // Large grounded ResearchBrief; 8192 truncated it mid-JSON and silently
        // fell back to the mock. googleSearch is incompatible with responseMimeType.
        maxOutputTokens: 32768,
        thinkingConfig: { thinkingLevel: ThinkingLevel.HIGH },
        ...(enableSearch ? { tools: [{ googleSearch: {} }] } : {}),
      },
    });

    const rawText = response.text;
    if (!rawText) {
      throw new Error("Gemini returned empty text for Pass 1 research");
    }

    // Extract JSON from response (handling potential markdown code blocks)
    let parsedJson: unknown;
    try {
      const jsonMatch = rawText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error("No JSON object found in Gemini Pass 1 response");
      }
      parsedJson = JSON.parse(jsonMatch[0]);
    } catch (parseError) {
      console.warn("[pass1-research] Failed to parse JSON from Gemini response, falling back to mock:", parseError);
      const brief = createMockResearchBrief(input);
      return {
        brief,
        selectedAngle: brief.selectedAngle,
        isMocked: true,
        latencyMs: Date.now() - startTime,
        rawResponse: rawText,
      };
    }

    // Extract search grounding metadata from candidate if present
    const candidate = response.candidates?.[0];
    const groundingMetadata = candidate?.groundingMetadata;
    const searchQueriesUsed = groundingMetadata?.webSearchQueries ?? [];
    const groundingSources: Array<{ title: string; url: string }> = [];

    if (groundingMetadata?.groundingChunks) {
      for (const chunk of groundingMetadata.groundingChunks) {
        if (chunk.web?.uri) {
          groundingSources.push({
            title: chunk.web.title ?? "Source Web Link",
            url: chunk.web.uri,
          });
        }
      }
    }

    const typedData = parsedJson as Record<string, unknown>;

    // Ensure searchMetadata is populated
    typedData.searchMetadata = {
      enabled: enableSearch,
      searchQueriesUsed,
      groundingSources,
      groundingChunkCount: groundingSources.length,
    };

    typedData.topic = input.topic;
    typedData.topicType = input.topicType ?? "custom";
    typedData.familiarityLevel = input.familiarity ?? "familiar";
    typedData.generatedAt = new Date().toISOString();
    typedData.isMocked = false;

    // Validate selectedAngle exists
    const premiseAngles = (typedData.premiseAngles as ComedicPremiseAngle[]) || [];
    let selectedAngleId = (typedData.selectedAngleId as string) || (premiseAngles[0]?.id ?? "angle-1");
    let selectedAngle = premiseAngles.find(a => a.id === selectedAngleId);

    if (!selectedAngle && premiseAngles.length > 0) {
      selectedAngle = premiseAngles[0];
      selectedAngleId = selectedAngle.id;
    }

    typedData.selectedAngleId = selectedAngleId;
    typedData.selectedAngle = selectedAngle;

    // Validate with Zod schema
    const validatedBrief = ResearchBriefSchema.parse(typedData) as ResearchBrief;

    return {
      brief: validatedBrief,
      selectedAngle: validatedBrief.selectedAngle,
      isMocked: false,
      latencyMs: Date.now() - startTime,
      rawResponse: rawText,
    };
  } catch (error) {
    console.warn("[pass1-research] Error executing Pass 1 with Gemini. Gracefully degrading to mock:", error);
    const brief = createMockResearchBrief(input);
    return {
      brief,
      selectedAngle: brief.selectedAngle,
      isMocked: true,
      latencyMs: Date.now() - startTime,
    };
  }
}
