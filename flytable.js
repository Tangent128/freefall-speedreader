/* ISC Licensed:
 * 
 * Copyright (c) 2014-2015, Tangent128 
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
 */

function setupFlyTable(element) {
	
	var table = {};
	table.container = element;
	table.recycle = [];
	table.inUse = [];
	table.sliceStart = 1/0;
	table.sliceEnd = -1;

	// extra space on either side to render
	table.scrollPadding = 10;
	
	/* Public Overrides */
	
	table.recalculate = function() {};
	
	table.getComponent = function(index, recycle) {
		if(!recycle) {
			recycle = $("<s>no renderer</s>");
		}
		
		return recycle;
	}
	
	table.recycleComponent = function(element) {};
	
	table.getItemTop = function(index) {
		return this.getItemHeight(0)*index; // arbitrary value
	}
	
	table.getItemHeight = function(index) {
		return 16; // arbitrary value
	}
	
	table.getTotalHeight = function() {
		return 160; // arbitrary value
	}

	table.pixelToIndex = function(y) {
		return ~~(y / this.getItemHeight(0));
	}

	/* Internal Functions */
	
	function recycleOffscreenNodes(table, startY, endY) {
		var container = table.container;
		var inUse = table.inUse;
		var recycle = table.recycle;
		var stillInUse = [];
		
		var firstVisible = table.pixelToIndex(startY);
		var lastVisible = table.pixelToIndex(endY);
		
		for(var i = 0; i < inUse.length; i++) {
			var element = inUse[i];
			var index = element.data("flytable-index");
			
			if(index < firstVisible || index > lastVisible) {
				recycle.push(element);
				table.recycleComponent(element);
				element.remove();
			} else {
				stillInUse.push(element);
			}
		}
		
		table.inUse = stillInUse;
		table.sliceStart = Math.max(firstVisible, table.sliceStart);
		table.sliceEnd = Math.min(table.sliceEnd, lastVisible);
	}
	function recycleAllNodes(table) {
		var inUse = table.inUse;
		var recycle = table.recycle;
		
		for(var i = 0; i < inUse.length; i++) {
			recycle.push(inUse[i]);
		}
		table.container.empty();
		
		table.inUse = [];
		table.sliceStart = 1/0;
		table.sliceEnd = -1;
	}
	
	function includeInSlice(table, index) {
		table.sliceStart = Math.min(index, table.sliceStart);
		table.sliceEnd = Math.max(table.sliceEnd, index);
	};

	function grabNode() {
		if(table.recycle.length > 0) {
			return table.recycle.pop();
		}
		return false;
	}
	
	// util, limit an event handler to only run every 40ms
	function burnout(func) {
		var burnedOut = false;
		return function(evt) {
			if(burnedOut) {
				return;
			}
			burnedOut = true;
			window.setTimeout(function() {burnedOut = false;}, 40);
			return func.apply(this, evt);
		}
	}
	
	function renderSlice(table, startY, endY) {
		// prepare table element
		var container = table.container;
		table.recalculate();
		var height = table.getTotalHeight();

		container.css({
			position: "relative",
			height: height
		});
		
		// pad region
		var startY = Math.max(0, startY - table.scrollPadding);
		var endY = Math.min(endY + table.scrollPadding, height)
		
		// clear offscreen nodes
		recycleOffscreenNodes(table, startY, endY);

		// loop through visible blocks
		var index = table.pixelToIndex(startY);
		var existingSliceStart = table.sliceStart;
		var existingSliceEnd = table.sliceEnd;

		for(var y = table.getItemTop(index); y < endY;) {
			var h = table.getItemHeight(index);

			if(index < existingSliceStart || index > existingSliceEnd) {
				var element = table.getComponent(index, grabNode());
				element.css({
					position: "absolute",
					left: "0",
					right: "0",
					top: y,
					height: h
				});
				element.data("flytable-index", index);
				includeInSlice(table, index);
				container.append(element);
				table.inUse.push(element);
			}
			
			index++;
			y += h;
		}
		
	}
	
	/* Public Methods */
	
	table.render = function() {
		var screenY = $(window).scrollTop();
		var tableY = this.container.offset().top;
		var delta = screenY - tableY;
		renderSlice(table, delta, delta + $(window).height());
	};
	
	// utility for displaying datasets of uniform row height
	// renderFunc(index of item, jQuery-wrapped node to render to)
	table.simpleDataset = function(getDataCount, templateSelector, renderFunc) {
		var tmpl;
		var rowHeight;
		
		this.recalculate = function() {
			tmpl = $(templateSelector);
			rowHeight = tmpl.height();
		}
		
		this.getComponent = function(index, node) {
			if(!node) {
				node = tmpl.clone();
			}
		
			renderFunc(index, node);
			
			return node;
		}
		
		this.getItemTop = function(index) {
			return rowHeight*index;
		}
		
		this.getItemHeight = function(index) {
			return rowHeight;
		}

		this.getTotalHeight = function() {
			return rowHeight * getDataCount();
		}
	}
	
	// utility for displaying array-based datasets
	// renderFunc(item value, jQuery-wrapped node to render to, index of item)
	table.simpleArray = function(array, templateSelector, renderFunc) {
		this.simpleDataset(
			function() {return array.length;},
			templateSelector,
			function(index, node) {
				renderFunc(array[index], node, index)
			}
		)
	}
	
	/* End */
	
	return table;
}

/*
 * See other stuff I've written at https://github.com/Tangent128/
 */
