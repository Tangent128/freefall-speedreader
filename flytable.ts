/**
 * /* ISC Licensed:
 *
 * Copyright (c) 2014-2019, Tangent128
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

class Flytable {
  inUse = [] as JQuery[];
  sliceStart = 1 / 0;
  sliceEnd = -1;

  /** extra space on either side to render */
  scrollPadding = 10;

  /* Public Overrides */
  public recalculate = function (this: Flytable) {};

  public getComponent = function (this: Flytable, _index: number): JQuery {
    return $("<s>no renderer</s>");
  };

  public getItemTop = function (this: Flytable, index: number): number {
    return this.getItemHeight(0) * index; // arbitrary value
  };

  public getItemHeight = function (this: Flytable, _index: number): number {
    return 16; // arbitrary value
  };

  public getTotalHeight = function (this: Flytable): number {
    return 160; // arbitrary value
  };

  public pixelToIndex = function (this: Flytable, y: number): number {
    return ~~(y / this.getItemHeight(0));
  };

  constructor(public container: JQuery) {}

  private destroyOffscreenNodes(startY: number, endY: number) {
    const inUse = this.inUse;
    const stillInUse: JQuery[] = [];

    const firstVisible = this.pixelToIndex(startY);
    const lastVisible = this.pixelToIndex(endY);

    inUse.forEach(element => {
      const index = element.data("flytable-index");

      if (index < firstVisible || index > lastVisible) {
        element.remove();
      } else {
        stillInUse.push(element);
      }
    });

    this.inUse = stillInUse;
    this.sliceStart = Math.max(firstVisible, this.sliceStart);
    this.sliceEnd = Math.min(this.sliceEnd, lastVisible);
  }

  private includeInSlice(index: number) {
    this.sliceStart = Math.min(index, this.sliceStart);
    this.sliceEnd = Math.max(this.sliceEnd, index);
  }

  private renderSlice(startY: number, endY: number) {
    // prepare table element
    const container = this.container;
    this.recalculate();
    const height = this.getTotalHeight();

    container.css({
      position: "relative",
      height: height,
    });

    // pad region
    startY = Math.max(0, startY - this.scrollPadding);
    endY = Math.min(endY + this.scrollPadding, height);

    // clear offscreen nodes
    this.destroyOffscreenNodes(startY, endY);

    // loop through visible blocks
    let index = this.pixelToIndex(startY);
    const existingSliceStart = this.sliceStart;
    const existingSliceEnd = this.sliceEnd;

    for (let y = this.getItemTop(index); y < endY; ) {
      const h = this.getItemHeight(index);

      if (index < existingSliceStart || index > existingSliceEnd) {
        const element = this.getComponent(index);
        element.css({
          position: "absolute",
          left: "0",
          right: "0",
          top: y,
          height: h,
        });
        element.data("flytable-index", index);
        this.includeInSlice(index);
        container.append(element);
        this.inUse.push(element);
      }

      index++;
      y += h;
    }
  }

  public render() {
    const screenY = $(window).scrollTop();
    const tableY = (this.container.offset() as JQueryCoordinates).top;
    const delta = screenY - tableY;
    this.renderSlice(delta, delta + $(window).height());
  }

  /**
   * utility for displaying datasets of uniform row height
   * @param renderFunc index of item, jQuery-wrapped node to render to
   */
  public simpleDataset(
    getDataCount: () => number,
    templateSelector: string | JQuery | HTMLElement,
    renderFunc: (index: number, node: JQuery) => void
  ) {
    let tmpl: JQuery;
    let rowHeight: number;

    this.recalculate = function () {
      tmpl = $(templateSelector);
      rowHeight = tmpl.height();
    };

    this.getComponent = function (index) {
      const node = tmpl.clone();

      renderFunc(index, node);

      return node;
    };

    this.getItemTop = function (index) {
      return rowHeight * index;
    };

    this.getItemHeight = function (index) {
      return rowHeight;
    };

    this.getTotalHeight = function () {
      return rowHeight * getDataCount();
    };
  }

  /**
   * utility for displaying array-based datasets
   * @param renderFunc (item value, jQuery-wrapped node to render to, index of item)
   */
  public simpleArray<T>(
    array: T[],
    templateSelector: string | JQuery | HTMLElement,
    renderFunc: (value: T, node: JQuery, index: number) => void
  ) {
    this.simpleDataset(
      function () {
        return array.length;
      },
      templateSelector,
      function (index, node) {
        renderFunc(array[index], node, index);
      }
    );
  }
}

function setupFlyTable(element: JQuery): Flytable {
  return new Flytable(element);
}

/*
 * See other stuff I've written at https://github.com/Tangent128/
 */
