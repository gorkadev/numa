import {
  Airplane01Icon,
  Car01Icon,
  CubeIcon,
  FlashIcon,
  GameController01Icon,
  SwordIcon,
  Target01Icon,
} from "@hugeicons/core-free-icons"

/**
 * The starting points offered on the empty home screen.
 *
 * Each carries two strings because they answer different questions. The label
 * is what fits on a chip and tells the player what kind of game this is; the
 * prompt is what the agent actually receives, and a two-word label makes a
 * poor first message — it leaves the model to invent every decision the player
 * would rather have been asked about.
 *
 * The prompts stay deliberately short of a spec. They name a genre, a look and
 * one mechanic, and stop: the agent opens a new game by asking a short run of
 * questions, and a prompt that has already settled everything would rob it of
 * anything worth asking.
 */
export const suggestions = [
  {
    icon: CubeIcon,
    label: "Voxel survival",
    prompt:
      "Build a first-person voxel survival game: mine and place blocks in a world I can walk around, gather what I need before nightfall, and stay alive.",
  },
  {
    icon: SwordIcon,
    label: "Ink samurai duel",
    prompt:
      "Build a one-on-one samurai duel in a black-and-white ink-wash style, where fights are won by timing a parry and the counter-strike that follows it.",
  },
  {
    icon: FlashIcon,
    label: "Comic-book firefight",
    prompt:
      "Build a top-down firefight drawn like a comic book — bold outlines, halftone shading and onomatopoeia popping up on every hit — where I clear a room of enemies using cover.",
  },
  {
    icon: Airplane01Icon,
    label: "Realistic battlefield",
    prompt:
      "Build a first-person battlefield sequence with a realistic look: cross open ground under fire, use cover, and take an objective.",
  },
  {
    icon: Target01Icon,
    label: "Fight-first shooter",
    prompt:
      "Build an arena shooter that rewards pushing forward rather than hiding: health comes from killing, enemies pressure me constantly, and standing still is what gets me killed.",
  },
  {
    icon: Car01Icon,
    label: "Jungle expedition drive",
    prompt:
      "Build a driving game through dense jungle: an off-road route with mud, river crossings and steep climbs where keeping the vehicle intact matters as much as speed.",
  },
  {
    icon: GameController01Icon,
    label: "Sunny kingdom platformer",
    prompt:
      "Build a bright 3D platformer set in a sunny storybook kingdom: run, jump and double-jump across floating islands to collect what is scattered across each one.",
  },
]
