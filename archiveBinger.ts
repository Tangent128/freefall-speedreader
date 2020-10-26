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

/** Utility Functions (for use by configuration) */
namespace SpeedreaderUtility {
  export function fixedLen(num: number, len: number): string {
    return ("0000000000000000" + num).slice(-len);
  }
}

type MetadataEntry = {
  i: number;
  h: number;
  y: number;
  last: number;
  lastY: number;
};

type SpeedreaderConfig<T> = {
  bookmarkBox?: JQuery;
  bookmarkKey?: string;
  bookmarkList?: JQuery;
  bookmarkTmpl?: JQuery;
  comicContainer: JQuery;
  comicTmpl: JQuery;
  onSetup: (data: T[]) => void;
  render: (comicDiv: JQuery, index: number, metadataRecord: T) => void;
  rowPadding: number;
  scrollPadding: number;
} & (
  | {
      data: T[];
    }
  | {
      dataPromise: JQueryPromise<T[]>;
    }
);

interface Bookmark {
  text: string;
  url: string;
}

// Load flytable.js and jQuery before this
function BootSpeedreader<MetadataType extends MetadataEntry>(
  SetupSpeedreader: (
    Utility: typeof SpeedreaderUtility
  ) => SpeedreaderConfig<Partial<MetadataType>>
): void {
  /* Get Config */
  const loadedConfig = SetupSpeedreader(SpeedreaderUtility);
  let config: SpeedreaderConfig<MetadataType> = $.extend(
    {
      /* required:
    data | dataPromise
    comicContainer
    comicTmpl
    render(comicDiv, index#, metadataRecord)
    */
      rowPadding: 20,
      scrollPadding: 300,
    },
    loadedConfig
  );

  /* Process Data */

  let data: MetadataType[] = [
    { i: 0, h: 0, y: 0, last: 1, lastY: 1 } as MetadataType,
  ];
  let last = 0;
  let totalHeight = 0;

  let initialLoad = true;
  function processUpdate(
    newConfig: SpeedreaderConfig<MetadataType>,
    newData: MetadataType[]
  ) {
    config = newConfig;
    data = newData;
    totalHeight = cookData(data, config.rowPadding);

    // pre-render ensures the page has correct vertical space usage
    table.render();

    if (initialLoad) {
      jumpToHash();
      initialLoad = false;
    }

    if (config.onSetup) {
      config.onSetup(data);
    }
  }
  function updateData(config: SpeedreaderConfig<MetadataType>) {
    if ("data" in config) {
      processUpdate(config, config.data);
    }
    if ("dataPromise" in config) {
      config.dataPromise.then(function (data) {
        processUpdate(config, data as MetadataType[]);
      });
    }
  }

  /**
   * process data array into form easy for flytable code to process:
   * - calculate index and y-axis extents to determine when search has found right record
   * - copy forward unchanged metadata attributes for use by comic renderer
   *
   * returns the calculated total height of the comics
   */
  function cookData<T extends MetadataEntry>(
    array: T[],
    rowPadding: number
  ): number {
    let prev = { i: 0, h: 0, y: 0 } as Partial<T>;
    const first = array[0];

    // discover custom attributes
    const attributes = [] as (keyof T)[];
    for (const key in first) {
      if (!(key in prev)) {
        attributes.push(key);
      }
    }

    array.forEach(item => {
      // copy attributes forward
      attributes.forEach(attr => {
        if (!(attr in item)) {
          item[attr] = prev[attr] as T[keyof T];
        }
      });

      // copy height forward + ensure requested padding
      if (item.h) {
        item.h += rowPadding;
      } else {
        item.h = prev.h as number;
      }

      // calculate segment height & spanned indices
      const span = item.i - (prev.i as number);
      item.y = (prev.y as number) + span * (prev.h as number);

      prev.last = item.i;
      prev.lastY = item.y;
      prev = item;
    });

    // last item needs to be given explicitly
    const lastEntry = array[array.length - 1];
    last = lastEntry.i;
    lastEntry.last = lastEntry.i + 1;

    const lastSpan = lastEntry.last - lastEntry.i;
    const totalHeight = lastEntry.y + lastEntry.h * lastSpan;
    lastEntry.lastY = totalHeight;

    return totalHeight;
  }

  /* Setup Flytable */

  const table = setupFlyTable(config.comicContainer);
  (window as any).DebugTable = table;

  table.scrollPadding = config.scrollPadding;

  table.getTotalHeight = function () {
    return totalHeight;
  };

  function search<
    Key1 extends keyof MetadataType,
    Key2 extends keyof MetadataType
  >(
    start: number,
    end: number,
    fieldStart: Key1,
    fieldEnd: Key2,
    value: MetadataType[Key1] & MetadataType[Key2]
  ): MetadataType {
    const midIndex = (start + end) >> 1;
    const midItem = data[midIndex];

    const midPlus = midItem[fieldStart] <= value;
    const midMinus = value < midItem[fieldEnd];

    if (midPlus && midMinus) {
      // found target
      return midItem;
    } else if (midPlus && midIndex + 1 < end) {
      // search items above midpoint
      return search(midIndex + 1, end, fieldStart, fieldEnd, value);
    } else if (midMinus && start < midIndex) {
      // search items below midpoint
      return search(start, midIndex, fieldStart, fieldEnd, value);
    } else {
      // nowhere left to search, this must be the closest we can get
      return midItem;
    }
  }
  function getData(index: number) {
    return search(0, data.length, "i", "last", index);
  }
  table.getItemTop = function (index) {
    const entry = getData(index);

    const offset = index - entry.i;
    const y = entry.y + entry.h * offset;

    return y;
  };
  table.getItemHeight = function (index) {
    const entry = getData(index);
    return entry.h;
  };

  table.pixelToIndex = function (y) {
    if (y <= 0) {
      return data[0].i;
    }

    const item = search(0, data.length, "y", "lastY", y);
    if (item) {
      const offset = y - item.y;
      const indexOffset = ~~(offset / item.h);

      return item.i + indexOffset;
    } else {
      return last;
    }
  };

  table.getComponent = function (comicNum) {
    const node = config.comicTmpl.clone();
    config.render(node, comicNum, getData(comicNum));

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
  updateData(config);
}
/*
 * See other stuff I've written at https://github.com/Tangent128/
 */
