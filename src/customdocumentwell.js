"use strict";
var VSCodeSideTabs;
(function (VSCodeSideTabs_1) {
    var VSCodeSideTabsOptions = /** @class */ (function () {
        function VSCodeSideTabsOptions() {
            this.colorByProject = true;
            this.sortByFileType = true;
            this.sortByProject = true;
            this.brightenActiveTab = true;
            this.compactTabs = true;
            this.projectExpr = /([^\w]|^)src[/\\][^/\\]+/i;
            this.projectColors = {};
            this.projectCount = 0;
            this.colors = [
                "#8DA3C1", "#9D827B", "#C1AA66", "#869A87", "#C97E6C",
                "#617595", "#846A62", "#887E5C", "#607562", "#BA5E41",
                "#3D5573", "#694F47", "#696658", "#425E45"
            ];
        }
        VSCodeSideTabsOptions.prototype.extend = function (options) {
            var _a, _b, _c;
            if (options == null)
                return;
            this.sortByFileType = (_a = this.sortByFileType, (_a !== null && _a !== void 0 ? _a : options.sortByFileType));
            this.sortByProject = (_b = this.sortByProject, (_b !== null && _b !== void 0 ? _b : options.sortByProject));
            this.projectExpr = (_c = this.projectExpr, (_c !== null && _c !== void 0 ? _c : options.projectExpr));
        };
        VSCodeSideTabsOptions.prototype.getColorForProject = function (projectName) {
            var key = (projectName || "unknown").toUpperCase();
            var knownColor = this.projectColors[key];
            if (knownColor !== undefined)
                return knownColor;
            var color = this.colors[this.projectCount++ % this.colors.length];
            this.projectColors[key] = color;
            return color;
        };
        return VSCodeSideTabsOptions;
    }());
    var VSCodeSideTabs = /** @class */ (function () {
        function VSCodeSideTabs(options) {
            var _this = this;
            if (options === void 0) { options = null; }
            this.currentTabs = [];
            this.sideTabSize = "300px";
            this.eventTypes = {
                mouse: ["click", "mousedown", "mouseup", "contextmenu"],
                drag: ["drag", "dragend", "dragenter", "dragexit", "dragleave", "dragover", "dragstart", "drop"]
            };
            this.options = new VSCodeSideTabsOptions();
            this.hasStolenTabContainerInfo = false;
            this.realTabsContainers = document.querySelectorAll(".tabs-and-actions-container");
            this.tabChangeObserver = new MutationObserver(function () { return _this.reloadTabs(); });
            this.newTabContainer = document.createElement("div");
            this.newTabContainer.className = "split-view-view visible hack--vertical-tab-container";
            this.newTabContainer.style.width = this.sideTabSize;
            this.newTabContainer.style.marginLeft = "-" + this.sideTabSize;
            this.newTabContainer.style.overflowY = "auto";
            // The borderRightColor is updated later in `stealTabContainerInfo`
            this.newTabContainer.style.borderRightWidth = "1px";
            this.newTabContainer.style.borderRightStyle = "solid";
            this.newTabContainer.style.borderRightColor = "var(--title-border-bottom-color)";
            this.cssRuleRewriter = new CssRuleRewrite("", /\.tab(?=\s|:|$)/, /(^|,).+?(\.tab(?=\s|:|$))/g, "$1 .hack--vertical-tab-container $2");
            this.options.extend(options);
        }
        // Attach and add new elements to the DOM. This should only be called
        // once.
        VSCodeSideTabs.prototype.attach = function () {
            var _this = this;
            this.reloadTabContainers();
            this.cssRuleRewriter.insertFixedTabCssRules();
            var newContainerDestination = document.querySelector("#workbench\\.parts\\.editor > div > .grid-view-container");
            if (newContainerDestination == null)
                return;
            newContainerDestination.insertBefore(this.newTabContainer, newContainerDestination.firstChild);
            var that = this;
            function fixNewContainer() {
                newContainerDestination.style.display = "flex";
                newContainerDestination.style.flexDirection = "row";
                newContainerDestination.style.width = "calc(100% - " + that.sideTabSize + ");";
                newContainerDestination.style.marginLeft = that.sideTabSize;
            }
            fixNewContainer();
            var newContainerObserver = new MutationObserver(function () { return fixNewContainer(); });
            newContainerObserver.observe(newContainerDestination, {
                attributes: true,
                attributeFilter: ["style"]
            });
            // This feels more expensive than I'd like to run on every DOM
            // modification. Profile and potentially fix?
            function isListNode(node) {
                if (node.nodeType != Node.ELEMENT_NODE)
                    return false;
                var domNode = node;
                return domNode.querySelector(".tabs-and-actions-container") != null;
            }
            var domObserver = new MutationObserver(function (mutations) {
                for (var _i = 0, mutations_1 = mutations; _i < mutations_1.length; _i++) {
                    var mut = mutations_1[_i];
                    for (var i = 0; i < mut.addedNodes.length; ++i) {
                        if (isListNode(mut.addedNodes[i])) {
                            _this.reloadTabContainers();
                            return;
                        }
                    }
                    for (var i = 0; i < mut.removedNodes.length; ++i) {
                        if (isListNode(mut.removedNodes[i])) {
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
            this.addCustomCssRules();
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
        // Pass in a '.tabs-and-actions-container' element to steal the coloring
        // info from, because coloring is done usually by scoped variables.
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
        VSCodeSideTabs.prototype.createDisposableEvent = function (eventType, element, handler) {
            element.addEventListener(eventType, handler);
            return function () { return element.removeEventListener(eventType, handler); };
        };
        VSCodeSideTabs.prototype.forwardEvent = function (eventType, source, destination) {
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
            if (this.eventTypes.mouse.indexOf(eventType) != -1) {
                return this.createDisposableEvent(eventType, source, function (e) {
                    var mouseEvent = document.createEvent("MouseEvents");
                    mouseEvent.initMouseEvent(e.type, true, true, e.view, e.detail, e.screenX, e.screenY, e.clientX, e.clientY, e.ctrlKey, e.altKey, e.shiftKey, e.metaKey, e.button, e.relatedTarget);
                    var actualDest = getActualDestination(destination, e);
                    // This feels very much like play stupid games win stupid
                    // prizes. If these events are synthetically generated
                    // in real time, then their dispatching causes the "click"
                    // event to never trigger. The tabs themselves detect clicks
                    // via mousedown/mouseup. The close button requires "click".
                    if ((e.type == "mousedown" || e.type == "mouseup") &&
                        DOM.isChildOf(e.target, "tab-close")) {
                        setTimeout(function () { return actualDest.dispatchEvent(mouseEvent); }, 500);
                    }
                    else {
                        actualDest.dispatchEvent(mouseEvent);
                    }
                });
            }
            if (this.eventTypes.drag.indexOf(eventType) != -1) {
                return this.createDisposableEvent(eventType, source, function (e) {
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
            return this.createDisposableEvent(eventType, source, function (e) {
                var event = document.createEvent("Event");
                event.initEvent(e.type, true, true);
                var actualDest = getActualDestination(destination, e);
                actualDest.dispatchEvent(event);
            });
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
                for (var _i = 0, _a = this.eventTypes.mouse; _i < _a.length; _i++) {
                    var ev = _a[_i];
                    disposables.push(this.forwardEvent(ev, newTab, realTab));
                }
                for (var _b = 0, _c = this.eventTypes.drag; _b < _c.length; _b++) {
                    var ev = _c[_b];
                    disposables.push(this.forwardEvent(ev, newTab, realTab));
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
                if (this.options.colorByProject && project) {
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
            var sorted = newTabs.sort(function (a, b) { return _this.tabSort(a, b); });
            for (var _d = 0, sorted_1 = sorted; _d < sorted_1.length; _d++) {
                var tabInfo = sorted_1[_d];
                this.newTabContainer.appendChild(tabInfo.newTab);
                this.currentTabs.push(tabInfo);
            }
        };
        VSCodeSideTabs.prototype.tabSort = function (a, b) {
            var sortResult = 0;
            if (this.options.sortByProject && this.options.projectExpr) {
                sortResult = this.tabProjectSort(a, b);
                if (sortResult != 0)
                    return sortResult;
            }
            if (this.options.sortByFileType) {
                sortResult = this.tabTypeSort(a, b);
                if (sortResult != 0)
                    return sortResult;
            }
            return 0;
        };
        VSCodeSideTabs.prototype.tabTypeSort = function (a, b) {
            if (a.tabType == b.tabType)
                return 0;
            if (a.tabType > b.tabType)
                return 1;
            return -1;
        };
        VSCodeSideTabs.prototype.tabProjectSort = function (a, b) {
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
        return VSCodeSideTabs;
    }());
    var DOM = /** @class */ (function () {
        function DOM() {
        }
        DOM.isChildOf = function (el, klass) {
            var curEl = el;
            while (curEl != null) {
                if (curEl.classList && curEl.classList.contains(klass)) {
                    return true;
                }
                curEl = curEl.parentElement;
            }
            return false;
        };
        return DOM;
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
