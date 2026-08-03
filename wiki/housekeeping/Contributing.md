# Contributing to the Wiki

## Adding a recipe
1. Copy `Templates/Recipe-Template.md` into `<beverage>/recipes/` (e.g. `beer/recipes/`).
2. Name the file `<Style>-<Your Name>.md`, e.g. `American-IPA-Dan.md`.
3. Fill in the frontmatter and ingredient tables — see the template's comment for units (kg for fermentables, g for hops/misc, L for volumes, °C for temperatures).
4. Link `style:` to the relevant style page (BJCP style under `beer/bjcp-styles/`, or the equivalent `styles/` page for cider/mead/wine).
5. If the recipe was brewed for a club event or entered in a competition, link `event:` to its page under `competitions/`, and add the recipe to that event's entrant table too.
6. Got a BeerXML export from BeerSmith/Brewer's Friend instead? Run `node housekeeping/Tools/beerxml-convert.js to-md <file.xml>` to generate a starting page, then fill in `style`/`event` by hand (see `Tools/beerxml-README.md`).

## Adding a topic page
1. Copy `Templates/Topic-Template.md` into the right `<beverage>/topics/<Category>/` folder.
2. Set `difficulty` and `beverage` in the frontmatter (see `Tag-Reference.md` for allowed values).
3. Link it from that category's index (or the nearest existing page) so it's reachable from `Home.md`.

## Adding a competition/event page
1. Copy `Templates/Event-Template.md` into `competitions/club-events/` or `competitions/external-competitions/`.
2. Fill in the entrant table, linking each row to the brewer's recipe page.
3. Have entrants add `event:`/`placement:` back on their own recipe pages.

## Naming conventions
- Folders: lowercase-hyphenated (`bjcp-styles`, `club-events`).
- Pages: `Title-Case-With-Hyphens.md`.
- Keep frontmatter keys and values consistent with `Tag-Reference.md` so filtered views (Obsidian Bases) keep working.
