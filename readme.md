# Custom Document Well for Visual Studio Code

## About
A replication a subset of Visual Studio's (discontinued)
[Custom Document Well](https://marketplace.visualstudio.com/items?itemName=VisualStudioPlatformTeam.CustomDocumentWell)
plugin.

The standard VS Code extension API does not support this style of modification,
this is instead done by direct DOM manipulation. This causes **an additional
installation step to be required.** See [Installation](#installation).

**Note:** Only the side bar being on the left is supported at this time.

Supported functionality:
* Vertical tabs (left side only at present).
* Sort and colorize by project.
* Sort by file type.

## Installation
1. Install the VS Code extension.
2. `View` -> `Command Palette`, "Install Custom Document Well" `{enter}`
3. Restart VS Code. **It may need to be restarted as an administrator!** See notes for [Custom CSS and JS Loader](https://marketplace.visualstudio.com/items?itemName=be5invis.vscode-custom-css)

Alternatively, this can be more easily run non-persistant on a single instance:
1. Open developer tools in VS Code: `Help` -> `Toggle Developer Tools`
2. Paste the contents of [customdocumentwell.js](https://github.com/jlennox/VSCode-CustomDocumentWell/blob/master/out/customdocumentwell.js) into the Console. Press enter.

## Development
1. Clone
2. Enter the project directory in `cmd.exe` or equivalent.
3. Enter tsc's watch with `node "C:\Program Files (x86)\Microsoft SDKs\TypeScript\3.7\tsc.js" --watch` or equivalent.
4. Press `F5` to start debugging in VS Code.
5. Run "Install Custom Document Well" command if not yet run. Only needs to be done once.

Alternatively, it can be loaded by pasting the .js into the developer console,
which can be easier for rapid development and when introducing potentionally
view breaking bugs.

## Remaining work/rough corners.

The vertical tabs can not be repositioned or resized. It's always on the left
and always 300px wide.

This was not done as a PR to VS Code because the changes and features are
personal and unlikely to be intune with the intended VS Code product direction.

## Screenshots

![Screenshot](/screenshots/sample-screenshot-a.png?raw=true)

![Screenshot](/screenshots/sample-screenshot-b.png?raw=true)