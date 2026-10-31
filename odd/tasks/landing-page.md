# Landing page

Objective: a public marketing landing for numa, built with the `landing-page-design` skill, in a new `apps/landing` Astro app.
Branch: `feat/landing-page` · Delivery: `ask-on-risk` · Checks: `pnpm --filter landing build`, `astro check`, visual check in the browser at desktop and 390px.

## Specs

- **S1 — Separate lightweight app.** A new `apps/landing` workspace app built with Astro (user: "No crees q sería mejor usar algo más liviano para una landing, como astro?"). Static output, React only for interactive islands. It does not touch `apps/web` routing, the auth proxy or `isPublicPath`.
- **S2 — Design line.** The skill drives layout and visual rules, with numa overrides: Inter, Hugeicons (user: "Pero numa gana lo q dices, me la pela q la skill diga q no se use Inter"). Share numa's values (colors, radius, font, indigo accent) but do not carry shadcn's component look. User, verbatim: "queremos seguir un poco el estilo de numa pero más bien me refiero a tener una similitud y simetría en tema de border radius, colores… es decir, usamos los primitivos de packages ui si consideras, pero q no acoplemos los estilos marcados de shadcn si la skill de la landing no lo necesita o requiere."
- **S3 — Hero (rewritten 2026-10-31, see L8).** Minimal hero in the style of inspiration images 13 and 17 (`apps/web/design/inspiration/elaya/img13.png`, `img17.gif`): the floating island fills the stage, unobstructed, on the right; copy on the left (badge, headline, subtitle, two buttons); a row of real facts at the bottom left; a minimal transparent nav. User: "quitamos composer, quitamos eso q tapa nuestro mundo, tiene q ser minimalista y q entre por los ojos." The island itself stays as is ("el template de la isla me flipa").
- **S4 — No composer.** The composer is dropped everywhere (user: "la idea del composer la descartamos totalmente, no me convence"). Calls to action link to the app's sign-in.
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
| T6 | S3, S4 | inline | done (checked in Chrome at 1440: rest, mid dive, exit) | 805a02b |
| T7 | S2 | inline | done (build OK, checked in Chrome) | 913ec32 |
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
- **L8 (2026-10-31), user:** "ostia, ps el hero no me gusta nada jaja. la idea del composer la descartamos totalmente, no me convence. necesito algo mas como la image 13 o 17 de inspiration: quitamos composer, quitamos eso q tapa nuestro mundo, tiene q ser minimalista y q entre por los ojos. despues hay q hacer muchos cambios mas, pero creo q es una buena base ni q sea. pero el hero, cambio de chip totalmente lo q te digo" / "o sea el template de la isla me flipa ee, no me gusta todo lo demas q lo rodea digamos". S3 and S4 rewritten; T6 opened.
- **L9:** T6: composer removed everywhere (Composer.astro deleted, copy keys dropped). Hero is copy left, island right via a horizontal view offset, stats row of real facts, transparent nav over the sky that gains a blurred surface past the hero. Dive softened so it stays on the island top.
- **L10 (2026-10-31), user:** "ahora sii esta mucho mejorr!! siguiente paso: botones primitivos porfavor!! no estas usando el button de la lib, son todos custom por lo q veo. usa el de la lib. veo q son de 40px de alto, o sea q podrias usar size lg. los primarios, pues variant default. el boton custom blanco me gusta, lo podemos dejar pq en shdcn en dark theme no hay una equivalencia de boton de color blanco, sabes? pero vaya, usa el primitivo de button de shadcn"
- **L11:** T7: `@workspace/ui` `Button` rendered through `LinkButton.tsx` (`nativeButton={false}`, `render={<a />}`, as in `apps/web/components/upgrade-card.tsx`). `@astrojs/react` added for build time rendering only: no `client:*` directive, the React client chunk is emitted but no page loads it. Primary actions `variant="default"`, secondary `variant="secondary"`, all `size="lg"`, which is `h-9` (36px), not 40px as assumed. White custom buttons kept on the Free and Max pricing cards. Tailwind scans `packages/ui/src/components/button.tsx` via `@source`; secondary, destructive and input tokens mirrored. Dark primary corrected to numa's own value. `.scene-light` keeps light tokens on the sky scenes and the nav over the hero.
