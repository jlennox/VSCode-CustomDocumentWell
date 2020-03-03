"use strict";
// MIT License
// Copyright(c) 2020 Joseph Lennox
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
var VSCodeSideTabs;
(function (VSCodeSideTabs_1) {
    var VSCodeSideTabsOptions = /** @class */ (function () {
        function VSCodeSideTabsOptions() {
            this.colorByProject = true;
            this.sortByFileType = true;
            this.sortByProject = true;
            this.brightenActiveTab = true;
            this.compactTabs = true;
            this.projectExpr = /([^\w]|^)src[/\\].+?[/\\]/i;
            this.projectColors = {};
            this.projectCount = 0;
        }
        VSCodeSideTabsOptions.prototype.extend = function (options) {
            if (options == null)
                return this;
            return __assign(__assign({}, this), options);
        };
        VSCodeSideTabsOptions.prototype.getColorForProject = function (projectName) {
            var key = (projectName || "unknown").toUpperCase();
            var knownColor = this.projectColors[key];
            if (knownColor !== undefined)
                return knownColor;
            var colors = VSCodeSideTabsOptions.colors;
            var color = colors[this.projectCount++ % colors.length];
            this.projectColors[key] = color;
            return color;
        };
        VSCodeSideTabsOptions.colors = [
            "#8DA3C1", "#9D827B", "#C1AA66", "#869A87", "#C97E6C",
            "#617595", "#846A62", "#887E5C", "#607562", "#BA5E41",
            "#3D5573", "#694F47", "#696658", "#425E45"
        ];
        return VSCodeSideTabsOptions;
    }());
    var VSCodeSideTabs = /** @class */ (function () {
        function VSCodeSideTabs(options) {
            var _this = this;
            if (options === void 0) { options = null; }
            this.currentTabs = [];
            this.newContainerDest = null;
            this.sideTabSizePx = 300;
            this.sideTabSize = this.sideTabSizePx + "px";
            this.options = new VSCodeSideTabsOptions();
            this.hasStolenTabContainerInfo = false;
            this.realTabsContainers = document.querySelectorAll(".tabs-and-actions-container");
            this.tabChangeObserver = new MutationObserver(function () { return _this.reloadTabs(); });
            this.newTabContainer = document.createElement("div");
            this.newTabContainer.className = "hack--vertical-tab-container";
            this.newTabContainer.style.width = this.sideTabSize;
            this.newTabContainer.style.position = "absolute";
            this.newTabContainer.style.top = "0";
            this.newTabContainer.style.left = "-" + this.sideTabSize;
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
        VSCodeSideTabs.prototype.attach = function () {
            var _this = this;
            // Do not load yet if there's no tabs present.
            if (document.querySelector(".tabs-container") == null) {
                setTimeout(function () { return _this.attach(); }, 100);
                return;
            }
            // These selectors feel far more fragile than I'd really like them to be.
            var container1 = document.querySelector(".split-view-container");
            // The new element can not be a direct child of split-view-container
            // because internally VSCode keeps a child index that is then referenced
            // back to the DOM, and this will upset the order of DOM nodes.
            var newContainerDest = container1.querySelector(".split-view-container")
                .parentElement;
            newContainerDest.classList.add("hack--container");
            // It's not present enough to load yet. Keep re-entering this method
            // until success.
            if (newContainerDest == null ||
                newContainerDest.firstChild == null) {
                setTimeout(function () { return _this.attach(); }, 100);
                return;
            }
            this.newContainerDest = newContainerDest;
            this.reloadTabContainers();
            this.cssRuleRewriter.insertFixedTabCssRules();
            this.addCustomCssRules();
            newContainerDest.insertBefore(this.newTabContainer, newContainerDest.firstChild);
            var that = this;
            function fixNewContainer() {
                newContainerDest.style.marginLeft = that.sideTabSize;
            }
            fixNewContainer();
            // Monitor for anyting that may undo `fixNewContainer()`
            var newContainerObserver = new MutationObserver(function () { return fixNewContainer(); });
            newContainerObserver.observe(newContainerDest, {
                attributes: true,
                attributeFilter: ["style"]
            });
            // Monitor for tab changes. That's tabs being added or removed.
            var domObserver = new MutationObserver(function (mutations) {
                for (var _i = 0, mutations_1 = mutations; _i < mutations_1.length; _i++) {
                    var mut = mutations_1[_i];
                    for (var i = 0; i < mut.addedNodes.length; ++i) {
                        if (VSCodeDom.isTabsContainer(mut.addedNodes[i])) {
                            _this.reloadTabContainers();
                            return;
                        }
                    }
                    for (var i = 0; i < mut.removedNodes.length; ++i) {
                        if (VSCodeDom.isTabsContainer(mut.removedNodes[i])) {
                            _this.reloadTabContainers();
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
            var relayoutObserver = new MutationObserver(function (mutations) {
                var doLayout = false;
                for (var _i = 0, mutations_2 = mutations; _i < mutations_2.length; _i++) {
                    var mut = mutations_2[_i];
                    if (!mut.target)
                        continue;
                    if (mut.target.nodeType != Node.ELEMENT_NODE)
                        continue;
                    var target = mut.target;
                    var parent_1 = target.parentElement;
                    if (!Dom.hasClass(target, "split-view-view") &&
                        !Dom.hasClass(target, "content")) {
                        continue;
                    }
                    if (Dom.hasClass(parent_1, "hack--container")) {
                        doLayout = true;
                        break;
                    }
                    doLayout = true;
                    break;
                }
                if (doLayout)
                    _this.relayoutEditors();
            });
            relayoutObserver.observe(document.body, {
                attributes: true,
                attributeFilter: ["style"],
                subtree: true
            });
            this.relayoutEditors();
        };
        VSCodeSideTabs.prototype.addCustomCssRules = function () {
            var newCssRules = [];
            if (this.options.compactTabs) {
                newCssRules.push("\n                    body .hack--vertical-tab-container .tab {\n                        height: 25px;\n                    }");
            }
            if (this.options.brightenActiveTab) {
                newCssRules.push("\n                    body .hack--vertical-tab-container .tab.active {\n                        filter: brightness(120%);\n                    }\n                    body .hack--vertical-tab-container .tab.active .tab-label {\n                        color: Black !important;\n                        font-weight: bold;\n                    }");
            }
            if (newCssRules.length > 0) {
                CssRuleRewrite.insertCssRules("hack--newCssRules", newCssRules.join("\r\n"));
            }
        };
        /**
         * Pass in a '.tabs-and-actions-container' element to steal the coloring
         * info from.
         *
         * Because coloring is done usually by scoped variables it has to be
         * grabbed at runtime using getComputedStyle.
         */
        VSCodeSideTabs.prototype.stealTabContainerInfo = function (realTabContainer) {
            if (this.hasStolenTabContainerInfo)
                return;
            if (!realTabContainer || !realTabContainer.parentElement)
                return;
            var parent = realTabContainer.parentElement;
            var backgroundColor = parent.style.backgroundColor;
            if (!backgroundColor)
                return;
            var aftersStyles = getComputedStyle(parent, ":after");
            var borderColor = aftersStyles.backgroundColor;
            this.newTabContainer.style.borderRightColor = borderColor;
            this.newTabContainer.style.backgroundColor = backgroundColor;
            this.hasStolenTabContainerInfo = true;
        };
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
        VSCodeSideTabs.prototype.relayoutEditors = function () {
            var _this = this;
            var editors = VSCodeDom.getEditorSplitViews();
            var rightMosts = {};
            // Determine the right-most editors for each editor row.
            // The right most editor on a per row basis needs its width reduced
            // by 300px.
            for (var _i = 0, editors_1 = editors; _i < editors_1.length; _i++) {
                var editor = editors_1[_i];
                var top_1 = editor.style.top;
                var left = editor.style.left
                    ? parseInt(editor.style.left, 10)
                    : 0;
                var existing = rightMosts[top_1];
                if (existing && left < existing.left)
                    continue;
                rightMosts[top_1] = {
                    el: editor,
                    left: left
                };
            }
            for (var key in rightMosts) {
                var rightMost = rightMosts[key];
                // Panels that do not explicity set a width use an inhereted
                // width of 100%.
                if (!rightMost.el.style.width) {
                    rightMost.el.style.width = "calc(100% - " + this.sideTabSize + ")";
                }
                else {
                    Dom.updateStyle(rightMost.el, "width", -this.sideTabSizePx);
                }
                // Some of the children elements also must be dynamically
                // resized.
                var children = rightMost.el.querySelectorAll(".overflow-guard, .editor-scrollable");
                for (var i = 0; i < children.length; ++i) {
                    Dom.updateStyle(children[i], "width", -this.sideTabSizePx);
                }
            }
            // If this is ever needed to work with variable side docking,
            // the placement of the dock can be determined by a class on the
            // id'd child.
            var sidebar = VSCodeDom.getSideBarSplitView();
            if (sidebar.activitybar)
                Dom.updateStyle(sidebar.activitybar, "left", -this.sideTabSizePx);
            if (sidebar.sidebar)
                Dom.updateStyle(sidebar.sidebar, "left", -this.sideTabSizePx);
            // The sashes for non-subcontainered elements must also be adjusted for.
            var sashContainer = Dom.getChildOf(this.newContainerDest, "sash-container");
            Dom.visitChildren(sashContainer, function (el) {
                if (Dom.hasClass(el, "monaco-sash")) {
                    Dom.updateStyle(el, "left", -_this.sideTabSizePx);
                }
            });
        };
        VSCodeSideTabs.prototype.reloadTabContainers = function () {
            this.tabChangeObserver.disconnect();
            this.realTabsContainers = document.querySelectorAll(".tabs-and-actions-container");
            for (var i = 0; i < this.realTabsContainers.length; ++i) {
                var realTabContainer = this.realTabsContainers[i];
                this.stealTabContainerInfo(realTabContainer);
                this.tabChangeObserver.observe(realTabContainer, { attributes: true, childList: true, subtree: true });
            }
            this.reloadTabs();
        };
        VSCodeSideTabs.prototype.reloadTabs = function () {
            while (this.currentTabs.length > 0) {
                var oldTab = this.currentTabs.pop();
                if (!oldTab)
                    continue;
                var disposables = oldTab.disposables;
                disposables.forEach(function (t) { return t(); });
            }
            this.newTabContainer.innerHTML = "";
            for (var i = 0; i < this.realTabsContainers.length; ++i) {
                if (i > 0) {
                    var hr = document.createElement("hr");
                    this.newTabContainer.appendChild(hr);
                }
                this.reloadTabsForContainer(this.realTabsContainers[i]);
            }
        };
        VSCodeSideTabs.prototype.reloadTabsForContainer = function (container) {
            var _this = this;
            var tabs = container.querySelectorAll(".tab");
            var newTabs = [];
            for (var i = 0; i < tabs.length; ++i) {
                var realTab = tabs[i];
                var text = realTab.textContent;
                var title = realTab.title || "";
                var isActive = realTab.classList.contains("active");
                var newTab = realTab.cloneNode(true);
                var disposables = [];
                for (var _i = 0, _a = Events.eventTypes.mouse; _i < _a.length; _i++) {
                    var ev = _a[_i];
                    disposables.push(Events.forwardEvent(ev, newTab, realTab));
                }
                for (var _b = 0, _c = Events.eventTypes.drag; _b < _c.length; _b++) {
                    var ev = _c[_b];
                    disposables.push(Events.forwardEvent(ev, newTab, realTab));
                }
                // Get just the file extension if present.
                var typeMatch = title.lastIndexOf(".");
                var tabType = typeMatch == -1
                    ? "unknown"
                    : title.substr(typeMatch + 1);
                var project = null;
                if (this.options.colorByProject || this.options.sortByProject) {
                    var projectResult = this.options.projectExpr.exec(title);
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
            var sorted = newTabs.sort(function (a, b) { return _this.tabSort.sort(a, b); });
            for (var _d = 0, sorted_1 = sorted; _d < sorted_1.length; _d++) {
                var tabInfo = sorted_1[_d];
                this.newTabContainer.appendChild(tabInfo.newTab);
                this.currentTabs.push(tabInfo);
            }
        };
        return VSCodeSideTabs;
    }());
    var Events = /** @class */ (function () {
        function Events() {
        }
        Events.createDisposableEvent = function (eventType, element, handler) {
            element.addEventListener(eventType, handler);
            return function () { return element.removeEventListener(eventType, handler); };
        };
        Events.forwardEvent = function (eventType, source, destination) {
            function getActualDestination(destination, e) {
                // This attempts to locate the same child of the destination as
                // the event was triggered on in our synthetic DOM. This isn't
                // the most accurate method but it should be good enough.
                var targetElement = e.target;
                if (!targetElement || !targetElement.className) {
                    return destination;
                }
                var querySelector = "." + targetElement.className.replace(/ /g, '.');
                return destination.querySelector(querySelector) || destination;
            }
            if (Events.eventTypes.mouse.indexOf(eventType) != -1) {
                return Events.createDisposableEvent(eventType, source, function (e) {
                    var mouseEvent = document.createEvent("MouseEvents");
                    mouseEvent.initMouseEvent(e.type, true, true, e.view, e.detail, e.screenX, e.screenY, e.clientX, e.clientY, e.ctrlKey, e.altKey, e.shiftKey, e.metaKey, e.button, e.relatedTarget);
                    var actualDest = getActualDestination(destination, e);
                    // This feels very much like play stupid games win stupid
                    // prizes. If these events are synthetically generated
                    // in real time, then their dispatching causes the "click"
                    // event to never trigger. The tabs themselves detect clicks
                    // via mousedown/mouseup. The close button requires "click".
                    if ((e.type == "mousedown" || e.type == "mouseup") &&
                        Dom.isChildOf(e.target, "tab-close")) {
                        setTimeout(function () { return actualDest.dispatchEvent(mouseEvent); }, 500);
                    }
                    else {
                        actualDest.dispatchEvent(mouseEvent);
                    }
                });
            }
            if (Events.eventTypes.drag.indexOf(eventType) != -1) {
                return Events.createDisposableEvent(eventType, source, function (e) {
                    var dragEvent = new DragEvent(e.type, {
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
                    var actualDest = getActualDestination(destination, e);
                    actualDest.dispatchEvent(dragEvent);
                });
            }
            return Events.createDisposableEvent(eventType, source, function (e) {
                var event = document.createEvent("Event");
                event.initEvent(e.type, true, true);
                var actualDest = getActualDestination(destination, e);
                actualDest.dispatchEvent(event);
            });
        };
        Events.eventTypes = {
            mouse: ["click", "mousedown", "mouseup", "contextmenu"],
            drag: ["drag", "dragend", "dragenter", "dragexit", "dragleave", "dragover", "dragstart", "drop"]
        };
        return Events;
    }());
    var VSCodeDom = /** @class */ (function () {
        function VSCodeDom() {
        }
        /**
         * Returns the ".split-view-view" container for each code editor.
         */
        VSCodeDom.getEditorSplitViews = function () {
            var results = [];
            var instances = document.querySelectorAll(".editor-instance");
            for (var i = 0; i < instances.length; ++i) {
                var instance = instances[i];
                var splitView = Dom.getParentOf(instance, "split-view-view");
                if (splitView == null)
                    continue;
                results.push(splitView);
            }
            return results;
        };
        VSCodeDom.getSideBarSplitView = function () {
            var sidebar = document.getElementById("workbench.parts.sidebar");
            var activitybar = document.getElementById("workbench.parts.activitybar");
            return {
                sidebar: Dom.getParentOf(sidebar, "split-view-view"),
                activitybar: Dom.getParentOf(activitybar, "split-view-view")
            };
        };
        // This feels more expensive than I'd like to run on every DOM
        // modification. Profile and potentially fix?
        VSCodeDom.isTabsContainer = function (node) {
            if (node.nodeType != Node.ELEMENT_NODE)
                return false;
            var domNode = node;
            return domNode.querySelector(".tabs-and-actions-container") != null;
        };
        return VSCodeDom;
    }());
    var Dom = /** @class */ (function () {
        function Dom() {
        }
        Dom.isChildOf = function (el, klass) {
            return Dom.getParentOf(el, klass) != null;
        };
        Dom.getParentOf = function (el, klass) {
            if (el == null)
                return null;
            var curEl = el;
            while (curEl != null) {
                if (curEl.classList && curEl.classList.contains(klass)) {
                    return curEl;
                }
                curEl = curEl.parentElement;
            }
            return null;
        };
        Dom.getChildOf = function (el, klass) {
            var _a;
            if (el == null)
                return null;
            for (var node = el.firstElementChild; node != null; node = (_a = node) === null || _a === void 0 ? void 0 : _a.nextElementSibling) {
                if (Dom.hasClass(node, klass))
                    return node;
            }
            return null;
        };
        Dom.getChildrenOf = function (el, klass) {
            var _a;
            var results = [];
            if (el == null)
                return results;
            for (var node = el.firstElementChild; node != null; node = (_a = node) === null || _a === void 0 ? void 0 : _a.nextElementSibling) {
                if (Dom.hasClass(node, klass))
                    results.push(node);
            }
            return results;
        };
        Dom.visitChildren = function (el, visitor) {
            var _a;
            if (el == null)
                return;
            for (var node = el.firstElementChild; node != null; node = (_a = node) === null || _a === void 0 ? void 0 : _a.nextElementSibling) {
                visitor(node);
            }
        };
        Dom.hasClass = function (el, klass) {
            if (!el)
                return false;
            return el.classList && el.classList.contains(klass);
        };
        /**
         * If the value has changed, update the numeric style by adjustment.
         *
         * The old value is stored to prevent runaway adjustments when it didn't
         * change. That is, if the code does -300, then VSCode does not change
         * update the value, and this code runs again, it would be a net -600.
         */
        Dom.updateStyle = function (el, style, adjustment) {
            if (!el || !el.style)
                return;
            var val = el.style[style];
            if (!val || val.length < 3)
                return;
            // only modify pixel values.
            if (val[val.length - 2] != "p")
                return;
            if (val[val.length - 1] != "x")
                return;
            var attrKey = "data-hack-last-" + style;
            var attr = el.getAttribute(attrKey);
            if (attr && attr == val)
                return;
            var intValue = parseInt(val, 10);
            if (isNaN(intValue) || !intValue)
                return;
            var newVal = intValue + adjustment + "px";
            el.setAttribute(attrKey, newVal);
            el.style[style] = newVal;
        };
        return Dom;
    }());
    var TabSort = /** @class */ (function () {
        function TabSort(options) {
            this.options = options;
        }
        TabSort.prototype.sort = function (a, b) {
            var sortResult = 0;
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
        };
        TabSort.typeSort = function (a, b) {
            if (a.tabType == b.tabType)
                return 0;
            if (a.tabType > b.tabType)
                return 1;
            return -1;
        };
        TabSort.projectSort = function (a, b) {
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
        };
        return TabSort;
    }());
    var CssRuleRewrite = /** @class */ (function () {
        function CssRuleRewrite(id, shouldRewriteRuleExp, rewriteRuleExp, rewriteRuleText) {
            this.id = id;
            this.shouldRewriteRuleExp = shouldRewriteRuleExp;
            this.rewriteRuleExp = rewriteRuleExp;
            this.rewriteRuleText = rewriteRuleText;
        }
        CssRuleRewrite.prototype.getTabCssRules = function () {
            var isTabRuleExpr = /\.tab(?=\s|:|$)/;
            var rules = [];
            for (var i = 0; i < document.styleSheets.length; ++i) {
                var sheet = document.styleSheets[i];
                for (var i2 = 0; i2 < sheet.rules.length; ++i2) {
                    var rule = sheet.rules[i2];
                    if (isTabRuleExpr.test(rule.selectorText)) {
                        rules.push(rule);
                    }
                }
            }
            return rules;
        };
        CssRuleRewrite.prototype.insertFixedTabCssRules = function () {
            if (document.getElementById(this.id) != null)
                return;
            var oldRules = this.getTabCssRules();
            var newRulesText = [];
            for (var _i = 0, oldRules_1 = oldRules; _i < oldRules_1.length; _i++) {
                var rule = oldRules_1[_i];
                newRulesText.push(rule.cssText.replace(/(^|,).+?(\.tab(?=\s|:|$))/g, "$1 .hack--vertical-tab-container $2"));
            }
            CssRuleRewrite.insertCssRules(this.id, newRulesText.join("\r\n"));
        };
        CssRuleRewrite.insertCssRules = function (id, rules) {
            if (document.getElementById(id) != null)
                return;
            var styleElement = document.createElement("style");
            styleElement.id = id;
            styleElement.type = "text/css";
            styleElement.appendChild(document.createTextNode(rules));
            document.head.appendChild(styleElement);
        };
        return CssRuleRewrite;
    }());
    (function () {
        var sideTabs = new VSCodeSideTabs();
        sideTabs.attach();
    })();
})(VSCodeSideTabs || (VSCodeSideTabs = {}));
