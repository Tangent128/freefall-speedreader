// Load flytable.js and jQuery before this

$(function() {
	
	/* Get Config */
	var config = SetupSpeedreader();
	
	var empty = $([]);
	config = $.extend({
		/* required:
		data
		comicContainer
		comicTmpl
		render(comicDiv, index#, metadataRecord)
		*/
		rowPadding: 20,
		scrollPadding: 300
	}, config);
	
	/* Process Data */
	
	/**
	 * process data array into form easy for flytable code to process:
	 * - calculate index and y-axis extents to determine when search has found right record
	 * - copy forward unchanged metadata attributes for use by comic renderer
	 *
	 * returns the calculated total height of the comics
	 */
	function cookData(array, rowPadding) {
		
		var prev = {i: 0, h: 0, y: 0};
		var first = array[0];
		
		// discover custom attributes
		var attributes = [];
		for(key in first) {
			if(!(key in prev)) {
				attributes.push(key);
			}
		}
		
		for(var i = 0; i < array.length; i++) {
			var item = array[i];
			
			// copy attributes forward
			for(var a = 0; a < attributes.length; a++) {
				var attr = attributes[a];
				if(!(attr in item)) {
					item[attr] = prev[attr];
				}
			}
			
			// copy height forward + ensure requested padding
			if(item.h) {
				item.h += rowPadding;
			} else {
				item.h = prev.h;
			}
			
			// calculate segment height & spanned indices
			var span = item.i - prev.i;
			item.y = prev.y + span * prev.h;
			
			prev.last = item.i;
			prev.lastY = item.y;
			prev = item;
		}
		
		// last item needs to be given explicitly
		var lastEntry = array[array.length - 1];
		array.last = lastEntry.i;
		lastEntry.last = lastEntry.i + 1;

		var lastSpan = lastEntry.last - lastEntry.i;
		var totalHeight = lastEntry.y + lastEntry.h * lastSpan;
		lastEntry.lastY = totalHeight;
		
		return totalHeight;
	};
	
	var data = config.data;
	var totalHeight = cookData(config.data, config.rowPadding);
	
	/* Setup Flytable */
	var table = setupFlyTable(config.comicContainer);
	window.DebugTable = table;

	table.scrollPadding = config.scrollPadding;

	table.getTotalHeight = function() {
		return totalHeight;
	};
	
	function getData(index) {
		for(var i = 0; i < data.length; i++) {
			var item = data[i];
			
			if(index >= item.i && index < item.last) {
				return item;
			}
		}
		return false; // failure, just crash
	};
	table.getItemTop = function(index) {
		var entry = getData(index);
		
		var offset = index - entry.i;
		var y = entry.y + entry.h * offset;

		return y;
	};
	table.getItemHeight = function(index) {
		var entry = getData(index);
		return entry.h;
	};

	table.pixelToIndex = function(y) {
		for(var i = 0; i < data.length; i++) {
			var item = data[i];
			
			if(y >= item.y && y < item.lastY) {
				var offset = y - item.y;
				
				var indexOffset = ~~(offset / item.h);
				
				return item.i + indexOffset;
			}
		}
		
		if(y <= 0) {
			return 0;
		} else {
			return data.last;
		}
	}

	table.getComponent = function(comicNum, node) {
		if(!node) {
			node = config.comicTmpl.clone();
		}
		config.render(node, comicNum, getData(comicNum));
		
		return node;
	};
	
	
	/* Setup Comic-Linking */

	function jumpToHash() {
		if(location.hash) {
			var comicNum = 1 * location.hash.replace("#", "");
			var baseY = config.comicContainer.offset().top;
			var comicY = table.getItemTop(comicNum);
			
			window.scrollTo(0, baseY + comicY);
			
			// just in case the window.scrollTo()
			// call didn't fire a scroll event
			table.render();
		}
	};
	
	function currentComic() {
		var baseY = config.comicContainer.offset().top;
		var comicY = window.scrollY - baseY;
		comicY += 80; // fudge a bit
		
		return table.pixelToIndex(comicY);
	};
	
	function updateHash() {
		if(window.history.replaceState) {
			var comicNum = currentComic();
			window.history.replaceState(comicNum, "#"+comicNum, "#"+comicNum);
		}
	};
	
	
	/* Setup Bookmarking */
	
	function getBookmarks() {
		return JSON.parse(localStorage[config.bookmarkKey] || "[]");
	};
	function updateBookmarkList(marks) {
		config.bookmarkList.empty();
		$.each(getBookmarks(), function(i) {
			var entry = config.bookmarkTmpl.clone();
			entry.find(".link").attr("href", this.url).text(this.text);
			entry.find(".deleteMark").attr("data-index", i);
			config.bookmarkList.append(entry);
		});
	};
	function saveBookmarks(marks) {
		localStorage[config.bookmarkKey] = JSON.stringify(marks);
		updateBookmarkList(marks);
	};
	
	
	/* Setup Events */
	
	$(document).on("scroll", function() {
		updateHash();
		table.render();
	});
	$(window).on("hashchange", function() {
		jumpToHash()
		table.render();
	});
	
	if(config.bookmarkBox && config.bookmarkList
	&& config.bookmarkTmpl && config.bookmarkKey) {
		
		if(window.addEventListener) {
			// can't catch this event with jQuery, somehow
			window.addEventListener("storage", function(e) {
				if(e.key == config.bookmarkKey) {
					updateBookmarkList();
				}
			});
		}
		
		$(config.bookmarkBox).on("click", ".markPlace", function() {
			var comicNum = currentComic();
			var list = getBookmarks();
			list.push({
				text: "#"+comicNum,
				url: "#"+comicNum
			});
			saveBookmarks(list);
		});
		$(config.bookmarkBox).on("click", ".deleteMark", function() {
			var index = 1 * $(this).attr("data-index");
			var list = getBookmarks();
			list.splice(index, 1);
			saveBookmarks(list);
		});

		if(window.JSON && window.localStorage) {
			config.bookmarkBox.show();
			updateBookmarkList();
		}
	}
	
	/* Kickoff */

	// pre-render ensures the page has correct vertical space usage
	table.render();
	jumpToHash();
	
});
