// MIT License
// Copyright(c) 2020 Joseph Lennox

namespace VSCodeSideTabs
{
    interface ITabDescription
    {
        realTab: HTMLElement;
        newTab: HTMLElement;
        isActive: boolean;
        text: string | null;
        project: string | null;
        path: string;
        disposables: IDisposableFn[];
        tabType: string;
    }

    interface IDisposableFn
    {
        (): void;
    }

    interface IVSCodeSideTabsOptions
    {
        colorByProject: boolean;
        sortByFileType: boolean;
        sortByProject: boolean;
        brightenActiveTab: boolean;
        compactTabs: boolean;
        projectExpr: RegExp;
    }

    class VSCodeSideTabsOptions implements IVSCodeSideTabsOptions
    {
        public colorByProject: boolean = true;
        public sortByFileType: boolean = true;
        public sortByProject: boolean = true;
        public brightenActiveTab: boolean = true;
        public compactTabs: boolean = true;
        public projectExpr: RegExp = /([^\w]|^)src[/\\].+?[/\\]/i;

        private projectColors: {[name: string]: string } = {};
        private projectCount: number = 0;

        private static colors: string[] = [
            "#8DA3C1", "#9D827B", "#C1AA66", "#869A87", "#C97E6C",
            "#617595", "#846A62", "#887E5C", "#607562", "#BA5E41",
            "#3D5573", "#694F47", "#696658", "#425E45" ];

        public extend(options: Partial<IVSCodeSideTabsOptions> | null): VSCodeSideTabsOptions
        {
            if (options == null) return this;

            return { ...this, ...options };
        }

        public getColorForProject(projectName: string | null): string
        {
            const key = (projectName || "unknown").toUpperCase();
            const knownColor = this.projectColors[key];
            if (knownColor !== undefined) return knownColor;

            const colors = VSCodeSideTabsOptions.colors;
            const color = colors[this.projectCount++ % colors.length];
            this.projectColors[key] = color;
            return color;
        }
    }

    class VSCodeSideTabs
    {
        private readonly currentTabs: ITabDescription[] = [];
        private realTabsContainers: NodeListOf<HTMLElement>;
        private newContainerDest: HTMLElement | null = null;
        private readonly tabChangeObserver: MutationObserver;
        private readonly newTabContainer: HTMLElement;
        private readonly sideTabSizePx = 300;
        private readonly sideTabSize = `${this.sideTabSizePx}px`;
        private readonly cssRuleRewriter: CssRuleRewrite;
        private readonly options = new VSCodeSideTabsOptions();
        private hasStolenTabContainerInfo: boolean = false;
        private readonly tabSort: TabSort;

        public constructor(
            options: Partial<IVSCodeSideTabsOptions> | null = null
        )
        {
            this.realTabsContainers = document.querySelectorAll<HTMLElement>(
                ".tabs-and-actions-container");

            this.tabChangeObserver = new MutationObserver(() => this.reloadTabs());

            this.newTabContainer = document.createElement("div");
            this.newTabContainer.className = "hack--vertical-tab-container";
            this.newTabContainer.style.width = this.sideTabSize;
            this.newTabContainer.style.position = "absolute";
            this.newTabContainer.style.top = "0";
            this.newTabContainer.style.left = `-${this.sideTabSize}`;
            this.newTabContainer.style.overflowY = "auto";

            // The borderRightColor is updated later in `stealTabContainerInfo`
            this.newTabContainer.style.borderRightWidth = "1px";
            this.newTabContainer.style.borderRightStyle = "solid";
            this.newTabContainer.style.borderRightColor = "var(--title-border-bottom-color)";

            this.cssRuleRewriter = new CssRuleRewrite(
                "",
                /\.tab(?=\s|:|$)/,
                /(^|,).+?(\.tab(?=\s|:|$))/g,
                "$1 .hack--vertical-tab-container $2");

            this.options = this.options.extend(options);

            this.tabSort = new TabSort(this.options);
        }

        // Attach and add new elements to the DOM.
        public attach(): void
        {
            // Do not load yet if there's no tabs present.
            if (document.querySelector(".tabs-container") == null)
            {
                setTimeout(() => this.attach(), 100);
                return;
            }

            // These selectors feel far more fragile than I'd really like them to be.
            const container1 = document.querySelector(".split-view-container") as HTMLElement;

            // The new element can not be a direct child of split-view-container
            // because internally VSCode keeps a child index that is then referenced
            // back to the DOM, and this will upset the order of DOM nodes.
            const newContainerDest = (container1.querySelector(".split-view-container") as HTMLElement)
                .parentElement as HTMLElement;

            newContainerDest.classList.add("hack--container");

            // It's not present enough to load yet. Keep re-entering this method
            // until success.
            if (newContainerDest == null ||
                newContainerDest.firstChild == null)
            {
                setTimeout(() => this.attach(), 100);
                return;
            }

            this.newContainerDest = newContainerDest;

            this.reloadTabContainers();
            this.cssRuleRewriter.insertFixedTabCssRules();
            this.addCustomCssRules();

            newContainerDest.insertBefore(
                this.newTabContainer,
                newContainerDest.firstChild);

            const that = this;

            function fixNewContainer()
            {
                newContainerDest.style.marginLeft = that.sideTabSize;
            }

            fixNewContainer();

            // Monitor for anyting that may undo `fixNewContainer()`
            const newContainerObserver = new MutationObserver(() => fixNewContainer());

            newContainerObserver.observe(
                newContainerDest, {
                    attributes: true,
                    attributeFilter: ["style"]
                });

            // Monitor for tab changes. That's tabs being added or removed.
            const domObserver = new MutationObserver((mutations: MutationRecord[]) =>
            {
                for (let mut of mutations)
                {
                    for (let i = 0; i < mut.addedNodes.length; ++i)
                    {
                        if (VSCodeDom.isTabsContainer(mut.addedNodes[i]))
                        {
                            this.reloadTabContainers();
                            return;
                        }
                    }

                    for (let i = 0; i < mut.removedNodes.length; ++i)
                    {
                        if (VSCodeDom.isTabsContainer(mut.removedNodes[i]))
                        {
                            this.reloadTabContainers();
                            return;
                        }
                    }
                }
            });

            domObserver.observe(document.body, {
                subtree: true,
                childList: true
            });

            // Observe for layout events. This is the editors moving around.
            const relayoutObserver = new MutationObserver((mutations: MutationRecord[]) =>
            {
                let doLayout = false;
                for (let mut of mutations)
                {
                    if (!mut.target) continue;
                    if (mut.target.nodeType != Node.ELEMENT_NODE) continue;

                    const target = mut.target as HTMLElement;
                    const parent = target.parentElement as HTMLElement;

                    if (!Dom.hasClass(target, "split-view-view") &&
                        !Dom.hasClass(target, "content"))
                    {
                        continue;
                    }

                    if (Dom.hasClass(parent, "hack--container"))
                    {
                        doLayout = true;
                        break;
                    }

                    doLayout = true;
                    break;
                }

                if (doLayout) this.relayoutEditors();
            });

            relayoutObserver.observe(document.body, {
                attributes: true,
                attributeFilter: ["style"],
                subtree: true
            });

            this.relayoutEditors();
        }

        private addCustomCssRules(): void
        {
            const newCssRules: string[] = [];

            if (this.options.compactTabs)
            {
                newCssRules.push(`
                    body .hack--vertical-tab-container .tab {
                        height: 25px;
                    }`);
            }

            if (this.options.brightenActiveTab)
            {
                newCssRules.push(`
                    body .hack--vertical-tab-container .tab.active {
                        filter: brightness(120%);
                    }
                    body .hack--vertical-tab-container .tab.active .tab-label {
                        color: Black !important;
                        font-weight: bold;
                    }`);
            }

            if (newCssRules.length > 0)
            {
                CssRuleRewrite.insertCssRules(
                    "hack--newCssRules",
                    newCssRules.join("\r\n"));
            }
        }

        /**
         * Pass in a '.tabs-and-actions-container' element to steal the coloring
         * info from.
         *
         * Because coloring is done usually by scoped variables it has to be
         * grabbed at runtime using getComputedStyle.
         */
        private stealTabContainerInfo(realTabContainer: HTMLElement): void
        {
            if (this.hasStolenTabContainerInfo) return;
            if (!realTabContainer || !realTabContainer.parentElement) return;

            const parent = realTabContainer.parentElement;
            const backgroundColor = parent.style.backgroundColor;

            if (!backgroundColor) return;

            const aftersStyles = getComputedStyle(parent, ":after");
            const borderColor = aftersStyles.backgroundColor;

            this.newTabContainer.style.borderRightColor = borderColor;
            this.newTabContainer.style.backgroundColor = backgroundColor;

            this.hasStolenTabContainerInfo = true;
        }

        /**
         * Relayout the editors.
         *
         * Due to the presence of our vertical tabs the editors are no longer
         * properly layed out. They will be pushed too far to the right.
         *
         * VSCode determines editors widths based on `window.innerWidth`,
         * https://github.com/microsoft/vscode/blob/7e4c8c983d181cbb56c969662ead5f9a59bfd786/src/vs/base/browser/dom.ts#L414
         *
         * One possible workaround to this, would be to `window.innerWidth = 0`
         * to force this routine to use `document.body.clientWidth` which
         * could be manipulated using negative left margins.
         *
         * After experimentation, the easiest means appeared to be detecting
         * by DOM mutation events for when their relayout happens and performing
         * a new relayout immediately after.
         */
        private relayoutEditors(): void
        {
            const editors = VSCodeDom.getEditorSplitViews();
            const rightMosts: { [top: string]: {
                    el: HTMLElement,
                    left: number
                } } = {};

            // Determine the right-most editors for each editor row.
            // The right most editor on a per row basis needs its width reduced
            // by 300px.
            for (let editor of editors)
            {
                const top = editor.style.top;
                const left = editor.style.left
                    ? parseInt(editor.style.left, 10)
                    : 0;

                const existing = rightMosts[top];

                if (existing && left < existing.left) continue;

                rightMosts[top] = {
                    el: editor,
                    left: left
                };
            }

            for (let key in rightMosts)
            {
                const rightMost = rightMosts[key];

                // Panels that do not explicity set a width use an inhereted
                // width of 100%.
                if (!rightMost.el.style.width)
                {
                    rightMost.el.style.width = `calc(100% - ${this.sideTabSize})`;
                }
                else
                {
                    Dom.updateStyle(rightMost.el, "width", -this.sideTabSizePx);
                }

                // Some of the children elements also must be dynamically
                // resized.
                const children = rightMost.el.querySelectorAll(
                    ".overflow-guard, .editor-scrollable");

                for (let i = 0; i < children.length; ++i)
                {
                    Dom.updateStyle(
                        children[i] as HTMLElement, "width",
                        -this.sideTabSizePx);
                }
            }

            // If this is ever needed to work with variable side docking,
            // the placement of the dock can be determined by a class on the
            // id'd child.
            const sidebar = VSCodeDom.getSideBarSplitView();
            if (sidebar.activitybar) Dom.updateStyle(sidebar.activitybar, "left", -this.sideTabSizePx);
            if (sidebar.sidebar) Dom.updateStyle(sidebar.sidebar, "left", -this.sideTabSizePx);

            // The sashes for non-subcontainered elements must also be adjusted for.
            const sashContainer = Dom.getChildOf(this.newContainerDest, "sash-container");

            Dom.visitChildren(sashContainer, el => {
                if (Dom.hasClass(el, "monaco-sash"))
                {
                    Dom.updateStyle(el, "left", -this.sideTabSizePx);
                }
            });
        }

        private reloadTabContainers(): void
        {
            this.tabChangeObserver.disconnect();

            this.realTabsContainers = document.querySelectorAll<HTMLElement>(
                ".tabs-and-actions-container");

            for (let i = 0; i < this.realTabsContainers.length; ++i)
            {
                const realTabContainer = this.realTabsContainers[i];

                this.stealTabContainerInfo(realTabContainer);

                this.tabChangeObserver.observe(
                    realTabContainer,
                    { attributes: true, childList: true, subtree: true });
            }

            this.reloadTabs();
        }

        private reloadTabs(): void
        {
            while (this.currentTabs.length > 0)
            {
                const oldTab = this.currentTabs.pop();
                if (!oldTab) continue;
                const disposables = oldTab.disposables;
                disposables.forEach(t => t());
            }

            this.newTabContainer.innerHTML = "";

            for (let i = 0; i < this.realTabsContainers.length; ++i)
            {
                if (i > 0)
                {
                    const hr = document.createElement("hr");
                    this.newTabContainer.appendChild(hr);
                }

                this.reloadTabsForContainer(this.realTabsContainers[i]);
            }
        }

        private reloadTabsForContainer(container: HTMLElement): void
        {
            const tabs = container.querySelectorAll<HTMLDivElement>(".tab");
            const newTabs: ITabDescription[] = [];

            for (let i = 0; i < tabs.length; ++i)
            {
                const realTab = tabs[i];

                const text = realTab.textContent;
                const title = realTab.title || "";
                const isActive = realTab.classList.contains("active");
                const newTab = realTab.cloneNode(true) as HTMLElement;

                const disposables = [];

                for (let ev of Events.eventTypes.mouse)
                {
                    disposables.push(Events.forwardEvent(ev, newTab, realTab));
                }

                for (let ev of Events.eventTypes.drag)
                {
                    disposables.push(Events.forwardEvent(ev, newTab, realTab));
                }

                // Get just the file extension if present.
                const typeMatch = title.lastIndexOf(".");
                const tabType = typeMatch == -1
                    ? "unknown"
                    : title.substr(typeMatch + 1);

                let project: string | null = null;

                if (this.options.colorByProject || this.options.sortByProject)
                {
                    const projectResult = this.options.projectExpr.exec(title);
                    project = projectResult ? projectResult[0] : null;
                }

                if (this.options.colorByProject)
                {
                    // If the tab is active and brightening is disabled, do
                    // not change the background color so that the active
                    // tab color is used instead.
                    if (!isActive || this.options.brightenActiveTab)
                    {
                        newTab.style.backgroundColor = this.options
                            .getColorForProject(project);
                    }
                }

                newTabs.push({
                    realTab: realTab,
                    newTab: newTab,
                    isActive: isActive,
                    text: text,
                    project: project,
                    path: title,
                    disposables: disposables,
                    tabType: tabType.toUpperCase()
                });
            }

            const sorted = newTabs.sort((a, b) => this.tabSort.sort(a, b))

            for (let tabInfo of sorted)
            {
                this.newTabContainer.appendChild(tabInfo.newTab);
                this.currentTabs.push(tabInfo);
            }
        }
    }

    class Events
    {
        public static readonly eventTypes = {
            mouse: ["click", "mousedown", "mouseup", "contextmenu"],
            drag: ["drag", "dragend", "dragenter", "dragexit", "dragleave", "dragover", "dragstart", "drop"]
        };

        private static createDisposableEvent(
            eventType: string,
            element: HTMLElement,
            handler: any): IDisposableFn
        {
            element.addEventListener(eventType, handler);

            return () => element.removeEventListener(eventType, handler);
        }

        public static forwardEvent(
            eventType: string,
            source: HTMLElement,
            destination: HTMLElement): IDisposableFn
        {
            function getActualDestination(
                destination: HTMLElement, e: Event): HTMLElement
            {
                // This attempts to locate the same child of the destination as
                // the event was triggered on in our synthetic DOM. This isn't
                // the most accurate method but it should be good enough.
                const targetElement = e.target as HTMLElement;
                if (!targetElement || !targetElement.className)
                {
                    return destination;
                }

                const querySelector = "." + targetElement.className.replace(/ /g, '.');
                return destination.querySelector<HTMLElement>(querySelector) || destination;
            }

            if (Events.eventTypes.mouse.indexOf(eventType) != -1)
            {
                return Events.createDisposableEvent(eventType, source, (e: MouseEvent) =>
                {
                    const mouseEvent = document.createEvent("MouseEvents");
                    mouseEvent.initMouseEvent(e.type, true, true,
                        <Window>e.view, e.detail, e.screenX, e.screenY,
                        e.clientX, e.clientY, e.ctrlKey, e.altKey,
                        e.shiftKey, e.metaKey, e.button, e.relatedTarget);
                    const actualDest = getActualDestination(destination, e);

                    // This feels very much like play stupid games win stupid
                    // prizes. If these events are synthetically generated
                    // in real time, then their dispatching causes the "click"
                    // event to never trigger. The tabs themselves detect clicks
                    // via mousedown/mouseup. The close button requires "click".
                    if ((e.type == "mousedown" || e.type == "mouseup") &&
                        Dom.isChildOf(e.target as HTMLElement, "tab-close"))
                    {
                        setTimeout(() => actualDest.dispatchEvent(mouseEvent), 500);
                    }
                    else
                    {
                        actualDest.dispatchEvent(mouseEvent);
                    }
                });
            }

            if (Events.eventTypes.drag.indexOf(eventType) != -1)
            {
                return Events.createDisposableEvent(eventType, source, (e: DragEvent) =>
                {
                    const dragEvent = new DragEvent(e.type, {
                        altKey: e.altKey, button: e.button, buttons: e.buttons,
                        clientX: e.clientX, clientY: e.clientY,
                        ctrlKey: e.ctrlKey, metaKey: e.metaKey,
                        movementX: e.movementX, movementY: e.movementY,
                        offsetX: e.offsetX, offsetY: e.offsetY,
                        pageX: e.pageX, pageY: e.pageY,
                        relatedTarget: e.relatedTarget,
                        screenX: e.screenX, screenY: e.screenY,
                        shiftKey: e.shiftKey, x: e.x, y: e.y,
                        dataTransfer: e.dataTransfer
                    } as DragEventInit);
                    const actualDest = getActualDestination(destination, e);
                    actualDest.dispatchEvent(dragEvent);
                });
            }

            return Events.createDisposableEvent(eventType, source, (e: Event) =>
            {
                const event = document.createEvent("Event");
                event.initEvent(e.type, true, true);
                const actualDest = getActualDestination(destination, e);
                actualDest.dispatchEvent(event);
            });
        }
    }

    class VSCodeDom
    {
        /**
         * Returns the ".split-view-view" container for each code editor.
         */
        public static getEditorSplitViews(): HTMLElement[]
        {
            const results: HTMLElement[] = [];
            const instances = document.querySelectorAll<HTMLElement>(
                ".editor-instance,[id=workbench\\.parts\\.panel]");

            for (let i = 0; i < instances.length; ++i)
            {
                const instance = instances[i];
                const splitView = Dom.getParentOf(instance, "split-view-view");
                if (splitView == null) continue;
                results.push(splitView);
            }

            return results;
        }

        public static getSideBarSplitView(): {
            sidebar: HTMLElement | null
            activitybar: HTMLElement | null
        }
        {
            const sidebar = document.getElementById("workbench.parts.sidebar");
            const activitybar = document.getElementById("workbench.parts.activitybar");

            return {
                sidebar: Dom.getParentOf(sidebar, "split-view-view"),
                activitybar: Dom.getParentOf(activitybar, "split-view-view")
            }
        }

        // This feels more expensive than I'd like to run on every DOM
        // modification. Profile and potentially fix?
        public static isTabsContainer(node: Node): boolean
        {
            if (node.nodeType != Node.ELEMENT_NODE) return false;
            const domNode = <HTMLElement>node;
            return domNode.querySelector(".tabs-and-actions-container") != null;
        }
    }

    class Dom
    {
        public static isChildOf(el: HTMLElement, klass: string): boolean
        {
            return Dom.getParentOf(el, klass) != null;
        }

        public static getParentOf(el: HTMLElement | null, klass: string): HTMLElement | null
        {
            if (el  == null) return null;
            let curEl: HTMLElement | null = el;

            while (curEl != null)
            {
                if (curEl.classList && curEl.classList.contains(klass))
                {
                    return curEl;
                }

                curEl = curEl.parentElement;
            }

            return null;
        }

        public static getChildOf(el: HTMLElement | null, klass: string): HTMLElement | null
        {
            if (el == null) return null;

            for (let node = el.firstElementChild as HTMLElement;
                node != null;
                node = node?.nextElementSibling as HTMLElement)
            {
                if (Dom.hasClass(node, klass)) return node;
            }

            return null;
        }

        public static getChildrenOf(el: HTMLElement | null, klass: string): HTMLElement[]
        {
            const results: HTMLElement[] = [];
            if (el == null) return results;

            for (let node = el.firstElementChild as HTMLElement;
                node != null;
                node = node?.nextElementSibling as HTMLElement)
                {
                    if (Dom.hasClass(node, klass)) results.push(node);
                }

                return results;
            }

        public static visitChildren(el: HTMLElement | null, visitor: (el: HTMLElement) => void): void
        {
            if (el == null) return;
            for (let node = el.firstElementChild as HTMLElement;
                node != null;
                node = node?.nextElementSibling as HTMLElement)
            {
                visitor(node);
            }
        }

        public static hasClass(el: HTMLElement | null, klass: string): boolean
        {
            if (!el) return false;
            return el.classList && el.classList.contains(klass);
        }

        /**
         * If the value has changed, update the numeric style by adjustment.
         *
         * The old value is stored to prevent runaway adjustments when it didn't
         * change. That is, if the code does -300, then VSCode does not change
         * update the value, and this code runs again, it would be a net -600.
         */
        public static updateStyle(
            el: HTMLElement | null,
            style: string,
            adjustment: number): void
        {
            if (!el || !el.style) return;
            const val = (<any>el.style)[style];
            if (!val || val.length < 3) return;

            // only modify pixel values.
            if (val[val.length - 2] != "p") return;
            if (val[val.length - 1] != "x") return;

            const attrKey = "data-hack-last-" + style;
            const attr = el.getAttribute(attrKey);
            if (attr && attr == val) return;

            const intValue = parseInt(val, 10);
            if (isNaN(intValue) || !intValue) return;

            const newVal = `${intValue + adjustment}px`

            el.setAttribute(attrKey, newVal);
            (<any>el.style)[style] = newVal;
        }
    }

    class TabSort
    {
        public constructor(private options: VSCodeSideTabsOptions)
        {
        }

        public sort(a: ITabDescription, b: ITabDescription): number
        {
            let sortResult = 0;

            if (this.options.sortByProject && this.options.projectExpr)
            {
                sortResult = TabSort.projectSort(a, b);
                if (sortResult != 0) return sortResult;
            }

            if (this.options.sortByFileType)
            {
                sortResult = TabSort.typeSort(a, b);
                if (sortResult != 0) return sortResult;
            }

            return 0;
        }

        private static typeSort(a: ITabDescription, b: ITabDescription): number
        {
            if (a.tabType == b.tabType) return 0;
            if (a.tabType > b.tabType) return 1;
            return -1;
        }

        private static projectSort(a: ITabDescription, b: ITabDescription): number
        {
            // Handle both being null, etc.
            if (a.project == b.project) return 0;
            if (a.project != null && b.project == null) return -1;
            if (a.project == null && b.project != null) return 1;

            // Impossible condition to please the compile time null checker.
            if (a.project == null || b.project == null) return 0;
            if (a.project > b.project) return 1;
            return -1;
        }
    }

    class CssRuleRewrite
    {
        public constructor(
            public id: string,
            public shouldRewriteRuleExp: RegExp,
            public rewriteRuleExp: RegExp,
            public rewriteRuleText: string)
        {
        }

        public getTabCssRules(): CSSStyleRule[]
        {
            const isTabRuleExpr = /\.tab(?=\s|:|$)/;
            const rules: CSSStyleRule[] = [];

            for (let i = 0; i < document.styleSheets.length; ++i)
            {
                const sheet = document.styleSheets[i] as CSSStyleSheet;

                for (let i2 = 0; i2 < sheet.rules.length; ++i2)
                {
                    const rule = sheet.rules[i2] as CSSStyleRule;

                    if (isTabRuleExpr.test(rule.selectorText))
                    {
                        rules.push(rule);
                    }
                }
            }

            return rules;
        }

        public insertFixedTabCssRules(): void
        {
            if (document.getElementById(this.id) != null) return;

            const oldRules = this.getTabCssRules();
            const newRulesText: string[] = [];

            for (let rule of oldRules)
            {
                newRulesText.push(rule.cssText.replace(
                    /(^|,).+?(\.tab(?=\s|:|$))/g,
                    "$1 .hack--vertical-tab-container $2"));
            }

            CssRuleRewrite.insertCssRules(this.id, newRulesText.join("\r\n"));
        }

        public static insertCssRules(id: string, rules: string): void
        {
            if (document.getElementById(id) != null) return;

            const styleElement = document.createElement("style");
            styleElement.id = id;
            styleElement.type = "text/css";
            styleElement.appendChild(document.createTextNode(rules));

            document.head.appendChild(styleElement);
        }
    }

    (function() {
        const sideTabs = new VSCodeSideTabs();
        sideTabs.attach();
    })();
}
