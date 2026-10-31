/**
 * English copy. Facts (plans, credits, templates, prompts) are taken from the
 * app's own messages in `apps/web/messages/en.json`, so the site never
 * promises something the product does not do.
 */
export const en = {
  meta: {
    title: "numa: make video games by describing them",
    description:
      "Build your own racers, shooters, puzzles and whole worlds using your own words. If you can describe it, you can play it.",
  },
  skip: "Skip to content",
  nav: {
    home: "numa home",
    templates: "Templates",
    howItWorks: "How it works",
    pricing: "Pricing",
    faq: "FAQ",
    signIn: "Sign in",
    start: "Start free",
    openMenu: "Open menu",
    closeMenu: "Close menu",
  },
  hero: {
    badge: "Six templates for 2D and 3D games",
    title: ["Describe your game.", "numa builds it."],
    subtitle:
      "Racers, shooters, puzzles or whole worlds. Tell an AI agent what you want to play and get it back playable in your browser.",
    proof: "Free to start: 100 credits every month.",
    primary: "Start free",
    secondary: "How it works",
    stats: [
      { value: "6", label: "Ready made templates" },
      { value: "2D and 3D", label: "Games in your browser" },
      { value: "100", label: "Free credits every month" },
    ],
    sceneLabel:
      "A floating island built from blocks, with trees, a flag and animals wandering the meadow.",
  },
  tagline: ["If you can describe it,", "you can play it."],
  how: {
    eyebrow: "How it works",
    title: "From one sentence to a game you can play",
    steps: [
      {
        title: "Describe it",
        body: "One sentence is enough. Add references if you have them, and pick a template or start from a blank canvas.",
      },
      {
        title: "The agent builds it",
        body: "It plans the game, writes the code, sets the scene with real assets and checks that it runs.",
      },
      {
        title: "Play it and change it",
        body: "The game runs next to the chat. Ask for changes in plain words and play the new version.",
      },
    ],
    demo: {
      send: "Create",
      prompt: "A sheep herding game on a floating island",
      plan: "Planning the game",
      code: "Writing the code",
      scene: "Setting the scene",
      verify: "Checking it runs",
      play: "Play",
    },
  },
  templates: {
    eyebrow: "Templates",
    title: "Start from a world that already looks good",
    subtitle:
      "Each template brings a kit of real models and sprites, so your first version already has art direction.",
    items: [
      { id: "cube-world", name: "Cube World", tagline: "A blocky 3D world with heroes, animals and monsters.", kind: "3D" },
      { id: "platformer", name: "Platformer", tagline: "Bright 3D platforms, coins and enemies to jump on.", kind: "3D" },
      { id: "toon-shooter", name: "Toon Shooter", tagline: "Cartoon 3D soldiers, weapons and battlefields.", kind: "3D" },
      { id: "fantasy-cards", name: "Fantasy Cards", tagline: "3D fantasy cards of spells, creatures and treasures.", kind: "3D" },
      { id: "tiny-swords", name: "Tiny Swords", tagline: "A 2D pixel art kingdom seen from above.", kind: "2D" },
      { id: "legacy-fantasy", name: "Legacy Fantasy", tagline: "A 2D pixel art forest adventure seen from the side.", kind: "2D" },
    ],
  },
  benefits: {
    eyebrow: "Why numa",
    title: "Everything a game needs, without the setup",
    chat: {
      ask: "Make the sheep faster in",
      file: "@game.js",
      reply: "Done. The sheep run faster now.",
    },
    items: [
      {
        title: "No code to write",
        body: "You bring the idea. The agent writes every file, and you can open and read them whenever you want.",
      },
      {
        title: "Worlds with real assets",
        body: "Templates come with kits of 3D models and pixel art, so games look finished from the first version.",
      },
      {
        title: "Change it by talking",
        body: "Every change is a message. Mention a file with @ to point the agent at exactly what to touch.",
      },
      {
        title: "Pay for what you build",
        body: "One credit is one cent of what a turn actually costs to generate. A turn that fails costs nothing.",
      },
      {
        title: "Play it in the browser",
        body: "Every game runs in a browser tab, on any computer. Nothing to install, and you can share what you build.",
      },
    ],
  },
  pricing: {
    eyebrow: "Pricing",
    title: "Pay for what you build",
    subtitle:
      "Every plan runs on credits. One credit is one cent of what a turn actually costs to generate.",
    perMonth: "/month",
    popular: "Most popular",
    plans: [
      {
        id: "free",
        name: "Free",
        price: "$0",
        description: "Enough to find out whether the idea in your head plays.",
        features: [
          "100 credits every month",
          "Unlimited games and revisions",
          "Play and share every game you build",
        ],
        cta: "Start free",
      },
      {
        id: "pro",
        name: "Pro",
        price: "$20",
        description: "For the weeks where one idea turns into nine.",
        features: [
          "Everything on Free",
          "2,000 credits every month",
          "Extra credits when a month runs long",
        ],
        cta: "Get Pro",
      },
      {
        id: "max",
        name: "Max",
        price: "$50",
        description: "For teams that build every day and never want to watch the balance.",
        features: [
          "Everything on Pro",
          "5,500 credits every month",
          "10% more credits per dollar than Pro",
        ],
        cta: "Get Max",
      },
    ],
  },
  faq: {
    eyebrow: "FAQ",
    title: "Questions, answered",
    categories: [
      { id: "all", label: "All topics" },
      { id: "start", label: "Getting started" },
      { id: "features", label: "Features" },
      { id: "billing", label: "Credits and billing" },
    ],
    items: [
      {
        category: "start",
        q: "Do I need to know how to code?",
        a: "No. You describe the game and the agent writes the code. Every file stays visible in the app if you ever want to read it.",
      },
      {
        category: "features",
        q: "What kind of games can I make?",
        a: "2D and 3D games that run in the browser: platformers, shooters, card battlers, top down adventures, driving games and more. Start from a template or from a blank canvas.",
      },
      {
        category: "billing",
        q: "What is a credit?",
        a: "One credit is one US cent of what a turn costs to generate. A long conversation about a complicated game costs more than a short one about a simple game, so credits are spent by the turn rather than by the game.",
      },
      {
        category: "start",
        q: "Can I start for free?",
        a: "Yes. The Free plan comes with 100 credits every month, unlimited games and revisions, and you can play and share everything you build.",
      },
      {
        category: "features",
        q: "Which AI models does it use?",
        a: "You choose between three tiers. Fast is the cheapest for small tweaks, Balanced is the right pick for most games, and Pro is slower and stronger for mechanics that need real reasoning.",
      },
      {
        category: "features",
        q: "Can I use my own images and files?",
        a: "Yes. Attach images or files to your message and the agent uses them as references for the game.",
      },
      {
        category: "billing",
        q: "What happens when I run out of credits?",
        a: "New turns stop until your balance recovers. Nothing is deleted and nothing is locked. Free plans refill on the first of the month, and Pro or Max plans can buy extra credits without waiting.",
      },
      {
        category: "billing",
        q: "Can I cancel whenever I want?",
        a: "Yes. A cancelled Pro or Max plan runs to the end of the period you already paid for, then drops to Free. Extra credits you bought are kept.",
      },
    ],
  },
  finalCta: {
    title: ["Describe your game.", "numa builds it."],
    subtitle: "Your first 100 credits are on us, every month.",
    primary: "Start free",
    secondary: "See the pricing",
  },
  footer: {
    tagline: "Make video games by describing them.",
    product: "Product",
    language: "Language",
    rights: "All rights reserved.",
  },
  notFound: {
    title: "This level does not exist",
    body: "The page you are looking for is not here. The island is still floating where you left it.",
    back: "Back to home",
  },
}

export type Dictionary = typeof en
