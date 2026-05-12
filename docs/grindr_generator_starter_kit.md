# $GRINDR GENERATOR — STARTER KIT

This document contains the INITIAL FILES you should create before moving to Codex.

The goal:
- make the meme engine deterministic
- organize prompt logic
- make archetypes modular
- prepare for API generation
- give Codex a stable architecture

DO NOT skip this structure.

---

# 1. RECOMMENDED ROOT STRUCTURE

```plaintext
/grindr-generator
│
├── /docs
│   ├── GRINDR_MEME_BIBLE_v1.md
│   ├── GRINDR_PROMPT_ARCHITECTURE_v1.md
│   ├── GRINDR_PRD_v1.md
│   └── ROADMAP.md
│
├── /archetypes
│   ├── unc.json
│   ├── scamsem.json
│   ├── fagge_banks.json
│   ├── cookr.json
│   ├── jackside.json
│   ├── orangr.json
│   ├── centr.json
│   └── broccoli_intern.json
│
├── /formats
│   ├── propaganda_poster.json
│   ├── podcast_satire.json
│   ├── luxury_campaign.json
│   ├── schizo_collage.json
│   ├── dating_profile.json
│   ├── internal_leak.json
│   └── training_manual.json
│
├── /themes
│   ├── fomo_extraction.json
│   ├── attention_harvesting.json
│   ├── luxury_after_rug.json
│   ├── narrative_deployment.json
│   ├── hidden_wallets.json
│   └── fake_community.json
│
├── /styles
│   ├── black_pink_luxury.json
│   ├── corporate_dystopia.json
│   ├── schizo_psyop.json
│   ├── vhs_handheld.json
│   └── low_bitrate_stream.json
│
├── /camera
│   ├── static_webcam.json
│   ├── handheld_vhs.json
│   ├── luxury_editorial.json
│   ├── paparazzi_flash.json
│   └── surveillance_feed.json
│
├── /symbols
│   ├── glowing_phone.json
│   ├── green_candles.json
│   ├── private_group_chat.json
│   ├── notification_burst.json
│   ├── pink_mask_logo.json
│   └── hidden_wallet_dashboard.json
│
├── /slogans
│   ├── extraction.txt
│   ├── liquidity.txt
│   ├── fomo.txt
│   └── propaganda.txt
│
├── /generation
│   ├── promptCompiler.ts
│   ├── imagePromptBuilder.ts
│   ├── videoPromptBuilder.ts
│   └── randomizer.ts
│
├── /app
├── /components
├── /public
└── package.json
```

---

# 2. FIRST FILES TO CREATE

These are the MINIMUM files you should manually create before Codex.

---

# 2.1 archetypes/scamsem.json

```json
{
  "id": "scamsem",
  "role": "high-functioning KOL extractor",
  "corporate_title": "Chief Narrative Officer",
  "traits": [
    "pseudo-philosophical",
    "emotionally detached",
    "fake sincerity",
    "calculated"
  ],
  "dialogue_style": "calm analytical honesty",
  "visuals": [
    "podcast mic",
    "dark room",
    "trading chart reflection",
    "designer hoodie"
  ],
  "symbolic_function": "intellectualized extraction",
  "catchphrases": [
    "deploy narrative",
    "community strong",
    "higher"
  ]
}
```

---

# 2.2 archetypes/orangr.json

```json
{
  "id": "orangr",
  "role": "timeline synchronization specialist",
  "corporate_title": "Director of Narrative Synchronization",
  "traits": [
    "permanently online",
    "sleep deprived",
    "hyper-reactive",
    "doomscrolling addict"
  ],
  "dialogue_style": "fragmented overstimulated posting",
  "visuals": [
    "monitor glow",
    "tweet overlays",
    "blue light eyes",
    "glitch UI"
  ],
  "symbolic_function": "algorithmic psychosis",
  "catchphrases": [
    "timeline shifting",
    "everyone sees it now",
    "phase 2"
  ]
}
```

---

# 2.3 formats/propaganda_poster.json

```json
{
  "id": "propaganda_poster",
  "description": "corporate dystopian propaganda poster for $GRINDR INDUSTRIES",
  "composition": "single strong central image",
  "text_density": "low",
  "required_elements": [
    "headline",
    "subtext",
    "corporate footer"
  ],
  "best_for": [
    "slogans",
    "departments",
    "satirical corporate messaging"
  ]
}
```

---

# 2.4 themes/fomo_extraction.json

```json
{
  "id": "fomo_extraction",
  "summary": "KOL public buy triggers notifications, followers enter, hidden wallets exit",
  "actions": [
    "phones light up with buy alerts",
    "green candles appear",
    "hidden wallets quietly sell"
  ],
  "slogans": [
    "PING → PUMP → EXIT",
    "ATTENTION IS LIQUIDITY"
  ]
}
```

---

# 2.5 styles/schizo_psyop.json

```json
{
  "id": "schizo_psyop",
  "palette": [
    "black",
    "neon pink",
    "toxic green"
  ],
  "textures": [
    "compression artifacts",
    "glitch overlays",
    "screen burn",
    "chromatic aberration"
  ],
  "composition": "dense but readable",
  "mood": "algorithmic paranoia"
}
```

---

# 2.6 camera/handheld_vhs.json

```json
{
  "id": "handheld_vhs",
  "description": "shaky handheld VHS camcorder footage",
  "motion": "unstable but readable",
  "effects": [
    "tracking lines",
    "analog grain",
    "fisheye distortion"
  ]
}
```

---

# 2.7 symbols/glowing_phone.json

```json
{
  "id": "glowing_phone",
  "description": "bright smartphone illuminating faces in dark environments",
  "associated_themes": [
    "attention_harvesting",
    "fomo_extraction"
  ]
}
```

---

# 2.8 slogans/extraction.txt

```txt
WE EXTRACT
ATTENTION IS LIQUIDITY
THE PRODUCT IS YOU
PING → PUMP → EXIT
EVERY NOTIFICATION IS FOREPLAY
COMMUNITY OWNED EXIT LIQUIDITY
```

---

# 3. MOST IMPORTANT FILE

This file is the ACTUAL ENGINE.

Create:

```plaintext
/generation/promptCompiler.ts
```

Initial responsibility:
- load JSON modules
- merge them
- compile clean prompts

Pseudo logic:

```ts
const prompt = [
  format.description,
  archetype.visuals,
  setting.description,
  theme.summary,
  style.textures,
  camera.description,
  symbols,
  slogans
].join(', ')
```

DO NOT overcomplicate initially.

---

# 4. NEXT STEP AFTER THIS

AFTER these files exist:

1. Ask Codex to scaffold:
   - Next.js frontend
   - generation API route
   - prompt compiler
   - randomizer
   - image output page

2. Connect image API:
   - Fal.ai
   - Replicate
   - Together.ai
   - local Flux later

3. Start with:
   - propaganda posters
   - podcast screenshots
   - schizo collages

NOT video yet.

Video later.

---

# 5. WHAT YOU SHOULD ASK CODEX NEXT

Literally paste:

```txt
Build the MVP architecture for the $GRINDR Generator.

Requirements:
- Next.js app router
- Tailwind
- modular JSON-based prompt system
- prompt compiler
- randomizer
- image generation API abstraction
- generation page
- archetype/theme/style loaders
- clean neon black/pink UI

Use the provided folder structure and documents.
```

---

# 6. IMPORTANT

You are NOT building:
- an AI art app
- a meme randomizer
- a crypto dashboard

You are building:

THE EXTRACTION PROPAGANDA MACHINE™

Everything must reinforce:
- attention harvesting
- luxury degeneracy
- algorithmic psychosis
- KOL extraction culture
- self-aware memecoin nihilism

END OF STARTER KIT

