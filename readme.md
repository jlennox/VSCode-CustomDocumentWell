# VSCode Custom Document Well

## About
This replicates a subset of Visual Studio's (discontinued)
[Custom Document Well](https://marketplace.visualstudio.com/items?itemName=VisualStudioPlatformTeam.CustomDocumentWell)
plugin.

Supported functionality:
* Left side docking.
* Sort and colorize by project.
* Sort by file type.

## Installation
1. Install [Custom CSS and JS Loader](https://marketplace.visualstudio.com/items?itemName=be5invis.vscode-custom-css)
2. Clone this repository.
3. Modify the `vscode_custom_css.imports` setting to point to `customdocumentwell.js`, ie:
```
"vscode_custom_css.imports": ["file:///C:/code/VSCode-CustomDocumentWell/src/customdocumentwell.js"],
```
4. Restart Visual Studio Code.

Alternatively, this can be more easily run non-persistant on a single instance:
1. Open developer tools in VS Code: `Help` -> `Toggle Developer Tools`
2. Paste the contents of `customdocumentwell.js` into the Console. Press enter.

## Development
1. Clone
2. Enter the "src" directory in cmd.exe or equivalent.
3. Enter tsc's watch with `node "C:\Program Files (x86)\Microsoft SDKs\TypeScript\3.7\tsc.js" --watch` or equivalent.
4. Reload Visual Studio Code when changed. Most easily done with `F5` in the Developer Tools.

## Remaining work/rough corners.

There appears to be no way to read VSCode's config from imported JavaScript. To
change options modify the property initializing values on `VSCodeSideTabsOptions`.

The tab container can not be repositioned or resized. It's always on the left
and always 300px.

If there's serious interest in this project, those issues, as well as making it
a stand alone Visual Studio Code plugin are possible.

This was not done as a PR to Visual Studio Code because the changes and features
are very personal and likely more than they'd be willing to accept into the main
branch.

## Screenshots

![Screenshot](/screenshots/sample-screenshot-a.png?raw=true)

![Screenshot](/screenshots/sample-screenshot-b.png?raw=true)