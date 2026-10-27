# BACKLOG — Skills Marketplace

> Big feature, deliberately not started. Recorded 2026-10-27 so it is not forgotten.

## The idea

In the owner's words: "podriamos crear una marketplace de skills para q ofrezcamos por una parte nosotros skills preconfiguradas/hechas, de complementos interesantes a añadir (multijugador, sistema de inventario, musica x, diseño y...) o incluso poder metirle al usuario crear sus propias skills".

And on timing: "es algo grande y complejo q no me parece q se debe de abrir ahora ese melon, pero lo apuntamos en GRANDE para q lo hagamos y no se me olvide".

Two halves:

1. **Curated skills** we ship: player-facing add-ons such as local multiplayer, an inventory system, a music style, a design style.
2. **User-authored skills**: players write their own and use them in their games.

Players would reference a skill from the chat composer with `@`, the same way they mention files today (`feat/composer-mentions`).

## Where things stand today

- The existing skills are internal engine documentation for the agent, not for players: `apps/web/lib/games/skills/` (`engine-core`, `engine-utils`, `engine-movement`, `engine-scene`, `engine-feedback`, `engine-audio`, `engine-systems`, `engine-reference`), registered in `registry.ts` as TS modules.
- The agent receives them three ways: role defaults inlined in instructions, per-task extras chosen by the orchestrator (`TaskSpec.skills`, `mergeSkills`), and the `load_skill` tool (orchestrator in `trigger/chat.ts`, and workers).
- `SkillName` is a closed union and the registry is in code, so a marketplace means moving skills to data (database or storage), not adding files.

## Pieces it will need (first sketch, not decided)

- Skill storage and versioning outside the code registry, keeping the internal engine skills separate.
- A catalogue UI: browse, preview, install into a game or account.
- An authoring flow for user skills, with limits on size and content.
- Composer `@` mentions for skills: a "Skills" section in the mention list, a distinct chip, and message metadata (`skills: [...]`) that `trigger/chat.ts` forces into the turn's context and the dispatched tasks, rather than relying on the model to call `load_skill`.
- Safety: a user skill is text injected into the agent's prompt, so it is a prompt-injection surface and needs review or sandboxing rules, especially if skills can be shared between users.
- Pricing and ownership, if curated skills are a paid add-on.
