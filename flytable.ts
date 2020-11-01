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

  constructor(public container: HTMLElement) {}

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

  public renderSlice(startY: number, endY: number) {
    // prepare table element
    const height = this.getTotalHeight();

    this.container.style.position = "relative";
    this.container.style.height = height + "px";

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
        this.container.append(element[0]);
        this.inUse.push(element);
      }

      index++;
      y += h;
    }
  }

  public render() {
    const offset = -this.container.getBoundingClientRect().top;
    this.renderSlice(offset, offset + window.innerHeight);
  }
}

/*
 * See other stuff I've written at https://github.com/Tangent128/
 */
