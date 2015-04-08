// Load flytable.js and jQuery before this

$(function() {
	
	/* Get Config */
	var config = SetupSpeedreader();
	
	var empty = $([]);
	config = $.extend({
		// required: data
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
	
	/* Setup Bookmarking */
	
	/* Kickoff */

	// pre-render ensures the page has correct vertical space usage
	table.render();
	
});
