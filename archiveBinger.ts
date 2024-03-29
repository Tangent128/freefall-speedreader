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

type Renderer<T> = (index: number, metadataRecord: T) => HTMLElement;

/**
 * Inclusive range indicating a subset of comics to display.
 */
type ComicRange = {
  readonly from: number;
  readonly to: number;
};

/**
 * Implements the data structure used for relating y-positions to comic metadata.
 */
class ComicTable<T extends MetadataEntry> {
  private comics: T[] = [];
  public readonly fullRange: ComicRange;

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

    // establish total range of comics
    this.fullRange = {
      from: this.comics[0].i,
      to: this.comics[this.comics.length - 1].i,
    };
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

  private getAbsItemTop(index: number): number {
    const entry = this.getForIndex(index);

    const offset = index - entry.i;
    const y = entry.y + entry.h * offset;

    return y;
  }

  private getForY(y: number): T {
    return this.search(0, this.comics.length, "y", "lastY", y);
  }

  public pixelToIndex(range: ComicRange, y: number): number {
    if (y <= 0) {
      return range.from;
    }

    const fromY = this.getAbsItemTop(range.from);

    const item = this.getForY(fromY + y);
    if (item) {
      const offset = fromY + y - item.y;
      const indexOffset = Math.floor(offset / item.h);

      return item.i + indexOffset;
    } else {
      return range.to;
    }
  }

  public getItemTop(range: ComicRange, index: number): number {
    return this.getAbsItemTop(index) - this.getAbsItemTop(range.from);
  }

  public getItemHeight(index: number): number {
    return this.getForIndex(index).h;
  }

  public getRangeHeight(range: ComicRange): number {
    return this.getItemTop(range, range.to) + this.getItemHeight(range.to);
  }
}

/**
 * Implements the logic for determining what slice of comics to render
 */
class FlytableRenderer<T extends MetadataEntry> {
  inUse: { html: HTMLElement; comicIndex: number }[] = [];
  sliceStart = 1 / 0;
  sliceEnd = -1;
  range: ComicRange;

  constructor(
    /** the HTML element to render into */
    public container: HTMLElement,
    /** comic data; heights + anything the renderer needs, like URLs or widths */
    private data: ComicTable<T>,
    /** comic render function */
    private renderer: Renderer<T>,
    /** extra space on either side to render */
    private scrollPadding: number
  ) {
    this.range = data.fullRange;
  }

  private getHtml(comicNum: number): HTMLElement {
    return this.renderer(comicNum, this.data.getForIndex(comicNum));
  }

  private destroyOffscreenNodes(
    range: ComicRange,
    startY: number,
    endY: number
  ) {
    const firstVisible = this.data.pixelToIndex(range, startY);
    const lastVisible = this.data.pixelToIndex(range, endY);

    this.inUse = this.inUse.filter(({ comicIndex, html }) => {
      const keeping = comicIndex >= firstVisible && comicIndex <= lastVisible;
      if (!keeping) {
        html.parentNode?.removeChild(html);
      }
      return keeping;
    });

    this.sliceStart = Math.max(firstVisible, this.sliceStart);
    this.sliceEnd = Math.min(this.sliceEnd, lastVisible);
  }

  private includeInSlice(index: number) {
    this.sliceStart = Math.min(index, this.sliceStart);
    this.sliceEnd = Math.max(this.sliceEnd, index);
  }

  public renderSlice(range: ComicRange, startY: number, endY: number) {
    // give the page-sized container that holds all the comics the correct size
    const height = this.data.getRangeHeight(range);
    this.container.style.height = height + "px";

    // make sure that the comic container is the reference point for comic locations
    this.container.style.position = "relative";

    // add padding to the "on-screen" region so comics can load before they're scrolled in
    startY = Math.max(0, startY - this.scrollPadding);
    endY = Math.min(endY + this.scrollPadding, height);

    // clear comics that no longer need to be on-screen
    this.destroyOffscreenNodes(range, startY, endY);

    // loop through each of the comics that should be on-screen right now
    let comicIndex = this.data.pixelToIndex(range, startY);
    const existingSliceStart = this.sliceStart;
    const existingSliceEnd = this.sliceEnd;

    for (let y = this.data.getItemTop(range, comicIndex); y < endY; ) {
      const h = this.data.getItemHeight(comicIndex);

      // if this comic isn't already onscreen, render it
      if (comicIndex < existingSliceStart || comicIndex > existingSliceEnd) {
        const element = this.getHtml(comicIndex);

        // place the comic at the correct location within the comic container
        element.style.position = "absolute";
        element.style.left = "0px";
        element.style.right = "0px";
        element.style.top = y + "px";
        element.style.height = h + "px";

        this.includeInSlice(comicIndex);
        this.container.appendChild(element);
        this.inUse.push({ html: element, comicIndex });
      }

      // move on to the next comic
      comicIndex++;
      y += h;
    }
  }

  public render() {
    const offset = -this.container.getBoundingClientRect().top;
    this.renderSlice(this.range, offset, offset + window.innerHeight);
  }
}

type SpeedreaderConfig<T> = {
  comicContainer: HTMLElement | string;
  data: T[];
  render: Renderer<T>;
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

function FillInTemplate(
  element: string | HTMLElement,
  toSet: [string, Record<string, string>][]
): HTMLElement {
  const result = SelectHtml(element)!.cloneNode(true) as HTMLElement;
  toSet.forEach(edit => {
    const child = result.querySelector(edit[0]);
    for (const name in edit[1]) {
      (child as any)[name] = edit[1][name];
    }
  });
  return result;
}

interface Bookmark {
  text: string;
  url: string;
}

function SetupSpeedreader<T extends MetadataEntry>(
  config: SpeedreaderConfig<Partial<T>>
): void {
  /* Process Data */
  const comicTable = new ComicTable(config.data, config.rowPadding || 20);

  /* Setup Flytable */
  const container = SelectHtml(config.comicContainer)!;
  const table = new FlytableRenderer<T>(
    container,
    comicTable,
    config.render,
    config.scrollPadding || 300
  );

  /* Define view state that can be read/written to URL hash */
  interface HashOptions {
    comicNumber: number;
    range?: ComicRange;
  }
  let options: HashOptions = { comicNumber: comicTable.fullRange.from };

  function ParseHash(hash: string): HashOptions {
    const comicNumberMatch = hash.match(/^#(\d+)/);
    const rangeMatch = hash.match(/,range=(\d+)-(\d+)/);

    return {
      comicNumber: comicNumberMatch
        ? Number(comicNumberMatch[1])
        : comicTable.fullRange.from,
      range: rangeMatch
        ? { from: Number(rangeMatch[1]), to: Number(rangeMatch[2]) }
        : undefined,
    };
  }
  function FormatHash(options: HashOptions): string {
    return `#${options.comicNumber}${
      options.range ? `,range=${options.range.from}-${options.range.to}` : ""
    }`;
  }

  /* Setup Comic-Linking */
  function jumpToHash() {
    if (location.hash) {
      options = ParseHash(location.hash);
      table.range = options.range ?? comicTable.fullRange;

      const resetY = container.getBoundingClientRect().top;
      const comicY = comicTable.getItemTop(table.range, options.comicNumber);

      // this shouldn't be necessary, but seems delaying a tick before scrolling is a little more reliable
      window.setTimeout(() => {
        window.scrollBy(0, resetY + comicY);

        // make sure the landing zone is rendered
        table.renderSlice(table.range, -resetY, -resetY + window.innerHeight);
      }, 0);
    }
  }

  function currentComic() {
    let comicY = -container.getBoundingClientRect().top;
    comicY += 80; // fudge a bit

    return comicTable.pixelToIndex(table.range, comicY);
  }

  function updateHash() {
    if (window.history.replaceState) {
      const comicNum = currentComic();
      const hash = FormatHash({
        comicNumber: comicNum,
        range: options.range,
      });
      window.history.replaceState(comicNum, hash, hash);
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
  // pre-render ensures the page has correct vertical space usage
  table.render();
  jumpToHash();
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
