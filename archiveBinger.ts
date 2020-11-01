/**
 * /* ISC Licensed:
 *
 * Copyright (c) 2015-2019, Tangent128
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
    (Element.prototype as any).msMatchesSelector ||
    (Element.prototype as any).webkitMatchesSelector;
}

type MetadataEntry = {
  i: number;
  h: number;
  y: number;
  last: number;
  lastY: number;
};

/**
 * Implements the data structure used for relating y-positions to comic metadata.
 */
class ComicTable<T extends MetadataEntry> {
  private comics: T[] = [];

  /**
   * "Cook" the possibly-compacted version of the data table
   *  into a form easy for flytable code to process:
   * - calculate index and y-axis extents to determine when search has found right record
   * - copy forward unchanged metadata attributes for use by comic renderer
   */
  constructor(compactData: Partial<T>[], rowPadding: number) {
    const keys = Object.keys(compactData[0]) as (keyof T)[];
    compactData.forEach((compactEntry, i) => {
      const fullEntry: Partial<T> = {};
      // copy attributes forwards
      keys.forEach(key => {
        if (key === "h") {
          fullEntry.h =
            compactEntry.h !== undefined
              ? compactEntry.h + rowPadding
              : this.comics[i - 1].h;
        } else {
          fullEntry[key] =
            key in compactEntry ? compactEntry[key] : this.comics[i - 1][key];
        }
      });

      if (i == 0) {
        fullEntry.y = 0;
      } else {
        // calculate segment height + span
        const prev = this.comics[i - 1];
        const span = fullEntry.i! - prev.i;
        fullEntry.y = prev.y + span * prev.h;
        // backpatch last & lastY values
        prev.last = fullEntry.i!;
        prev.lastY = fullEntry.y!;
      }
      this.comics[i] = fullEntry as T;
    });

    // finish patching up table, filling out final entry
    const finalEntry = this.comics[this.comics.length - 1];
    finalEntry.last = finalEntry.i + 1;
    finalEntry.lastY = finalEntry.y + finalEntry.h;
  }

  private search<Key1 extends keyof T, Key2 extends keyof T>(
    start: number,
    end: number,
    fieldStart: Key1,
    fieldEnd: Key2,
    value: T[Key1] & T[Key2]
  ): T {
    const midIndex = (start + end) >> 1;
    const midItem = this.comics[midIndex];

    const midPlus = midItem[fieldStart] <= value;
    const midMinus = value < midItem[fieldEnd];

    if (midPlus && midMinus) {
      // found target
      return midItem;
    } else if (midPlus && midIndex + 1 < end) {
      // search items above midpoint
      return this.search(midIndex + 1, end, fieldStart, fieldEnd, value);
    } else if (midMinus && start < midIndex) {
      // search items below midpoint
      return this.search(start, midIndex, fieldStart, fieldEnd, value);
    } else {
      // nowhere left to search, this must be the closest we can get
      return midItem;
    }
  }

  public getForIndex(index: number): T {
    return this.search(0, this.comics.length, "i", "last", index);
  }

  public getForY(y: number): T {
    return this.search(0, this.comics.length, "y", "lastY", y);
  }

  public getFirstIndex(): number {
    return this.comics[0].i;
  }

  public getLastIndex(): number {
    return this.comics[this.comics.length - 1].i;
  }

  public getTotalHeight(): number {
    return this.comics[this.comics.length - 1].lastY;
  }
}

type SpeedreaderConfig<T> = {
  comicContainer: HTMLElement | string;
  comicTmpl: JQuery;
  data: T[];
  render: (comicDiv: JQuery, index: number, metadataRecord: T) => void;
  rowPadding?: number;
  scrollPadding?: number;
};

function SelectHtml(selector: string | HTMLElement): HTMLElement | null {
  if (selector instanceof HTMLElement) {
    return selector;
  } else {
    return document.querySelector(selector);
  }
}

interface Bookmark {
  text: string;
  url: string;
}

// Load flytable.js and jQuery before this
function SetupSpeedreader<MetadataType extends MetadataEntry>(
  config: SpeedreaderConfig<Partial<MetadataType>>
): void {
  /* Process Data */
  const comicTable = new ComicTable(config.data, config.rowPadding || 20);

  let initialLoad = true;
  function processUpdate() {
    // pre-render ensures the page has correct vertical space usage
    table.render();

    if (initialLoad) {
      jumpToHash();
      initialLoad = false;
    }
  }

  /* Setup Flytable */
  const container = SelectHtml(config.comicContainer)!;
  const table = new Flytable(container);

  table.scrollPadding = config.scrollPadding || 300;

  table.getTotalHeight = () => comicTable.getTotalHeight();

  table.getItemTop = function (index) {
    const entry = comicTable.getForIndex(index);

    const offset = index - entry.i;
    const y = entry.y + entry.h * offset;

    return y;
  };
  table.getItemHeight = function (index) {
    const entry = comicTable.getForIndex(index);
    return entry.h;
  };

  table.pixelToIndex = function (y) {
    if (y <= 0) {
      return comicTable.getFirstIndex();
    }

    const item = comicTable.getForY(y);
    if (item) {
      const offset = y - item.y;
      const indexOffset = ~~(offset / item.h);

      return item.i + indexOffset;
    } else {
      return comicTable.getLastIndex();
    }
  };

  table.getComponent = function (comicNum) {
    const node = config.comicTmpl.clone();
    config.render(node, comicNum, comicTable.getForIndex(comicNum));

    return node;
  };

  /* Setup Comic-Linking */

  function jumpToHash() {
    if (location.hash) {
      const comicNum = Number(location.hash.replace("#", ""));
      const resetY = container.getBoundingClientRect().top;
      const comicY = table.getItemTop(comicNum);

      window.scrollBy(0, resetY + comicY);

      // just in case the window.scrollTo()
      // call didn't fire a scroll event
      table.render();
    }
  }

  function currentComic() {
    let comicY = -container.getBoundingClientRect().top;
    comicY += 80; // fudge a bit

    return table.pixelToIndex(comicY);
  }

  function updateHash() {
    if (window.history.replaceState) {
      const comicNum = currentComic();
      window.history.replaceState(comicNum, "#" + comicNum, "#" + comicNum);
    }
  }

  /* Setup Events */

  let lastY = 0;
  document.addEventListener("scroll", () => {
    const scrollY = window.scrollY;
    if (Math.abs(scrollY - lastY) > 50) {
      updateHash();
      table.render();
      lastY = scrollY;
    }
  });
  window.addEventListener("hashchange", () => {
    jumpToHash();
    table.render();
  });

  /* Kickoff */
  processUpdate();
}

interface BookmarkConfig {
  bookmarkBox: string | HTMLElement;
  bookmarkKey: string;
  bookmarkList: string | HTMLElement;
  bookmarkTmpl: string | HTMLElement;
}

function SetupBookmarkBox(config: BookmarkConfig): void {
  if (!(window.JSON && window.localStorage)) return;

  /* Resolve the references to the HTML elements the bookmark box uses */
  const bookmarkBox = SelectHtml(config.bookmarkBox);
  if (bookmarkBox && !bookmarkBox.parentNode) {
    // if the bookmark box is inline HTML, add it to the page before we try to query for its list holder.
    document.body.appendChild(bookmarkBox);
  }
  const bookmarkList = SelectHtml(config.bookmarkList);
  // clone the template so we don't care if it gets wiped out
  const bookmarkTmpl = SelectHtml(config.bookmarkTmpl)?.cloneNode(
    true
  ) as HTMLElement | null;

  /* If we found everything we need, set up the events and render the bookmarks */
  if (bookmarkBox && bookmarkList && bookmarkTmpl) {
    const box = new BookmarkBox(bookmarkList, bookmarkTmpl, config.bookmarkKey);

    if (window.addEventListener) {
      window.addEventListener("storage", e => box.handleStorageEvent(e));
    }

    bookmarkBox.addEventListener("click", e => box.handleClickEvent(e));

    box.updateBookmarkList();
  }
}

class BookmarkBox {
  constructor(
    private bookmarkList: HTMLElement,
    private bookmarkTmpl: HTMLElement,
    private bookmarkKey: string
  ) {}

  getBookmarks(): Bookmark[] {
    try {
      return JSON.parse(localStorage[this.bookmarkKey]);
    } catch {
      return [];
    }
  }

  saveBookmarks(marks: Bookmark[]) {
    localStorage[this.bookmarkKey] = JSON.stringify(marks);
    this.updateBookmarkList();
  }

  updateBookmarkList() {
    this.bookmarkList.innerHTML = "";
    this.getBookmarks().forEach((bookmark, i) => {
      const entry = this.bookmarkTmpl.cloneNode(true) as HTMLElement;
      const link = entry.querySelector("[href]") as HTMLAnchorElement;
      link.href = bookmark.url;
      link.innerText = bookmark.text;
      const deleteMark = entry.querySelector(
        "[data-delete-mark]"
      ) as HTMLElement;
      deleteMark.setAttribute("data-delete-mark", String(i));
      this.bookmarkList.append(entry);
    });
  }

  handleStorageEvent(e: StorageEvent) {
    if (e.key == this.bookmarkKey) {
      this.updateBookmarkList();
    }
  }

  handleClickEvent(e: MouseEvent) {
    const target = e.target as HTMLElement;

    if (target.matches("[data-mark-place]")) {
      const spot = location.hash;
      if (spot) {
        const list = this.getBookmarks();
        list.push({
          text: spot,
          url: spot,
        });
        this.saveBookmarks(list);
      }
    }

    if (target.matches("[data-delete-mark]")) {
      const index = Number(target.getAttribute("data-delete-mark"));
      const list = this.getBookmarks();
      list.splice(index, 1);
      this.saveBookmarks(list);
    }
  }
}

/*
 * See other stuff I've written at https://github.com/Tangent128/
 */
