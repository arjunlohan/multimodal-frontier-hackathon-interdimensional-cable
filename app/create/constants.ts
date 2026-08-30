export const VIDEO_DURATION_OPTIONS = [
  { value: 8, label: "8s", description: "1 clip" },
  { value: 16, label: "16s", description: "2 clips" },
  { value: 24, label: "24s", description: "3 clips" },
  { value: 32, label: "32s", description: "4 clips" },
  { value: 40, label: "40s (Max)", description: "5 clips" },
] as const;

export const AUDIO_PODCAST_DURATION_OPTIONS = [
  { value: 60, label: "1 min", description: "Quick Brief" },
  { value: 120, label: "2 min", description: "Short Episode" },
  { value: 180, label: "3 min", description: "Standard Podcast" },
  { value: 240, label: "4 min", description: "Deep Discussion" },
  { value: 300, label: "5 min (Max)", description: "Full Podcast" },
] as const;

export const DURATION_OPTIONS = VIDEO_DURATION_OPTIONS;

export const FAMILIARITY_OPTIONS = [
  { value: "beginner", label: "New to this", description: "Explain like I'm hearing about this for the first time" },
  { value: "familiar", label: "Familiar", description: "I know the basics, give me the interesting details" },
  { value: "expert", label: "Expert", description: "I follow this closely, give me the deep cuts" },
] as const;

export const TOPIC_TYPES = {
  freetext: "freetext",
  news_link: "news_link",
  hacker_news: "hacker_news",
} as const;
