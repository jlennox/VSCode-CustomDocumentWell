"use strict";
// The MIT License(MIT)
//
// Copyright(c) 2016 Roberto Huertas
// Copyright(c) 2016 Belleve Invis
// https://github.com/be5invis/vscode-custom-css
// https://github.com/be5invis/vscode-custom-css/blob/master/LICENSE.txt
//
// Modifications:
// The MIT License(MIT)
// Copyright(c) 2020 Joseph Lennox
Object.defineProperty(exports, "__esModule", { value: true });
const vscode = require("vscode");
const path = require("path");
const events = require("events");
const fs = require("fs");
const messages_1 = require("./messages");
function activate(context) {
    var _a;
    process.on("uncaughtException", (error) => {
        if (/ENOENT|EACCES|EPERM/.test(error.code || "")) {
            vscode.window.showInformationMessage(messages_1.messages.admin);
            return;
        }
    });
    const eventEmitter = new events.EventEmitter();
    const appPath = (_a = require === null || require === void 0 ? void 0 : require.main) === null || _a === void 0 ? void 0 : _a.filename;
    if (!appPath) {
        console.error("Custom Document Well: Unable to locate application path.");
        return;
    }
    const appDir = path.dirname(appPath);
    const base = path.join(appDir, "vs", "code");
    const htmlFile = path.join(base, "electron-browser", "workbench", "workbench.html");
    const htmlFileBack = path.join(base, "electron-browser", "workbench", "workbench.bak-cdw");
    function replaceCss() {
        mutateFile((contents) => {
            contents = removeInjectedHtml(contents);
            return injectHtml(contents);
        });
    }
    function removeInjectedHtml(contents) {
        return contents.replace(/<!-- !! VSCODE-CDW-START !! -->[\s\S]*?<!-- !! VSCODE-CDW-END !! -->/, "");
    }
    function injectHtml(contents) {
        const config = vscode.workspace.getConfiguration("custom_document_well");
        let cdwPath = path.join(__dirname, "customdocumentwell.js");
        if (path.sep === "\\") {
            cdwPath = cdwPath.replace(/\\/g, "/");
        }
        const injectHTML = `
			<script>window.__hack_cdw_config = ${JSON.stringify(config)};</script>
			<script src="file:///${cdwPath}"></script>`;
        return contents.replace("</html>", `<!-- !! VSCODE-CDW-START !! -->${injectHTML}<!-- !! VSCODE-CDW-END !! --></html>`);
    }
    function mutateFile(cb) {
        try {
            const originalHtml = fs.readFileSync(htmlFile, "utf-8");
            const html = cb(originalHtml);
            if (originalHtml == html)
                return;
            fs.writeFileSync(htmlFile, html, "utf-8");
            enabledRestart();
        }
        catch (e) {
            console.log(e);
        }
    }
    function timeDiff(d1, d2) {
        return Math.abs(d2.getTime() - d1.getTime());
    }
    function hasBeenUpdated(stats1, stats2) {
        const dbak = new Date(stats1.ctime);
        const dor = new Date(stats2.ctime);
        const segs = timeDiff(dbak, dor) / 1000;
        return segs > 60;
    }
    function cleanCssInstall() {
        const c = fs
            .createReadStream(htmlFile)
            .pipe(fs.createWriteStream(htmlFileBack));
        c.on("finish", function () {
            replaceCss();
        });
    }
    function installItem(bakfile, orfile, cleanInstallFunc) {
        fs.stat(bakfile, function (errBak, statsBak) {
            if (errBak) {
                // clean installation
                cleanInstallFunc();
                return;
            }
            // check htmlFileBack's timestamp and compare it to the htmlFile's.
            fs.stat(orfile, function (errOr, statsOr) {
                if (errOr) {
                    vscode.window.showInformationMessage(messages_1.messages.smthingwrong + errOr);
                    return;
                }
                var updated = hasBeenUpdated(statsBak, statsOr);
                if (updated) {
                    // some update has occurred. clean install
                    cleanInstallFunc();
                }
            });
        });
    }
    function emitEndUninstall() {
        eventEmitter.emit("endUninstall");
    }
    function restoredAction(isRestored, willReinstall) {
        if (isRestored >= 1) {
            if (willReinstall) {
                emitEndUninstall();
            }
            else {
                disabledRestart();
            }
        }
    }
    function restoreBak(willReinstall = false) {
        var restore = 0;
        fs.unlink(htmlFile, function (err) {
            if (err) {
                vscode.window.showInformationMessage(messages_1.messages.admin);
                return;
            }
            var c = fs
                .createReadStream(htmlFileBack)
                .pipe(fs.createWriteStream(htmlFile));
            c.on("finish", function () {
                fs.unlinkSync(htmlFileBack);
                restore++;
                restoredAction(restore, willReinstall);
            });
        });
    }
    function reloadWindow() {
        // reload vscode-window
        vscode.commands.executeCommand("workbench.action.reloadWindow");
    }
    function enabledRestart() {
        vscode.window
            .showInformationMessage(messages_1.messages.enabled, { title: messages_1.messages.restartIde })
            .then(function (msg) {
            reloadWindow();
        });
    }
    function disabledRestart() {
        vscode.window
            .showInformationMessage(messages_1.messages.disabled, { title: messages_1.messages.restartIde })
            .then(function (msg) {
            reloadWindow();
        });
    }
    // ####  main commands ######################################################
    function fInstall() {
        installItem(htmlFileBack, htmlFile, cleanCssInstall);
    }
    function fUninstall(willReinstall = false) {
        fs.stat(htmlFileBack, function (errBak, statsBak) {
            if (errBak) {
                if (willReinstall) {
                    emitEndUninstall();
                }
                return;
            }
            fs.stat(htmlFile, function (errOr, statsOr) {
                if (errOr) {
                    vscode.window.showInformationMessage(messages_1.messages.smthingwrong + errOr);
                    return;
                }
                restoreBak(willReinstall);
            });
        });
    }
    function fUpdate() {
        eventEmitter.once("endUninstall", fInstall);
        fUninstall(true);
    }
    context.subscriptions.push(vscode.commands.registerCommand("extension.installCustomDocumentWell", fInstall));
    context.subscriptions.push(vscode.commands.registerCommand("extension.uninstallCustomDocumentWell", fUninstall));
    context.subscriptions.push(vscode.commands.registerCommand("extension.updateCustomDocumentWell", fUpdate));
}
exports.activate = activate;
// this method is called when your extension is deactivated
function deactivate() { }
exports.deactivate = deactivate;
//# sourceMappingURL=extension.js.map