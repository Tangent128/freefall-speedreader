"use strict";
/**
 * /* ISC Licensed:
 *
 * Copyright (c) 2015-2020, Tangent128
 * Permission to use, copy, modify, and/or distribute this software for
 * any purpose with or without fee is hereby granted, provided that the
 * above copyright notice and this permission notice appear in all copies.
 *
 * THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
 * WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
 * MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
 * ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
 * WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
 * ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
 * OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
 *
 * @format
 */
// polyfill .matches()
if (!Element.prototype.matches) {
    Element.prototype.matches =
        Element.prototype.msMatchesSelector ||
            Element.prototype.webkitMatchesSelector;
}
/**
 * Implements the data structure used for relating y-positions to comic metadata.
 */
var ComicTable = /** @class */ (function () {
    /**
     * "Cook" the possibly-compacted version of the data table
     *  into a form easy for flytable code to process:
     * - calculate index and y-axis extents to determine when search has found right record
     * - copy forward unchanged metadata attributes for use by comic renderer
     */
    function ComicTable(compactData, rowPadding) {
        var _this = this;
        this.comics = [];
        var keys = Object.keys(compactData[0]);
        compactData.forEach(function (compactEntry, i) {
            var fullEntry = {};
            // copy attributes forwards
            keys.forEach(function (key) {
                if (key === "h") {
                    fullEntry.h =
                        compactEntry.h !== undefined
                            ? compactEntry.h + rowPadding
                            : _this.comics[i - 1].h;
                }
                else {
                    fullEntry[key] =
                        key in compactEntry ? compactEntry[key] : _this.comics[i - 1][key];
                }
            });
            if (i == 0) {
                fullEntry.y = 0;
            }
            else {
                // calculate segment height + span
                var prev = _this.comics[i - 1];
                var span = fullEntry.i - prev.i;
                fullEntry.y = prev.y + span * prev.h;
                // backpatch last & lastY values
                prev.last = fullEntry.i;
                prev.lastY = fullEntry.y;
            }
            _this.comics[i] = fullEntry;
        });
        // finish patching up table, filling out final entry
        var finalEntry = this.comics[this.comics.length - 1];
        finalEntry.last = finalEntry.i + 1;
        finalEntry.lastY = finalEntry.y + finalEntry.h;
    }
    ComicTable.prototype.search = function (start, end, fieldStart, fieldEnd, value) {
        var midIndex = (start + end) >> 1;
        var midItem = this.comics[midIndex];
        var midPlus = midItem[fieldStart] <= value;
        var midMinus = value < midItem[fieldEnd];
        if (midPlus && midMinus) {
            // found target
            return midItem;
        }
        else if (midPlus && midIndex + 1 < end) {
            // search items above midpoint
            return this.search(midIndex + 1, end, fieldStart, fieldEnd, value);
        }
        else if (midMinus && start < midIndex) {
            // search items below midpoint
            return this.search(start, midIndex, fieldStart, fieldEnd, value);
        }
        else {
            // nowhere left to search, this must be the closest we can get
            return midItem;
        }
    };
    ComicTable.prototype.getForIndex = function (index) {
        return this.search(0, this.comics.length, "i", "last", index);
    };
    ComicTable.prototype.getForY = function (y) {
        return this.search(0, this.comics.length, "y", "lastY", y);
    };
    ComicTable.prototype.getFirstIndex = function () {
        return this.comics[0].i;
    };
    ComicTable.prototype.getLastIndex = function () {
        return this.comics[this.comics.length - 1].i;
    };
    ComicTable.prototype.getTotalHeight = function () {
        return this.comics[this.comics.length - 1].lastY;
    };
    return ComicTable;
}());
/**
 * Implements the logic for determining what slice of comics to render
 */
var FlytableRenderer = /** @class */ (function () {
    function FlytableRenderer(
    /** the HTML element to render into */
    container, 
    /** comic date; heights + anything the renderer needs, like URLs or widths */
    data, 
    /** comic render function */
    renderer, 
    /** extra space on either side to render */
    scrollPadding) {
        this.container = container;
        this.data = data;
        this.renderer = renderer;
        this.scrollPadding = scrollPadding;
        this.inUse = [];
        this.sliceStart = 1 / 0;
        this.sliceEnd = -1;
        this.getItemTop = function (index) {
            var entry = this.data.getForIndex(index);
            var offset = index - entry.i;
            var y = entry.y + entry.h * offset;
            return y;
        };
        this.pixelToIndex = function (y) {
            if (y <= 0) {
                return this.data.getFirstIndex();
            }
            var item = this.data.getForY(y);
            if (item) {
                var offset = y - item.y;
                var indexOffset = ~~(offset / item.h);
                return item.i + indexOffset;
            }
            else {
                return this.data.getLastIndex();
            }
        };
    }
    FlytableRenderer.prototype.getComponent = function (comicNum) {
        return this.renderer(comicNum, this.data.getForIndex(comicNum));
    };
    FlytableRenderer.prototype.getItemHeight = function (index) {
        return this.data.getForIndex(index).h;
    };
    FlytableRenderer.prototype.destroyOffscreenNodes = function (startY, endY) {
        var inUse = this.inUse;
        var stillInUse = [];
        var firstVisible = this.pixelToIndex(startY);
        var lastVisible = this.pixelToIndex(endY);
        inUse.forEach(function (element) {
            var index = Number(element.getAttribute("flytable-index"));
            if (index < firstVisible || index > lastVisible) {
                element.remove();
            }
            else {
                stillInUse.push(element);
            }
        });
        this.inUse = stillInUse;
        this.sliceStart = Math.max(firstVisible, this.sliceStart);
        this.sliceEnd = Math.min(this.sliceEnd, lastVisible);
    };
    FlytableRenderer.prototype.includeInSlice = function (index) {
        this.sliceStart = Math.min(index, this.sliceStart);
        this.sliceEnd = Math.max(this.sliceEnd, index);
    };
    FlytableRenderer.prototype.renderSlice = function (startY, endY) {
        // prepare table element
        var height = this.data.getTotalHeight();
        this.container.style.position = "relative";
        this.container.style.height = height + "px";
        // pad region
        startY = Math.max(0, startY - this.scrollPadding);
        endY = Math.min(endY + this.scrollPadding, height);
        // clear offscreen nodes
        this.destroyOffscreenNodes(startY, endY);
        // loop through visible blocks
        var index = this.pixelToIndex(startY);
        var existingSliceStart = this.sliceStart;
        var existingSliceEnd = this.sliceEnd;
        for (var y = this.getItemTop(index); y < endY;) {
            var h = this.getItemHeight(index);
            if (index < existingSliceStart || index > existingSliceEnd) {
                var element = this.getComponent(index);
                element.style.position = "absolute";
                element.style.left = "0px";
                element.style.right = "0px";
                element.style.top = y + "px";
                element.style.height = h + "px";
                element.setAttribute("flytable-index", String(index));
                this.includeInSlice(index);
                this.container.appendChild(element);
                this.inUse.push(element);
            }
            index++;
            y += h;
        }
    };
    FlytableRenderer.prototype.render = function () {
        var offset = -this.container.getBoundingClientRect().top;
        this.renderSlice(offset, offset + window.innerHeight);
    };
    return FlytableRenderer;
}());
function SelectHtml(selector) {
    if (selector instanceof HTMLElement) {
        return selector;
    }
    else {
        return document.querySelector(selector);
    }
}
function FillInTemplate(element, toSet) {
    var result = SelectHtml(element).cloneNode(true);
    toSet.forEach(function (edit) {
        var child = result.querySelector(edit[0]);
        for (var name_1 in edit[1]) {
            child[name_1] = edit[1][name_1];
        }
    });
    return result;
}
function SetupSpeedreader(config) {
    /* Process Data */
    var comicTable = new ComicTable(config.data, config.rowPadding || 20);
    /* Setup Flytable */
    var container = SelectHtml(config.comicContainer);
    var table = new FlytableRenderer(container, comicTable, config.render, config.scrollPadding || 300);
    /* Setup Comic-Linking */
    function jumpToHash() {
        if (location.hash) {
            var comicNum = Number(location.hash.replace("#", ""));
            var resetY_1 = container.getBoundingClientRect().top;
            var comicY_1 = table.getItemTop(comicNum);
            // this shouldn't be necessary, but seems delaying a tick before scrolling is a little more reliable
            window.setTimeout(function () {
                window.scrollBy(0, resetY_1 + comicY_1);
                // make sure the landing zone is rendered
                table.renderSlice(-resetY_1, -resetY_1 + window.innerHeight);
            }, 0);
        }
    }
    function currentComic() {
        var comicY = -container.getBoundingClientRect().top;
        comicY += 80; // fudge a bit
        return table.pixelToIndex(comicY);
    }
    function updateHash() {
        if (window.history.replaceState) {
            var comicNum = currentComic();
            window.history.replaceState(comicNum, "#" + comicNum, "#" + comicNum);
        }
    }
    /* Setup Events */
    var lastY = 0;
    document.addEventListener("scroll", function () {
        var scrollY = window.scrollY;
        if (Math.abs(scrollY - lastY) > 50) {
            updateHash();
            table.render();
            lastY = scrollY;
        }
    });
    window.addEventListener("hashchange", function () {
        jumpToHash();
        table.render();
    });
    /* Kickoff */
    // pre-render ensures the page has correct vertical space usage
    table.render();
    jumpToHash();
}
function SetupBookmarkBox(config) {
    var _a;
    if (!(window.JSON && window.localStorage))
        return;
    /* Resolve the references to the HTML elements the bookmark box uses */
    var bookmarkBox = SelectHtml(config.bookmarkBox);
    if (bookmarkBox && !bookmarkBox.parentNode) {
        // if the bookmark box is inline HTML, add it to the page before we try to query for its list holder.
        document.body.appendChild(bookmarkBox);
    }
    var bookmarkList = SelectHtml(config.bookmarkList);
    // clone the template so we don't care if it gets wiped out
    var bookmarkTmpl = (_a = SelectHtml(config.bookmarkTmpl)) === null || _a === void 0 ? void 0 : _a.cloneNode(true);
    /* If we found everything we need, set up the events and render the bookmarks */
    if (bookmarkBox && bookmarkList && bookmarkTmpl) {
        var box_1 = new BookmarkBox(bookmarkList, bookmarkTmpl, config.bookmarkKey);
        if (window.addEventListener) {
            window.addEventListener("storage", function (e) { return box_1.handleStorageEvent(e); });
        }
        bookmarkBox.addEventListener("click", function (e) { return box_1.handleClickEvent(e); });
        box_1.updateBookmarkList();
    }
}
var BookmarkBox = /** @class */ (function () {
    function BookmarkBox(bookmarkList, bookmarkTmpl, bookmarkKey) {
        this.bookmarkList = bookmarkList;
        this.bookmarkTmpl = bookmarkTmpl;
        this.bookmarkKey = bookmarkKey;
    }
    BookmarkBox.prototype.getBookmarks = function () {
        try {
            return JSON.parse(localStorage[this.bookmarkKey]);
        }
        catch (_a) {
            return [];
        }
    };
    BookmarkBox.prototype.saveBookmarks = function (marks) {
        localStorage[this.bookmarkKey] = JSON.stringify(marks);
        this.updateBookmarkList();
    };
    BookmarkBox.prototype.updateBookmarkList = function () {
        var _this = this;
        this.bookmarkList.innerHTML = "";
        this.getBookmarks().forEach(function (bookmark, i) {
            var entry = _this.bookmarkTmpl.cloneNode(true);
            var link = entry.querySelector("[href]");
            link.href = bookmark.url;
            link.innerText = bookmark.text;
            var deleteMark = entry.querySelector("[data-delete-mark]");
            deleteMark.setAttribute("data-delete-mark", String(i));
            _this.bookmarkList.append(entry);
        });
    };
    BookmarkBox.prototype.handleStorageEvent = function (e) {
        if (e.key == this.bookmarkKey) {
            this.updateBookmarkList();
        }
    };
    BookmarkBox.prototype.handleClickEvent = function (e) {
        var target = e.target;
        if (target.matches("[data-mark-place]")) {
            var spot = location.hash;
            if (spot) {
                var list = this.getBookmarks();
                list.push({
                    text: spot,
                    url: spot,
                });
                this.saveBookmarks(list);
            }
        }
        if (target.matches("[data-delete-mark]")) {
            var index = Number(target.getAttribute("data-delete-mark"));
            var list = this.getBookmarks();
            list.splice(index, 1);
            this.saveBookmarks(list);
        }
    };
    return BookmarkBox;
}());
/*
 * See other stuff I've written at https://github.com/Tangent128/
 */
