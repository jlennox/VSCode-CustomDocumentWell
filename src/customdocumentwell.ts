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
        public projectExpr: RegExp = /([^\w]|^)src[/\\][^/\\]+/i;

        private projectColors: {[name: string]: string } = {};
        private projectCount: number = 0;

        public colors: string[] = [
            "#8DA3C1", "#9D827B", "#C1AA66", "#869A87", "#C97E6C",
            "#617595", "#846A62", "#887E5C", "#607562", "#BA5E41",
            "#3D5573", "#694F47", "#696658", "#425E45" ];

        public extend(options: Partial<IVSCodeSideTabsOptions> | null): void
        {
            if (options == null) return;

            this.sortByFileType = this.sortByFileType ?? options.sortByFileType;
            this.sortByProject = this.sortByProject ?? options.sortByProject;
            this.projectExpr = this.projectExpr ?? options.projectExpr;
        }

        public getColorForProject(projectName: string): string
        {
            const key = (projectName || "unknown").toUpperCase();
            const knownColor = this.projectColors[key];
            if (knownColor !== undefined) return knownColor;

            const color = this.colors[this.projectCount++ % this.colors.length];
            this.projectColors[key] = color;
            return color;
        }
    }

    class VSCodeSideTabs
    {
        private readonly currentTabs: ITabDescription[] = [];
        private realTabsContainers: NodeListOf<HTMLElement>;
        private readonly tabChangeObserver: MutationObserver;
        private readonly newTabContainer: HTMLElement;
        private readonly sideTabSize = "300px";
        private readonly eventTypes = {
            mouse: ["click", "mousedown", "mouseup", "contextmenu"],
            drag: ["drag", "dragend", "dragenter", "dragexit", "dragleave", "dragover", "dragstart", "drop"]
        };
        private readonly cssRuleRewriter: CssRuleRewrite;
        private readonly options = new VSCodeSideTabsOptions();
        private hasStolenTabContainerInfo: boolean = false;

        public constructor(
            options: Partial<IVSCodeSideTabsOptions> | null = null
        )
        {
            this.realTabsContainers = document.querySelectorAll<HTMLElement>(
                ".tabs-and-actions-container");

            this.tabChangeObserver = new MutationObserver(() => this.reloadTabs());

            this.newTabContainer = document.createElement("div");
            this.newTabContainer.className = "split-view-view visible hack--vertical-tab-container";
            this.newTabContainer.style.width = this.sideTabSize;
            this.newTabContainer.style.marginLeft = `-${this.sideTabSize}`;
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

            this.options.extend(options);
        }

        // Attach and add new elements to the DOM. This should only be called
        // once.
        public attach(): void
        {
            this.reloadTabContainers();

            this.cssRuleRewriter.insertFixedTabCssRules();

            const newContainerDestination = document.querySelector(
                "#workbench\\.parts\\.editor > div > .grid-view-container") as HTMLElement;

            if (newContainerDestination == null) return;

            newContainerDestination.insertBefore(
                this.newTabContainer,
                newContainerDestination.firstChild);

            const that = this;

            function fixNewContainer()
            {
                newContainerDestination.style.display = "flex";
                newContainerDestination.style.flexDirection = "row";
                newContainerDestination.style.width = `calc(100% - ${that.sideTabSize});`;
                newContainerDestination.style.marginLeft = that.sideTabSize;
            }

            fixNewContainer();

            const newContainerObserver = new MutationObserver(() => fixNewContainer());

            newContainerObserver.observe(
                newContainerDestination, {
                    attributes: true,
                    attributeFilter: ["style"]
                });

            // This feels more expensive than I'd like to run on every DOM
            // modification. Profile and potentially fix?
            function isListNode(node: Node): boolean
            {
                if (node.nodeType != Node.ELEMENT_NODE) return false;
                const domNode = <HTMLElement>node;
                return domNode.querySelector(".tabs-and-actions-container") != null;
            }

            const domObserver = new MutationObserver((mutations: MutationRecord[]) =>
            {
                for (let mut of mutations)
                {
                    for (let i = 0; i < mut.addedNodes.length; ++i)
                    {
                        if (isListNode(mut.addedNodes[i])) {
                            this.reloadTabContainers();
                            return;
                        }
                    }

                    for (let i = 0; i < mut.removedNodes.length; ++i)
                    {
                        if (isListNode(mut.removedNodes[i]))
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

            this.addCustomCssRules();
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

        // Pass in a '.tabs-and-actions-container' element to steal the coloring
        // info from, because coloring is done usually by scoped variables.
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

        private createDisposableEvent(
            eventType: string,
            element: HTMLElement,
            handler: any): IDisposableFn
        {
            element.addEventListener(eventType, handler);

            return () => element.removeEventListener(eventType, handler);
        }

        private forwardEvent(
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

            if (this.eventTypes.mouse.indexOf(eventType) != -1)
            {
                return this.createDisposableEvent(eventType, source, (e: MouseEvent) =>
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
                        DOM.isChildOf(e.target as HTMLElement, "tab-close"))
                    {
                        setTimeout(() => actualDest.dispatchEvent(mouseEvent), 500);
                    }
                    else
                    {
                        actualDest.dispatchEvent(mouseEvent);
                    }
                });
            }

            if (this.eventTypes.drag.indexOf(eventType) != -1)
            {
                return this.createDisposableEvent(eventType, source, (e: DragEvent) =>
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

            return this.createDisposableEvent(eventType, source, (e: Event) =>
            {
                const event = document.createEvent("Event");
                event.initEvent(e.type, true, true);
                const actualDest = getActualDestination(destination, e);
                actualDest.dispatchEvent(event);
            });
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

                for (let ev of this.eventTypes.mouse)
                {
                    disposables.push(this.forwardEvent(ev, newTab, realTab));
                }

                for (let ev of this.eventTypes.drag)
                {
                    disposables.push(this.forwardEvent(ev, newTab, realTab));
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

                if (this.options.colorByProject && project)
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

            const sorted = newTabs.sort((a, b) => this.tabSort(a, b))

            for (let tabInfo of sorted)
            {
                this.newTabContainer.appendChild(tabInfo.newTab);
                this.currentTabs.push(tabInfo);
            }
        }

        private tabSort(a: ITabDescription, b: ITabDescription): number
        {
            let sortResult = 0;

            if (this.options.sortByProject && this.options.projectExpr)
            {
                sortResult = this.tabProjectSort(a, b);
                if (sortResult != 0) return sortResult;
            }

            if (this.options.sortByFileType)
            {
                sortResult = this.tabTypeSort(a, b);
                if (sortResult != 0) return sortResult;
            }

            return 0;
        }

        private tabTypeSort(a: ITabDescription, b: ITabDescription): number
        {
            if (a.tabType == b.tabType) return 0;
            if (a.tabType > b.tabType) return 1;
            return -1;
        }

        private tabProjectSort(a: ITabDescription, b: ITabDescription): number
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

    class DOM
    {
        public static isChildOf(el: HTMLElement, klass: string): boolean
        {
            let curEl: HTMLElement | null = el;

            while (curEl != null)
            {
                if (curEl.classList && curEl.classList.contains(klass))
                {
                    return true;
                }

                curEl = curEl.parentElement;
            }

            return false;
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
