# JSFL API Inventory

This file is the initial inventory for the first `jsfl-lsp` milestones.
It is intentionally incomplete and focuses on the global roots and object families
needed for diagnostics, future completion, and hover support.

## Notes

- Return types are approximate and should be refined as real examples are collected.
- `Document`, `Timeline`, `Library`, `Layer`, `Frame`, and `Element` are listed as object families.
  They are usually reached from `fl.getDocumentDOM()` rather than as direct globals.
- Source links are included so the inventory can be expanded against documented behavior
  instead of guesswork.

## Root Globals

| Name | Kind | Description | Representative members | Return type estimate | Source |
| --- | --- | --- | --- | --- | --- |
| `fl` | global object | Main JSFL host entrypoint for the Animate application. | `getDocumentDOM()`, `trace()`, `outputPanel`, `browseForFileURL()` | `fl.getDocumentDOM()` -> `Document \| null` | Adobe Extending Flash / Animate reference PDF, Adobe Animate help |
| `FLfile` | global object | File-system helper used by JSFL scripts. | `exists()`, `read()`, `write()`, `remove()` | Boolean/string depending on method | Adobe Extending Flash / Animate reference PDF |
| `MMExecute` | global function | Bridge function commonly used by panels/extensions to execute JSFL. | `MMExecute("fl.trace('...')")` | `string` result in many host integrations | Adobe extension and panel documentation |

## Object Families

| Name | Kind | Description | Representative members | Return type estimate | Source |
| --- | --- | --- | --- | --- | --- |
| `Document` | object family | Current Animate document DOM returned from `fl.getDocumentDOM()`. | `getTimeline()`, `library`, `selection`, `name` | `getTimeline()` -> `Timeline`; `library` -> `Library` | Adobe Extending Flash / Animate reference PDF |
| `Timeline` | object family | Timeline state for the active document or symbol. | `currentFrame`, `layers`, `insertFrames()`, `setSelectedLayers()` | `layers` -> `Layer[]` | Adobe Extending Flash / Animate reference PDF |
| `Library` | object family | Symbol/library access for the current document. | `items`, `addItemToDocument()`, `editItem()` | `items` -> `LibraryItem[]` | Adobe Extending Flash / Animate reference PDF |
| `Layer` | object family | Layer model inside a timeline. | `frames`, `locked`, `visible`, `name` | `frames` -> `Frame[]` | Adobe Extending Flash / Animate reference PDF |
| `Frame` | object family | Frame-level state inside a layer. | `elements`, `startFrame`, `duration`, `labelType` | `elements` -> `Element[]` | Adobe Extending Flash / Animate reference PDF |
| `Element` | object family | Stage element selected from frames or document selection. | `x`, `y`, `width`, `height`, `name` | numeric/string members | Adobe Extending Flash / Animate reference PDF |
| `Selection` | object family | Convenience label for the current `Document.selection` list. | array-like access to selected `Element` instances | `Element[]` | Adobe Extending Flash / Animate reference PDF |

## Initial Diagnostic Focus

These are the symbols the v0 analyzer is aware of directly:

- Known JSFL root globals: `fl`, `FLfile`, `MMExecute`
- Document access pattern: `fl.getDocumentDOM()`
- Derived object families for future completion/hover: `Document`, `Timeline`, `Library`, `Layer`, `Frame`, `Element`, `Selection`

Anything outside this set should be treated as "unknown to v0" until the inventory is extended.

## Source Links

- Adobe Animate Learn & Support: <https://helpx.adobe.com/animate.html>
- Adobe Animate universal document converter example: <https://helpx.adobe.com/animate/using/universal-document-type-converter.html>
- Adobe Animate archived reference PDF: <https://helpx.adobe.com/archive/en/animate/cc/2015/animate_reference.pdf>
- Adobe Flash/Animate extensibility reference PDF archive: <https://help.adobe.com/archive/en_US/flash/cs5/flash_cs5_extending.pdf>
