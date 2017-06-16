import { debounce } from 'lodash';
import { EditorLock, Event, EventData, Range } from './core';
import { defaultFormatter } from './formatters/defaultFormatter';
// shared across all grids on the page
var scrollbarDimensions;
var maxSupportedCssHeight; // browser's breaking point
export const COLUMNS_TO_LEFT = -1;
export const COLUMNS_TO_RIGHT = 1;
export class SlickGrid {
    // Renaming Objects / Variables
    // yep, an array objectk instance with properties. yay @js!
    // $viewport          > contentViewport.el
    // $canvas            > contentCanvas.el
    // canvasWidth        > contentCanvas.width
    // canvasWidthL       > contentCanvas[0].width
    // canvasWidthR       > contentCanvas[1].width
    // headersWidth       > header.width
    // headersWidthL      > header[0].width
    // headersWidthR      > header[1].width
    // all.viewportWidth  > contentViewport.width
    // c.viewportHeight   > contentViewport.height
    // c.paneHeight       > DEPRECIATED. difference from contentViewport.height?
    //////////////////////////////////////////////////////////////////////////////////////////////
    // Initialization
    constructor(container, data, columns, options) {
        this.container = container;
        this.data = data;
        this.columns = columns;
        // Events
        this.onScroll = new Event();
        this.onSort = new Event();
        this.onHeaderMouseEnter = new Event();
        this.onHeaderMouseLeave = new Event();
        this.onHeaderContextMenu = new Event();
        this.onSubHeaderContextMenu = new Event();
        this.onHeaderClick = new Event();
        this.onHeaderCellRendered = new Event();
        this.onHeaderColumnDragStart = new Event();
        this.onHeaderColumnDrag = new Event();
        this.onHeaderColumnDragEnd = new Event();
        this.onHeadersCreated = new Event(); // Throws once after all headers and subheaders are created (or re-created)
        this.onBeforeHeaderCellDestroy = new Event();
        this.onSubHeaderCellRendered = new Event();
        this.onBeforeSubHeaderCellDestroy = new Event();
        this.onMouseEnter = new Event();
        this.onMouseLeave = new Event();
        this.onClick = new Event();
        this.onDblClick = new Event();
        this.onContextMenu = new Event();
        this.onBeforeKeyDown = new Event();
        this.onKeyDown = new Event();
        this.onAddNewRow = new Event();
        this.onValidationError = new Event();
        this.onViewportChanged = new Event();
        this.onRender = new Event();
        this.onInvalidate = new Event();
        this.onColumnsReordered = new Event();
        this.onColumnsResized = new Event();
        this.onColumnsChanged = new Event();
        this.onCellChange = new Event();
        this.onBeforeEditCell = new Event();
        this.onBeforeCellEditorDestroy = new Event();
        this.onBeforeDestroy = new Event();
        this.onActiveCellChanged = new Event();
        this.onActiveCellPositionChanged = new Event();
        this.onActiveRowChanged = new Event();
        this.onDragInit = new Event();
        this.onDragStart = new Event();
        this.onDrag = new Event();
        this.onDragEnd = new Event();
        this.onSelectedRowsChanged = new Event();
        this.onCellCssStylesChanged = new Event();
        // settings
        this.defaults = {
            explicitInitialization: false,
            rowHeight: 25,
            defaultColumnWidth: 80,
            absoluteColumnMinWidth: 20,
            enableAddRow: false,
            leaveSpaceForNewRows: false,
            editable: false,
            autoEdit: true,
            enableCellNavigation: true,
            enableColumnReorder: false,
            enableColumnResize: true,
            asyncEditorLoading: false,
            asyncEditorLoadDelay: 100,
            forceFitColumns: false,
            enableAsyncPostRender: false,
            asyncPostRenderDelay: 50,
            autoHeight: false,
            editorLock: new EditorLock(),
            showSubHeaders: false,
            addRowIndexToClassName: true,
            formatterFactory: undefined,
            editorFactory: undefined,
            cellFlashingCssClass: 'flashing',
            selectedCellCssClass: 'selected',
            multiSelect: true,
            enableTextSelectionOnCells: false,
            dataItemColumnValueExtractor: undefined,
            fullWidthRows: false,
            multiColumnSort: false,
            defaultFormatter,
            columnHeaderRenderer: this.columnHeaderRenderer,
            subHeaderRenderers: [],
            forceSyncScrolling: false,
            addNewRowCssClass: 'new-row',
            useAntiscroll: false,
            showScrollbarsOnHover: false,
            skipPaging: false,
            appendSubheadersToContainer: false,
            scrollbarSize: undefined,
            maxSupportedCssHeight: undefined,
            resizeOnlyDraggedColumn: true,
            syncColumnCellResize: true
        };
        this.columnDefaults = {
            name: '',
            resizable: true,
            sortable: false,
            minWidth: this.defaults.absoluteColumnMinWidth,
            rerenderOnResize: false,
            headerCssClass: undefined,
            defaultSortAsc: true,
            focusable: true,
            selectable: true
        };
        this.page = 0; // current page
        this.offset = 0; // current page offset
        this.vScrollDir = 1;
        // private
        this.initialized = false;
        this.objectName = 'slickGrid';
        this.uid = this.objectName + '_' + Math.round(1000000 * Math.random());
        this.options = this.defaults;
        // TODO: move all state to this object
        this.state = {
            invalidateSafeCellChangeCallback: null // Function|null
        };
        this.tabbingDirection = 1;
        this.activeCellNode = null;
        this.currentEditor = null;
        this.rowsCache = {};
        this.renderedRows = 0;
        this.prevScrollTop = 0;
        this.scrollTop = 0;
        this.lastRenderedScrollTop = 0;
        this.lastRenderedScrollLeft = 0;
        this.prevScrollLeft = 0;
        this.scrollLeft = 0;
        this.selectedRows = [];
        this.plugins = [];
        this.cellCssClasses = {};
        this.columnIdxById = {};
        this.sortColumns = [];
        this.columnPosLeft = [];
        this.columnPosRight = [];
        // async call handles
        this.h_editorLoader = null;
        this.h_render = null;
        this.h_postrender = null;
        this.postProcessedRows = {};
        this.postProcessToRow = null;
        this.postProcessFromRow = null;
        // perf counters
        this.counter_rows_rendered = 0;
        this.counter_rows_removed = 0;
        /*
          ## Visual Grid Components
      
          To support pinned columns, we slice up the grid regions, and try to be very clear and consistent about the naming.
          All UI region info objects start as an array with a left [0] and right [1] side
          Dom elements are stored at the top level together (still in a left/right pair) because jquery deals with multiple elements nicely. (eg: el.empty(), el.children())
          topViewport.width     // combined width
          topViewport[0].width  // left width
          topViewport.el        // both els
          topViewport.el[0]     // left el
      
              [0]    [1]
              .....................
              .      .            .
              .  TL  .     TR     .
              .      .            .
              .....................
              .      .            .
              .      .            .
              .      .            .
              .  CL  .     CR     .
              .      .            .
              .      .            .
              .      .            .
              .....................
      
          */
        /** The scrolling region */
        this.topViewport = {};
        /** The full size of content (both off and on screen) */
        this.topCanvas = {};
        /** The column headers */
        this.header = {};
        /** Optional rows of cells below the column headers */
        this.subHeaders = {};
        /**
         * Content viewports are wrapped with elements that have the same dimensions
         * as the viewports themselves. This is in service of the antiscroll plugin.
         */
        this.contentViewportWrap = {};
        /** The scrolling region for the grid rows */
        this.contentViewport = {};
        /** Full size of row content, both width and height */
        this.contentCanvas = { widths: [] };
        this._handleSelectedRangesChanged = this.handleSelectedRangesChanged.bind(this);
        this.debouncedUpdateAntiscroll = debounce(() => this.updateAntiscroll(), 500);
        // calculate these only once and share between grid instances
        maxSupportedCssHeight = maxSupportedCssHeight || this.getMaxSupportedCssHeight();
        scrollbarDimensions = scrollbarDimensions || this.measureScrollbar();
        this.options = $.extend({}, this.defaults, options);
        if (this.options.useAntiscroll && !$.isFunction($.fn.antiscroll)) {
            throw new ReferenceError('The { useAntiscroll: true } option was passed to SlickGrid, but the antiscroll library is not loaded. You can download the library here: https://github.com/bcherny/antiscroll.');
        }
        this.validateAndEnforceOptions();
        this.columnDefaults.width = this.options.defaultColumnWidth;
        this.enforceWidthLimits(columns);
        // validate loaded JavaScript modules against requested options
        if (this.options.enableColumnReorder && !$.fn.sortable) {
            throw new Error('SlickGrid\'s \'enableColumnReorder = true\' option requires jquery-ui.sortable module to be loaded');
        }
        this.editController = {
            commitCurrentEdit: this.commitCurrentEdit.bind(this),
            cancelCurrentEdit: this.cancelCurrentEdit.bind(this)
        };
        if (this.initialized) {
            return;
        }
        this.initialized = true;
        this.container = this.container;
        this.$container = $(this.container);
        if (this.$container.length < 1) {
            throw new Error('SlickGrid requires a valid container, ' + this.container + ' does not exist in the DOM.');
        }
        this.$container.empty().addClass(this.objectName + ' ' + this.uid + ' ui-widget');
        // set up a positioning container if needed
        if (!/relative|absolute|fixed/.test(this.$container.css('position'))) {
            this.$container.css('position', 'relative');
        }
        this.$focusSink = $('<div tabIndex=\'0\' hideFocus class=\'focus-sink\'></div>').appendTo(this.$container);
        /* SlickGrid Dom structure:
          .slickGrid
          .viewport.T.L > .canvas.T.L
          .header
          .subHeaders > .subHeader-row * M
          .viewport.T.R > .canvas.T.R
          .header
          .subHeaders > .subHeader-row * M
          .viewport.C.L > .canvas.C.L
          .row * N
          .viewport.C.R > .canvas.C.R
          .row * N
          */
        // ----------------------- Create the elements
        this.topViewport.el = $('<div class=\'viewport T L\' tabIndex=\'0\' hideFocus />' +
            '<div class=\'viewport T R\' tabIndex=\'0\' hideFocus />');
        this.topCanvas.el = $('<div class=\'canvas T L\' />' +
            '<div class=\'canvas T R\' />');
        this.header.el = $('<div class=\'header\' />' +
            '<div class=\'header\' />');
        this.subHeaders.el = $('<div class=\'subHeaders\' />' +
            '<div class=\'subHeaders\' />');
        if (!this.options.showSubHeaders) {
            this.subHeaders.el.hide();
        }
        this.contentViewportWrap.el = $('<div class=\'viewport-wrap C L\' tabIndex=\'0\' hideFocus />' +
            '<div class=\'viewport-wrap C R\' tabIndex=\'0\' hideFocus />');
        this.contentViewport.el = $('<div class=\'viewport C L antiscroll-inner\' tabIndex=\'0\' hideFocus />' +
            '<div class=\'viewport C R antiscroll-inner\' tabIndex=\'0\' hideFocus />');
        this.contentCanvas.el = $('<div class=\'canvas C L\' tabIndex=\'0\' hideFocus />' +
            '<div class=\'canvas C R\' tabIndex=\'0\' hideFocus />');
        // ----------------------- Matryoshka the elements together
        this.topCanvas.el[0].appendChild(this.header.el[0]);
        this.topCanvas.el[1].appendChild(this.header.el[1]);
        this.topViewport.el[0].appendChild(this.topCanvas.el[0]);
        this.topViewport.el[1].appendChild(this.topCanvas.el[1]);
        this.contentViewport.el[0].appendChild(this.contentCanvas.el[0]);
        this.contentViewport.el[1].appendChild(this.contentCanvas.el[1]);
        this.contentViewportWrap.el[0].appendChild(this.contentViewport.el[0]);
        this.contentViewportWrap.el[1].appendChild(this.contentViewport.el[1]);
        this.injectSubheaders(this.options.appendSubheadersToContainer);
        this.$container.append(this.topViewport.el, this.contentViewportWrap.el);
        this.measureCssSizes(); // Wins award for most 's'es in a row.
        // Default the active canvas to the top left
        this.$activeCanvasNode = this.contentCanvas.el.eq(0);
        this.$focusSink2 = this.$focusSink.clone().appendTo(this.$container); // after the grid, in tab index order.
        // Start of original finishInitialization
        this.calculateViewportWidth();
        // for usability reasons, all text selection in SlickGrid is disabled
        // with the exception of input and textarea elements (selection must
        // be enabled there so that editors work as expected); note that
        // selection in grid cells (grid body) is already unavailable in
        // all browsers except IE
        this.disableSelection(this.header.el); // disable all text selection in header (including input and textarea)
        if (!this.options.enableTextSelectionOnCells) {
            // disable text selection in grid cells except in input and textarea elements
            // (this is IE-specific, because selectstart event will only fire in IE)
            this.contentViewport.el.bind('selectstart.ui', function (event) {
                return $(event.target).is('input,textarea');
            });
        }
        this.updateColumnCaches();
        this.createCssRules();
        this.updatePinnedState();
        this.setupColumnSort();
        this.bindAncestorScrollEvents();
        this.$container
            .bind('resize.slickgrid', this.resizeCanvas.bind(this));
        this.contentViewport.el
            .bind('scroll', this.scroll.bind(this));
        this.topViewport.el
            .bind('mousewheel', this.onHeaderMouseWheel.bind(this)); // modern browsers only, not in gecko
        this.header.el
            .bind('contextmenu', this.handleHeaderContextMenu.bind(this))
            .bind('click', this.handleHeaderClick.bind(this))
            .delegate('.slick-header-column', 'mouseenter', this.handleHeaderMouseEnter.bind(this))
            .delegate('.slick-header-column', 'mouseleave', this.handleHeaderMouseLeave.bind(this));
        this.subHeaders.el
            .bind('contextmenu', this.handleSubHeaderContextMenu.bind(this));
        this.$focusSink.add(this.$focusSink2)
            .bind('keydown', this.handleKeyDown.bind(this));
        this.contentCanvas.el
            .bind('keydown', this.handleKeyDown.bind(this))
            .bind('click', this.handleClick.bind(this))
            .bind('dblclick', this.handleDblClick.bind(this))
            .bind('contextmenu', this.handleContextMenu.bind(this))
            .bind('draginit', this.handleDragInit.bind(this))
            .bind('dragstart', { distance: 3 }, this.handleDragStart.bind(this))
            .bind('drag', this.handleDrag.bind(this))
            .bind('dragend', this.handleDragEnd.bind(this))
            .delegate('.cell', 'mouseenter', this.handleMouseEnter.bind(this))
            .delegate('.cell', 'mouseleave', this.handleMouseLeave.bind(this));
        // Work around http://crbug.com/312427.
        if (navigator.userAgent.toLowerCase().match(/webkit/) &&
            navigator.userAgent.toLowerCase().match(/macintosh/)) {
            this.contentCanvas.el.bind('mousewheel', evt => {
                var scrolledRow = $(evt.target).closest('.row')[0];
                this.protectedRowIdx = this.getRowFromNode(scrolledRow);
            });
        }
    }
    registerPlugin(plugin) {
        this.plugins.unshift(plugin);
        plugin.init(this);
    }
    unregisterPlugin(plugin) {
        for (var i = this.plugins.length; i >= 0; i--) {
            if (this.plugins[i] === plugin) {
                if (this.plugins[i].destroy) {
                    this.plugins[i].destroy();
                }
                this.plugins.splice(i, 1);
                break;
            }
        }
    }
    setSelectionModel(model) {
        if (this.selectionModel) {
            this.selectionModel.onSelectedRangesChanged.unsubscribe(this._handleSelectedRangesChanged);
            if (this.selectionModel.destroy) {
                this.selectionModel.destroy();
            }
        }
        this.selectionModel = model;
        if (this.selectionModel) {
            this.selectionModel.init(this);
            this.selectionModel.onSelectedRangesChanged.subscribe(this._handleSelectedRangesChanged);
        }
    }
    getSelectionModel() {
        return this.selectionModel;
    }
    getCanvasNode() {
        return this.contentCanvas.el; // could be one or two elements, depending on whether columns are pinned. Always a jquery element.
    }
    getTopCanvasNode() {
        return this.topCanvas.el;
    }
    measureScrollbar() {
        if (this.options.scrollbarSize) {
            return this.options.scrollbarSize;
        }
        var $c = $('<div style=\'position:absolute; top:-10000px; left:-10000px; width:100px; height:100px; overflow:scroll;\'></div>').appendTo('body');
        var dim = {
            width: $c.width() - $c[0].clientWidth,
            height: $c.height() - $c[0].clientHeight
        };
        $c.remove();
        return dim;
    }
    calculateCanvasWidth() {
        var availableWidth = this.viewportHasVScroll ? this.contentViewport.width - scrollbarDimensions.width : this.contentViewport.width;
        var i = this.columns.length;
        this.contentCanvas.width = this.contentCanvas.widths[0] = this.contentCanvas.widths[1] = 0;
        while (i--) {
            var column = this.columns[i];
            if (column.width == null) {
                console.warn('width shouldn\'t be null/undefined', column);
                continue;
            }
            if (this.isColumnInvisible(column))
                continue;
            if (this.options.pinnedColumn != null && i > this.options.pinnedColumn) {
                this.contentCanvas.widths[1] += column.width;
            }
            else {
                this.contentCanvas.widths[0] += column.width;
            }
        }
        this.contentCanvas.width = this.contentCanvas.widths[0] + this.contentCanvas.widths[1];
        if (this.options.fullWidthRows) {
            var extraRoom = Math.max(0, availableWidth - this.contentCanvas.width);
            this.contentCanvas.width += extraRoom;
            if (this.options.pinnedColumn != null) {
                this.contentCanvas.widths[1] += extraRoom;
            }
            else {
                this.contentCanvas.widths[0] += extraRoom;
            }
        }
    }
    updateCanvasWidth(forceColumnWidthsUpdate) {
        let oldCanvasWidth = this.contentCanvas.width;
        let oldCanvasWidthL = this.contentCanvas.widths[0];
        let oldCanvasWidthR = this.contentCanvas.widths[1];
        let widthChanged;
        this.calculateCanvasWidth();
        let canvasWidth = this.contentCanvas.width;
        let canvasWidthL = this.contentCanvas.widths[0];
        let canvasWidthR = this.contentCanvas.widths[1];
        widthChanged = canvasWidth !== oldCanvasWidth ||
            canvasWidthL !== oldCanvasWidthL ||
            canvasWidthR !== oldCanvasWidthR;
        if (widthChanged || this.isPinned) {
            //        setHeadersWidth();
            this.topCanvas.el[0].style.width =
                this.contentCanvas.el[0].style.width =
                    canvasWidthL + 'px';
            if (this.isPinned) {
                this.topCanvas.el[1].style.width =
                    this.contentCanvas.el[1].style.width =
                        canvasWidthR + 'px';
                // Set widths on the left side, and width+left offset on the right side
                this.topViewport.el[0].style.width =
                    this.topViewport.el[1].style.left =
                        this.contentViewportWrap.el[0].style.width =
                            this.contentViewportWrap.el[1].style.left =
                                canvasWidthL + 'px';
                this.topViewport.el[1].style.width =
                    this.contentViewportWrap.el[1].style.width =
                        (this.contentViewport.width - canvasWidthL) + 'px';
            }
            else {
                this.topViewport.el[0].style.width =
                    this.contentViewportWrap.el[0].style.width =
                        null;
            }
            if (this.options.appendSubheadersToContainer) {
                this.subHeaders.el.find('.subHeader-row').css('width', canvasWidthL);
            }
            this.viewportHasHScroll = (canvasWidth > this.contentViewport.width - scrollbarDimensions.width);
        }
        if (true || widthChanged || forceColumnWidthsUpdate) {
            this.applyColumnWidths();
        }
    }
    disableSelection($target) {
        if ($target && $target.jquery) {
            $target
                .attr('unselectable', 'on')
                .css('MozUserSelect', 'none')
                .bind('selectstart.ui', function () {
                return false;
            }); // from jquery:ui.core.js 1.7.2
        }
    }
    getMaxSupportedCssHeight() {
        if (this.options.maxSupportedCssHeight) {
            return this.options.maxSupportedCssHeight;
        }
        var supportedHeight = 1000000;
        // FF reports the height back but still renders blank after ~6M px
        var testUpTo = navigator.userAgent.toLowerCase().match(/firefox/) ? 6000000 : 1000000000;
        var div = $('<div style=\'display:none\' />').appendTo(document.body);
        while (true) {
            var test = supportedHeight * 2;
            div.css('height', test);
            if (test > testUpTo || div.height() !== test) {
                break;
            }
            else {
                supportedHeight = test;
            }
        }
        div.remove();
        return supportedHeight;
    }
    // TODO:  this is static.  need to handle page mutation.
    bindAncestorScrollEvents() {
        var elem = this.contentCanvas.el[0];
        while ((elem = elem.parentNode) !== document.body && elem != null) {
            // bind to scroll containers only
            if (elem === this.contentViewport.el[0] || elem.scrollWidth !== elem.clientWidth || elem.scrollHeight !== elem.clientHeight) {
                var $elem = $(elem);
                if (!this.$boundAncestors) {
                    this.$boundAncestors = $elem;
                }
                else {
                    this.$boundAncestors = this.$boundAncestors.add($elem);
                }
                $elem.bind('scroll.' + this.uid, this.handleActiveCellPositionChange.bind(this));
            }
        }
    }
    updateColumnHeaders() {
        for (var i = 0; i < this.columns.length; i++) {
            this.updateColumnHeader(this.columns[i].id);
        }
    }
    unbindAncestorScrollEvents() {
        if (!this.$boundAncestors) {
            return;
        }
        this.$boundAncestors.unbind('scroll.' + this.uid);
        this.$boundAncestors = null;
    }
    updateColumnHeader(columnId, title, toolTip) {
        if (!this.initialized) {
            return;
        }
        var idx = this.getColumnIndex(columnId);
        if (idx == null) {
            return;
        }
        var columnDef = this.columns[idx];
        var $header = this.header.el.children().eq(idx); // var $header = topCanvas.el.children().eq(idx);
        if ($header) {
            if (title !== undefined) {
                this.columns[idx].name = title;
            }
            if (toolTip !== undefined) {
                this.columns[idx].toolTip = toolTip;
            }
            this.trigger(this.onBeforeHeaderCellDestroy, {
                node: $header[0],
                column: columnDef
            });
            const header = $header
                .attr('title', toolTip || '')
                .removeClass($header.data('headerCssClass'))
                .addClass(columnDef.headerCssClass || '')
                .data('headerCssClass', columnDef.headerCssClass)
                .children().eq(0);
            if (title !== undefined) {
                header.html(title);
            }
            this.trigger(this.onHeaderCellRendered, {
                node: $header[0],
                column: columnDef
            });
        }
    }
    // TODO: support subHeaders.el[1]
    injectSubheaders(appendSubheadersToContainer) {
        if (appendSubheadersToContainer) {
            this.$container.append(this.subHeaders.el[0]);
        }
        else {
            this.topCanvas.el[0].appendChild(this.subHeaders.el[0]);
            this.topCanvas.el[1].appendChild(this.subHeaders.el[1]);
        }
    }
    // Updates the contents of a single subHeader cell
    // Does not destroy, remove event listeners, update any attached .data(), etc.
    updateSubHeaders(columnId, rowIndex) {
        if (!this.initialized) {
            return;
        }
        var columnIndex = this.getColumnIndex(columnId);
        if (columnIndex == null) {
            throw new ReferenceError('Slick.Grid#updateSubHeader cannot update subheader because column ' + columnId + ' is not defined on the given grid');
        }
        if (rowIndex == null) {
            rowIndex = 0;
        }
        // Get needed data for this column
        var columnDef = this.columns[columnIndex];
        var newEl = this.options.subHeaderRenderers[rowIndex](columnDef);
        var hiddenClass = this.getHiddenCssClass(columnIndex);
        // Replace only the contents, but copy over any className that the subHeaderRenderer might have added
        this.subHeaders.el
            .map(function (n, a) { return $(a).find('.subHeader-row'); })
            .map(function (n, a) { return a[rowIndex]; })
            .children()
            .eq(columnIndex)
            .html(newEl.html())
            .addClass(newEl[0].className)
            .addClass(hiddenClass || '');
    }
    getHeaderRow() { return this.subHeaders.el; }
    // Use a columnId to return the related header dom element
    getHeaderRowColumn(columnId) {
        var idx = this.getColumnIndex(columnId);
        return this.subHeaders.el.children().eq(idx);
    }
    createColumnHeaders() {
        const onMouseEnter = () => $(this).addClass('ui-state-hover');
        const onMouseLeave = () => $(this).removeClass('ui-state-hover');
        // Broadcast destroy events and empty out any current headers
        this.header.el.children()
            .each(() => {
            var columnDef = $(this).data('column');
            if (columnDef) {
                this.trigger(this.onBeforeHeaderCellDestroy, { node: this, column: columnDef });
            }
        });
        // Broadcast destroy events and empty out any current subHeaders
        this.subHeaders.el.children()
            .each(() => {
            var columnDef = $(this).data('column');
            if (columnDef) {
                this.trigger(this.onBeforeSubHeaderCellDestroy, { node: this, column: columnDef });
            }
        });
        this.header.el.empty();
        this.subHeaders.el.empty();
        // generate subheader rows
        for (var i = 0; i < this.options.subHeaderRenderers.length; i++) {
            var l = this.subHeaders.el.eq(0).append($('<div class="subHeader-row">'));
            l.data('subHeader-row-' + i);
            var r = this.subHeaders.el.eq(1).append($('<div class="subHeader-row">'));
            r.data('subHeader-row-' + i);
        }
        // Build new headers based on column data.
        let $headerHolder;
        let $subHeaderHolder;
        let m;
        let oneHeader;
        for (let i = 0; i < this.columns.length; i++) {
            // Select the correct region to draw into based on the column index.
            $headerHolder = this.options.pinnedColumn != null && i > this.options.pinnedColumn ? this.header.el.eq(1) : this.header.el.eq(0);
            $subHeaderHolder = this.options.pinnedColumn != null && i > this.options.pinnedColumn ? this.subHeaders.el.eq(1) : this.subHeaders.el.eq(0);
            m = this.columns[i];
            oneHeader = this.options.columnHeaderRenderer(m);
            var hiddenClass = this.getHiddenCssClass(i);
            oneHeader
                .addClass('cell l' + i + ' r' + i)
                .attr('id', '' + this.uid + '_' + m.id)
                .attr('title', m.toolTip || '')
                .data('column', m)
                .addClass(m.headerCssClass || '')
                .data('headerCssClass', m.headerCssClass)
                .addClass(hiddenClass)
                .bind('dragstart', { distance: 3 }, (e, dd) => {
                this.trigger(this.onHeaderColumnDragStart, { origEvent: e, dragData: dd, node: this, columnIndex: this.getColumnIndexFromEvent(e) });
            })
                .bind('drag', (e, dd) => {
                this.trigger(this.onHeaderColumnDrag, { origEvent: e, dragData: dd, node: this, columnIndex: this.getColumnIndexFromEvent(e) });
            })
                .bind('dragend', (e, dd) => {
                this.trigger(this.onHeaderColumnDragEnd, { origEvent: e, dragData: dd, node: this, columnIndex: this.getColumnIndexFromEvent(e) });
            })
                .appendTo($headerHolder);
            if (this.options.enableColumnReorder || m.sortable) {
                oneHeader
                    .on('mouseenter', onMouseEnter)
                    .on('mouseleave', onMouseLeave);
            }
            if (m.sortable) {
                oneHeader.addClass('slick-header-sortable');
                oneHeader.append('<span class=\'slick-sort-indicator\' />');
            }
            this.trigger(this.onHeaderCellRendered, { node: oneHeader[0], column: m });
            this.options.subHeaderRenderers.forEach((renderer, n) => {
                var oneSubHeader = renderer(m);
                oneSubHeader
                    .data('column', m)
                    .addClass('cell l' + i + ' r' + i)
                    .addClass(hiddenClass || '')
                    .appendTo($subHeaderHolder.find('.subHeader-row').eq(n));
                this.trigger(this.onSubHeaderCellRendered, {
                    node: oneSubHeader[0],
                    column: m,
                    subHeader: n
                });
            });
        }
        this.setSortColumns(this.sortColumns);
        if (this.options.enableColumnResize) {
            this.setupColumnResize();
        }
        if (this.options.enableColumnReorder) {
            this.setupColumnReorder();
        }
        this.trigger(this.onHeadersCreated);
    }
    // Given a column object, return a jquery element with HTML for the column
    // Can be overridden by providing a function to options.columnHeaderRenderer
    columnHeaderRenderer(column) {
        // 50% faster using native API, versus the old jQuery way
        // jQuery's .html() is particularly slow
        //
        // Saves roughly 0.5ms * N in synchronous processing time, where N is the number of columns
        var d = document.createElement('div');
        d.className = 'cell';
        d.innerHTML = '<span class=\'name\'>' + column.name + '</span>';
        if (column.toolTip) {
            d.title = column.toolTip;
        }
        return $(d);
    }
    setupColumnSort() {
        this.topCanvas.el.click((e) => {
            // temporary workaround for a bug in jQuery 1.7.1 (http://bugs.jquery.com/ticket/11328)
            e.metaKey = e.metaKey || e.ctrlKey;
            if ($(e.target).hasClass('resizer')) {
                return;
            }
            var $col = $(e.target).closest('.cell');
            if (!$col.length) {
                return;
            }
            var column = $col.data('column');
            if (column.sortable) {
                if (!this.getEditorLock().commitCurrentEdit()) {
                    return;
                }
                var sortOpts = null;
                var i = 0;
                for (; i < this.sortColumns.length; i++) {
                    if (this.sortColumns[i].columnId === column.id) {
                        sortOpts = this.sortColumns[i];
                        sortOpts.sortAsc = !sortOpts.sortAsc;
                        break;
                    }
                }
                if (e.metaKey && this.options.multiColumnSort) {
                    if (sortOpts) {
                        this.sortColumns.splice(i, 1);
                    }
                }
                else {
                    if ((!e.shiftKey && !e.metaKey) || !this.options.multiColumnSort) {
                        this.sortColumns = [];
                    }
                    if (!sortOpts) {
                        sortOpts = { columnId: column.id, sortAsc: column.defaultSortAsc };
                        this.sortColumns.push(sortOpts);
                    }
                    else if (this.sortColumns.length === 0) {
                        this.sortColumns.push(sortOpts);
                    }
                }
                this.setSortColumns(this.sortColumns);
                if (!this.options.multiColumnSort) {
                    this.trigger(this.onSort, {
                        multiColumnSort: false,
                        sortCol: column,
                        sortAsc: sortOpts.sortAsc
                    }, e);
                }
                else {
                    this.trigger(this.onSort, {
                        multiColumnSort: true,
                        sortCols: $.map(this.sortColumns, (col) => {
                            return { sortCol: this.columns[this.getColumnIndex(col.columnId)], sortAsc: col.sortAsc };
                        })
                    }, e);
                }
            }
        });
    }
    setupColumnReorder() {
        this.topCanvas.el.filter(':ui-sortable').sortable('destroy');
        this.topCanvas.el.sortable({
            containment: 'parent',
            distance: 3,
            axis: 'x',
            cursor: 'default',
            tolerance: 'intersection',
            helper: 'clone',
            placeholder: 'slick-sortable-placeholder ui-state-default slick-header-column',
            start: function (e, ui) {
                ui.placeholder.width(ui.helper.outerWidth()); // - headerColumnWidthDiff);
                $(ui.helper).addClass('slick-header-column-active');
            },
            beforeStop: function (e, ui) {
                $(ui.helper).removeClass('slick-header-column-active');
            },
            stop: (e) => {
                if (!this.getEditorLock().commitCurrentEdit()) {
                    $(this).sortable('cancel');
                    return;
                }
                var reorderedIds = this.topCanvas.el.sortable('toArray');
                var reorderedColumns = [];
                for (var i = 0; i < reorderedIds.length; i++) {
                    reorderedColumns.push(this.columns[this.getColumnIndex(reorderedIds[i].replace(this.uid, ''))]);
                }
                this.setColumns(reorderedColumns);
                this.trigger(this.onColumnsReordered, {});
                e.stopPropagation();
                this.setupColumnResize();
            }
        });
    }
    setupColumnResize() {
        let j;
        let c;
        let pageX;
        let columnElements;
        let minPageX;
        let maxPageX;
        let firstResizable;
        let lastResizable;
        if (!this.columns.length) {
            return;
        }
        columnElements = this.getHeaderEls();
        columnElements.find('.resizer').remove();
        // Get the first and last resizable column
        columnElements.each((i, e) => {
            if (this.columns[i].resizable) {
                if (firstResizable === undefined) {
                    firstResizable = i;
                }
                lastResizable = i;
            }
        });
        if (firstResizable === undefined) {
            return;
        }
        // Configure resizing on each column
        columnElements.each((i, e) => {
            if (i < firstResizable || (this.options.forceFitColumns && i >= lastResizable)) {
                return;
            }
            $('<div class=\'resizer\' />')
                .appendTo(e)
                .bind('dragstart', e => {
                if (!this.getEditorLock().commitCurrentEdit()) {
                    return false;
                }
                pageX = e.pageX;
                $(e.target).parent().addClass('active');
                // Get the dragged column object and set a flag on it
                var idx = this.getCellFromNode($(e.target).parent());
                if (idx > -1) {
                    this.columns[idx].manuallySized = true;
                }
                var shrinkLeewayOnRight = null;
                var stretchLeewayOnRight = null;
                // lock each column's width option to current width
                columnElements.each((i, e) => this.columns[i].previousWidth = $(e).outerWidth());
                if (this.options.forceFitColumns) {
                    shrinkLeewayOnRight = 0;
                    stretchLeewayOnRight = 0;
                    // colums on right affect maxPageX/minPageX
                    for (j = i + 1; j < columnElements.length; j++) {
                        c = this.columns[j];
                        if (c.resizable) {
                            if (stretchLeewayOnRight !== null) {
                                if (c.maxWidth) {
                                    stretchLeewayOnRight += c.maxWidth - c.previousWidth;
                                }
                                else {
                                    stretchLeewayOnRight = null;
                                }
                            }
                            shrinkLeewayOnRight += c.previousWidth - Math.max(c.minWidth || 0, this.options.absoluteColumnMinWidth);
                        }
                    }
                }
                let shrinkLeewayOnLeft = 0;
                let stretchLeewayOnLeft = 0;
                for (j = 0; j <= i; j++) {
                    // columns on left only affect minPageX
                    c = this.columns[j];
                    if (c.resizable) {
                        if (stretchLeewayOnLeft !== null) {
                            if (c.maxWidth) {
                                stretchLeewayOnLeft += c.maxWidth - c.previousWidth;
                            }
                            else {
                                stretchLeewayOnLeft = null;
                            }
                        }
                        shrinkLeewayOnLeft += c.previousWidth - Math.max(c.minWidth || 0, this.options.absoluteColumnMinWidth);
                    }
                }
                if (shrinkLeewayOnRight === null) {
                    shrinkLeewayOnRight = 100000;
                }
                if (shrinkLeewayOnLeft === null) {
                    shrinkLeewayOnLeft = 100000;
                }
                if (stretchLeewayOnRight === null) {
                    stretchLeewayOnRight = 100000;
                }
                if (stretchLeewayOnLeft === null) {
                    stretchLeewayOnLeft = 100000;
                }
                maxPageX = pageX + Math.min(shrinkLeewayOnRight, stretchLeewayOnLeft);
                minPageX = pageX - Math.min(shrinkLeewayOnLeft, stretchLeewayOnRight);
            })
                .bind('drag', e => {
                let actualMinWidth;
                let d = Math.min(maxPageX, Math.max(minPageX, e.pageX)) - pageX;
                let x;
                if (d < 0) {
                    x = d;
                    if (this.options.resizeOnlyDraggedColumn) {
                        this.columns[i].width = Math.max(this.columns[i].previousWidth + x, (this.columns[i].minWidth || 0)); // apply shrinkage to this column only.
                    }
                    else {
                        for (j = i; j >= 0; j--) {
                            c = this.columns[j];
                            if (c.resizable) {
                                actualMinWidth = Math.max(c.minWidth || 0, this.options.absoluteColumnMinWidth);
                                if (x && c.previousWidth + x < actualMinWidth) {
                                    x += c.previousWidth - actualMinWidth;
                                    c.width = actualMinWidth;
                                }
                                else {
                                    c.width = c.previousWidth + x;
                                    x = 0;
                                }
                            }
                        }
                    }
                    if (this.options.forceFitColumns) {
                        x = -d;
                        for (j = i + 1; j < columnElements.length; j++) {
                            c = this.columns[j];
                            if (c.resizable) {
                                if (x && c.maxWidth && (c.maxWidth - c.previousWidth < x)) {
                                    x -= c.maxWidth - c.previousWidth;
                                    c.width = c.maxWidth;
                                }
                                else {
                                    c.width = c.previousWidth + x;
                                    x = 0;
                                }
                            }
                        }
                    }
                }
                else {
                    x = d;
                    if (this.options.resizeOnlyDraggedColumn) {
                        this.columns[i].width = Math.min(this.columns[i].previousWidth + x, this.columns[i].maxWidth || maxPageX);
                    }
                    else {
                        for (j = i; j >= 0; j--) {
                            c = this.columns[j];
                            if (c.resizable) {
                                if (x && c.maxWidth && (c.maxWidth - c.previousWidth < x)) {
                                    x -= c.maxWidth - c.previousWidth;
                                    c.width = c.maxWidth;
                                }
                                else {
                                    c.width = c.previousWidth + x;
                                    x = 0;
                                }
                            }
                        }
                    }
                    if (this.options.forceFitColumns) {
                        x = -d;
                        for (j = i + 1; j < columnElements.length; j++) {
                            c = this.columns[j];
                            if (c.resizable) {
                                actualMinWidth = Math.max(c.minWidth || 0, this.options.absoluteColumnMinWidth);
                                if (x && c.previousWidth + x < actualMinWidth) {
                                    x += c.previousWidth - actualMinWidth;
                                    c.width = actualMinWidth;
                                }
                                else {
                                    c.width = c.previousWidth + x;
                                    x = 0;
                                }
                            }
                        }
                    }
                }
                this.applyColumnHeaderWidths();
                if (this.options.syncColumnCellResize) {
                    this.updateCanvasWidth(true); // If you're resizing one of the columns in the pinned section, we should update the size of that area as you drag
                    this.applyColumnWidths();
                }
            })
                .bind('dragend', e => {
                var newWidth;
                $(e.target).parent().removeClass('active');
                for (j = 0; j < columnElements.length; j++) {
                    c = this.columns[j];
                    newWidth = $(columnElements[j]).outerWidth();
                    if (c.previousWidth !== newWidth && c.rerenderOnResize) {
                        this.invalidateAllRows();
                    }
                }
                this.updateCanvasWidth(true);
                this.render();
                this.trigger(this.onColumnsResized, {});
            });
        });
    }
    // Given an element, return the sum of vertical paddings and borders on that element.
    getVBoxDelta($el) {
        var p = ['borderTopWidth', 'borderBottomWidth', 'paddingTop', 'paddingBottom'];
        var delta = 0;
        $.each(p, function (n, val) {
            delta += parseFloat($el.css(val)) || 0;
        });
        return delta;
    }
    // Hide extra panes if they're not needed (eg: the grid is not using pinned columns)
    updatePinnedState() {
        if (!this.isPinned) {
            this.topViewport.el.eq(1).hide();
            this.contentViewportWrap.el.eq(1).hide();
        }
        else {
            this.topViewport.el.eq(1).show();
            this.contentViewportWrap.el.eq(1).show();
        }
        this.setScroller();
        this.setOverflow();
        this.createColumnHeaders();
        this.updateCanvasWidth();
        this.invalidateAllRows();
        this.resizeCanvas();
    }
    // enable antiscroll for an element
    disableAntiscroll($element) {
        $element.removeClass('antiscroll-wrap');
        if ($element.data('antiscroll')) {
            $element.data('antiscroll').destroy();
        }
    }
    enableAntiscroll($element) {
        $element
            .addClass('antiscroll-wrap')
            .antiscroll({
            autoShow: this.options.showScrollbarsOnHover
        });
    }
    updateAntiscroll() {
        if (!this.options.useAntiscroll) {
            return;
        }
        const cl = this.contentViewportWrap.el.filter('.C.L');
        const cr = this.contentViewportWrap.el.filter('.C.R');
        if (this.isPinned) {
            this.enableAntiscroll(cr);
            this.disableAntiscroll(cl);
        }
        else {
            this.enableAntiscroll(cl);
            this.disableAntiscroll(cr);
        }
    }
    // If columns are pinned, scrollers are in the right-side panes, otherwise they're in the left ones
    setScroller() {
        if (this.options.pinnedColumn == null) {
            this.topViewport.scroller = this.topViewport.el[0];
            this.contentViewport.scroller = this.contentViewport.el[0];
        }
        else {
            this.topViewport.scroller = this.topViewport.el[1];
            this.contentViewport.scroller = this.contentViewport.el[1];
        }
    }
    setOverflow() {
        if (this.isPinned) {
            this.contentViewport.el.eq(0).addClass('pinned');
        }
        else {
            this.contentViewport.el.eq(0).removeClass('pinned');
        }
    }
    // Measures the computed sizes of important elements
    // With this method, folks can set whatever CSS size they'd like, and the grid's js can figure it out from there
    measureCssSizes() {
        if (!this.options.rowHeight) {
            let el;
            let markup = '<div class=\'cell\' style=\'visibility:hidden\'>-</div>';
            el = $('<div class="row">' + markup + '</div>').appendTo(this.contentCanvas.el[0]);
            this.options.rowHeight = el.outerHeight();
            el.remove();
        }
    }
    createCssRules() {
        this.$style = $('<style type=\'text/css\' rel=\'stylesheet\' />').appendTo($('head'));
        var rules = [];
        for (var i = 0; i < this.columns.length; i++) {
            rules.push('.' + this.uid + ' .l' + i + ' { }');
            rules.push('.' + this.uid + ' .r' + i + ' { }');
        }
        if (this.$style[0].styleSheet) {
            this.$style[0].styleSheet.cssText = rules.join(' ');
        }
        else {
            this.$style[0].appendChild(document.createTextNode(rules.join(' ')));
        }
    }
    getColumnCssRules(idx) {
        if (!this.stylesheet) {
            var sheets = document.styleSheets;
            for (var i = 0; i < sheets.length; i++) {
                if ((sheets[i].ownerNode) === this.$style[0]) {
                    this.stylesheet = sheets[i];
                    break;
                }
            }
            if (!this.stylesheet) {
                throw new Error('Cannot find stylesheet.');
            }
            // find and cache column CSS rules
            this.columnCssRulesL = [];
            this.columnCssRulesR = [];
            var cssRules = (this.stylesheet.cssRules || this.stylesheet.rules);
            let matches;
            let columnIdx;
            for (let i = 0; i < cssRules.length; i++) {
                var selector = cssRules[i].selectorText;
                if (matches = /\.l\d+/.exec(selector)) {
                    columnIdx = parseInt(matches[0].substr(2, matches[0].length - 2), 10);
                    this.columnCssRulesL[columnIdx] = cssRules[i];
                }
                else if (matches = /\.r\d+/.exec(selector)) {
                    columnIdx = parseInt(matches[0].substr(2, matches[0].length - 2), 10);
                    this.columnCssRulesR[columnIdx] = cssRules[i];
                }
            }
        }
        return {
            left: this.columnCssRulesL[idx],
            right: this.columnCssRulesR[idx]
        };
    }
    removeCssRules() {
        this.$style.remove();
        this.stylesheet = null;
    }
    destroy() {
        this.getEditorLock().cancelCurrentEdit();
        this.trigger(this.onBeforeDestroy, {});
        var i = this.plugins.length;
        while (i--) {
            this.unregisterPlugin(this.plugins[i]);
        }
        if (this.options.enableColumnReorder) {
            this.header.el.filter(':ui-sortable').sortable('destroy');
        }
        this.unbindAncestorScrollEvents();
        this.$container.unbind('.slickgrid');
        this.removeCssRules();
        this.contentCanvas.el.unbind('draginit dragstart dragend drag');
        this.$container.empty()
            .removeClass(this.uid)
            .removeClass(this.objectName);
    }
    //////////////////////////////////////////////////////////////////////////////////////////////
    // General
    // A simple way to expose the uid to consumers, who might care which slickgrid instance they're dealing with.
    getId() {
        return this.uid;
    }
    trigger(evt, args, e) {
        e = e || new EventData();
        args = $.extend({}, args, { grid: this });
        return evt.notify(args, e, this);
    }
    getEditorLock() {
        return this.options.editorLock;
    }
    getEditController() {
        return this.editController;
    }
    getColumnIndex(id) {
        return this.columnIdxById[id];
    }
    // returns a jQuery node that matches the given id
    // if the provided id is undefined, returns an empty jQuery object
    getColumnNodeById(id) {
        var idx = this.getColumnIndex(id);
        if (idx > -1)
            return this.getHeaderEls(idx);
        else
            return $([]);
    }
    // Return the header element(s) that wrap all column headers
    // There is one or two, depending on whether columns are pinned
    getHeaderEl() {
        return this.header.el;
    }
    // Get all column header cell elements.
    // There should be as many elements as there are columns
    // It doesn't differentiate between pinned and unpinned columns
    // If you provide an index, it returns only that column
    getHeaderEls(idx) {
        if (idx == null) {
            return this.header.el.children();
        }
        else {
            return this.header.el.children().eq(idx);
        }
    }
    // Given an x and a y coord, return the index of the column
    getColumnIndexFromEvent(evt) {
        var nearestEl = document.elementFromPoint(evt.clientX, evt.clientY);
        var headerEl = $(nearestEl).closest('.cell');
        if (!headerEl.length) {
            return null;
        }
        return this.getCellFromNode(headerEl[0]);
    }
    getColumnFromEvent(evt) {
        const index = this.getColumnIndexFromEvent(evt);
        return index === null ? null : this.columns[index];
    }
    autosizeColumns() {
        let i;
        let widths = [];
        let shrinkLeeway = 0;
        let total = 0;
        let prevTotal;
        let availWidth = this.viewportHasVScroll ? this.contentViewport.width - scrollbarDimensions.width : this.contentViewport.width;
        for (i = 0; i < this.columns.length; i++) {
            const c = this.columns[i];
            widths.push(c.width);
            total += c.width;
            if (c.resizable) {
                shrinkLeeway += c.width - Math.max(c.minWidth || 0, this.options.absoluteColumnMinWidth);
            }
        }
        // shrink
        prevTotal = total;
        while (total > availWidth && shrinkLeeway) {
            var shrinkProportion = (total - availWidth) / shrinkLeeway;
            for (let i = 0; i < this.columns.length && total > availWidth; i++) {
                const c = this.columns[i];
                var width = widths[i];
                if (!c.resizable || width <= c.minWidth || width <= this.options.absoluteColumnMinWidth) {
                    continue;
                }
                var absMinWidth = Math.max(c.minWidth || 0, this.options.absoluteColumnMinWidth);
                var shrinkSize = Math.floor(shrinkProportion * (width - absMinWidth)) || 1;
                shrinkSize = Math.min(shrinkSize, width - absMinWidth);
                total -= shrinkSize;
                shrinkLeeway -= shrinkSize;
                widths[i] -= shrinkSize;
            }
            if (prevTotal <= total) {
                break;
            }
            prevTotal = total;
        }
        // grow
        prevTotal = total;
        while (total < availWidth) {
            var growProportion = availWidth / total;
            for (i = 0; i < this.columns.length && total < availWidth; i++) {
                const c = this.columns[i];
                var currentWidth = widths[i];
                var growSize;
                if (!c.resizable || c.maxWidth <= currentWidth) {
                    growSize = 0;
                }
                else {
                    growSize = Math.min(Math.floor(growProportion * currentWidth) - currentWidth, (c.maxWidth - currentWidth) || 1000000) || 1;
                }
                total += growSize;
                widths[i] += growSize;
            }
            if (prevTotal >= total) {
                break;
            }
            prevTotal = total;
        }
        var reRender = false;
        for (i = 0; i < this.columns.length; i++) {
            if (this.columns[i].rerenderOnResize && this.columns[i].width !== widths[i]) {
                reRender = true;
            }
            this.columns[i].width = widths[i];
        }
        this.applyColumnHeaderWidths();
        this.updateCanvasWidth(true);
        if (reRender) {
            this.invalidateAllRows();
            this.render();
        }
    }
    applyColumnHeaderWidths() {
        if (!this.initialized) {
            return;
        }
        var h;
        for (var i = 0, headers = this.header.el.children(), ii = headers.length; i < ii; i++) {
            h = $(headers[i]);
            const paddingLeft = parseInt(h.css('paddingLeft'), 10);
            const paddingRight = parseInt(h.css('paddingRight'), 10);
            const newWidth = this.columns[i].width - paddingLeft - paddingRight;
            if (h.width() !== newWidth) {
                h.width(newWidth);
            }
        }
        this.updateColumnCaches();
    }
    applyColumnWidths() {
        var x = 0;
        for (var i = 0; i < this.columns.length; i++) {
            var column = this.columns[i];
            var width = this.getColumnVisibleWidth(column);
            var rule = this.getColumnCssRules(i);
            if (!rule.left)
                return;
            rule.left.style.left = x + 'px';
            var canvasWidth = this.options.pinnedColumn != null && i > this.options.pinnedColumn ? this.contentCanvas.widths[1] : this.contentCanvas.widths[0];
            rule.right.style.right = (canvasWidth - x - width) + 'px';
            // If this column is frozen, reset the css left value since the column starts in a new viewport.
            if (this.options.pinnedColumn === i) {
                x = 0;
            }
            else {
                x += width;
            }
        }
        this.debouncedUpdateAntiscroll();
    }
    setSortColumn(columnId, sortAsc) {
        this.setSortColumns([{ columnId, sortAsc }]);
    }
    setSortColumns(cols) {
        this.sortColumns = cols;
        var headerColumnEls = this.getHeaderEls();
        headerColumnEls
            .removeClass('slick-header-column-sorted')
            .find('.slick-sort-indicator')
            .removeClass('slick-sort-indicator-asc slick-sort-indicator-desc');
        $.each(this.sortColumns, (i, col) => {
            if (col.sortAsc == null) {
                col.sortAsc = true;
            }
            var columnIndex = this.getColumnIndex(col.columnId);
            if (columnIndex != null) {
                headerColumnEls.eq(columnIndex)
                    .addClass('slick-header-column-sorted')
                    .find('.slick-sort-indicator')
                    .addClass(col.sortAsc ? 'slick-sort-indicator-asc' : 'slick-sort-indicator-desc');
            }
        });
    }
    getSortColumns() {
        return this.sortColumns;
    }
    handleSelectedRangesChanged(e, ranges) {
        this.selectedRows = [];
        var hash = {};
        var maxRow = this.getDataLength() - 1;
        var maxCell = this.columns.length - 1;
        for (var i = 0, len = ranges.length; i < len; i++) {
            for (var j = Math.max(0, ranges[i].fromRow), jlen = Math.min(ranges[i].toRow, maxRow); j <= jlen; j++) {
                if (!hash[j]) {
                    this.selectedRows.push(j);
                    hash[j] = {};
                }
                for (var k = Math.max(0, ranges[i].fromCell), klen = Math.min(ranges[i].toCell, maxCell); k <= klen; k++) {
                    if (this.canCellBeSelected(j, k)) {
                        hash[j][this.columns[k].id] = this.options.selectedCellCssClass;
                    }
                }
            }
        }
        this.setCellCssStyles(this.options.selectedCellCssClass, hash);
        this.trigger(this.onSelectedRowsChanged, { rows: this.getSelectedRows() }, e);
    }
    getColumns() {
        return this.columns;
    }
    getColumnByKey(key) {
        const columns = this.getColumns();
        for (let i = 0; i < columns.length; i++) {
            if (columns[i].key === key) {
                return columns[i];
            }
        }
        return undefined;
    }
    isAdjacent(array) {
        if (!array || array.length === 0)
            return false;
        if (array.length === 1)
            return true;
        array.sort((a, b) => a - b);
        for (let i = 1; i < array.length; i++) {
            if (array[i] !== (array[i - 1] + 1))
                return false;
        }
        return true;
    }
    updateColumnCaches() {
        // Pre-calculate cell boundaries.
        this.columnPosLeft = [];
        this.columnPosRight = [];
        var x = 0;
        for (var i = 0, ii = this.columns.length; i < ii; i++) {
            var column = this.columns[i];
            var columnWidth = this.getColumnVisibleWidth(column);
            this.columnPosLeft[i] = x;
            x += columnWidth;
            this.columnPosRight[i] = x;
        }
    }
    // Given a set of columns, make sure `minWidth <= width <= maxWidth`
    enforceWidthLimits(cols) {
        this.columnIdxById = {};
        for (var i = 0; i < cols.length; i++) {
            var m = cols[i];
            this.columnIdxById[m.id] = i;
            // Changing the object reference can cause problems for external consumers of that object, so we're careful to maintain it using this crazy double extend.
            var tempCol = $.extend({}, this.columnDefaults, m);
            $.extend(m, tempCol);
            if (m.minWidth && m.width < m.minWidth) {
                m.width = m.minWidth;
            }
            else if (m.maxWidth && m.width > m.maxWidth) {
                m.width = m.maxWidth;
            }
        }
    }
    /**
     * Efficient change detection
     */
    didColumnsChange(before, after) {
        return before.length !== after.length || after.some((a, n) => {
            const b = before[n];
            return a.asyncPostRender !== b.asyncPostRender
                || a.cssClass !== b.cssClass
                || a.defaultSortAsc !== b.defaultSortAsc
                || a.editor !== b.editor
                || a.field !== b.field
                || a.focusable !== b.focusable
                || a.formatter !== b.formatter
                || a.groupTotalsFormatter !== b.groupTotalsFormatter
                || a.headerCssClass !== b.headerCssClass
                || a.id !== b.id
                || a.isHidden !== b.isHidden
                || a.json !== b.json
                || a.key !== b.key
                || a.manuallySized !== b.manuallySized
                || a.maxWidth !== b.maxWidth
                || a.minWidth !== b.minWidth
                || a.name !== b.name
                || a.rerenderOnResize !== b.rerenderOnResize
                || a.resizable !== b.resizable
                || a.selectable !== b.selectable
                || a.showHidden !== b.showHidden
                || a.sortable !== b.sortable
                || a.toolTip !== b.toolTip
                || a.validator !== b.validator
                || a.width !== b.width;
        });
    }
    /**
     * Set or re-set the columns in the grid
     * opts.skipResizeCanvas let's you skip that step. Boosts performance if you don't need it because you're planning to to manually call resizeCanvas.
     */
    setColumns(columns, opts = {}) {
        if (!this.didColumnsChange(this.columns, columns) && !opts.forceUpdate) {
            return;
        }
        this.columns = columns;
        this.enforceWidthLimits(this.columns);
        this.updateColumnCaches();
        if (this.initialized) {
            this.invalidateAllRows();
            this.createColumnHeaders();
            this.removeCssRules();
            this.createCssRules();
            if (!opts.skipResizeCanvas) {
                this.resizeCanvas();
            }
            this.applyColumnWidths();
            this.handleScroll();
            this.trigger(this.onColumnsChanged, opts);
        }
    }
    // Given a column definition object, do all the steps required to react to a change in the widths of any of the columns, and nothing more.
    // TODO: only update when columns changed
    updateColumnWidths(columns) {
        this.columns = columns;
        this.enforceWidthLimits(this.columns);
        this.applyColumnWidths();
        this.updateColumnCaches();
        this.updateCanvasWidth(true); // Update the grid-canvas width. The `true` tells it to update the width of all the cells even if the canvas hasn't changed size (eg: if there was plenty of room for the cells both before and after the sizing, the canvas doesn't change)
        //      this.trigger(this.onColumnsResized); // TODO: find why this was needed and solve it without an infinite loop
    }
    getOptions() {
        return this.options;
    }
    setOptions(args) {
        if (!this.getEditorLock().commitCurrentEdit()) {
            return;
        }
        var pinnedColChanged; // If the pinned column has changed, we need to take some extra steps to render canvii
        this.makeActiveCellNormal();
        if (args.hasOwnProperty('enableAddRow') && this.options.enableAddRow !== args.enableAddRow) {
            this.invalidateRow(this.getDataLength());
        }
        if (args.hasOwnProperty('pinnedColumn') && args.pinnedColumn !== this.options.pinnedColumn) {
            pinnedColChanged = true;
            this.options.pinnedColumn = args.pinnedColumn; // $extend usually works, but not in the case where the new value is undefined. $.extend does not copy over null or undefined values.
        }
        // Do we need to redraw the subheader rows?
        if (args.hasOwnProperty('subHeaderRenderers')) {
            var subHeaderCount = this.subHeaders.el.eq(0).find('.subHeader-row').length;
            if (subHeaderCount !== this.options.subHeaderRenderers.length) {
                this.createColumnHeaders();
                this.calculateHeights();
                this.resizeCanvas();
            }
        }
        if (args.hasOwnProperty('appendSubheadersToContainer')) {
            this.injectSubheaders(args.appendSubheadersToContainer);
        }
        this.options = $.extend(this.options, args);
        this.validateAndEnforceOptions();
        if (this.options.autoHeight) {
            this.contentViewport.el.css('overflow-y', 'hidden');
        }
        else {
            this.contentViewport.el.css('overflow-y', '');
        }
        if (pinnedColChanged) {
            this.updatePinnedState();
        }
        this.render();
        this.debouncedUpdateAntiscroll();
    }
    validateAndEnforceOptions() {
        if (this.options.autoHeight) {
            this.options.leaveSpaceForNewRows = false;
        }
        if (this.options.pinnedColumn != null) {
            this.isPinned = true;
        }
        else {
            this.isPinned = false;
            this.options.pinnedColumn = undefined; // map null and undefined both to undefined. null does some odd things in numerical comparisons. eg: 20 > null is true (wat!)
        }
    }
    setData(newData, scrollToTop) {
        this.data = newData;
        this.invalidateAllRows();
        this.updateRowCount();
        if (scrollToTop) {
            this.scrollTo(0);
        }
    }
    getData() {
        return this.data;
    }
    getDataLength() {
        if (this.data.getLength) {
            return this.data.getLength();
        }
        else {
            return this.data['length'];
        }
    }
    getDataLengthIncludingAddNew() {
        return this.getDataLength() + (this.options.enableAddRow ? 1 : 0);
    }
    getDataItem(rowIndex) {
        if (this.data.getItem) {
            return this.data.getItem(rowIndex);
        }
        else {
            return this.data[rowIndex];
        }
    }
    setSubHeadersVisibility(visible) {
        if (this.options.showSubHeaders !== visible) {
            this.options.showSubHeaders = visible;
            if (visible) {
                this.subHeaders.el.show();
            }
            else {
                this.subHeaders.el.hide();
            }
        }
        this.resizeCanvas();
    }
    getContainerNode() {
        return this.$container.get(0);
    }
    //////////////////////////////////////////////////////////////////////////////////////////////
    // Rendering / Scrolling
    getRowTop(row) {
        return this.options.rowHeight * row - this.offset;
    }
    // Given a Y position, get the row index.
    // The Y position must be relative to the row canvas for an accurate answer.
    getRowFromPosition(y) {
        return Math.floor((y + this.offset) / this.options.rowHeight);
    }
    scrollTo(y) {
        y = Math.max(y, 0);
        y = Math.min(y, this.th - this.contentViewport.height + (this.viewportHasHScroll ? scrollbarDimensions.height : 0));
        var oldOffset = this.offset;
        this.page = Math.min(this.n - 1, Math.floor(y / this.ph));
        this.offset = Math.round(this.page * this.cj);
        var newScrollTop = y - this.offset;
        if (this.offset !== oldOffset) {
            var range = this.getViewport(newScrollTop);
            this.cleanupRows(range);
            this.updateRowPositions();
        }
        if (this.prevScrollTop !== newScrollTop) {
            this.vScrollDir = (this.prevScrollTop + oldOffset < newScrollTop + this.offset) ? 1 : -1;
            this.lastRenderedScrollTop = this.scrollTop = this.prevScrollTop = newScrollTop;
            this.contentViewport.el.scrollTop(newScrollTop); // using jquery's .scrollTop() method handles multiple viewports
            this.trigger(this.onViewportChanged, {});
        }
    }
    getFormatter(rowIndex, column) {
        var rowMetadata = this.data.getItemMetadata && this.data.getItemMetadata(rowIndex);
        // look up by id, then index
        var columnOverrides = rowMetadata &&
            rowMetadata.columns &&
            (rowMetadata.columns[column.id] || rowMetadata.columns[this.getColumnIndex(column.id)]);
        return (columnOverrides && columnOverrides.formatter) ||
            (rowMetadata && rowMetadata.formatter) ||
            column.formatter ||
            (this.options.formatterFactory && this.options.formatterFactory.getFormatter(column)) ||
            this.options.defaultFormatter;
    }
    getEditor(rowIndex, cell) {
        var column = this.columns[cell];
        var rowMetadata = this.data.getItemMetadata && this.data.getItemMetadata(rowIndex);
        var columnMetadata = rowMetadata && rowMetadata.columns;
        if (columnMetadata && columnMetadata[column.id] && columnMetadata[column.id].editor !== undefined) {
            return columnMetadata[column.id].editor;
        }
        if (columnMetadata && columnMetadata[cell] && columnMetadata[cell].editor !== undefined) {
            return columnMetadata[cell].editor;
        }
        return column.editor || (this.options.editorFactory && this.options.editorFactory.getEditor(column));
    }
    getDataItemValueForColumn(item, columnDef) {
        if (this.options.dataItemColumnValueExtractor) {
            return this.options.dataItemColumnValueExtractor(item, columnDef);
        }
        return item[columnDef.field];
    }
    appendRowHtml(markupArrayL, markupArrayR, row, range, dataLength) {
        var d = this.getDataItem(row);
        var dataLoading = row < dataLength && !d;
        var rowCss = 'row' +
            (this.options.addRowIndexToClassName ? ' row_' + row : '') +
            (dataLoading ? ' loading' : '') +
            (row === this.activeRow ? ' active' : '') +
            (row % 2 === 1 ? ' odd' : ' even');
        var metadata = this.data.getItemMetadata && this.data.getItemMetadata(row);
        if (metadata && metadata.cssClasses) {
            rowCss += ' ' + metadata.cssClasses;
        }
        var rowHtml = '<div class=\'' + rowCss + '\' style=\'top:' + (this.getRowTop(row)) + 'px; height:' + this.options.rowHeight + 'px;line-height:' + this.options.rowHeight + 'px;\'>';
        markupArrayL.push(rowHtml);
        if (this.isPinned) {
            markupArrayR.push(rowHtml);
        }
        let colspan;
        let m;
        for (var i = 0, ii = this.columns.length; i < ii; i++) {
            m = this.columns[i];
            colspan = 1;
            if (metadata && metadata.columns) {
                var columnData = metadata.columns[m.id] || metadata.columns[i];
                colspan = (columnData && columnData.colspan) || 1;
                // Grouping metadata can indicate that columns should autocalculate spanning.
                // In this case, we span whatever pinned region we're in, but not the whole grid.
                if (colspan === '*') {
                    if (this.options.pinnedColumn == null || i > this.options.pinnedColumn) {
                        colspan = ii - i;
                    }
                    else {
                        colspan = this.options.pinnedColumn + 1 - i;
                    }
                }
            }
            // Do not render cells outside of the viewport.
            if (this.columnPosRight[Math.min(ii - 1, i + colspan - 1)] > range.leftPx) {
                if (this.columnPosLeft[i] > range.rightPx) {
                    // All columns to the right are outside the range.
                    break;
                }
                if (this.options.pinnedColumn != null && i > this.options.pinnedColumn) {
                    this.appendCellHtml(markupArrayR, row, i, colspan, d);
                }
                else {
                    this.appendCellHtml(markupArrayL, row, i, colspan, d);
                }
            }
            else if (this.isPinned && this.options.pinnedColumn != null && (i <= this.options.pinnedColumn)) {
                this.appendCellHtml(markupArrayL, row, i, colspan, d);
            }
            if (colspan > 1) {
                i += (colspan - 1);
            }
        }
        markupArrayL.push('</div>');
        if (this.isPinned) {
            markupArrayR.push('</div>');
        }
    }
    appendCellHtml(markupArray, row, cell, colspan, item) {
        var m = this.columns[cell];
        var cellCss = 'cell l' + cell +
            ' r' + Math.min(this.columns.length - 1, cell + colspan - 1) +
            (m.cssClass ? ' ' + m.cssClass : '');
        var hiddenClass = this.getHiddenCssClass(cell);
        if (hiddenClass) {
            cellCss += ' ' + hiddenClass;
        }
        if (row === this.activeRow && cell === this.activeCell) {
            cellCss += (' active');
        }
        // TODO:  merge them together in the setter
        for (var key in this.cellCssClasses) {
            if (this.cellCssClasses[key][row] && this.cellCssClasses[key][row][m.id]) {
                cellCss += (' ' + this.cellCssClasses[key][row][m.id]);
            }
        }
        markupArray.push('<div class=\'' + cellCss + '\'>');
        // if there is a corresponding row (if not, this is the Add New row or this data hasn't been loaded yet)
        if (item) {
            var value = this.getDataItemValueForColumn(item, m);
            markupArray.push(this.getFormatter(row, m)(row, cell, value, m, item, this));
        }
        markupArray.push('</div>');
        this.rowsCache[row].cellRenderQueue.push(cell);
        this.rowsCache[row].cellColSpans[cell] = colspan;
    }
    cleanupRows(rangeToKeep) {
        for (var i in this.rowsCache) {
            const ii = parseInt(i, 10);
            if ((ii !== this.activeRow) && (ii < rangeToKeep.top || ii > rangeToKeep.bottom)) {
                this.removeRowFromCache(ii);
            }
        }
    }
    invalidate() {
        this.updateRowCount();
        this.invalidateAllRows();
        this.render();
        this.trigger(this.onInvalidate);
    }
    // convenience method - like #invalidate, but waits for current
    // edit to complete before invalidating.
    // WARNING: while this API is convenient for invalidating data
    //          without impacting the UX, note that its sometimes-
    //          sync, sometimes-async API releases Zalgo! use with
    //          caution!
    invalidateSafe() {
        if (this.getEditorLock().isActive()) {
            // if an invalidate is already scheduled, there's no need to call it twice
            if (this.state.invalidateSafeCellChangeCallback) {
                return;
            }
            this.state.invalidateSafeCellChangeCallback = () => {
                this.onCellChange.unsubscribe(this.state.invalidateSafeCellChangeCallback);
                this.state.invalidateSafeCellChangeCallback = null;
                this.invalidateSafe();
            };
            this.onCellChange.subscribe(this.state.invalidateSafeCellChangeCallback);
        }
        else {
            this.invalidate();
        }
    }
    invalidateAllRows() {
        if (this.currentEditor) {
            this.makeActiveCellNormal();
        }
        for (var row in this.rowsCache) {
            this.removeRowFromCache(Number(row));
        }
    }
    // While scrolling, remove rows from cache and dom if they're off screen
    // There's an exception in here for OSX--if you remove the element that triggered a scroll it interrupts inertial scrolling and feels janky.
    removeRowFromCache(rowIndex) {
        var cacheEntry = this.rowsCache[rowIndex];
        if (!cacheEntry) {
            return;
        }
        if (rowIndex === this.protectedRowIdx) {
            return;
        }
        // call jquery's .remove, so we can listen on cleanup events.
        // See https://github.com/mleibman/SlickGrid/issues/354
        cacheEntry.rowNode.remove();
        delete this.rowsCache[rowIndex];
        delete this.postProcessedRows[rowIndex];
        this.renderedRows--;
        this.counter_rows_removed++;
    }
    invalidateRows(rowIndeces) {
        let i;
        let rl;
        if (!rowIndeces || !rowIndeces.length) {
            return;
        }
        this.vScrollDir = 0;
        for (i = 0, rl = rowIndeces.length; i < rl; i++) {
            if (this.currentEditor && this.activeRow === rowIndeces[i]) {
                this.makeActiveCellNormal();
            }
            if (this.rowsCache[rowIndeces[i]]) {
                this.removeRowFromCache(rowIndeces[i]);
            }
        }
    }
    invalidateRow(rowIndex) {
        this.invalidateRows([rowIndex]);
    }
    updateCell(rowIndex, cell) {
        var cellNode = this.getCellNode(rowIndex, cell);
        if (!cellNode) {
            return;
        }
        let m = this.columns[cell];
        let d = this.getDataItem(rowIndex);
        if (this.currentEditor && this.activeRow === rowIndex && this.activeCell === cell) {
            this.currentEditor.loadValue(d);
        }
        else {
            cellNode.innerHTML = d ? this.getFormatter(rowIndex, m)(rowIndex, cell, this.getDataItemValueForColumn(d, m), m, d, this) : '';
            this.invalidatePostProcessingResults(rowIndex);
        }
    }
    updateRow(rowIndex) {
        var cacheEntry = this.rowsCache[rowIndex];
        if (!cacheEntry) {
            return;
        }
        this.ensureCellNodesInRowsCache(rowIndex);
        var d = this.getDataItem(rowIndex);
        for (var c in cacheEntry.cellNodesByColumnIdx) {
            let columnIdx = Number(c) | 0;
            if (!cacheEntry.cellNodesByColumnIdx.hasOwnProperty(c))
                continue;
            let m = this.columns[columnIdx];
            let node = cacheEntry.cellNodesByColumnIdx[columnIdx];
            if (rowIndex === this.activeRow && columnIdx === this.activeCell && this.currentEditor) {
                this.currentEditor.loadValue(d);
            }
            else if (d) {
                node.innerHTML = this.getFormatter(rowIndex, m)(rowIndex, columnIdx, this.getDataItemValueForColumn(d, m), m, d, this);
            }
            else {
                node.innerHTML = '';
            }
        }
        this.invalidatePostProcessingResults(rowIndex);
    }
    // TODO: calculate the height of the header and subHeader row based on their css size
    calculateHeights() {
        if (this.options.autoHeight) {
            this.contentViewport.height = this.options.rowHeight
                * this.getDataLengthIncludingAddNew()
                + this.header.el.outerHeight();
        }
        else {
            this.contentViewport.height = parseFloat($.css(this.$container[0], 'height', true))
                - parseFloat($.css(this.$container[0], 'paddingTop', true))
                - parseFloat($.css(this.$container[0], 'paddingBottom', true))
                - parseFloat($.css(this.topViewport.el[0], 'height'))
                - this.getVBoxDelta(this.topViewport.el.eq(0))
                - (this.options.appendSubheadersToContainer ? this.subHeaders.el.height() : 0);
        }
        this.numVisibleRows = Math.ceil(this.contentViewport.height / this.options.rowHeight);
    }
    // If you pass it a width, that width is used as the viewport width. If you do not, it is calculated as normal.
    // This is more performant if the canvas size is changed externally. The width is already known so we can pass it in instead of recalculating.
    calculateViewportWidth(width) {
        this.contentViewport.width = width || parseFloat($.css(this.$container[0], 'width', true));
    }
    // If you pass resizeOptions.width, the viewport width calculation can be skipped. This saves 15ms or so.
    resizeCanvas() {
        if (!this.initialized) {
            return;
        }
        // Reset
        this.contentViewport.height = 0;
        this.calculateHeights();
        this.calculateViewportWidth();
        var topOffset = this.topViewport.el.height(); // the top boundary of the center row of things
        this.contentViewportWrap.el.css({ top: topOffset, height: this.contentViewport.height });
        // something is setting the contentViewport's height, and should't be.
        // this causes the viewport to not resize when the window is resized.
        // as a workaround, override the CSS here.
        // TODO: figure out what's setting the height and fix it there instead.
        this.contentViewport.el.css({ top: 0, height: '100%', width: '100%' });
        if (this.options.forceFitColumns) {
            this.autosizeColumns();
        }
        this.updateRowCount();
        // Since the width has changed, force the render() to reevaluate virtually rendered cells.
        this.lastRenderedScrollLeft = -1;
        this.render();
        this.debouncedUpdateAntiscroll();
    }
    updateRowCount() {
        if (!this.initialized) {
            return;
        }
        var dataLengthIncludingAddNew = this.getDataLengthIncludingAddNew();
        var numberOfRows = dataLengthIncludingAddNew +
            (this.options.leaveSpaceForNewRows ? this.numVisibleRows - 1 : 0);
        var oldViewportHasVScroll = this.viewportHasVScroll;
        // with autoHeight, we do not need to accommodate the vertical scroll bar
        this.viewportHasVScroll = !this.options.autoHeight && (numberOfRows * this.options.rowHeight > this.contentViewport.height);
        this.makeActiveCellNormal();
        // remove the rows that are now outside of the data range
        // this helps avoid redundant calls to .removeRow() when the size of the data decreased by thousands of rows
        var l = dataLengthIncludingAddNew - 1;
        for (let i in this.rowsCache) {
            let ii = Number(i);
            if (ii >= l) {
                this.removeRowFromCache(ii);
            }
        }
        if (this.activeCellNode && this.activeRow > l) {
            this.resetActiveCell();
        }
        var oldH = this.h;
        this.th = Math.max(this.options.rowHeight * numberOfRows, this.contentViewport.height - scrollbarDimensions.height);
        if (this.th < maxSupportedCssHeight) {
            // just one page
            this.h = this.ph = this.th;
            this.n = 1;
            this.cj = 0;
        }
        else {
            // break into pages
            this.h = maxSupportedCssHeight;
            this.ph = this.h / 100;
            this.n = Math.floor(this.th / this.ph);
            this.cj = (this.th - this.h) / (this.n - 1);
        }
        if (this.h !== oldH) {
            this.contentCanvas.el.css('height', this.h);
            this.scrollTop = this.contentViewport.el[0].scrollTop;
        }
        var oldScrollTopInRange = (this.scrollTop + this.offset <= this.th - this.contentViewport.height);
        if (this.th === 0 || this.scrollTop === 0) {
            this.page = this.offset = 0;
        }
        else if (oldScrollTopInRange) {
            // maintain virtual position
            this.scrollTo(this.scrollTop + this.offset);
        }
        else {
            // scroll to bottom
            this.scrollTo(this.th - this.contentViewport.height);
        }
        if (this.h !== oldH && this.options.autoHeight) {
            this.resizeCanvas();
        }
        if (this.options.forceFitColumns && oldViewportHasVScroll !== this.viewportHasVScroll) {
            this.autosizeColumns();
        }
        this.updateCanvasWidth(false);
    }
    getViewport(viewportTop, viewportLeft) {
        if (viewportTop == null) {
            viewportTop = this.scrollTop;
        }
        if (viewportLeft == null) {
            viewportLeft = this.scrollLeft;
        }
        return {
            top: this.getRowFromPosition(viewportTop),
            bottom: this.getRowFromPosition(viewportTop + this.contentViewport.height) + 1,
            leftPx: viewportLeft,
            rightPx: viewportLeft + this.contentViewport.width
        };
    }
    getRenderedRange(viewportTop, viewportLeft) {
        var range = this.getViewport(viewportTop, viewportLeft);
        var buffer = Math.round(this.contentViewport.height / this.options.rowHeight);
        var minBuffer = 3;
        if (this.vScrollDir === -1) {
            range.top -= buffer;
            range.bottom += minBuffer;
        }
        else if (this.vScrollDir === 1) {
            range.top -= minBuffer;
            range.bottom += buffer;
        }
        else {
            range.top -= minBuffer;
            range.bottom += minBuffer;
        }
        range.top = Math.max(0, range.top);
        range.bottom = Math.min(this.getDataLengthIncludingAddNew() - 1, range.bottom);
        range.leftPx -= this.contentViewport.width;
        range.rightPx += this.contentViewport.width;
        range.leftPx = Math.max(0, range.leftPx);
        range.rightPx = Math.min(this.contentCanvas.width, range.rightPx);
        return range;
    }
    /*
      Fills in cellNodesByColumnIdx with dom node references
      -
      rowsCache[idx].rowNode is a jquery element that wraps two raw dom elements.
      When pinned, there are two containers, one left and one right.
      rowsCache[idx].rowNode.children().length // sum of both
      rowsCache[idx].rowNode[0].childNodes.length // left side
      rowsCache[idx].rowNode[1].childNodes.length // right side
      */
    ensureCellNodesInRowsCache(rowIndex) {
        var cacheEntry = this.rowsCache[rowIndex];
        if (cacheEntry) {
            if (cacheEntry.cellRenderQueue.length) {
                var $lastNode = cacheEntry.rowNode.children().last(); // The last cell in the row
                while (cacheEntry.cellRenderQueue.length) {
                    var columnIdx = cacheEntry.cellRenderQueue.pop();
                    cacheEntry.cellNodesByColumnIdx[columnIdx] = $lastNode[0];
                    $lastNode = $lastNode.prev();
                    // cellRenderQueue is not empty but there is no .prev() element.
                    // We must need to switch to the other pinned row container.
                    if ($lastNode.length === 0) {
                        $lastNode = $(cacheEntry.rowNode[0]).children().last();
                    }
                }
            }
        }
    }
    cleanUpCells(range, rowIndex) {
        var totalCellsRemoved = 0;
        var cacheEntry = this.rowsCache[rowIndex];
        // Remove cells outside the range.
        var cellsToRemove = [];
        for (let i in cacheEntry.cellNodesByColumnIdx) {
            // I really hate it when people mess with Array.prototype.
            if (!cacheEntry.cellNodesByColumnIdx.hasOwnProperty(i)) {
                continue;
            }
            let ii = Number(i) || 0;
            if (ii <= this.options.pinnedColumn) {
                continue;
            } // never remove cells in a frozen column
            var colspan = cacheEntry.cellColSpans[i];
            if (this.columnPosLeft[i] > range.rightPx || this.columnPosRight[Math.min(this.columns.length - 1, ii + colspan - 1)] < range.leftPx) {
                if (!(rowIndex === this.activeRow && ii === this.activeCell)) {
                    cellsToRemove.push(ii);
                }
            }
        }
        // Remove every cell that isn't in the range,
        // remove the dom element, cellColSpans, cellNodesByColumnIdx, and postProcessedRows entries.
        let cellToRemove;
        let el;
        while ((cellToRemove = cellsToRemove.pop()) != null) {
            el = cacheEntry.cellNodesByColumnIdx[cellToRemove];
            // We used to know the parent, but now there are two possible parents (left or right), so it's easier to go from element to parent to remove:
            // The parent element won't exist if we removed the whole row. eg: we've stopping pinning columns so the whole viewport was removed.
            if (el && el.parentElement) {
                el.parentElement.removeChild(el);
            }
            delete cacheEntry.cellColSpans[cellToRemove];
            delete cacheEntry.cellNodesByColumnIdx[cellToRemove];
            if (this.postProcessedRows[rowIndex]) {
                delete this.postProcessedRows[rowIndex][cellToRemove];
            }
            totalCellsRemoved++;
        }
        return totalCellsRemoved;
    }
    cleanUpAndRenderCells(range) {
        var cacheEntry;
        var markupArray = [];
        var processedRows = [];
        let cellsAdded;
        let cellsRemoved;
        var totalCellsAdded = 0;
        var colspan;
        for (var row = range.top, btm = range.bottom; row <= btm; row++) {
            cacheEntry = this.rowsCache[row];
            if (!cacheEntry) {
                continue;
            }
            // cellRenderQueue populated in renderRows() needs to be cleared first
            this.ensureCellNodesInRowsCache(row);
            cellsRemoved = this.cleanUpCells(range, row);
            // Render missing cells.
            cellsAdded = 0;
            var metadata = this.data.getItemMetadata && this.data.getItemMetadata(row);
            metadata = metadata && metadata.columns;
            var d = this.getDataItem(row);
            // TODO:  shorten this loop (index? heuristics? binary search?)
            for (var i = 0, ii = this.columns.length; i < ii; i++) {
                // Cells to the right are outside the range.
                if (this.columnPosLeft[i] > range.rightPx) {
                    break;
                }
                // Already rendered.
                if ((colspan = cacheEntry.cellColSpans[i]) != null) {
                    i += (colspan > 1 ? colspan - 1 : 0);
                    continue;
                }
                // Adjust the colspan if needed
                colspan = 1;
                if (metadata) {
                    var columnData = metadata[this.columns[i].id] || metadata[i];
                    colspan = (columnData && columnData.colspan) || 1;
                    if (colspan === '*') {
                        colspan = ii - i;
                    }
                }
                // Cells whose right edge is inside the left range boundary are visible and should be drawn
                if (this.columnPosRight[Math.min(ii - 1, i + colspan - 1)] > range.leftPx) {
                    this.appendCellHtml(markupArray, row, i, colspan, d);
                    cellsAdded++;
                }
                i += (colspan > 1 ? colspan - 1 : 0);
            }
            if (cellsAdded) {
                totalCellsAdded += cellsAdded;
                processedRows.push(row);
            }
        }
        if (!markupArray.length) {
            return;
        }
        // Create a temporary DOM element to hold the markup for every cell. Can be from different rows.
        var x = document.createElement('div');
        x.innerHTML = markupArray.join('');
        let processedRow;
        let $node;
        let side;
        while ((processedRow = processedRows.pop()) != null) {
            cacheEntry = this.rowsCache[processedRow];
            var columnIdx;
            // Starting on the rightmost cell,
            while ((columnIdx = cacheEntry.cellRenderQueue.pop()) != null) {
                $node = $(x).children().last();
                side = this.options.pinnedColumn != null && columnIdx > this.options.pinnedColumn ? 1 : 0;
                $(cacheEntry.rowNode[side]).append($node);
                cacheEntry.cellNodesByColumnIdx[columnIdx] = $node[0];
            }
        }
    }
    renderRows(range) {
        let markupArrayL = [];
        let markupArrayR = [];
        let rows = [];
        let needToReselectCell = false;
        let dataLength = this.getDataLength();
        for (var i = range.top, ii = range.bottom; i <= ii; i++) {
            if (this.rowsCache[i]) {
                continue;
            }
            this.renderedRows++;
            rows.push(i);
            // Create an entry right away so that appendRowHtml() can
            // start populating it.
            this.rowsCache[i] = {
                rowNode: null,
                // ColSpans of rendered cells (by column idx).
                // Can also be used for checking whether a cell has been rendered.
                cellColSpans: [],
                // Cell nodes (by column idx).  Lazy-populated by ensureCellNodesInRowsCache().
                cellNodesByColumnIdx: [],
                // Column indices of cell nodes that have been rendered, but not yet indexed in
                // cellNodesByColumnIdx.  These are in the same order as cell nodes added at the
                // end of the row.
                cellRenderQueue: []
            };
            this.appendRowHtml(markupArrayL, markupArrayR, i, range, dataLength);
            if (this.activeCellNode && this.activeRow === i) {
                needToReselectCell = true;
            }
            this.counter_rows_rendered++;
        }
        if (!rows.length) {
            return;
        }
        let l = document.createElement('div');
        let r = document.createElement('div');
        l.innerHTML = markupArrayL.join('');
        r.innerHTML = markupArrayR.join('');
        // For each row, add a row node that contains either one or two elements, depending on whether columns are pinned
        for (let i = 0, ii = rows.length; i < ii; i++) {
            if (this.isPinned) {
                this.rowsCache[rows[i]].rowNode = $()
                    .add($(l.firstChild).appendTo(this.contentCanvas.el[0]))
                    .add($(r.firstChild).appendTo(this.contentCanvas.el[1]));
            }
            else {
                this.rowsCache[rows[i]].rowNode = $()
                    .add($(l.firstChild).appendTo(this.contentCanvas.el[0]));
            }
        }
        if (needToReselectCell) {
            this.activeCellNode = this.getCellNode(this.activeRow, this.activeCell);
        }
    }
    startPostProcessing() {
        if (!this.options.enableAsyncPostRender) {
            return;
        }
        if (!this.columns.some((column) => column.asyncPostRender != null))
            return;
        clearTimeout(this.h_postrender);
        this.h_postrender = setTimeout(this.asyncPostProcessRows.bind(this), this.options.asyncPostRenderDelay);
    }
    invalidatePostProcessingResults(row) {
        delete this.postProcessedRows[row];
        this.postProcessFromRow = Math.min(this.postProcessFromRow, row);
        this.postProcessToRow = Math.max(this.postProcessToRow, row);
        this.startPostProcessing();
    }
    updateRowPositions() {
        for (var row in this.rowsCache) {
            this.rowsCache[row].rowNode.css('top', this.getRowTop(Number(row)) + 'px');
        }
    }
    render() {
        if (!this.initialized) {
            return;
        }
        var visible = this.getViewport();
        var rendered = this.getRenderedRange();
        // remove rows no longer in the viewport
        this.cleanupRows(rendered);
        // If we change the left scroll, we may need to add/remove cells from already drawn rows.
        if (this.lastRenderedScrollLeft !== this.scrollLeft) {
            this.cleanUpAndRenderCells(rendered);
        }
        // render missing rows
        this.renderRows(rendered);
        this.postProcessFromRow = visible.top;
        this.postProcessToRow = Math.min(this.getDataLengthIncludingAddNew() - 1, visible.bottom);
        this.startPostProcessing();
        this.lastRenderedScrollTop = this.scrollTop;
        this.lastRenderedScrollLeft = this.scrollLeft;
        this.trigger(this.onRender, {});
        this.h_render = null;
    }
    // React to a mousewheel event on a header element, translate them to the grid contents
    // It's OK to always decrement because the browser never lets scrollLeft or Top get set less than 0.
    onHeaderMouseWheel(evt) {
        this.contentViewport.scroller.scrollLeft -= evt.originalEvent.wheelDeltaX;
        this.contentViewport.scroller.scrollTop -= evt.originalEvent.wheelDeltaY;
    }
    // Handle an actual, browser triggered scroll event
    // Send the scrollTop from the triggering element into `handleScroll`, which can be triggered programatically.
    scroll() {
        this.handleScroll();
    }
    handleScroll(top = this.contentViewport.scroller.scrollTop) {
        this.scrollTop = top;
        this.scrollLeft = this.contentViewport.scroller.scrollLeft;
        this.reallyHandleScroll(false);
    }
    reallyHandleScroll(isMouseWheel) {
        var contentScroller = this.contentViewport.scroller;
        // Ceiling the max scroll values
        var maxScrollDistanceY = contentScroller.scrollHeight - contentScroller.clientHeight;
        var maxScrollDistanceX = contentScroller.scrollWidth - contentScroller.clientWidth;
        if (this.scrollTop > maxScrollDistanceY) {
            this.scrollTop = maxScrollDistanceY;
        }
        if (this.scrollLeft > maxScrollDistanceX) {
            this.scrollLeft = maxScrollDistanceX;
        }
        var vScrollDist = Math.abs(this.scrollTop - this.prevScrollTop);
        var hScrollDist = Math.abs(this.scrollLeft - this.prevScrollLeft);
        if (hScrollDist) {
            this.prevScrollLeft = this.scrollLeft;
            contentScroller.scrollLeft = this.scrollLeft;
            this.topViewport.scroller.scrollLeft = this.scrollLeft;
            if (this.options.appendSubheadersToContainer) {
                this.subHeaders.el.scrollLeft(this.scrollLeft);
            }
        }
        if (vScrollDist) {
            this.vScrollDir = this.prevScrollTop < this.scrollTop ? 1 : -1;
            this.prevScrollTop = this.scrollTop;
            if (isMouseWheel) {
                contentScroller.scrollTop = this.scrollTop;
            }
            // Set the scroll position of the paired viewport to match this one
            if (this.isPinned) {
                this.contentViewport.el[0].scrollTop = this.scrollTop;
                this.contentViewport.el[1].scrollTop = this.scrollTop;
            }
            // switch virtual pages if needed
            if (vScrollDist < this.contentViewport.height) {
                this.scrollTo(this.scrollTop + this.offset);
            }
            else {
                var oldOffset = this.offset;
                if (this.h === this.contentViewport.height) {
                    this.page = 0;
                }
                else {
                    this.page = Math.min(this.n - 1, Math.floor(this.scrollTop * ((this.th - this.contentViewport.height) / (this.h - this.contentViewport.height)) * (1 / this.ph)));
                }
                this.offset = Math.round(this.page * this.cj);
                if (oldOffset !== this.offset) {
                    this.invalidateAllRows();
                }
            }
        }
        if (hScrollDist || vScrollDist) {
            if (this.h_render) {
                clearTimeout(this.h_render);
            }
            if (Math.abs(this.lastRenderedScrollTop - this.scrollTop) > 20 ||
                Math.abs(this.lastRenderedScrollLeft - this.scrollLeft) > 20) {
                if (this.options.forceSyncScrolling || (Math.abs(this.lastRenderedScrollTop - this.scrollTop) < this.contentViewport.height &&
                    Math.abs(this.lastRenderedScrollLeft - this.scrollLeft) < this.contentViewport.width)) {
                    this.render();
                }
                else {
                    this.h_render = setTimeout(this.render.bind(this), 50);
                }
                this.trigger(this.onViewportChanged, {});
            }
        }
        this.trigger(this.onScroll, { scrollLeft: this.scrollLeft, scrollTop: this.scrollTop });
    }
    asyncPostProcessRows() {
        var dataLength = this.getDataLength();
        while (this.postProcessFromRow <= this.postProcessToRow) {
            let row;
            if (this.vScrollDir >= 0) {
                row = this.postProcessFromRow;
                this.postProcessFromRow = this.postProcessFromRow + 1;
            }
            else {
                row = this.postProcessToRow;
                this.postProcessToRow = this.postProcessToRow - 1;
            }
            var cacheEntry = this.rowsCache[row];
            if (!cacheEntry || row >= dataLength) {
                continue;
            }
            if (!this.postProcessedRows[row]) {
                this.postProcessedRows[row] = {};
            }
            this.ensureCellNodesInRowsCache(row);
            for (let columnName in cacheEntry.cellNodesByColumnIdx) {
                if (!cacheEntry.cellNodesByColumnIdx.hasOwnProperty(columnName)) {
                    continue;
                }
                const columnIdx = Number(columnName) || 0;
                var m = this.columns[columnIdx];
                if (m.asyncPostRender && !this.postProcessedRows[row][columnIdx]) {
                    var node = cacheEntry.cellNodesByColumnIdx[columnIdx];
                    if (node) {
                        try {
                            m.asyncPostRender(node, row, this.getDataItem(row), m, this);
                        }
                        catch (error) {
                            console.error('Error in asyncPostRenderer:', error, [node, row, this.getDataItem(row), m, this]);
                        }
                    }
                    this.postProcessedRows[row][columnIdx] = true;
                }
            }
            this.h_postrender = setTimeout(this.asyncPostProcessRows.bind(this), this.options.asyncPostRenderDelay);
            return;
        }
    }
    updateCellCssStylesOnRenderedRows(addedHash, removedHash) {
        let node;
        let columnId;
        let addedRowHash;
        let removedRowHash;
        for (var row in this.rowsCache) {
            removedRowHash = removedHash && removedHash[row];
            addedRowHash = addedHash && addedHash[row];
            if (removedRowHash) {
                for (columnId in removedRowHash) {
                    if (!addedRowHash || removedRowHash[columnId] !== addedRowHash[columnId]) {
                        node = this.getCellNode(Number(row), this.getColumnIndex(columnId));
                        if (node) {
                            $(node).removeClass(removedRowHash[columnId]);
                        }
                    }
                }
            }
            if (addedRowHash) {
                for (columnId in addedRowHash) {
                    if (!removedRowHash || removedRowHash[columnId] !== addedRowHash[columnId]) {
                        node = this.getCellNode(Number(row), this.getColumnIndex(columnId));
                        if (node) {
                            $(node).addClass(addedRowHash[columnId]);
                        }
                    }
                }
            }
        }
    }
    addCellCssStyles(key, hash) {
        if (this.cellCssClasses[key]) {
            throw 'addCellCssStyles: cell CSS hash with key \'' + key + '\' already exists.';
        }
        this.cellCssClasses[key] = hash;
        this.updateCellCssStylesOnRenderedRows(hash, null);
        this.trigger(this.onCellCssStylesChanged, { key: key, hash: hash });
    }
    removeCellCssStyles(key) {
        if (!this.cellCssClasses[key]) {
            return;
        }
        this.updateCellCssStylesOnRenderedRows(null, this.cellCssClasses[key]);
        delete this.cellCssClasses[key];
        this.trigger(this.onCellCssStylesChanged, { key: key, hash: null });
    }
    setCellCssStyles(key, hash) {
        var prevHash = this.cellCssClasses[key];
        this.cellCssClasses[key] = hash;
        this.updateCellCssStylesOnRenderedRows(hash, prevHash);
        this.trigger(this.onCellCssStylesChanged, { key: key, hash: hash });
    }
    // (key: String) => Object
    getCellCssStyles(key) {
        return this.cellCssClasses[key];
    }
    flashCell(row, cell, speed) {
        speed = speed || 100;
        if (this.rowsCache[row]) {
            var $cell = $(this.getCellNode(row, cell));
            var toggleCellClass = (times) => {
                if (!times) {
                    return;
                }
                setTimeout(() => {
                    $cell.queue(() => {
                        $cell.toggleClass(this.options.cellFlashingCssClass).dequeue();
                        toggleCellClass(times - 1);
                    });
                }, speed);
            };
            toggleCellClass(4);
        }
    }
    //////////////////////////////////////////////////////////////////////////////////////////////
    // Interactivity
    handleDragInit(e, dd) {
        var cell = this.getCellFromEvent(e);
        if (!cell || !this.cellExists(cell.row, cell.cell)) {
            return false;
        }
        var retval = this.trigger(this.onDragInit, dd, e);
        if (e.isImmediatePropagationStopped()) {
            return retval;
        }
        // if nobody claims to be handling drag'n'drop by stopping immediate propagation,
        // cancel out of it
        return false;
    }
    handleDragStart(e, dd) {
        var cell = this.getCellFromEvent(e);
        if (!cell || !this.cellExists(cell.row, cell.cell)) {
            return false;
        }
        var retval = this.trigger(this.onDragStart, dd, e);
        if (e.isImmediatePropagationStopped()) {
            return retval;
        }
        return false;
    }
    handleDrag(e, dd) {
        return this.trigger(this.onDrag, dd, e);
    }
    handleDragEnd(e, dd) {
        this.trigger(this.onDragEnd, dd, e);
    }
    handleKeyDown(e) {
        this.trigger(this.onBeforeKeyDown, { row: this.activeRow, cell: this.activeCell }, e);
        this.trigger(this.onKeyDown, { row: this.activeRow, cell: this.activeCell }, e);
        var handled = e.isImmediatePropagationStopped();
        if (!handled) {
            if (!e.shiftKey && !e.altKey && !e.ctrlKey) {
                if (e.which === 27) {
                    if (!this.getEditorLock().isActive()) {
                        return; // no editing mode to cancel, allow bubbling and default processing (exit without cancelling the event)
                    }
                    this.cancelEditAndSetFocus();
                }
                else if (e.which === 34) {
                    this.navigatePageDown();
                    handled = true;
                }
                else if (e.which === 33) {
                    this.navigatePageUp();
                    handled = true;
                }
                else if (e.which === 37) {
                    handled = this.navigateLeft();
                }
                else if (e.which === 39) {
                    handled = this.navigateRight();
                }
                else if (e.which === 38) {
                    handled = this.navigateUp();
                }
                else if (e.which === 40) {
                    handled = this.navigateDown();
                }
                else if (e.which === 9) {
                    handled = this.navigateNext();
                }
                else if (e.which === 13) {
                    if (this.options.editable) {
                        if (this.currentEditor) {
                            // adding new row
                            if (this.activeRow === this.getDataLength()) {
                                this.navigateDown();
                            }
                            else {
                                this.commitEditAndSetFocus();
                            }
                        }
                        else {
                            if (this.getEditorLock().commitCurrentEdit()) {
                                this.editActiveCell();
                            }
                        }
                    }
                    handled = true;
                }
            }
            else if (e.which === 9 && e.shiftKey && !e.ctrlKey && !e.altKey) {
                handled = this.navigatePrev();
            }
        }
        if (handled) {
            // the event has been handled so don't let parent element (bubbling/propagation) or browser (default) handle it
            e.stopPropagation();
            e.preventDefault();
            try {
                e.originalEvent.keyCode = 0; // prevent default behaviour for special keys in IE browsers (F3, F5, etc.)
            }
            catch (error) {
                // ignore exceptions - setting the original event's keycode throws access denied exception for "Ctrl"
                // (hitting control key only, nothing else), "Shift" (maybe others)
            }
        }
    }
    handleClick(e) {
        if (!this.currentEditor) {
            // if this click resulted in some cell child node getting focus,
            // don't steal it back - keyboard events will still bubble up
            // IE9+ seems to default DIVs to tabIndex=0 instead of -1, so check for cell clicks directly.
            if (e.target !== document.activeElement || $(e.target).hasClass('cell')) {
                this.focus();
            }
        }
        var cell = this.getCellFromEvent(e);
        if (!cell || (this.currentEditor !== null && this.activeRow === cell.row && this.activeCell === cell.cell)) {
            return;
        }
        this.trigger(this.onClick, { row: cell.row, cell: cell.cell }, e);
        if (e.isImmediatePropagationStopped()) {
            return;
        }
        if ((this.activeCell !== cell.cell || this.activeRow !== cell.row) && this.canCellBeActive(cell.row, cell.cell)) {
            if (!this.getEditorLock().isActive() || this.getEditorLock().commitCurrentEdit()) {
                this.scrollRowIntoView(cell.row, false);
                this.setActiveCellInternal(this.getCellNode(cell.row, cell.cell));
            }
        }
    }
    handleContextMenu(e) {
        var $cell = $(e.target).closest('.cell', this.contentCanvas.el);
        if ($cell.length === 0) {
            return;
        }
        // are we editing this cell?
        if (this.activeCellNode === $cell[0] && this.currentEditor !== null) {
            return;
        }
        this.trigger(this.onContextMenu, {}, e);
    }
    handleDblClick(e) {
        var cell = this.getCellFromEvent(e);
        if (!cell || (this.currentEditor !== null && this.activeRow === cell.row && this.activeCell === cell.cell)) {
            return;
        }
        this.trigger(this.onDblClick, { row: cell.row, cell: cell.cell }, e);
        if (e.isImmediatePropagationStopped()) {
            return;
        }
        if (this.options.editable) {
            this.gotoCell(cell.row, cell.cell, true);
        }
    }
    handleHeaderMouseEnter(e) {
        this.trigger(this.onHeaderMouseEnter, {
            column: $(this).data('column')
        }, e);
    }
    handleHeaderMouseLeave(e) {
        this.trigger(this.onHeaderMouseLeave, {
            column: $(this).data('column')
        }, e);
    }
    handleHeaderContextMenu(e) {
        var $header = $(e.target).closest('.cell', '.header');
        var column = $header && $header.data('column');
        this.trigger(this.onHeaderContextMenu, { column: column }, e);
    }
    handleSubHeaderContextMenu(e) {
        var $subHeader = $(e.target).closest('.cell', '.subHeaders');
        var column = $subHeader && $subHeader.data('column');
        this.trigger(this.onSubHeaderContextMenu, { column: column }, e);
    }
    handleHeaderClick(e) {
        var $header = $(e.target).closest('.cell', '.header');
        var column = $header && $header.data('column');
        if (column) {
            this.trigger(this.onHeaderClick, { column: column }, e);
        }
    }
    handleMouseEnter(e) {
        this.trigger(this.onMouseEnter, {}, e);
    }
    handleMouseLeave(e) {
        this.trigger(this.onMouseLeave, {}, e);
    }
    cellExists(row, cell) {
        return !(row < 0 || row >= this.getDataLength() || cell < 0 || cell >= this.columns.length);
    }
    getCellFromPoint(x, y) {
        var row = this.getRowFromPosition(y);
        var cell = 0;
        var w = 0;
        for (var i = 0; i < this.columns.length && w < x; i++) {
            w += this.columns[i].width;
            cell++;
        }
        if (cell < 0) {
            cell = 0;
        }
        return { row: row, cell: cell - 1 };
    }
    // Given a cell element, read column number from .l<columnNumber> CSS class
    getCellFromNode(cellNode) {
        if (cellNode[0]) {
            cellNode = cellNode[0];
        } // unwrap jquery
        var cls = /l\d+/.exec(cellNode.className);
        if (!cls) {
            throw 'getCellFromNode: cannot get cell - ' + cellNode.className;
        }
        return parseInt(cls[0].substr(1, cls[0].length - 1), 10);
    }
    // Given a dom element for a row, find out which row index it belongs to
    getRowFromNode(node) {
        for (var idx in this.rowsCache) {
            if (this.rowsCache[idx].rowNode[0] === node ||
                this.rowsCache[idx].rowNode[1] === node) {
                return parseInt(idx, 10);
            }
        }
        return null;
    }
    getCellFromEvent(e) {
        var $cell = $(e.target).closest('.cell', this.contentCanvas.el);
        if (!$cell.length) {
            return null;
        }
        var row = this.getRowFromNode($cell[0].parentNode);
        var cell = this.getCellFromNode($cell[0]);
        if (row == null || cell == null) {
            return null;
        }
        else {
            return {
                row: row,
                cell: cell
            };
        }
    }
    getCellNodeBox(row, cell) {
        if (!this.cellExists(row, cell)) {
            return null;
        }
        var y1 = this.getRowTop(row);
        var y2 = y1 + this.options.rowHeight - 1;
        var x1 = 0;
        for (var i = 0; i < cell; i++) {
            x1 += this.columns[i].width;
        }
        var x2 = x1 + this.columns[cell].width;
        return {
            top: y1,
            left: x1,
            bottom: y2,
            right: x2
        };
    }
    //////////////////////////////////////////////////////////////////////////////////////////////
    // Cell switching
    resetActiveCell() {
        this.setActiveCellInternal(null, false);
    }
    focus() {
        if (this.tabbingDirection === -1) {
            this.$focusSink[0].focus();
        }
        else {
            this.$focusSink2[0].focus();
        }
    }
    getPinnedColumnsWidth() {
        if (this.options.pinnedColumn == null)
            return 0;
        let width = 0;
        for (let i = 0; i <= this.options.pinnedColumn; i++) {
            width += this.columnPosRight[i] - this.columnPosLeft[i];
        }
        return width;
    }
    // Returns the index of the first column (counting from the left) that is focusable
    // (Void) => Number
    getFirstFocusableColumnIndex() {
        var columns = this.getColumns();
        var index = 0;
        while (index < columns.length) {
            if (columns[index].focusable) {
                return index;
            }
            index++;
        }
        return -1;
    }
    scrollCellIntoView(row, cell, doPaging) {
        this.scrollRowIntoView(row, doPaging);
        // no need to scroll if cell inside pinned area (not perfect solution but practical)
        if (this.options.pinnedColumn != null && cell <= this.options.pinnedColumn)
            return;
        const left = this.columnPosLeft[cell] - this.getPinnedColumnsWidth();
        const right = this.columnPosRight[cell + this.getColspan(row, cell) - 1];
        const scrollRight = this.scrollLeft + this.contentViewport.width;
        if (left < this.scrollLeft) {
            this.contentViewport.el.scrollLeft(left);
            this.handleScroll();
            this.render();
        }
        else if (right > scrollRight) {
            this.contentViewport.el.scrollLeft(this.scrollLeft + this.columnPosRight[cell] - this.columnPosLeft[cell]);
            this.handleScroll();
            this.render();
        }
    }
    setActiveCellInternal(newCell, opt_editMode) {
        var previousActiveRow = this.activeRow;
        if (this.activeCellNode !== null) {
            this.makeActiveCellNormal();
            $(this.activeCellNode).removeClass('active');
            if (this.rowsCache[this.activeRow]) {
                $(this.rowsCache[this.activeRow].rowNode).removeClass('active');
            }
        }
        var activeCellChanged = (this.activeCellNode !== newCell);
        this.activeCellNode = newCell;
        if (this.activeCellNode != null) {
            this.activeRow = this.getRowFromNode(this.activeCellNode.parentNode);
            this.activeCell = this.activePosX = this.getCellFromNode(this.activeCellNode);
            if (opt_editMode == null) {
                opt_editMode = (this.activeRow === this.getDataLength()) || this.options.autoEdit;
            }
            $(this.activeCellNode).addClass('active');
            $(this.rowsCache[this.activeRow].rowNode).addClass('active');
            if (this.options.editable && opt_editMode && this.isCellPotentiallyEditable(this.activeRow, this.activeCell)) {
                if (this.h_editorLoader) {
                    clearTimeout(this.h_editorLoader);
                }
                if (this.options.asyncEditorLoading) {
                    this.h_editorLoader = setTimeout(this.editActiveCell.bind(this), this.options.asyncEditorLoadDelay);
                }
                else {
                    this.editActiveCell();
                }
            }
        }
        else {
            this.activeRow = this.activeCell = null;
        }
        if (activeCellChanged) {
            this.trigger(this.onActiveCellChanged, this.getActiveCell());
        }
        var activeRowChanged = (this.activeRow !== previousActiveRow);
        if (activeRowChanged) {
            this.trigger(this.onActiveRowChanged, { row: this.getDataItem(this.activeRow) });
        }
    }
    clearTextSelection() {
        const sel = window.getSelection();
        if (sel && sel.removeAllRanges)
            sel.removeAllRanges();
    }
    isCellPotentiallyEditable(row, cell) {
        var dataLength = this.getDataLength();
        // is the data for this row loaded?
        if (row < dataLength && !this.getDataItem(row)) {
            return false;
        }
        // are we in the Add New row?  can we create new from this cell?
        if (this.columns[cell].cannotTriggerInsert && row >= dataLength) {
            return false;
        }
        // does this cell have an editor?
        if (!this.getEditor(row, cell)) {
            return false;
        }
        return true;
    }
    makeActiveCellNormal() {
        if (!this.currentEditor) {
            return;
        }
        this.trigger(this.onBeforeCellEditorDestroy, { editor: this.currentEditor });
        this.currentEditor.destroy();
        this.currentEditor = null;
        if (this.activeCellNode) {
            var d = this.getDataItem(this.activeRow);
            $(this.activeCellNode).removeClass('editable invalid');
            if (d) {
                var column = this.columns[this.activeCell];
                var formatter = this.getFormatter(this.activeRow, column);
                this.activeCellNode.innerHTML = formatter(this.activeRow, this.activeCell, this.getDataItemValueForColumn(d, column), column, d, this);
                this.invalidatePostProcessingResults(this.activeRow);
            }
        }
        // if there previously was text selected on a page (such as selected text in the edit cell just removed),
        // IE can't set focus to anything else correctly
        if (navigator.userAgent.toLowerCase().match(/msie/)) {
            this.clearTextSelection();
        }
        this.getEditorLock().deactivate(this.editController);
    }
    editActiveCell(editor) {
        if (!this.activeCellNode) {
            return;
        }
        if (!this.options.editable) {
            throw 'Grid : editActiveCell : should never get called when options.editable is false';
        }
        // cancel pending async call if there is one
        if (this.h_editorLoader) {
            clearTimeout(this.h_editorLoader);
        }
        if (!this.isCellPotentiallyEditable(this.activeRow, this.activeCell)) {
            return;
        }
        var columnDef = this.columns[this.activeCell];
        var item = this.getDataItem(this.activeRow);
        if (this.trigger(this.onBeforeEditCell, { row: this.activeRow, cell: this.activeCell, item: item, column: columnDef }) === false) {
            this.focus();
            return;
        }
        this.getEditorLock().activate(this.editController);
        $(this.activeCellNode).addClass('editable');
        // don't clear the cell if a custom editor is passed through
        if (!editor) {
            this.activeCellNode.innerHTML = '';
        }
        this.currentEditor = new (editor || this.getEditor(this.activeRow, this.activeCell))({
            grid: this,
            gridPosition: this.absBox(this.$container[0]),
            position: this.absBox(this.activeCellNode),
            container: this.activeCellNode,
            column: columnDef,
            item: item || {},
            commitChanges: this.commitEditAndSetFocus,
            cancelChanges: this.cancelEditAndSetFocus
        });
        if (item) {
            this.currentEditor.loadValue(item);
        }
        this.serializedEditorValue = this.currentEditor.serializeValue();
        if (this.currentEditor.position) {
            this.handleActiveCellPositionChange();
        }
    }
    commitEditAndSetFocus() {
        // if the commit fails, it would do so due to a validation error
        // if so, do not steal the focus from the editor
        if (this.getEditorLock().commitCurrentEdit()) {
            this.focus();
            if (this.options.autoEdit) {
                this.navigateDown();
            }
        }
    }
    cancelEditAndSetFocus() {
        if (this.getEditorLock().cancelCurrentEdit()) {
            this.focus();
        }
    }
    absBox(elem) {
        var box = {
            top: elem.offsetTop,
            left: elem.offsetLeft,
            bottom: 0,
            right: 0,
            width: $(elem).outerWidth(),
            height: $(elem).outerHeight(),
            visible: true
        };
        box.bottom = box.top + box.height;
        box.right = box.left + box.width;
        // walk up the tree
        var offsetParent = elem.offsetParent;
        while ((elem = elem.parentNode) !== document.body) {
            if (box.visible && elem.scrollHeight !== elem.offsetHeight && $(elem).css('overflowY') !== 'visible') {
                box.visible = box.bottom > elem.scrollTop && box.top < elem.scrollTop + elem.clientHeight;
            }
            if (box.visible && elem.scrollWidth !== elem.offsetWidth && $(elem).css('overflowX') !== 'visible') {
                box.visible = box.right > elem.scrollLeft && box.left < elem.scrollLeft + elem.clientWidth;
            }
            box.left -= elem.scrollLeft;
            box.top -= elem.scrollTop;
            if (elem === offsetParent) {
                box.left += elem.offsetLeft;
                box.top += elem.offsetTop;
                offsetParent = elem.offsetParent;
            }
            box.bottom = box.top + box.height;
            box.right = box.left + box.width;
        }
        return box;
    }
    getActiveCellPosition() {
        return this.absBox(this.activeCellNode);
    }
    getGridPosition() {
        return this.absBox(this.$container[0]);
    }
    handleActiveCellPositionChange() {
        if (!this.activeCellNode) {
            return;
        }
        this.trigger(this.onActiveCellPositionChanged, {});
        if (this.currentEditor) {
            var cellBox = this.getActiveCellPosition();
            if (this.currentEditor.show && this.currentEditor.hide) {
                if (!cellBox.visible) {
                    this.currentEditor.hide();
                }
                else {
                    this.currentEditor.show();
                }
            }
            if (this.currentEditor.position) {
                this.currentEditor.position(cellBox);
            }
        }
    }
    getCellEditor() {
        return this.currentEditor;
    }
    getActiveCell() {
        if (!this.activeCellNode) {
            return null;
        }
        else {
            return { row: this.activeRow, cell: this.activeCell };
        }
    }
    getActiveCellNode() {
        return this.activeCellNode;
    }
    scrollRowIntoView(rowIndex, doPaging) {
        var rowAtTop = rowIndex * this.options.rowHeight;
        var rowAtBottom = (rowIndex + 1) * this.options.rowHeight - this.contentViewport.height + (this.viewportHasHScroll ? scrollbarDimensions.height : 0);
        // need to page down?
        if ((rowIndex + 1) * this.options.rowHeight > this.scrollTop + this.contentViewport.height + this.offset) {
            this.scrollTo(doPaging ? rowAtTop : rowAtBottom);
            this.render();
        }
        else if (rowIndex * this.options.rowHeight < this.scrollTop + this.offset) {
            // or page up?
            this.scrollTo(doPaging ? rowAtBottom : rowAtTop);
            this.render();
        }
    }
    scrollRowToTop(row) {
        this.scrollTo(row * this.options.rowHeight);
        this.render();
    }
    scrollPage(dir) {
        var deltaRows = dir * this.numVisibleRows;
        this.scrollTo((this.getRowFromPosition(this.scrollTop) + deltaRows) * this.options.rowHeight);
        this.render();
        if (this.options.enableCellNavigation && this.activeRow != null) {
            var row = this.activeRow + deltaRows;
            var dataLengthIncludingAddNew = this.getDataLengthIncludingAddNew();
            if (row >= dataLengthIncludingAddNew) {
                row = dataLengthIncludingAddNew - 1;
            }
            if (row < 0) {
                row = 0;
            }
            var cell = 0;
            var prevCell = null;
            var prevActivePosX = this.activePosX;
            while (cell <= this.activePosX) {
                if (this.canCellBeActive(row, cell)) {
                    prevCell = cell;
                }
                cell += this.getColspan(row, cell);
            }
            if (prevCell !== null) {
                this.setActiveCellInternal(this.getCellNode(row, prevCell));
                this.activePosX = prevActivePosX;
            }
            else {
                this.resetActiveCell();
            }
        }
    }
    navigatePageDown() {
        this.scrollPage(1);
    }
    navigatePageUp() {
        this.scrollPage(-1);
    }
    getColspan(rowIndex, cell) {
        var metadata = this.data.getItemMetadata && this.data.getItemMetadata(rowIndex);
        if (!metadata || !metadata.columns) {
            return 1;
        }
        var columnData = metadata.columns[this.columns[cell].id] || metadata.columns[cell];
        var colspan = (columnData && columnData.colspan);
        if (colspan === '*') {
            return this.columns.length - cell;
        }
        else {
            return colspan || 1;
        }
    }
    findFirstFocusableCell(rowIndex) {
        var cell = 0;
        while (cell < this.columns.length) {
            if (this.canCellBeActive(rowIndex, cell)) {
                return cell;
            }
            cell += this.getColspan(rowIndex, cell);
        }
        return null;
    }
    findLastFocusableCell(rowIndex) {
        var cell = 0;
        var lastFocusableCell = null;
        while (cell < this.columns.length) {
            if (this.canCellBeActive(rowIndex, cell)) {
                lastFocusableCell = cell;
            }
            cell += this.getColspan(rowIndex, cell);
        }
        return lastFocusableCell;
    }
    gotoRight(row, cell, posX) {
        if (cell >= this.columns.length) {
            return null;
        }
        do {
            cell += this.getColspan(row, cell);
        } while (cell < this.columns.length && !this.canCellBeActive(row, cell));
        if (cell < this.columns.length) {
            return {
                row: row,
                cell: cell,
                posX: cell
            };
        }
        return null;
    }
    gotoLeft(row, cell, posX) {
        if (cell <= 0) {
            return null;
        }
        var firstFocusableCell = this.findFirstFocusableCell(row);
        if (firstFocusableCell === null || firstFocusableCell >= cell) {
            return null;
        }
        var prev = {
            row: row,
            cell: firstFocusableCell,
            posX: firstFocusableCell
        };
        var pos;
        while (true) {
            pos = this.gotoRight(prev.row, prev.cell, prev.posX);
            if (!pos) {
                return null;
            }
            if (pos.cell >= cell) {
                return prev;
            }
            prev = pos;
        }
    }
    gotoDown(row, cell, posX) {
        var prevCell;
        var dataLengthIncludingAddNew = this.getDataLengthIncludingAddNew();
        while (true) {
            row++;
            if (row >= dataLengthIncludingAddNew) {
                return null;
            }
            prevCell = cell = 0;
            while (cell <= posX) {
                prevCell = cell;
                cell += this.getColspan(row, cell);
            }
            if (this.canCellBeActive(row, prevCell)) {
                return {
                    row: row,
                    cell: prevCell,
                    posX: posX
                };
            }
        }
    }
    gotoUp(row, cell, posX) {
        var prevCell;
        while (true) {
            row--;
            if (row < 0) {
                return null;
            }
            prevCell = cell = 0;
            while (cell <= posX) {
                prevCell = cell;
                cell += this.getColspan(row, cell);
            }
            if (this.canCellBeActive(row, prevCell)) {
                return {
                    row: row,
                    cell: prevCell,
                    posX: posX
                };
            }
        }
    }
    gotoNext(row, cell, posX) {
        if (row == null && cell == null) {
            row = cell = posX = 0;
            if (this.canCellBeActive(row, cell)) {
                return {
                    row: row,
                    cell: cell,
                    posX: cell
                };
            }
        }
        var pos = this.gotoRight(row, cell, posX);
        if (pos) {
            return pos;
        }
        var firstFocusableCell = null;
        var dataLengthIncludingAddNew = this.getDataLengthIncludingAddNew();
        while ((row = row + 1) < dataLengthIncludingAddNew) {
            firstFocusableCell = this.findFirstFocusableCell(row);
            if (firstFocusableCell !== null) {
                return {
                    row: row,
                    cell: firstFocusableCell,
                    posX: firstFocusableCell
                };
            }
        }
        return null;
    }
    gotoPrev(row, cell, posX) {
        if (row == null && cell == null) {
            row = this.getDataLengthIncludingAddNew() - 1;
            cell = posX = this.columns.length - 1;
            if (this.canCellBeActive(row, cell)) {
                return {
                    row: row,
                    cell: cell,
                    posX: cell
                };
            }
        }
        var pos;
        var lastSelectableCell;
        while (!pos) {
            pos = this.gotoLeft(row, cell, posX);
            if (pos) {
                break;
            }
            row--;
            if (row < 0) {
                return null;
            }
            cell = 0;
            lastSelectableCell = this.findLastFocusableCell(row);
            if (lastSelectableCell !== null) {
                pos = {
                    row: row,
                    cell: lastSelectableCell,
                    posX: lastSelectableCell
                };
            }
        }
        return pos;
    }
    navigateRight() {
        return this.navigate('right');
    }
    navigateLeft() {
        return this.navigate('left');
    }
    navigateDown() {
        return this.navigate('down');
    }
    navigateUp() {
        return this.navigate('up');
    }
    navigateNext() {
        return this.navigate('next');
    }
    navigatePrev() {
        return this.navigate('prev');
    }
    navigate(dir) {
        if (!this.options.enableCellNavigation) {
            return false;
        }
        if (!this.activeCellNode && dir !== 'prev' && dir !== 'next') {
            return false;
        }
        if (!this.getEditorLock().commitCurrentEdit()) {
            return true;
        }
        this.focus();
        var tabbingDirections = {
            up: -1,
            down: 1,
            left: -1,
            right: 1,
            prev: -1,
            next: 1
        };
        this.tabbingDirection = tabbingDirections[dir];
        var stepFunctions = {
            up: this.gotoUp.bind(this),
            down: this.gotoDown.bind(this),
            left: this.gotoLeft.bind(this),
            right: this.gotoRight.bind(this),
            prev: this.gotoPrev.bind(this),
            next: this.gotoNext.bind(this)
        };
        var stepFn = stepFunctions[dir];
        var pos = stepFn(this.activeRow, this.activeCell, this.activePosX);
        if (pos) {
            var isAddNewRow = (pos.row === this.getDataLength());
            this.scrollCellIntoView(pos.row, pos.cell, (this.options.skipPaging ? false : !isAddNewRow));
            this.setActiveCellInternal(this.getCellNode(pos.row, pos.cell));
            this.activePosX = pos.posX;
            return true;
        }
        else {
            this.setActiveCellInternal(this.getCellNode(this.activeRow, this.activeCell));
            return false;
        }
    }
    getCellNode(rowIndex, cell) {
        if (rowIndex === null || cell === null) {
            return null;
        }
        if (this.rowsCache[rowIndex]) {
            this.ensureCellNodesInRowsCache(rowIndex);
            return this.rowsCache[rowIndex].cellNodesByColumnIdx[cell];
        }
        return null;
    }
    setActiveCell(rowIndex, columnIndex, settings = {}) {
        if (!this.initialized) {
            return;
        }
        settings = $.extend({ scrollIntoView: true }, settings);
        if (rowIndex > this.getDataLength() || rowIndex < 0 || columnIndex >= this.columns.length || columnIndex < 0) {
            return;
        }
        if (!this.options.enableCellNavigation) {
            return;
        }
        if (settings.scrollIntoView)
            this.scrollCellIntoView(rowIndex, columnIndex, false);
        this.setActiveCellInternal(this.getCellNode(rowIndex, columnIndex), false);
    }
    canCellBeActive(rowIndex, columnIndex) {
        if (!this.options.enableCellNavigation || rowIndex >= this.getDataLengthIncludingAddNew() ||
            rowIndex < 0 || columnIndex >= this.columns.length || columnIndex < 0) {
            return false;
        }
        var rowMetadata = this.data.getItemMetadata && this.data.getItemMetadata(rowIndex);
        var columnMetadata = rowMetadata && rowMetadata.columns && (rowMetadata.columns[this.columns[columnIndex].id] || rowMetadata.columns[columnIndex]);
        if (columnMetadata && typeof columnMetadata.focusable === 'boolean') {
            return columnMetadata.focusable;
        }
        if (rowMetadata && typeof rowMetadata.focusable === 'boolean') {
            return rowMetadata.focusable;
        }
        return Boolean(this.columns[columnIndex].focusable && this.isColumnVisible(this.columns[columnIndex]));
    }
    // Given an array of column indexes, return true if the lowest index and the highest index span across the column that is marked as pinned.
    crossesPinnedArea(indices) {
        if (this.options.pinnedColumn == null || !indices || indices.length < 2) {
            return false; // can't cross a boundary if there are 0 or 1 indices, or if columns aren't pinned
        }
        const max = Math.max.apply(null, indices);
        const min = Math.min.apply(null, indices);
        if (min <= this.options.pinnedColumn && max > this.options.pinnedColumn) {
            return true;
        }
        else {
            return false;
        }
    }
    canCellBeSelected(rowIndex, columnIndex) {
        if (rowIndex >= this.getDataLength() || rowIndex < 0 || columnIndex >= this.columns.length || columnIndex < 0) {
            return false;
        }
        var rowMetadata = this.data.getItemMetadata && this.data.getItemMetadata(rowIndex);
        var columnMetadata = rowMetadata && rowMetadata.columns && (rowMetadata.columns[this.columns[columnIndex].id] || rowMetadata.columns[columnIndex]);
        if (columnMetadata && typeof columnMetadata.selectable === 'boolean') {
            return columnMetadata.selectable;
        }
        if (rowMetadata && typeof rowMetadata.selectable === 'boolean') {
            return rowMetadata.selectable;
        }
        return Boolean(this.columns[columnIndex].selectable);
    }
    gotoCell(rowIndex, columnIndex, forceEdit) {
        if (!this.initialized) {
            return;
        }
        if (!this.canCellBeActive(rowIndex, columnIndex)) {
            return;
        }
        if (!this.getEditorLock().commitCurrentEdit()) {
            return;
        }
        this.scrollCellIntoView(rowIndex, columnIndex, false);
        var newCell = this.getCellNode(rowIndex, columnIndex);
        // if selecting the 'add new' rowIndex, start editing right away
        this.setActiveCellInternal(newCell, forceEdit || (rowIndex === this.getDataLength()) || this.options.autoEdit);
        // if no editor was created, set the focus back on the grid
        if (!this.currentEditor) {
            this.focus();
        }
    }
    //////////////////////////////////////////////////////////////////////////////////////////////
    // IEditor implementation for the editor lock
    commitCurrentEdit() {
        var item = this.getDataItem(this.activeRow);
        var column = this.columns[this.activeCell];
        if (this.currentEditor) {
            if (this.currentEditor.isValueChanged()) {
                var validationResults = this.currentEditor.validate();
                if (validationResults.valid) {
                    if (this.activeRow < this.getDataLength()) {
                        var editCommand = {
                            row: this.activeRow,
                            cell: this.activeCell,
                            editor: this.currentEditor,
                            serializedValue: this.currentEditor.serializeValue(),
                            prevSerializedValue: this.serializedEditorValue,
                            execute() {
                                this.editor.applyValue(item, this.serializedValue);
                                this.updateRow(this.row);
                                this.trigger(this.onCellChange, {
                                    row: this.activeRow,
                                    cell: this.activeCell,
                                    item: item
                                });
                            },
                            undo() {
                                this.editor.applyValue(item, this.prevSerializedValue);
                                this.updateRow(this.row);
                                this.trigger(this.onCellChange, {
                                    row: this.activeRow,
                                    cell: this.activeCell,
                                    item: item
                                });
                            }
                        };
                        if (this.options.editCommandHandler) {
                            this.makeActiveCellNormal();
                            this.options.editCommandHandler(item, column, editCommand);
                        }
                        else {
                            editCommand.execute();
                            this.makeActiveCellNormal();
                        }
                    }
                    else {
                        var newItem = {};
                        this.currentEditor.applyValue(newItem, this.currentEditor.serializeValue());
                        this.makeActiveCellNormal();
                        this.trigger(this.onAddNewRow, { item: newItem, column: column });
                    }
                    // check whether the lock has been re-acquired by event handlers
                    return !this.getEditorLock().isActive();
                }
                else {
                    // Re-add the CSS class to trigger transitions, if any.
                    if (this.activeCellNode) {
                        $(this.activeCellNode).removeClass('invalid');
                        $(this.activeCellNode).width(); // force layout
                        $(this.activeCellNode).addClass('invalid');
                    }
                    this.trigger(this.onValidationError, {
                        editor: this.currentEditor,
                        cellNode: this.activeCellNode,
                        validationResults: validationResults,
                        row: this.activeRow,
                        cell: this.activeCell,
                        column: column
                    });
                    this.currentEditor.focus();
                    return false;
                }
            }
            this.makeActiveCellNormal();
        }
        return true;
    }
    cancelCurrentEdit() {
        this.makeActiveCellNormal();
        return true;
    }
    rowsToRanges(rows) {
        var ranges = [];
        var lastCell = this.columns.length - 1;
        for (var i = 0; i < rows.length; i++) {
            ranges.push(new Range(rows[i], 0, rows[i], lastCell));
        }
        return ranges;
    }
    getSelectedRows() {
        if (!this.selectionModel) {
            throw 'Selection model is not set';
        }
        return this.selectedRows;
    }
    setSelectedRows(rows) {
        if (!this.selectionModel) {
            throw 'Selection model is not set';
        }
        this.selectionModel.setSelectedRanges(this.rowsToRanges(rows));
    }
    isGroupNode(row, cell) {
        const node = this.getCellNode(row, cell);
        if (!node)
            return false;
        return $(node)
            .parents('.slick-group')
            .length > 0;
    }
    getHiddenCssClass(index) {
        var column = this.columns[index];
        if (!column.isHidden)
            return null;
        if (column.showHidden)
            return 'show-hidden';
        return 'isHidden';
    }
    getColumnVisibleWidth(column) {
        return this.isColumnVisible(column) ? column.width : 0;
    }
    refreshColumns() {
        this.setColumns(this.columns, { forceUpdate: true, skipResizeCanvas: false });
    }
    hideColumn(column) {
        column.isHidden = true;
        delete (column.showHidden);
    }
    unhideColumn(column) {
        delete (column.isHidden);
        delete (column.showHidden);
    }
    iterateColumnsInDirection(column, columnDirection, fn) {
        var startIndex = this.getColumnIndex(column.id) + columnDirection;
        var value;
        if (columnDirection === SlickGrid.COLUMNS_TO_LEFT) {
            for (var i = startIndex; i >= 0; i--) {
                value = fn(this.columns[i], i);
                if (value)
                    return value;
            }
        }
        else if (columnDirection === SlickGrid.COLUMNS_TO_RIGHT) {
            var l = this.columns.length;
            for (let i = startIndex; i < l; i++) {
                value = fn(this.columns[i], i);
                if (value)
                    return value;
            }
        }
        else {
            throw new RangeError('columnDirection must be -1 or 1.');
        }
    }
    showAdjacentHiddenColumns(column, columnDirection) {
        this.iterateColumnsInDirection(column, columnDirection, (column) => {
            if (!column.isHidden)
                return true;
            column.showHidden = true;
        });
    }
    getNextVisibleColumn(column, columnDirection) {
        return this.iterateColumnsInDirection(column, columnDirection, (column) => {
            if (this.isColumnVisible(column))
                return column;
        });
    }
    isColumnHidden(column) {
        return Boolean(column.isHidden);
    }
    isColumnInvisible(column) {
        return Boolean(column.isHidden && !column.showHidden);
    }
    isColumnVisible(column) {
        return Boolean(!column.isHidden || column.showHidden);
    }
    isHiddenColumnVisible(column) {
        return Boolean(column.isHidden && column.showHidden);
    }
    isAnyColumnHidden() {
        return this.columns.some(this.isColumnHidden);
    }
    isAnyColumnInvisible() {
        return this.columns.some((column) => {
            return this.isColumnInvisible(column);
        });
    }
    toggleHiddenColumns() {
        var showHidden = this.isAnyColumnInvisible();
        this.columns.filter(this.isColumnHidden).forEach(function (column) {
            column.showHidden = showHidden;
        });
    }
    getColumnsFromIndices(indices) {
        return indices.map((index) => {
            return this.columns[index];
        });
    }
    withTransaction(fn) {
        this.data.beginUpdate();
        try {
            fn();
        }
        catch (e) {
            console.error('Error caught in SlickGrid transaction', e);
        }
        finally {
            this.data.endUpdate();
            this.invalidateSafe();
        }
    }
}
// constants
SlickGrid.COLUMNS_TO_LEFT = COLUMNS_TO_LEFT;
SlickGrid.COLUMNS_TO_RIGHT = COLUMNS_TO_RIGHT;