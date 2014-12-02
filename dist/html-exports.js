// # HTMLExports

;(function(scope) {
  'use strict'

  // TODO(nevir)
  scope.depsFor = function depsFor(document) {
    return []
  }

  // TODO(nevir)
  scope.exportsFor = function exportsFor(document) {
    var exports = {}
    var exportedNodes = document.querySelectorAll('[id][export]')
    for (var i = 0, node; node = exportedNodes[i]; i++) {
      exports[node.getAttribute('id')] = node
    }

    return exports
  }

})(this.HTMLExports = this.HTMLExports || {})

// # HTMLExports.DocumentLoader

;(function(scope) {
  'use strict'

  scope.DocumentLoader = DocumentLoader

  // TODO(nevir)
  function DocumentLoader(options, parentHooks) {
    Reflect.Loader.call(this, options || {})
    this._parentHooks = parentHooks || Reflect.Loader.prototype
  }
  DocumentLoader.prototype = Object.create(Reflect.Loader.prototype)

  // ### `DocumentLoader.mixin`

  // Rather than instantiating and managing a `DocumentLoader` directly, you
  // will frequently want to mix `DocumentLoader`'s behavior into an existing
  // instance of `Reflect.Loader`.
  //
  var MIXIN_HOOKS = ['instantiate']
  //
  // The hooks defined on the loader instance will be overridden, and chained
  // when operating on a resource that `DocumentLoader` doesn't understand.
  //
  // For example, to override the default system loader:
  //
  // ```js
  // HTMLExports.DocumentLoader.mixin(System)
  // ```
  //
  DocumentLoader.mixin = function mixin(loader) {
    var parentHooks = {}
    var instance = new this({}, parentHooks)
    MIXIN_HOOKS.forEach(function(hook) {
      parentHooks[hook] = loader[hook].bind(loader)
      loader[hook] = instance[hook].bind(instance)
    })

    // If the author is using es6-module-loader, make sure to set up `.html`
    // URLs so that they are not overridden.
    if (loader.paths) {
      loader.paths['*.html'] = '*.html'
    }

    // And if the author is using System.js, we have to shim the original
    // System too...
    if (loader.originalSystem) {
      DocumentLoader.mixin(loader.originalSystem)
    }
  }

  // ## Loader Hooks

  // ### `DocumentLoader#instantiate`

  // TODO(nevir)
  DocumentLoader.prototype.instantiate = function instantiate(load) {
    if (!this._isHtml(load)) {
      return this._parentHooks.instantiate.apply(this, arguments)
    }

    var doc = this._newDocument(load)
    return {
      deps: scope.depsFor(doc),
      execute: function execute() {
        return this.newModule(scope.exportsFor(doc))
      }.bind(this),
    }
  }

  // Internal Implementation

  DocumentLoader.prototype._isHtml = function _isHtml(load) {
    // A `.html` extension is a good hint.
    var path = load.address || load.name
    if (path && path.slice(-5) === '.html') {
      return true
    }

    // Otherwise, we check the content for something that looks like HTML:
    if (load.source && load.source.match && load.source.match(/^\s*</)) {
      return true
    }

    return false
  }

  // While I'd prefer to make use of HTML Imports, System.js (rightfully) makes
  // many assumptions about load record's `source` being a string. So, we just
  // consume that.
  //
  // This mostly follows the HTML Imports polyfill:
  // https://github.com/Polymer/HTMLImports/blob/master/src/importer.js#L121-147
  DocumentLoader.prototype._newDocument = function _newDocument(load) {
    var doc = document.implementation.createHTMLDocument('module: ' + load.name)

    // TODO(nevir): do we need to build a base URL from this?
    var base = doc.createElement('base')
    base.setAttribute('href', load.address)
    if (!doc.baseURI) {
      doc.baseURI = load.address
    }
    doc.head.appendChild(base)

    // Imports/module enforce UTF-8
    var meta = doc.createElement('meta')
    meta.setAttribute('charset', 'utf-8')
    doc.head.appendChild(meta)

    // Actually import the resource.
    doc.body.innerHTML = load.source
    // Template polyfill support.
    if (window.HTMLTemplateElement && HTMLTemplateElement.bootstrap) {
      HTMLTemplateElement.bootstrap(doc)
    }

    return doc
  }

})(this.HTMLExports = this.HTMLExports || {})

;(function(scope) {
  'use strict'

  scope.DocumentLoader.mixin(System)

})(this.HTMLExports = this.HTMLExports || {})
