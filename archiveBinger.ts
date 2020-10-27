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
  bookmarkBox?: JQuery;
  bookmarkKey?: string;
  bookmarkList?: JQuery;
  bookmarkTmpl?: JQuery;
  comicContainer: JQuery;
  comicTmpl: JQuery;
  data: T[];
  render: (comicDiv: JQuery, index: number, metadataRecord: T) => void;
  rowPadding?: number;
  scrollPadding?: number;
};

interface Bookmark {
  text: string;
  url: string;
}

// Load flytable.js and jQuery before this
function BootSpeedreader<MetadataType extends MetadataEntry>(
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

  const table = setupFlyTable(config.comicContainer);
  (window as any).DebugTable = table;

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
      const comicNum = 1 * Number(location.hash.replace("#", ""));
      const baseY = (config.comicContainer.offset() as JQueryCoordinates).top;
      const comicY = table.getItemTop(comicNum);

      window.scrollTo(0, baseY + comicY);

      // just in case the window.scrollTo()
      // call didn't fire a scroll event
      table.render();
    }
  }

  function currentComic() {
    const baseY = (config.comicContainer.offset() as JQueryCoordinates).top;
    let comicY = window.scrollY - baseY;
    comicY += 80; // fudge a bit

    return table.pixelToIndex(comicY);
  }

  function updateHash() {
    if (window.history.replaceState) {
      const comicNum = currentComic();
      window.history.replaceState(comicNum, "#" + comicNum, "#" + comicNum);
    }
  }

  /* Setup Bookmarking */

  function getBookmarks(): Bookmark[] {
    return JSON.parse(
      (config.bookmarkKey && localStorage[config.bookmarkKey]) || "[]"
    );
  }
  function updateBookmarkList() {
    const { bookmarkList, bookmarkTmpl } = config;
    if (!(bookmarkList && bookmarkTmpl)) return;
    bookmarkList.empty();
    getBookmarks().forEach((bookmark, i) => {
      const entry = bookmarkTmpl.clone();
      entry.find(".link").attr("href", bookmark.url).text(bookmark.text);
      entry.find(".deleteMark").attr("data-index", i);
      bookmarkList.append(entry);
    });
  }
  function saveBookmarks(marks: Bookmark[]) {
    if (!config.bookmarkKey) return;
    localStorage[config.bookmarkKey] = JSON.stringify(marks);
    updateBookmarkList();
  }

  /* Setup Events */

  let lastY = 0;
  $(document).on("scroll", function (evt) {
    const scrollY = window.scrollY;
    if (Math.abs(scrollY - lastY) > 50) {
      updateHash();
      table.render();
      lastY = scrollY;
    }
  });
  $(window).on("hashchange", function () {
    jumpToHash();
    table.render();
  });

  if (
    config.bookmarkBox &&
    config.bookmarkList &&
    config.bookmarkTmpl &&
    config.bookmarkKey
  ) {
    if (window.addEventListener) {
      // can't catch this event with jQuery, somehow
      window.addEventListener("storage", function (e) {
        if (e.key == config.bookmarkKey) {
          updateBookmarkList();
        }
      });
    }

    config.bookmarkBox.on("click", ".markPlace", function () {
      const comicNum = currentComic();
      const list = getBookmarks();
      list.push({
        text: "#" + comicNum,
        url: "#" + comicNum,
      });
      saveBookmarks(list);
    });
    config.bookmarkBox.on("click", ".deleteMark", function (this: HTMLElement) {
      const index = Number($(this).attr("data-index"));
      const list = getBookmarks();
      list.splice(index, 1);
      saveBookmarks(list);
    });

    if (window.JSON && window.localStorage) {
      config.bookmarkBox.show();
      updateBookmarkList();
    }
  }

  /* Kickoff */
  processUpdate();
}
/*
 * See other stuff I've written at https://github.com/Tangent128/
 */
