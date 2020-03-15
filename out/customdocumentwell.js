"use strict";
// MIT License
// Copyright(c) 2020 Joseph Lennox
var VSCodeSideTabs;
(function (VSCodeSideTabs_1) {
    class VSCodeSideTabsOptions {
        constructor() {
            this.showPin = true;
            this.colorByProject = true;
            this.sortByFileType = true;
            this.sortByProject = true;
            this.brightenActiveTab = true;
            this.compactTabs = true;
            this.debug = false;
            this.projectExpr = /(?:[^\w]|^)src[/\\].+?[/\\]/i;
            this.projectColors = {};
            this.projectCount = 0;
        }
        extend(options) {
            if (options == null)
                return this;
            return Object.assign(Object.assign({}, this), options);
        }
        getColorForProject(projectName) {
            const key = (projectName || "unknown").toUpperCase();
            const knownColor = this.projectColors[key];
            if (knownColor !== undefined)
                return knownColor;
            const colors = VSCodeSideTabsOptions.colors;
            const color = colors[this.projectCount++ % colors.length];
            this.projectColors[key] = color;
            return color;
        }
    }
    VSCodeSideTabsOptions.colors = [
        "#8DA3C1", "#9D827B", "#C1AA66", "#869A87", "#C97E6C",
        "#617595", "#846A62", "#887E5C", "#607562", "#BA5E41",
        "#3D5573", "#694F47", "#696658", "#425E45"
    ];
    class VSCodeSideTabs {
        constructor(options = null) {
            this.currentTabs = [];
            this.newContainerDest = null;
            this.sideTabSizePx = 300;
            this.sideTabSize = `${this.sideTabSizePx}px`;
            this.options = new VSCodeSideTabsOptions();
            this.hasStolenTabContainerInfo = false;
            this.hasAttached = false;
            this.requestedAnimationFrame = false;
            this.nextFramePerformRelayout = false;
            this.nextFrameReloadTabContainers = false;
            this.pinned = {};
            this.realTabsContainers = document.querySelectorAll(".tabs-and-actions-container");
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
            this.cssRuleRewriter = new CssRuleRewrite("", /\.tab(?=\s|:|$)/, /(^|,).+?(\.tab(?=\s|:|$))/g, "$1 .hack--vertical-tab-container $2");
            this.options = this.options.extend(options);
            this.tabSort = new TabSort(this.options);
        }
        // Attach and add new elements to the DOM.
        attach() {
            // If the DOM is not yet ready, try attaching again in a moment.
            if (!this.attachCore()) {
                setTimeout(() => this.attach(), 100);
            }
        }
        attachCore() {
            var _a, _b;
            if (this.hasAttached)
                return true;
            // Do not load yet if there's no tabs present.
            if (document.querySelector(".tabs-container") == null) {
                return false;
            }
            // The new element can not be a direct child of split-view-container
            // because internally VSCode keeps a child index that is then
            // referencedback to the DOM, and this will upset the order of DOM
            // nodes.
            // These selectors are too fragile and will likely become a main
            // point of maintenance.
            const newContainerDest = (_b = (_a = document
                .querySelector(".split-view-container")) === null || _a === void 0 ? void 0 : _a.querySelector(".split-view-container")) === null || _b === void 0 ? void 0 : _b.parentElement;
            // It's not present enough to load yet. Keep re-entering this method
            // until success.
            if (newContainerDest == null ||
                newContainerDest.firstChild == null) {
                return false;
            }
            newContainerDest.classList.add("hack--container");
            this.newContainerDest = newContainerDest;
            this.reloadTabContainers();
            this.cssRuleRewriter.insertFixedTabCssRules();
            this.addCustomCssRules();
            newContainerDest.insertBefore(this.newTabContainer, newContainerDest.firstChild);
            const that = this;
            function fixNewContainer() {
                newContainerDest.style.marginLeft = that.sideTabSize;
            }
            fixNewContainer();
            // Monitor for anyting that may undo `fixNewContainer()`
            const newContainerObserver = new MutationObserver(() => fixNewContainer());
            newContainerObserver.observe(newContainerDest, {
                attributes: true,
                attributeFilter: ["style"]
            });
            // Monitor for tab changes. That's tabs being added or removed.
            const domObserver = new MutationObserver((mutations) => {
                let doTabReload = false;
                let doRelayout = false;
                function isDone() {
                    return doTabReload && doRelayout;
                }
                for (let mut of mutations) {
                    if (isDone())
                        break;
                    for (let i = 0; i < mut.addedNodes.length && !isDone(); ++i) {
                        const element = mut.addedNodes[i];
                        if (element.nodeType != Node.ELEMENT_NODE)
                            continue;
                        // This event is required for when two tabs are switched
                        // between. Otherwise the recreated overflow-guard is
                        // not fixed.
                        if (!doTabReload && VSCodeDom.requiresDomRelayout(element)) {
                            doRelayout = true;
                        }
                        if (!doRelayout && VSCodeDom.isTabsContainer(element)) {
                            doTabReload = true;
                        }
                    }
                    for (let i = 0; i < mut.removedNodes.length && !doRelayout; ++i) {
                        const element = mut.removedNodes[i];
                        if (element.nodeType != Node.ELEMENT_NODE)
                            continue;
                        if (!doRelayout && VSCodeDom.isTabsContainer(element)) {
                            doTabReload = true;
                        }
                    }
                }
                if (doTabReload)
                    this.reloadTabContainers();
                if (doRelayout)
                    this.relayoutEditors();
            });
            domObserver.observe(document.body, {
                subtree: true,
                childList: true
            });
            // Observe for layout events. This is the editors moving around.
            const relayoutObserver = new MutationObserver((mutations) => {
                for (let mut of mutations) {
                    if (!mut.target)
                        continue;
                    if (mut.target.nodeType != Node.ELEMENT_NODE)
                        continue;
                    const target = mut.target;
                    // We have to reduce relayouts as much as possible because
                    // this is a very spammy event and relayout isn't exactly
                    // cheap.
                    if (!Dom.hasClass(target, "split-view-view") &&
                        !Dom.hasClass(target, "content")) {
                        continue;
                    }
                    this.relayoutEditors();
                    return;
                }
            });
            relayoutObserver.observe(document.body, {
                attributes: true,
                attributeFilter: ["style"],
                subtree: true
            });
            this.relayoutEditors();
            this.hasAttached = true;
            return true;
        }
        requestAnimationFrame() {
            if (this.requestedAnimationFrame)
                return;
            this.requestedAnimationFrame = true;
            requestAnimationFrame(() => this.animationFrame());
        }
        animationFrame() {
            if (this.nextFramePerformRelayout) {
                this.relayoutEditorsCore();
            }
            if (this.nextFrameReloadTabContainers) {
                this.reloadTabContainersCore();
            }
            this.requestedAnimationFrame = false;
            this.nextFrameReloadTabContainers = false;
            this.nextFramePerformRelayout = false;
        }
        addCustomCssRules() {
            const newCssRules = [];
            if (this.options.compactTabs) {
                newCssRules.push(`
                    body .hack--vertical-tab-container .tab {
                        height: 25px;
                    }`);
            }
            if (this.options.brightenActiveTab) {
                newCssRules.push(`
                    body .hack--vertical-tab-container .tab.active {
                        filter: brightness(120%);
                    }
                    body .hack--vertical-tab-container .tab.active .tab-label {
                        color: Black !important;
                        font-weight: bold;
                    }`);
            }
            if (newCssRules.length > 0) {
                CssRuleRewrite.insertCssRules("hack--newCssRules", newCssRules.join("\r\n"));
            }
        }
        /**
         * Pass in a '.tabs-and-actions-container' element to steal the coloring
         * info from.
         *
         * Because coloring is done usually by scoped variables it has to be
         * grabbed at runtime using getComputedStyle.
         */
        stealTabContainerInfo(realTabContainer) {
            if (this.hasStolenTabContainerInfo)
                return;
            if (!realTabContainer || !realTabContainer.parentElement)
                return;
            const parent = realTabContainer.parentElement;
            const backgroundColor = parent.style.backgroundColor;
            if (!backgroundColor)
                return;
            const aftersStyles = getComputedStyle(parent, ":after");
            const borderColor = aftersStyles.backgroundColor;
            this.newTabContainer.style.borderRightColor = borderColor;
            this.newTabContainer.style.backgroundColor = backgroundColor;
            this.hasStolenTabContainerInfo = true;
        }
        relayoutEditors() {
            this.nextFramePerformRelayout = true;
            this.requestAnimationFrame();
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
        relayoutEditorsCore() {
            this.debug("relayoutEditorsCore()");
            const editors = VSCodeDom.getEditorSplitViews();
            const rightMostEditors = {};
            // Determine the right-most editors for each editor row. Rows are
            // determined by editors having a common `top` value.
            // The right most editor on a per row basis needs its width reduced
            // by 300px.
            for (let editor of editors) {
                const top = editor.style.top;
                const left = editor.style.left
                    ? parseInt(editor.style.left, 10)
                    : 0;
                const existing = rightMostEditors[top];
                if (existing && left < existing.left)
                    continue;
                rightMostEditors[top] = {
                    el: editor,
                    left: left
                };
            }
            for (let key in rightMostEditors) {
                const rightMost = rightMostEditors[key];
                // Panels that do not explicity set a width use an inherited
                // width of 100%.
                if (!rightMost.el.style.width) {
                    rightMost.el.style.width = `calc(100% - ${this.sideTabSize})`;
                }
                else {
                    Dom.updateStyle(rightMost.el, "width", -this.sideTabSizePx);
                }
                // Some of the children elements also must be dynamically
                // resized.
                // .overlayWidgets is the container that holds the quick search.
                // .zone-widge belongs to the code peek view. Even though it's a
                //     child of overlayWidgets it has its own width calculated.
                const children = rightMost.el.querySelectorAll(".overlayWidgets, .zone-widget");
                for (let i = 0; i < children.length; ++i) {
                    const el = children[i];
                    Dom.updateStyle(el, "width", -this.sideTabSizePx);
                }
                const scrollables = rightMost.el.querySelectorAll(".editor-scrollable, .overflow-guard");
                for (let i = 0; i < scrollables.length; ++i) {
                    const el = scrollables[i];
                    // If the element is inline, then its sizing is based
                    // relative to its parent already. The `peek` preview
                    // behaves this way.
                    if (Dom.hasParent(el, "inline"))
                        continue;
                    Dom.updateStyle(el, "width", -this.sideTabSizePx);
                }
                const needParentChanges = document.querySelectorAll(".welcomePageContainer");
                for (let i = 0; i < needParentChanges.length; ++i) {
                    Dom.updateStyle(needParentChanges[i].parentElement, "width", -this.sideTabSizePx);
                }
            }
            // If this is ever needed to work with variable side docking,
            // the placement of the dock can be determined by a class on the
            // id'd child.
            const sidebar = VSCodeDom.getSideBarSplitView();
            Dom.updateStyle(sidebar.activitybar, "left", -this.sideTabSizePx);
            Dom.updateStyle(sidebar.sidebar, "left", -this.sideTabSizePx);
            // The sashes for non-subcontainered elements must also be adjusted for.
            const sashContainer = Dom.getChild(this.newContainerDest, "sash-container");
            Dom.visitChildren(sashContainer, el => {
                if (Dom.hasClass(el, "monaco-sash")) {
                    Dom.updateStyle(el, "left", -this.sideTabSizePx);
                }
            });
        }
        reloadTabContainers() {
            this.nextFrameReloadTabContainers = true;
            this.requestAnimationFrame();
        }
        reloadTabContainersCore() {
            this.debug("reloadTabContainersCore()");
            this.tabChangeObserver.disconnect();
            this.realTabsContainers = document.querySelectorAll(".tabs-and-actions-container");
            for (let i = 0; i < this.realTabsContainers.length; ++i) {
                const realTabContainer = this.realTabsContainers[i];
                this.stealTabContainerInfo(realTabContainer);
                // The only attribute we care about is when the selection
                // is changed. `childList` is monitored to tell when tabs are
                // added or removed.
                this.tabChangeObserver.observe(realTabContainer, {
                    attributes: true,
                    attributeFilter: ["aria-selected"],
                    childList: true,
                    subtree: true,
                });
            }
            this.reloadTabs();
        }
        reloadTabs() {
            this.debug("reloadTabs()");
            while (this.currentTabs.length > 0) {
                const oldTab = this.currentTabs.pop();
                if (!oldTab)
                    continue;
                const disposables = oldTab.disposables;
                disposables.forEach(t => t());
            }
            this.newTabContainer.innerHTML = "";
            for (let i = 0; i < this.realTabsContainers.length; ++i) {
                if (i > 0) {
                    const hr = document.createElement("hr");
                    this.newTabContainer.appendChild(hr);
                }
                this.reloadTabsForContainer(this.realTabsContainers[i]);
            }
            const pinned = this.currentTabs.filter(t => this.isPinned(t));
            if (pinned.length > 0) {
                const hr = document.createElement("hr");
                this.newTabContainer.prepend(hr);
                const sorted = this.tabSort.sort(pinned);
                for (let tabInfo of sorted) {
                    this.newTabContainer.insertBefore(tabInfo.newTab, hr);
                }
            }
        }
        isPinned(tabInfo) {
            return tabInfo.path in this.pinned;
        }
        reloadTabsForContainer(container) {
            var _a, _b, _c;
            const tabs = container.querySelectorAll(".tab");
            const newTabs = [];
            for (let i = 0; i < tabs.length; ++i) {
                const realTab = tabs[i];
                const text = realTab.textContent;
                const title = realTab.title || "";
                const isActive = realTab.classList.contains("active");
                const newTab = realTab.cloneNode(true);
                const disposables = [];
                for (let ev of Events.eventTypes.mouse) {
                    disposables.push(Events.forwardEvent(ev, newTab, realTab));
                }
                for (let ev of Events.eventTypes.drag) {
                    disposables.push(Events.forwardEvent(ev, newTab, realTab));
                }
                // Get just the file extension if present.
                const typeMatch = title.lastIndexOf(".");
                const tabType = typeMatch == -1
                    ? "unknown"
                    : title.substr(typeMatch + 1);
                let project = null;
                if (this.options.colorByProject || this.options.sortByProject) {
                    const projectResult = this.options.projectExpr.exec(title);
                    project = projectResult ? projectResult[0] : null;
                }
                if (this.options.colorByProject) {
                    // If the tab is active and brightening is disabled, do
                    // not change the background color so that the active
                    // tab color is used instead.
                    if (!isActive || this.options.brightenActiveTab) {
                        newTab.style.backgroundColor = this.options
                            .getColorForProject(project);
                    }
                }
                const tabInfo = {
                    realTab: realTab,
                    newTab: newTab,
                    isActive: isActive,
                    text: text,
                    project: project,
                    path: title,
                    disposables: disposables,
                    tabType: tabType.toUpperCase()
                };
                if (this.options.showPin) {
                    const tabClose = newTab.querySelector(".tab-close");
                    const pinTab = document.createElement("div");
                    pinTab.style.margin = "auto 0";
                    pinTab.style.width = "28px";
                    pinTab.innerHTML = `
                        <div class="monaco-action-bar animated">
                            <ul class="actions-container" role="toolbar" aria-label="Tab actions">
                                <li class="action-item" role="presentation">
                                    <a class="action-label codicon codicon-pin" role="button" tabindex="0" title="Pin"></a>
                                </li>
                            </ul>
                        </div>`;
                    disposables.push(Events.createDisposableEvent("mouseup", (_a = pinTab) === null || _a === void 0 ? void 0 : _a.querySelector("a"), () => {
                        if (tabInfo.path in this.pinned) {
                            delete this.pinned[tabInfo.path];
                        }
                        else {
                            this.pinned[tabInfo.path] = true;
                        }
                        this.reloadTabContainers();
                    }));
                    (_c = (_b = tabClose) === null || _b === void 0 ? void 0 : _b.parentElement) === null || _c === void 0 ? void 0 : _c.insertBefore(pinTab, tabClose);
                }
                newTabs.push(tabInfo);
            }
            const sorted = this.tabSort.sort(newTabs);
            for (let tabInfo of sorted) {
                if (!this.isPinned(tabInfo)) {
                    this.newTabContainer.appendChild(tabInfo.newTab);
                }
                this.currentTabs.push(tabInfo);
            }
        }
        debug(message, ...optionalParams) {
            if (!this.options.debug)
                return;
            const args = Array.prototype.slice.call(arguments);
            console.log.apply(console, args);
        }
    }
    class Events {
        static createDisposableEvent(eventType, element, handler) {
            if (element == null)
                return Events.blankEvent;
            element.addEventListener(eventType, handler);
            return () => element.removeEventListener(eventType, handler);
        }
        static forwardEvent(eventType, source, destination) {
            function getActualDestination(destination, e) {
                // This attempts to locate the same child of the destination as
                // the event was triggered on in our synthetic DOM. This isn't
                // the most accurate method but it should be good enough.
                const targetElement = e.target;
                if (!targetElement || !targetElement.className) {
                    return destination;
                }
                const querySelector = "." + targetElement.className.replace(/ /g, '.');
                return destination.querySelector(querySelector) || destination;
            }
            if (Events.eventTypes.mouse.indexOf(eventType) != -1) {
                return Events.createDisposableEvent(eventType, source, (e) => {
                    const mouseEvent = document.createEvent("MouseEvents");
                    mouseEvent.initMouseEvent(e.type, true, true, e.view, e.detail, e.screenX, e.screenY, e.clientX, e.clientY, e.ctrlKey, e.altKey, e.shiftKey, e.metaKey, e.button, e.relatedTarget);
                    const actualDest = getActualDestination(destination, e);
                    // This feels very much like play stupid games win stupid
                    // prizes. If these events are synthetically generated
                    // in real time, then their dispatching causes the "click"
                    // event to never trigger. The tabs themselves detect clicks
                    // via mousedown/mouseup. The close button requires "click".
                    if ((e.type == "mousedown" || e.type == "mouseup") &&
                        Dom.hasClosest(e.target, "tab-close")) {
                        setTimeout(() => actualDest.dispatchEvent(mouseEvent), 500);
                    }
                    else {
                        actualDest.dispatchEvent(mouseEvent);
                    }
                });
            }
            if (Events.eventTypes.drag.indexOf(eventType) != -1) {
                return Events.createDisposableEvent(eventType, source, (e) => {
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
                    });
                    const actualDest = getActualDestination(destination, e);
                    actualDest.dispatchEvent(dragEvent);
                });
            }
            return Events.createDisposableEvent(eventType, source, (e) => {
                const event = document.createEvent("Event");
                event.initEvent(e.type, true, true);
                const actualDest = getActualDestination(destination, e);
                actualDest.dispatchEvent(event);
            });
        }
    }
    Events.eventTypes = {
        mouse: ["click", "mousedown", "mouseup", "contextmenu"],
        drag: ["drag", "dragend", "dragenter", "dragexit", "dragleave", "dragover", "dragstart", "drop"]
    };
    Events.blankEvent = () => { };
    class VSCodeDom {
        /**
         * Returns the ".split-view-view" container for each code editor.
         */
        static getEditorSplitViews() {
            const results = [];
            const instances = document.querySelectorAll(".editor-instance,[id=workbench\\.parts\\.panel]");
            for (let i = 0; i < instances.length; ++i) {
                const instance = instances[i];
                const splitView = Dom.getClosest(instance, "split-view-view");
                if (splitView == null)
                    continue;
                results.push(splitView);
            }
            return results;
        }
        static getSideBarSplitView() {
            const sidebar = document.getElementById("workbench.parts.sidebar");
            const activitybar = document.getElementById("workbench.parts.activitybar");
            return {
                sidebar: Dom.getClosest(sidebar, "split-view-view"),
                activitybar: Dom.getClosest(activitybar, "split-view-view")
            };
        }
        // This feels more expensive than I'd like to run on every DOM
        // modification. Profile and potentially fix?
        static isTabsContainer(el) {
            return el.querySelector(".tabs-and-actions-container") != null;
        }
        static requiresDomRelayout(el) {
            if (!el || !el.classList)
                return false;
            for (let i = 0; i < el.classList.length; ++i) {
                switch (el.classList[i]) {
                    case "zone-widget":
                    case "overlayWidgets":
                    case "monaco-editor":
                        return true;
                }
            }
            return false;
        }
    }
    class Dom {
        static hasClosest(el, klass) {
            return Dom.getClosest(el, klass) != null;
        }
        static hasParent(el, klass) {
            return Dom.getParent(el, klass) != null;
        }
        /**
         * Returns the first parent that matches klass. Returns `el` if matches.
         */
        static getClosest(el, klass) {
            if (el == null)
                return null;
            let curEl = el;
            while (curEl != null) {
                if (Dom.hasClass(curEl, klass))
                    return curEl;
                curEl = curEl.parentElement;
            }
            return null;
        }
        /**
         * Returns the first parent that matches klass.
         */
        static getParent(el, klass) {
            if (el == null)
                return null;
            return Dom.getClosest(el.parentElement, klass);
        }
        /**
         * Returns the direct child that match klass.
         */
        static getChild(el, klass) {
            var _a;
            if (el == null)
                return null;
            for (let node = el.firstElementChild; node != null; node = (_a = node) === null || _a === void 0 ? void 0 : _a.nextElementSibling) {
                if (Dom.hasClass(node, klass))
                    return node;
            }
            return null;
        }
        /**
        * Returns all direct child that match klass.
        */
        static getChildren(el, klass) {
            var _a;
            const results = [];
            if (el == null)
                return results;
            for (let node = el.firstElementChild; node != null; node = (_a = node) === null || _a === void 0 ? void 0 : _a.nextElementSibling) {
                if (Dom.hasClass(node, klass))
                    results.push(node);
            }
            return results;
        }
        static visitChildren(el, visitor) {
            var _a;
            if (el == null)
                return;
            for (let node = el.firstElementChild; node != null; node = (_a = node) === null || _a === void 0 ? void 0 : _a.nextElementSibling) {
                visitor(node);
            }
        }
        static hasClass(el, klass) {
            if (!el)
                return false;
            return el.classList && el.classList.contains(klass);
        }
        /**
         * If the value has changed, update the numeric style by adjustment.
         *
         * The old value is stored to prevent runaway adjustments when it didn't
         * change. That is, if the code does -300, then VSCode does not change
         * update the value, and this code runs again, it would be a net -600.
         */
        static updateStyle(el, style, adjustment) {
            if (!el || !el.style)
                return;
            const val = el.style[style];
            if (!val || val.length < 3)
                return;
            // only modify pixel values.
            if (val[val.length - 2] != "p")
                return;
            if (val[val.length - 1] != "x")
                return;
            const attrKey = "data-hack-last-" + style;
            const attr = el.getAttribute(attrKey);
            if (attr && attr == val)
                return;
            const intValue = parseInt(val, 10);
            if (isNaN(intValue) || !intValue)
                return;
            const newVal = `${intValue + adjustment}px`;
            el.setAttribute(attrKey, newVal);
            el.style[style] = newVal;
        }
    }
    class TabSort {
        constructor(options) {
            this.options = options;
        }
        sort(tabs) {
            return tabs.sort((a, b) => this.sortCore(a, b));
        }
        sortCore(a, b) {
            let sortResult = 0;
            if (this.options.sortByProject && this.options.projectExpr) {
                sortResult = TabSort.projectSort(a, b);
                if (sortResult != 0)
                    return sortResult;
            }
            if (this.options.sortByFileType) {
                sortResult = TabSort.typeSort(a, b);
                if (sortResult != 0)
                    return sortResult;
            }
            return 0;
        }
        static typeSort(a, b) {
            if (a.tabType == b.tabType)
                return 0;
            if (a.tabType > b.tabType)
                return 1;
            return -1;
        }
        static projectSort(a, b) {
            // Handle both being null, etc.
            if (a.project == b.project)
                return 0;
            if (a.project != null && b.project == null)
                return -1;
            if (a.project == null && b.project != null)
                return 1;
            // Impossible condition to please the compile time null checker.
            if (a.project == null || b.project == null)
                return 0;
            if (a.project > b.project)
                return 1;
            return -1;
        }
    }
    class CssRuleRewrite {
        constructor(id, shouldRewriteRuleExp, rewriteRuleExp, rewriteRuleText) {
            this.id = id;
            this.shouldRewriteRuleExp = shouldRewriteRuleExp;
            this.rewriteRuleExp = rewriteRuleExp;
            this.rewriteRuleText = rewriteRuleText;
        }
        getTabCssRules() {
            const isTabRuleExpr = /\.tab(?=\s|:|$)/;
            const rules = [];
            for (let i = 0; i < document.styleSheets.length; ++i) {
                const sheet = document.styleSheets[i];
                for (let i2 = 0; i2 < sheet.rules.length; ++i2) {
                    const rule = sheet.rules[i2];
                    if (isTabRuleExpr.test(rule.selectorText)) {
                        rules.push(rule);
                    }
                }
            }
            return rules;
        }
        insertFixedTabCssRules() {
            if (document.getElementById(this.id) != null)
                return;
            const oldRules = this.getTabCssRules();
            const newRulesText = [];
            for (let rule of oldRules) {
                newRulesText.push(rule.cssText.replace(/(^|,).+?(\.tab(?=\s|:|$))/g, "$1 .hack--vertical-tab-container $2"));
            }
            CssRuleRewrite.insertCssRules(this.id, newRulesText.join("\r\n"));
        }
        static insertCssRules(id, rules) {
            if (document.getElementById(id) != null)
                return;
            const styleElement = document.createElement("style");
            styleElement.id = id;
            styleElement.type = "text/css";
            styleElement.appendChild(document.createTextNode(rules));
            document.head.appendChild(styleElement);
        }
    }
    (function () {
        const sideTabs = new VSCodeSideTabs();
        sideTabs.attach();
    })();
})(VSCodeSideTabs || (VSCodeSideTabs = {}));
//# sourceMappingURL=customdocumentwell.js.map