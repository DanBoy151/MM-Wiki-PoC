## `beerxml-convert.js`

Converts recipe pages (built from `../Templates/Recipe-Template.md`) to and from [BeerXML](http://www.beerxml.com/) 1.0, so recipes can move in and out of BeerSmith, Brewer's Friend, BeerXML.com, etc. Plain Node.js, zero dependencies — nothing to `npm install`.

### Usage

From this folder (or with a full path to the script):

```
node beerxml-convert.js to-xml <recipe.md> [out.xml]
node beerxml-convert.js to-md  <recipe.xml> [out.md]
```

- `to-xml` reads a filled-in recipe page, resolves its `style:` wikilink against the style library (e.g. `beer/bjcp-styles/`) to build the BeerXML `STYLE` block, and writes a `<RECIPES><RECIPE>…` file. If `out.xml` is omitted it's written next to the input.
- `to-md` reads a BeerXML file's first `<RECIPE>` and writes a new wiki recipe page in the same shape as `Recipe-Template.md`. The `style`, `event`, and `placement` fields have no BeerXML equivalent, so they're left blank — fill them in by hand after import.

### Example

```
node beerxml-convert.js to-xml "../../beer/recipes/My-Saison.md"
node beerxml-convert.js to-md  "~/Downloads/Club-IPA.xml" "../../beer/recipes/Club-IPA.md"
```

### Field mapping and known limitations

See `../BeerXML-Mapping.md` for the full field-by-field mapping and the list of BeerXML fields that aren't modeled (equipment/water profiles, a handful of rarely-used optional fields).
