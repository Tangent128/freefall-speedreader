// Load flytable.js and jQuery before this

$(function() {
	
	/* Get Config */
	var config = SetupSpeedreader();
	
	var empty = $([]);
	config = $.extend({
		/* required:
		data
		comicContainer
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
	var totalHeight = cookData(config.data, config.rowPadding);
		
	/* Setup Flytable */
	var table = config.table;
	table.scrollPadding = config.scrollPadding;

	table.getTotalHeight = function() {
		return totalHeight;
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
	
	/* Setup Events */
	$(document).on("scroll", function() {
		updateHash();
		table.render();
	});
	$(window).on("hashchange", function() {
		jumpToHash()
		table.render();
	});
	if(window.addEventListener) {
		// can't catch this event with jQuery, somehow
		window.addEventListener("storage", function(e) {
			if(e.key == BOOKMARK_KEY) {
				updateBookmarkList();
			}
		});
	}
	
	/* Kickoff */

	// pre-render ensures the page has correct vertical space usage
	table.render();
	jumpToHash();
	
});
