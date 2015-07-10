/**
 * Main Class of the tooltip plugin.
 * Initalizes and handles the the Item Instances.
 */

(function (root, factory) {

	'use strict';

	if (typeof define === 'function' && define.amd) {
		define([
			'jquery',
			'./Constants',
			'./Item',
			'./MutationObserver'
		], factory);
	} else if (typeof exports === 'object') {
		module.exports = factory(
			require('jquery'),
			require('./Constants'),
			require('./Item'),
			require('./MutationObserver')
		);
	} else {
		root.ProtipClass = factory(
			root.jQuery,
			root.ProtipConstants,
			root.ProtipItemClass
		);
	}
}(this, function ($, C, ProtipItemClass) {

	'use strict';

	// Lower the interval time, we don't need that much accuracy.
	MutationObserver._period = 100;

	/**
	 * The Protip main class
	 *
	 * @param [Object] settings Overrideable configuration options
	 * @returns {ProtipClass}
	 * @constructor
	 */
	var ProtipClass = function(settings){
		return this._Construct(settings);
	};

// Define the ProtipClass members
	$.extend(true, ProtipClass.prototype, {

		/**
		 * Default configuration options
		 *
		 * @memberOf ProtipClass
		 * @type Object
		 * @private
		 */
		_defaults: {
			/** @type String                Selector for clickable protips */
			selector:                       C.DEFAULT_SELECTOR,
			/** @type String                Namespace of the data attributes */
			namespace:                      C.DEFAULT_NAMESPACE,
			/** @type String                Template of protip element */
			protipTemplate:                 C.TEMPLATE_PROTIP,
			/** @type String                Template of the arrow element */
			arrowTemplate:                  C.TEMPLATE_ARROW,
			/** @type String                Template of protip icon */
			iconTemplate:                   C.TEMPLATE_ICON,
			/** @type Boolean               Should we observ whole document for assertions and removals */
			observer:                       true,
			/** @type Number                Arrow size. Calculated into positions. (px) */
			arrowOffset:                    4
		},

		/**
		 * @memberOf ProtipClass
		 * @param settings
		 * @returns {ProtipClass}
		 * @private
		 */
		_Construct: function(settings){
			/**
			 * Overrided configuration options (extends defaults)
			 *
			 * @type Object
			 */
			this.settings = $.extend({}, this._defaults, settings);

			/**
			 * Object storing the Item Class Instances
			 *
			 * @type {Object.<Number>.<ProtipItemClass>}
			 * @private
			 */
			this._itemInstances = {};

			/**
			 * Object storing the MutationObserver instance
			 *
			 * @type MutationObserver
			 * @private
			 */
			this._observerInstance = undefined;

			/**
			 * Array storing the the Item Instances which were visible
			 * before window resize.
			 *
			 * @type {Array.<ProtipItemInstance>}
			 * @private
			 */
			this._visibleBeforeResize = [];

			/**
			 * Object storing timeout tasks.
			 *
			 * @type {Object}
			 * @private
			 */
			this._task = {
				delayIn:  undefined,
				delayOut: undefined,
				resize:   undefined
			};

			// Do some initial things
			this._fetchElements();
			this._bind();

			return this;
		},

		/**
		 * Method to destroy a class instance.
		 * Calls each item classes destroy method.
		 * Does unbind.
		 * Makes some local references empty.
		 */
		destroy: function(){
			this._unbind();

			$.each(this._itemInstances, $.proxy(function(key){
				this.destroyItemInstance(key);
			}, this));

			this._itemInstances    = undefined;
			this.settings          = undefined;
			$._protipClassInstance = undefined;
		},

		/**
		 * Return a namspaced version of a data propery's name.
		 *
		 * @param string {string} The input string. eq: action
		 * @returns {string} eg: ptAction
		 */
		namespaced: function(string){
			return this.settings.namespace + string.charAt(0).toUpperCase() + string.slice(1);
		},

		/**
		 * Deletes the locally stored instance
		 * and calls the item's destroy method.
		 *
		 * @param key {string} Item instance identifier.
		 */
		destroyItemInstance: function(key){
			this._itemInstances[key].destroy();
			delete this._itemInstances[key];
		},

		/**
		 * Creates a ProtipItemClass instance
		 * and stores locally the instance.
		 *
		 * @param el {jQuery} Source element which has the tooltip.
		 * @returns {ProtipItemClass}
		 */
		createItemInstance: function(el){
			var id = this._generateId();
			this._itemInstances[id] = new ProtipItemClass(id, el, this);
			return this._itemInstances[id];
		},

		/**
		 * Fully reloads an ItemClass instance.
		 * Destroy + Create
		 *
		 * @param el {jQuery} Element we reload on.
		 */
		reloadItemInstance: function(el){
			var key = el.data(this.namespaced(C.PROP_IDENTIFIER));
			this.destroyItemInstance(key);
			this.createItemInstance(el);
		},

		/**
		 * Getter for retriving an ItemClass instance based on the passwed element.
		 * In case this element doesn't have ItemClass yet this method will also create a new one.
		 *
		 * @param el {jQuery} The element we're searching it's instance for.
		 * @returns {ProtipItemClass}
		 */
		getItemInstance: function(el){
			var identifier = el.data(this.namespaced(C.PROP_IDENTIFIER));
			return this._isInited(el) ? this._itemInstances[identifier] : this.createItemInstance(el);
		},

		/**
		 * Fetches DOM elements with the specified protip selector
		 * and creates an ItemClass instance for them.
		 *
		 * @private
		 */
		_fetchElements: function(){
			$(this.settings.selector).each($.proxy(function(index, el){
				this.createItemInstance($(el));
			}, this));
		},

		/**
		 * Generates a unique ID to be used as identfier.
		 *
		 * @returns {string}
		 * @private
		 */
		_generateId: function(){
			return new Date().valueOf() + Math.floor(Math.random() * 10000).toString();
		},

		/**
		 * Tells us if the passed element already has an ItemClass instance or not.
		 *
		 * @param el
		 * @returns {boolean}
		 * @private
		 */
		_isInited: function(el){
			return !!el.data(this.namespaced(C.PROP_INITED));
		},

		/**
		 * Method to hide all protips.
		 *
		 * @private
		 */
		_hideAll: function(){
			$.each(this._itemInstances, $.proxy(function(index, item){
				item.isVisible() && this._visibleBeforeResize.push(item) && item.hide();
			}, this));
		},

		/**
		 * Method to show all protips.
		 *
		 * @private
		 */
		_showAll: function(){
			this._visibleBeforeResize.forEach(function(item){
				item.show();
			});
		},

		/**
		 * Common event handler to every action.
		 *
		 * @param ev {Event} Event object.
		 * @private
		 */
		_onAction: function(ev){
			ev.type === C.EVENT_CLICK && ev.preventDefault();

			var el = $(ev.currentTarget);
			this.getItemInstance(el).actionHandler(ev.type);
		},

		/**
		 * OnResize event callback handler.
		 *
		 * @private
		 */
		_onResize: function(){
			!this._task.resize && this._hideAll();
			this._task.resize && clearTimeout(this._task.resize);
			this._task.resize = setTimeout(function () {
				this._showAll();
				this._task.resize = undefined;
				this._visibleBeforeResize = [];
			}.bind(this), 100);
		},

		/**
		 * OnBodyClick event callback handler.
		 *
		 * @param ev {Event} Event object.
		 * @private
		 */
		_onBodyClick: function(ev){
			var el = $(ev.target);
			var parent = el.parents('.' + C.SELECTOR_PREFIX + C.SELECTOR_CONTAINER);
			var selector = C.SELECTOR_PREFIX + C.SELECTOR_CONTAINER;
			var container = el.hasClass(selector) ? el : parent.size() ? parent : false;

			var instance = this._isInited(el) ? this.getItemInstance(el) : false;

			if (!instance || (instance.data.trigger !== C.TRIGGER_CLICK)) {
				$.each(this._itemInstances, function (index, item) {
					item.isVisible()
					&& item.data.trigger === C.TRIGGER_CLICK
					&& (!container || item.el.protip.get(0) !== container.get(0))
					&& item.hide();
				});
			}
		},

		/**
		 *  Click event callback handler for closing elements.
		 *
		 * @param ev {Event} Event object.
		 * @private
		 */
		_onCloseClick: function(ev){
			var identifier = $(ev.currentTarget).parents('.' + C.SELECTOR_PREFIX + C.SELECTOR_CONTAINER).data(this.namespaced(C.PROP_IDENTIFIER));
			this._itemInstances[identifier] && this._itemInstances[identifier].hide();
		},

		/**
		 * Handles add/removed nodes.
		 *
		 * @param mutations {<Array>MutationRecord}
		 * @private
		 */
		_mutationObserverCallback: function(mutations) {
			mutations.forEach(function(mutation) {
				for (var i = 0; i < mutation.addedNodes.length; i++) {
					var els = $(mutation.addedNodes[i].parentNode).find(this.settings.selector);
					els.each(function(index, el){
						el = $(el);
						if (el.data(this.namespaced(C.PROP_ACTION)) === C.TRIGGER_STICKY){
							this.getItemInstance(el).show();
						}
					}.bind(this));
				}

				for (var i = 0; i < mutation.removedNodes.length; i++) {
					var el = $(mutation.removedNodes[i]);
					el.find(this.settings.selector).each(function(index, item){
						this.getItemInstance($(item)).destroy();
					}.bind(this));

					if (el.hasClass(this.settings.selector.replace('.', ''))) {
						this.getItemInstance(el).destroy();
					}
				}
			}.bind(this));
		},

		/**
		 * Binds up all events.
		 *
		 * @private
		 */
		_bind: function(){
			var body = $(C.SELECTOR_BODY);

			body.on(C.EVENT_CLICK, $.proxy(this._onBodyClick, this))
				.on(C.EVENT_MOUSEOVER, this.settings.selector, $.proxy(this._onAction, this))
				.on(C.EVENT_MOUSEOUT, this.settings.selector, $.proxy(this._onAction, this))
				.on(C.EVENT_CLICK, this.settings.selector, $.proxy(this._onAction, this))
				.on(C.EVENT_CLICK, C.SELECTOR_CLOSE, $.proxy(this._onCloseClick, this));

			$(window).on(C.EVENT_RESIZE, $.proxy(this._onResize, this));


			if (this.settings.observer) {
				this._observerInstance = new MutationObserver(this._mutationObserverCallback.bind(this));

				this._observerInstance.observe(body.get(0), {
					attributes: false,
					childList: true,
					characterData: false,
					subtree: true
				});
			}
		},

		/**
		 * Unbinds all events.
		 *
		 * @private
		 */
		_unbind: function(){
			$(C.SELECTOR_BODY)
				.off(C.EVENT_CLICK, $.proxy(this._onBodyClick, this))
				.off(C.EVENT_MOUSEOVER, this.settings.selector, $.proxy(this._onAction, this))
				.off(C.EVENT_MOUSEOUT, this.settings.selector, $.proxy(this._onAction, this))
				.off(C.EVENT_CLICK, this.settings.selector, $.proxy(this._onAction, this))
				.off(C.EVENT_CLICK, C.SELECTOR_CLOSE, $.proxy(this._onCloseClick, this));

			$(window).off(C.EVENT_RESIZE, $.proxy(this._onResize, this));

			if (this.settings.observer) {
				this._observerInstance.disconnect();
			}
		}
	});

	return ProtipClass;

}));
