import type {
  RemovableSkillSource,
  SkillStatusEntry,
} from "@/lib/skills/types";

export type PackagedSkillId =
  | "soundhermes"
  | "task-manager"
  | "todo-board"
  | "caveman"
  | "telegram-remote"
  | "web-research"
  | "agent-reach"
  | "obsidian-skills"
  | "superpowers"
  | "humanizer"
  | "marketing-skills";

export type PackagedSkillDefinition = {
  packageId: PackagedSkillId;
  skillKey: string;
  name: string;
  description: string;
  installSource: RemovableSkillSource;
  creatorName?: string;
  creatorUrl?: string;
};

const EMPTY_REQUIREMENTS = {
  bins: [],
  anyBins: [],
  env: [],
  config: [],
  os: [],
};

const PACKAGED_SKILLS: PackagedSkillDefinition[] = [
  {
    packageId: "todo-board",
    skillKey: "todo-board",
    name: "todo",
    description: "Maintain a shared workspace TODO list with blocked tasks.",
    installSource: "hermes-workspace",
    creatorName: "iamlukethedev",
    creatorUrl: "http://x.com/iamlukethedev/",
  },
  {
    packageId: "task-manager",
    skillKey: "task-manager",
    name: "task-manager",
    description:
      "Capture actionable requests as persistent tasks and keep a shared Kanban task store in sync.",
    installSource: "hermes-workspace",
    creatorName: "iamlukethedev",
    creatorUrl: "https://github.com/iamlukethedev",
  },
  {
    packageId: "soundhermes",
    skillKey: "soundhermes",
    name: "soundhermes",
    description: "Control Spotify playback, search music, and return shareable music links.",
    installSource: "hermes-workspace",
    creatorName: "iamlukethedev",
    creatorUrl: "https://github.com/iamlukethedev",
  },
  {
    packageId: "caveman",
    skillKey: "caveman",
    name: "caveman",
    description: "Compress agent responses into dense, high-signal language. Eliminates filler and saves 30-75% tokens on mobile.",
    installSource: "hermes-workspace",
    creatorName: "Julien Barbier",
    creatorUrl: "https://github.com/julienbarbier42/caveman",
  },
  {
    packageId: "telegram-remote",
    skillKey: "telegram-remote",
    name: "telegram-remote",
    description: "Format task updates, notification badges, and approval cards for Telegram and mobile interfaces.",
    installSource: "hermes-workspace",
    creatorName: "Hermes Core",
    creatorUrl: "https://github.com/iamlukethedev/Hermes3D",
  },
  {
    packageId: "web-research",
    skillKey: "web-research",
    name: "web-research",
    description: "Stealth web intelligence & scraping via Camoufox browser, saving reports directly to _AI/research/ vault.",
    installSource: "hermes-workspace",
    creatorName: "Hermes Core",
    creatorUrl: "https://github.com/iamlukethedev/Hermes3D",
  },
  {
    packageId: "agent-reach",
    skillKey: "agent-reach",
    name: "agent-reach",
    description: "Social media and developer community scraping playbook for Twitter/X, Reddit, and LinkedIn via persistent Camoufox profiles.",
    installSource: "hermes-workspace",
    creatorName: "Prakhar Dixit",
    creatorUrl: "https://github.com/prakhardixit/agent-reach",
  },
  {
    packageId: "obsidian-skills",
    skillKey: "obsidian-skills",
    name: "obsidian-skills",
    description: "Structure and maintain workspace knowledge base as a connected Obsidian Vault with [[wikilinks]], callouts, and canvas diagrams.",
    installSource: "hermes-workspace",
    creatorName: "Kepano & Community",
    creatorUrl: "https://github.com/kepano/obsidian-skills",
  },
  {
    packageId: "superpowers",
    skillKey: "superpowers",
    name: "superpowers",
    description: "Rigorous software engineering discipline: requirement planning before coding, TDD, and multi-gate verification before commit.",
    installSource: "hermes-workspace",
    creatorName: "Superpowers Team",
    creatorUrl: "https://github.com/obra/superpowers",
  },
  {
    packageId: "humanizer",
    skillKey: "humanizer",
    name: "humanizer",
    description: "Filter out repetitive AI patterns, robotic phrasing, and overused buzzwords for authentic human-sounding prose.",
    installSource: "hermes-workspace",
    creatorName: "Humanizer Community",
    creatorUrl: "https://github.com/humanizer-ai/humanizer",
  },
  {
    packageId: "marketing-skills",
    skillKey: "marketing-skills",
    name: "marketing-skills",
    description: "Conversion rate optimization (CRO), landing page analysis, SEO checklist, and high-converting value proposition copy.",
    installSource: "hermes-workspace",
    creatorName: "Marketing Skills Hub",
    creatorUrl: "https://github.com/marketing-skills/hub",
  },
];

export const listPackagedSkills = (): PackagedSkillDefinition[] => [
  ...PACKAGED_SKILLS,
];

export const getPackagedSkillById = (
  packageId: string,
): PackagedSkillDefinition | null =>
  PACKAGED_SKILLS.find((skill) => skill.packageId === packageId) ?? null;

export const getPackagedSkillBySkillKey = (
  skillKey: string,
): PackagedSkillDefinition | null => {
  const normalized = skillKey.trim();
  return PACKAGED_SKILLS.find((skill) => skill.skillKey === normalized) ?? null;
};

export const buildPackagedSkillStatusEntry = (
  skill: PackagedSkillDefinition,
): SkillStatusEntry => ({
  name: skill.name,
  description: skill.description,
  source: "hermes-extra",
  bundled: false,
  filePath: "",
  baseDir: "",
  skillKey: skill.skillKey,
  always: false,
  disabled: false,
  blockedByAllowlist: false,
  eligible: false,
  requirements: { ...EMPTY_REQUIREMENTS },
  missing: { ...EMPTY_REQUIREMENTS },
  configChecks: [],
  install: [],
});

export const appendPackagedSkillsToMarketplace = (
  skills: SkillStatusEntry[],
): SkillStatusEntry[] => {
  const presentKeys = new Set(skills.map((skill) => skill.skillKey.trim()));
  const additions = PACKAGED_SKILLS.filter(
    (skill) => !presentKeys.has(skill.skillKey),
  ).map(buildPackagedSkillStatusEntry);
  if (additions.length === 0) {
    return skills;
  }
  return [...additions, ...skills];
};
