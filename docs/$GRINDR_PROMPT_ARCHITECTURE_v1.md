# $GRINDR PROMPT ARCHITECTURE v1
INTERNAL DOCUMENT — GRINDR INDUSTRIES™

Purpose:
Define how the $GRINDR Generator converts lore, archetypes, meme formats, and user inputs into consistent image/video prompts.

This document is the bridge between:
- Meme Bible
- PRD
- Codex implementation
- Image/video generation APIs

--------------------------------------------------
0. CORE IDEA
--------------------------------------------------

The generator should never create “random AI memes.”

It should compile structured inputs into lore-consistent propaganda.

Every prompt is assembled from modules:

1. FORMAT
2. ARCHETYPE(S)
3. SETTING
4. THEME
5. VISUAL STYLE
6. CAMERA LANGUAGE
7. SYMBOLIC OBJECTS
8. TEXT / SLOGANS
9. CHAOS LEVEL
10. PLATFORM OUTPUT

Prompt generation is modular, not freeform.

--------------------------------------------------
1. MASTER PROMPT FORMULA
--------------------------------------------------

Every generation prompt follows this structure:

[FORMAT DESCRIPTION]
+
[CHARACTERS / ARCHETYPES]
+
[SETTING]
+
[CORE ACTION]
+
[VISUAL SYMBOLS]
+
[BRAND LANGUAGE]
+
[CAMERA / COMPOSITION]
+
[TEXT / TYPOGRAPHY]
+
[STYLE CONSTRAINTS]
+
[NEGATIVE CONSTRAINTS]

Example skeleton:

```txt
Create a {format} in the $GRINDR universe.

Scene:
{setting}

Characters:
{archetypes}

Action:
{core_action}

Visual motifs:
{symbolic_objects}

Branding:
{brand_elements}

Text:
{headline}
{subtext}

Style:
{visual_style}
{camera_language}
{chaos_level}

Avoid:
{negative_constraints}