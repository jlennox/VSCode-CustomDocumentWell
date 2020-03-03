# Custom Document Well for Visual Studio Code

## About
This replicates a subset of Visual Studio's (discontinued)
[Custom Document Well](https://marketplace.visualstudio.com/items?itemName=VisualStudioPlatformTeam.CustomDocumentWell)
plugin.

Supported functionality:
* Vertical tabs (left side only at present).
* Sort and colorize by project.
* Sort by file type.

## Installation
1. Install [Custom CSS and JS Loader](https://marketplace.visualstudio.com/items?itemName=be5invis.vscode-custom-css)
2. Clone this repository or download from Releases.
3. Modify the `vscode_custom_css.imports` setting to point to `customdocumentwell.js`, ie:
```
"vscode_custom_css.imports": ["file:///C:/code/VSCode-CustomDocumentWell/src/customdocumentwell.js"],
```
4. Reload Custom JS: `View` -> `Command Palette`, "Reload Custom CSS and JS" `{enter}`
> **Note:** Custom CSS and JS may need special permissions on first reload if VSCode is not in a user writable directory. See the plugin page for more details.
5. Restart Visual Studio Code.

Alternatively, this can be more easily run non-persistant on a single instance:
1. Open developer tools in VS Code: `Help` -> `Toggle Developer Tools`
2. Paste the contents of [customdocumentwell.js](/src/customdocumentwell.js) into the Console. Press enter.

## Development
1. Clone
2. Enter the "src" directory in cmd.exe or equivalent.
3. Enter tsc's watch with `node "C:\Program Files (x86)\Microsoft SDKs\TypeScript\3.7\tsc.js" --watch` or equivalent.
4. Enter "Reload Custom CSS and JS" command and restart Visual Studio Code to update the source.

Alternatively, it can be loaded by pasting the .js into the developer console,
which can be easier for rapid development and when introducing potentionally
view breaking bugs.

## Remaining work/rough corners.

There appears to be no way to read VSCode's config from imported JavaScript. To
change options modify the property initializing values on `VSCodeSideTabsOptions`.

The vertical tabs can not be repositioned or resized. It's always on the left
and always 300px.

If there's serious interest in this project, those issues, as well as making it
a stand alone Visual Studio Code plugin are possible.

This was not done as a PR to Visual Studio Code because the changes and features
are very personal and likely more than they'd be willing to accept into the main
branch.

## Screenshots

![Screenshot](/screenshots/sample-screenshot-a.png?raw=true)

![Screenshot](/screenshots/sample-screenshot-b.png?raw=true)