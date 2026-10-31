# Landing page

Objective: a public marketing landing for numa, built with the `landing-page-design` skill, in a new `apps/landing` Astro app.
Branch: `feat/landing-page` · Delivery: `ask-on-risk` · Checks: `pnpm --filter landing build`, `astro check`, visual check in the browser at desktop and 390px.

## Specs

- **S1 — Separate lightweight app.** A new `apps/landing` workspace app built with Astro (user: "No crees q sería mejor usar algo más liviano para una landing, como astro?"). Static output, React only for interactive islands. It does not touch `apps/web` routing, the auth proxy or `isPublicPath`.
- **S2 — Design line.** The skill drives layout and visual rules, with numa overrides: Inter, Hugeicons (user: "Pero numa gana lo q dices, me la pela q la skill diga q no se use Inter"). Share numa's values (colors, radius, font, indigo accent) but do not carry shadcn's component look. User, verbatim: "queremos seguir un poco el estilo de numa pero más bien me refiero a tener una similitud y simetría en tema de border radius, colores… es decir, usamos los primitivos de packages ui si consideras, pero q no acoplemos los estilos marcados de shadcn si la skill de la landing no lo necesita o requiere."
- **S3 — Hero.** The floating island from `apps/web/lib/games/runtime/index.html`, live in three.js, with the camera reacting to scroll (user: "Podemos usar por ejemplo ahora en el hero esa isleta q creamos q sirve como témplate temporal del sandbox"; "con un hero en movimiento/animado"). A demo composer sits over it as the primary action. Headline "Describe tu juego. numa lo construye." / subheadline / proof line "Gratis para empezar: 100 créditos al mes." Reduced motion and load failure fall back to a static scene.
- **S4 — Composer hand-off.** Submitting the composer sends the visitor to the app's sign-in for now. Preserving the prompt through sign-in is deferred (user: "si nos bloquea por lo del composer, pues eso ya lo haremos no pasa nada").
- **S5 — Sections (approved outline).** Floating pill nav; hero; tagline reveal "Si puedes describirlo, / puedes jugarlo." (words light up one by one on scroll); How it works (3 steps); Templates gallery (6 real previews); Benefits (4); Pricing (Free $0 / 100 credits, Pro $20 / 2,000, Max $50 / 5,500, 1 credit = 1 cent); FAQ (8); final CTA identical to the hero; footer. No invented testimonials, logos or stats.
- **S6 — i18n.** English and Spanish copy.
- **S7 — Ship requirements.** Skill B10: title, meta description, og tags, favicon, 404, skip link, semantic HTML, alt text, no overflow at 390px.

## Tasks

| ID | Specs | Route | Status | Commit |
|---|---|---|---|---|
| T1 | S1, S2, S6 | inline | done (astro check 0 errors, build OK) | 80362ee |
| T2 | S3, S4 | inline | done (checked in Chrome at 1440 and 606 wide) | 545215f |
| T3 | S5 (tagline, how it works, benefits) | inline | done | 90a64af |
| T4 | S5 (templates, pricing, FAQ, final CTA, footer) | inline | done | 90a64af |
| T5 | S7 | inline | partial: 404, og, meta, skip link done; legal links missing; light theme not checked in browser | b2c4f53 |

Route evidence: one sequential build, no independent parallel units, so no writer trigger fires.

## Log

- **L1 (2026-10-31), user's original request:** "me encantaria que hicieramos la web de numa" … "ps yo creo q la skill debe de servirnos como base, para tener un diseño currado. debe de seguir la linea de diseño de numa, el hero deberia de ser algo potente … La página debe de ser algo visual y creativo, con un hero en movimiento/animado." Then: "Me importa darle caña a la landing y ver si tú opus + está skill podemos crear una landing buena buena".
- **L2:** Video generation ruled out (no free video API). Skill installed at `.agents/skills/landing-page-design` and overridden locally for Inter and Hugeicons. Inspiration saved, untracked, in `apps/web/design/inspiration/elaya/`.
- **L3:** Copy and outline approved ("Vale me convence si"). Astro chosen over Next. `packages/ui` has no Next imports, so it can render inside Astro if needed.
- **L4:** React dropped: the island is a plain TS module (three.js, lazy loaded after paint, paused off screen), the rest is HTML plus small scripts. Hero is always light (sky); below it the page follows the system theme.
- **L5:** Template previews in `public/templates` are the asset packs' promo art (vendor logos visible). Fine in the app, questionable on the landing; flagged to the user. Step three and `og.png` use a capture of the island instead.
- **L6:** Risk: item 5 (new dependencies: astro, three, fontsource; turbo build outputs). RDD off for this clone (clone_local). Independent verifier launched for deps/build.
- **L7:** Independent verifier: no blockers. Frozen-lockfile install OK, landing typecheck/build OK, web typecheck clean, no changes under apps/web or packages, dist and .astro ignored. Parent spot check: apps/web+packages diff empty.
