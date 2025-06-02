//------------------------------------------------------------------------------
//
// ADOBE SYSTEMS INCORPORATED
// Copyright 2008 Adobe Systems Incorporated
// All Rights Reserved
//
// NOTICE: Adobe permits you to use, modify, and distribute
// this file in accordance with the terms of the Adobe license
// agreement accompanying it. If you have received this file
// from a source other than Adobe, then your use, modification,
// or distribution of it requires the prior written permission
// of Adobe.
//
//------------------------------------------------------------------------------

/*
@@@BUILDINFO@@@ AutoBurstStacks.jsx 1.0.0.0
*/

//
// AutoBurstStacks.jsx - Automatically locate and create burst sets from a folder of images.
//

// Need localizations for
/*
@@@START_XML@@@
<?xml version="1.0" encoding="UTF-8"?>
<ScriptInfo xmlns:dc="http://purl.org/dc/elements/1.1/" xml:lang="en_US">
     <dc:title>Yi's Auto Collection</dc:title>
     <dc:description>This adds features to automatically process images into stacks</dc:description>
</ScriptInfo>
@@@END_XML@@@
*/



#target bridge

// on localized builds we pull the $$$/Strings from a .dat file
$.localize = true;

// If more than this many files have the same metadata, then
// stop; something is seriously wrong with the dataset.
var kMaxSameMetadata = 300;

var kBurstKey = "burst";

///==============================================================================

// This section defines the criteria used for determining if a photo
// is part of a burst collection.

function burstBurstMatcher(name)
{
	// The time stamp (DateTimeDigitized) on the photos must be
	// AT LEAST this close to be considered for the auto-collection.
	this.kTimeDelta = 1; // 2 seconds between shots, EXIF's unit is second, we can't be more accurate

	this.collectionType = name;
}

burstMatcher = new burstBurstMatcher(kBurstKey);

// Match based on time difference only
burstMatcher.matchMetadata = function( thumb1, thumb2 )
{
	return (thumb2.cachedTime - thumb1.cachedTime <= this.kTimeDelta);
}

//==============================================================================

// Progress bar definition
//-----------------------------------------------------------------------------------------------------------------------

var kProgressRes = "dialog \
{\
	text: '$$$/AdobeScript/BridgeExtension/AutoCollection/Title=Auto Collection',\
	preferredSize: [450,-1],\
	view1: Group\
	{\
		alignment: 'fill', orientation: 'column',\
		_label: StaticText{ alignment: 'fill', text: '$$$/AdobeScript/BridgeExtension/ExamImages=Examining images...' },\
		_progress: Progressbar{ alignment: 'fill', properties: { name: 'progress' } },\
		_startAndCancel: Button{ text: '$$$/AdobeScript/BridgeExtension/AutoCollection/Cancel=Cancel      ',\
			started: false, cancelled: false,\
			properties: { name: 'cancel' }\
		},\
	}\
}";

function burstProgressIndicator()
{
	this.window = new Window( localize(kProgressRes) );
	this.progressBar = this.window.children[0]['_progress'];
	this.window.progressBar = this.progressBar;
	this.window.progressBase = this;
	this.window.cancelButton = this.window.children[0][ '_startAndCancel'];
	this.window.cancelButton.cancelled = false;
	this.window.cancelButton.onClick = function()
	{
		this.cancelled = true;
		this.text = localize("$$$/AdobeScript/BridgeExtension/AutoCollection/Canceling=Canceling...");
	}

	this.window.onIdle = function()
	{
		if ((this.progressBar.value < this.progressBar.maxvalue) && ! this.cancelButton.cancelled)
		{
			this.progressBar.value = this.progressBar.value + 1;
			this.window.update();
			this.progressBase.workFunction();
        	this.window.notify('onIdle');
		} else {
            this.close();
        }
	}
}

burstProgressIndicator.prototype.isCancelled = function()
{
	return this.window.cancelButton.cancelled;
}

burstProgressIndicator.prototype.workFunction = function()
{
	$.sleep(500);
}

burstProgressIndicator.prototype.step = function()
{
    this.window.progressBar.value = this.window.progressBar.value + 1;
    this.window.update();
}

burstProgressIndicator.prototype.setMax = function( maxval )
{
	this.window.progressBar.maxvalue = maxval;
	this.window.progressBar.value = 0;
}

burstProgressIndicator.prototype.setText = function( label )
{
	this.window.children[0]['_label'].text = label;
}

burstProgressIndicator.prototype.start = function()
{
	this.window.notify('onIdle');
	this.window.show();
}

burstProgressIndicator.prototype.fileMessage = function( msg, currentGroup )
{
	var lastName = currentGroup[currentGroup.length-1].name;
	this.setText( msg + currentGroup[0].name + ' - ' + lastName + ' (' + currentGroup.length + ')'  );
	this.window.update();
}

//==============================================================================

// Tags used for properties saved in the stacks
// The "@" allows it's use as an attribute (x[kXyzAttr] vs. x.@Xyz)
var kTypeAttr = "@collectiontype";
var kTimeAttr = "@timestamp";
var kPathAttr = "@path";
var kFlatViewAttr = "@flatview";

//==============================================================================

function burstAutoCollector()
{
	this.matcher = null;
	this.loadedComplete = false;
	this.candidateGroups = [];
	this.collectionGroups = [];
	this.cur = 0;
}

var kUserCancelErr = 8007;

var burstAutoCollect = new burstAutoCollector();

// These set up the handler that verifies that the loaded event has been executed.
// This must be done before any select/deselect calls are made.
burstAutoCollect.loadedHandler = function( event )
{
	if ((event.type == "loaded") && (event.location == "app"))
		burstAutoCollect.loadedComplete = true;
	return { handled: false };	// Let default handlers also run
}

burstAutoCollect.loadedEventHandler = { handler: burstAutoCollect.loadedHandler };

burstAutoCollect.addLoadedHandler = function()
{
	var i;
	for (i in app.eventHandlers)
		if (app.eventHandlers[i].handler == burstAutoCollect.loadedHandler)
			return;
	app.eventHandlers.push( burstAutoCollect.loadedEventHandler );
}

// CS4 used a clunky cache file to keep the folder structure in.
// We Don't Need It Anymore
burstAutoCollect.nukeOldXMLFile = function()
{
	var kCacheName = localize("$$$/JavaScripts/BridgeExtensions/AutoCollections/CacheName=AutoCollectionsCache.xml");
	var pathFolder = this.getDocumentPath();
	if (! pathFolder)
		return null;
	var xmlFile = new File( Folder(pathFolder) + "/" + kCacheName );
	if (xmlFile.exists)
		xmlFile.remove();
}

// Process the EXIF data into relevant information, and cache it in the
// thumbnail object.
burstAutoCollect.cacheMetaData = function( thumb )
{
	if (! thumb.hasMetadata)
		return false;

	// Thumbnail must have EXIF metadata with DateTimeDigitized/Original before we can process it.
	var md = thumb.metadata;
	md.namespace = "http://ns.adobe.com/exif/1.0/";

	var exifTimeString = null;

	if ((typeof( md.DateTimeDigitized ) != "undefined")
		&& (md.DateTimeDigitized.length > 0))
		exifTimeString = md.DateTimeDigitized;
	else
		if ((typeof( md.DateTimeOriginal ) != "undefined")
			&& (md.DateTimeOriginal.length > 0))
			exifTimeString = md.DateTimeOriginal;

	if (! exifTimeString)
		return false;

	var i, m = exifTimeString.match(  /(\d{4})[:-](\d{2})[:-](\d{2})[T ](\d{2}):(\d{2}):(\d{2}).*/ );
	if (! m)    // Try again w/o seconds (Bridge 3.0 bug)
	{
		m = exifTimeString.match( /(\d{4})[:-](\d{2})[:-](\d{2})[T ](\d{2}):(\d{2}).*/)
		if (! m)
			return false;

		m[6] = 0;
	}

	for (i in m)
		m[i] = Number(m[i]);
	var timestamp = new Date( m[1], m[2], m[3], m[4], m[5], m[6] );

	thumb.cachedTime = timestamp.getTime() / 1000;
	return true;
}

// Get the valid images from the current thumbnails & cache metadata
burstAutoCollect.getDocumentImages = function()
{
    var i, kids = app.document.visibleThumbnails;
    var images = [];
    var nameGroups = {}; // Store groups of files with same base name

    app.synchronousMode = true;    // Makes sure metadata is up to date

    // First pass: Group files by base name
    for (i in kids)
    {
        if (this.cacheMetaData(kids[i]))
        {
            // Use substring/lastIndexOf to remove extension for compatibility
            var name = kids[i].name;
            var dotIndex = name.lastIndexOf('.');
            var baseName = (dotIndex !== -1) ? name.substring(0, dotIndex) : name;
            if (!nameGroups[baseName]) {
                nameGroups[baseName] = [];
            }
            nameGroups[baseName].push(kids[i]);
        }
    }

    // Second pass: For each group, use the first file's time for all files in that group
    for (var baseName in nameGroups) {
        var group = nameGroups[baseName];
        if (group.length > 1) {
            // Sort the group by name to ensure consistent ordering
            group.sort(function(a, b) {
                return a.name.localeCompare(b.name);
            });
            // Use the first file's time for all files in the group
            var firstTime = group[0].cachedTime;
            for (var j = 0; j < group.length; j++) {
                group[j].cachedTime = firstTime;
                images.push(group[j]);
            }
        } else {
            // Single file, just add it
            images.push(group[0]);
        }
    }

    app.synchronousMode = false;

    // Sort by time
    function sortFunction( a, b )
    {
        if (a.cachedTime == b.cachedTime)
            return a.name.localeCompare(b.name);
        else
            return a.cachedTime - b.cachedTime;
    }

    images.sort( sortFunction );
    return images;
}

// Find candidate groups of matching images based on
// meta-data alone.    AdobePatentID="B863"
burstAutoCollect.findCandidateGroups = function( images )
{
	var i;

	this.candidateGroups = [];

	// Take a day off the base time so the times are all six digits (no "%0d" in JS)
	var baseTime = images[0].cachedTime - 100000;

	var curGroup = [images[0]];

	for (i = 0; i < images.length - 1; ++i)
	{
		if (this.matcher.matchMetadata( images[i], images[i+1] ))
		{
			curGroup[0].cachedCollectionType = this.matcher.collectionType;
			curGroup.push(images[i+1]);
		}
		else
		{
			if (curGroup.length > 1)
				this.candidateGroups.push( curGroup );
			curGroup = [images[i+1]];
		}
		if (curGroup.length > kMaxSameMetadata)
			throw("too many files");
	}

	if (curGroup.length > 1)
		this.candidateGroups.push( curGroup );
}

// If there's no cache, this takes care of finding the collections.
// Returns true if completed successfully.    AdobePatentID="B863"
burstAutoCollect.createCollections = function( images, matcher )
{
	var i;

	this.matcher = matcher;

	this.findCandidateGroups( images );
	this.cur = 0;

	if (this.candidateGroups.length == 0)
		return;

	app.synchronousMode = true;

	// Use true for production, but if it bombs, you can't debug it with ESTK.
	// the false clause below skips the progress bar but is debuggable with ESTK.
	if (true)
	{
		this.progressWindow = new burstProgressIndicator();
		this.progressWindow.workFunction = burstAutoCollect.processCandidate;
		this.progressWindow.setMax( this.candidateGroups.length );
		this.progressWindow.start();
		if (this.progressWindow.isCancelled())
			throw kUserCancelErr;
	}
	else
	{
		for (i in this.candidateGroups)
			burstAutoCollect.processCandidate( true );
	}
	app.synchronousMode = false;


	// Clean out any empty candidates after processing
	i = 0;
	while (i < this.candidateGroups.length)
	{
		if (this.candidateGroups[i].length == 0)
			this.candidateGroups.splice(i,1);
		else
			i++;
	}

	this.collectionGroups = this.collectionGroups.concat( this.candidateGroups );

	// Avoid putting the same images in the next collection
	var j, numImages = images.length;
	i = 0;
	while (i < numImages)
	{
		j = 0;
		while ((i + j < numImages) && (images[i + j].cachedCollectionType != null))
			j++;
		if (j)
		{
			images.splice(i, j);
			numImages -= j;
		}
		else
			i++;
	}
}

// This handles each call to the alignmentLib, so it can
// run in the context of the progress bar.  Note we must
// explictly refer to "burstAutoCollect" instead of "this", because "this"
// will be the progressWindow.     AdobePatentID="B863"
burstAutoCollect.processCandidate = function( skipProgress )
{
	if (typeof(skipProgress) == "undefined")
		skipProgress = false;

	var currentGroup = burstAutoCollect.candidateGroups[burstAutoCollect.cur];
	var msg = localize('$$$/AdobeScript/BridgeExtension/ExamImages=Examining images...');
	if (! skipProgress)
		burstAutoCollect.progressWindow.fileMessage( msg, currentGroup );

	try {
		// Flag the collection type based on group size
		if (currentGroup.length > 1)
		{
			for (var i in currentGroup)
				currentGroup[i].cachedCollectionType = this.matcher.collectionType;
		}
		else
		{
			if (currentGroup.length) currentGroup[0].cachedCollectionType = null;
			currentGroup.length = 0;
		}
	}
	catch (error)
	{
		// Must close the progress indicator in this context
		burstAutoCollect.progressWindow.window.close();
		// Flag progressIndicator to stop working
		burstAutoCollect.cur = burstAutoCollect.candidateGroups.length;
	}

	burstAutoCollect.cur++;
}

// Deal with the screwy URL the "path" might be if show subfolders is on
burstAutoCollect.getDocumentPath = function()
{
	var i, queryStr = "bridge:special";
	var targetStr = "target=bridge:fs:file:";
	var result = null;

	function startsWith( a, b )
	{
		return ( a.slice(0, b.length) == b );
	}

	if (startsWith( app.document.thumbnail.path, queryStr))
	{
		strs = app.document.thumbnail.path.split('&');
		for (i in strs)
			if (startsWith( strs[i], targetStr ))
				result = decodeURI( strs[i] ).slice( targetStr.length );
		// Blows up here if result not found
		return result ? result.slice( File.fs == "Windows" ? 3 : 2 ) : null;	// Remove extra /'s
	}
	else
		return app.document.thumbnail.path;
}

// Check to see if the properties in the stacks are valid
// If the mod timestamp of the folder is newer than the timestamp
// of when the stack was made, then it's invalid.
burstAutoCollect.checkValidStacks = function()
{
	var folderModDate = Folder(this.getDocumentPath()).modified;
	var stacks = app.document.stacks;
	var ourStacksFound = false;

	for (s in stacks)
	{
		if (stacks[s].isValid() && stacks[s].properties[kTimeAttr])
		{
			ourStacksFound = true;
			var d = new Date( stacks[s].properties[kTimeAttr] );
			if (d < folderModDate)
				return false;
		}
	}

	return ourStacksFound;
}

// Reload the collection information from the properties in the
// stacks
burstAutoCollect.loadCollectionFromStackProps = function()
{
	this.collectionGroups = [];
	var stacks = app.document.stacks;

	for (i in stacks)
		if (stacks[i].properties[kTypeAttr] && stacks[i].isValid())
		{
			var group = [];
			for (j in stacks[i].thumbnails)
				group.push( stacks[i].thumbnails[j] );

			group[0].cachedCollectionType = stacks[i].properties[kTypeAttr];
			this.collectionGroups.push( group );
		}

	return true;
}

// Remove all the stacks in the document (sorry if you'd made some by hand...)
burstAutoCollect.unstackDocument = function()
{
	// Unstack
	app.document.selectAll();
	app.document.chooseMenuItem("StackUngroup");
	app.document.deselectAll();
	app.document.refresh();

	// Nuke the record of the stack properties
	app.document.flushStackProperties();
	$.sleep(300);
}

// Remove only stacks created by the burstAutoCollect code
// More tweakage: Could save stacks adjusted by user?
burstAutoCollect.removeAutoStacks = function()
{
	var s, stacks = app.document.stacks;

	function removeStack( stack )
	{
		var i;
		for (i in stack.thumbnails)
			app.document.select( stack.thumbnails[i] );
		app.document.chooseMenuItem("StackUngroup");
		app.document.deselectAll();
	}

	app.document.deselectAll();

	for (s in stacks)
		if (stacks[s].properties[kTypeAttr])
			removeStack( stacks[s] )

	app.document.refresh();
	$.sleep(300);
	app.document.flushStackProperties();
}

// Load the collections, either from the stack's property caches or (if no good)
// by examining the images in this folder and rebuilding the stacks
burstAutoCollect.stackCollections = function()
{
	function gatherStack( thumbGroup )
	{
		if (thumbGroup.length > 1)
		{
			app.document.deselectAll();
			for (j in thumbGroup)
				app.document.select( thumbGroup[j] )
			app.document.chooseMenuItem("StackGroup");
			lastStack = app.document.stacks[app.document.stacks.length-1];
			lastStack.properties[kTimeAttr] = Date().toString();
			lastStack.properties[kTypeAttr] = thumbGroup[0].cachedCollectionType;
		}
	}

	if ((!this.checkValidStacks()) || (!this.loadCollectionFromStackProps()))
	{
		this.nukeOldXMLFile();
		this.removeAutoStacks();
		var images = this.getDocumentImages();
		if (images.length == 0) // Bail now if there's nothing to process
			throw("no_timestamps");
		this.collectionGroups = [];
		this.createCollections( images, burstMatcher );
		var i;
		for (i in this.collectionGroups)
			gatherStack( this.collectionGroups[i] );
		app.document.flushStackProperties();
		app.document.deselectAll();
		$.sleep(300);
		app.document.refresh();
	}
	if (this.collectionGroups.length == 0)
		alert( 'No burst image sets found.' );
}

burstAutoCollect.loadAndDoCollection = function( postLoadFunction )
{
	try {
		eval( "burstAutoCollect." + postLoadFunction + "();" );
		$.sleep(300);
		app.document.refresh();
	}
	catch (error)
	{
		if (error == "no_timestamps")
			alert(localize('$$$/BridgeExtensions/AutoCollect/NoTimestamps=No timestamps were found on any of the image files'));
		else
		if (error == "too many files")
			alert(localize('$$$/BridgeExtensions/AutoCollect/TooManyFiles=Too many files were found with matching metadata.'));
		else
		if (error != kUserCancelErr)
			alert(localize('$$$/BridgeExtensions/AutoCollect/Unknownexception=Unknown Exception'));
	}
}

burstAutoCollect.avoidConflictsWithOriginalAutoStacks = function()
{
	// do nothing, just to change typeof(burstautoCollectMenu)
}

//==============================================================================

// Avoid duplicating the menus
if (typeof(burstautoCollectMenu) == "undefined")
	burstautoCollectMenu = new MenuElement( 'command', 'Auto-Stack Bursts', 'at the end of Stacks','Auto_Stack_Bursts');

burstautoCollectMenu.onSelect = function(m)
{
	burstAutoCollect.loadAndDoCollection( "stackCollections" );
}

// Uncomment to debug in ESTK
function burstTestAS()
{
 then = new Date();
 burstAutoCollect.loadAndDoCollection( "stackCollections" );
 now = new Date();  $.writeln('time: ' + (now - then) / 1000.0 );
}

function burstDumpStacks()
{
	var i, j, stacks = app.document.stacks;

	function ifWriteln(msg, data)
	{
		if (data)
			$.writeln( msg + data );
	}

	for (i in stacks)
	{
		$.writeln('------------');
		for (j in stacks[i].thumbnails)
			$.write( stacks[i].thumbnails[j].name + ' ');
		$.writeln();
		ifWriteln('Timestamp: ', stacks[i].properties[kTimeAttr]);
		ifWriteln('Type: ', stacks[i].properties[kTypeAttr]);
		$.writeln('Stack is ' + stacks[i].isValid() ? "Valid" : "Not valid");
	}
}
