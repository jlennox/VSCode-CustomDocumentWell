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

interface Error
{
    code?: string;
    stack?: string;
}

import * as vscode from 'vscode';
import path = require("path");
import events = require("events");
import fs = require("fs");
import { messages as msg } from "./messages";

export function activate(context: vscode.ExtensionContext): void
{
    process.on("uncaughtException", (error: Error): void =>
    {
        if (/ENOENT|EACCES|EPERM/.test(error.code || ""))
        {
            vscode.window.showInformationMessage(msg.admin);
            return;
        }
    });

    const eventEmitter = new events.EventEmitter();
    const appPath = require?.main?.filename;

    if (!appPath)
    {
        console.error("Custom Document Well: Unable to locate application path.");
        return;
    }

    const appDir = path.dirname(appPath);
    const base = path.join(appDir, "vs", "code");
    const htmlFile = path.join(base, "electron-browser", "workbench", "workbench.html");
    const htmlFileBack = path.join(base, "electron-browser", "workbench", "workbench.bak-cdw");

    function replaceCss()
    {
        mutateFile((contents: string) =>
        {
            contents = removeInjectedHtml(contents);
            return injectHtml(contents);
        });
    }

    function removeInjectedHtml(contents: string): string
    {
        return contents.replace(
            /<!-- !! VSCODE-CDW-START !! -->[\s\S]*?<!-- !! VSCODE-CDW-END !! -->/,
            "");
    }

    function injectHtml(contents: string): string
    {
        const config = vscode.workspace.getConfiguration("custom_document_well");
        let cdwPath = path.join(__dirname, "customdocumentwell.js");

        if (path.sep === "\\")
        {
            cdwPath = cdwPath.replace(/\\/g, "/");
        }

        const injectHTML = `
			<span id="__hack_cdw_config" style="display: none;">${encodeURI(JSON.stringify(config))}</span>
			<script src="file:///${cdwPath}" type="application/javascript"></script>`;

        return contents.replace(
            "</html>",
            `<!-- !! VSCODE-CDW-START !! -->${injectHTML}<!-- !! VSCODE-CDW-END !! --></html>`);
    }

    function mutateFile(cb: (contents: string) => string): void
    {
        try
        {
            const originalHtml = fs.readFileSync(htmlFile, "utf-8");
            const html = cb(originalHtml);

            if (originalHtml == html) return;

            fs.writeFileSync(htmlFile, html, "utf-8");
            enabledRestart();
        }
        catch (e)
        {
            console.log(e);
        }
    }

    function timeDiff(d1: Date, d2: Date): number
    {
        return Math.abs(d2.getTime() - d1.getTime());
    }

    function hasBeenUpdated(stats1: fs.Stats, stats2: fs.Stats): boolean
    {
        const dbak = new Date(stats1.ctime);
        const dor = new Date(stats2.ctime);
        const segs = timeDiff(dbak, dor) / 1000;
        return segs > 60;
    }

    function cleanCssInstall(): void
    {
        const c = fs
            .createReadStream(htmlFile)
            .pipe(fs.createWriteStream(htmlFileBack));
        c.on("finish", function ()
        {
            replaceCss();
        });
    }

    function installItem(bakfile: string, orfile: string, cleanInstallFunc: any): void
    {
        fs.stat(bakfile, function (errBak, statsBak)
        {
            //if (errBak)
            {
                // clean installation
                cleanInstallFunc();
              //  return;
            }

            // check htmlFileBack's timestamp and compare it to the htmlFile's.
            fs.stat(orfile, function (errOr, statsOr)
            {
                if (errOr)
                {
                    vscode.window.showInformationMessage(msg.smthingwrong + errOr);
                    return;
                }

                var updated = hasBeenUpdated(statsBak, statsOr);
                if (updated)
                {
                    // some update has occurred. clean install
                    cleanInstallFunc();
                }
            });
        });
    }

    function emitEndUninstall(): void
    {
        eventEmitter.emit("endUninstall");
    }

    function restoredAction(isRestored: number, willReinstall: boolean): void
    {
        if (isRestored >= 1)
        {
            if (willReinstall)
            {
                emitEndUninstall();
            } else
            {
                disabledRestart();
            }
        }
    }

    function restoreBak(willReinstall: boolean = false): void
    {
        var restore = 0;
        fs.unlink(htmlFile, function (err)
        {
            if (err)
            {
                vscode.window.showInformationMessage(msg.admin);
                return;
            }
            var c = fs
                .createReadStream(htmlFileBack)
                .pipe(fs.createWriteStream(htmlFile));
            c.on("finish", function ()
            {
                fs.unlinkSync(htmlFileBack);
                restore++;
                restoredAction(restore, willReinstall);
            });
        });
    }

    function reloadWindow(): void
    {
        // reload vscode-window
        vscode.commands.executeCommand("workbench.action.reloadWindow");
    }

    function enabledRestart(): void
    {
        vscode.window
            .showInformationMessage(msg.enabled, { title: msg.restartIde })
            .then(function (msg)
            {
                reloadWindow();
            });
    }

    function disabledRestart(): void
    {
        vscode.window
            .showInformationMessage(msg.disabled, { title: msg.restartIde })
            .then(function (msg)
            {
                reloadWindow();
            });
    }

    // ####  main commands ######################################################

    function fInstall(): void
    {
        installItem(htmlFileBack, htmlFile, cleanCssInstall);
    }

    function fUninstall(willReinstall: boolean = false): void
    {
        fs.stat(htmlFileBack, function (errBak, statsBak)
        {
            if (errBak)
            {
                if (willReinstall)
                {
                    emitEndUninstall();
                }
                return;
            }

            fs.stat(htmlFile, function (errOr, statsOr)
            {
                if (errOr)
                {
                    vscode.window.showInformationMessage(msg.smthingwrong + errOr);
                    return;
                }

                restoreBak(willReinstall);
            });
        });
    }

    function fUpdate(): void
    {
        eventEmitter.once("endUninstall", fInstall);
        fUninstall(true);
    }

    context.subscriptions.push(vscode.commands.registerCommand(
        "extension.installCustomDocumentWell", fInstall
    ));
    context.subscriptions.push(vscode.commands.registerCommand(
        "extension.uninstallCustomDocumentWell", fUninstall
    ));
    context.subscriptions.push(vscode.commands.registerCommand(
        "extension.updateCustomDocumentWell", fUpdate
    ));
}

// this method is called when your extension is deactivated
export function deactivate() { }
