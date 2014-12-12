// # HTMLExports

;(function(scope) {
  'use strict'

  // ### `HTMLExports.depsFor`

  scope.depsFor = function depsFor(source) {
    return []
  }

  // ### `HTMLExports.exportsFor`

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

// # DocumentLoader

// `HTMLExports.DocumentLoader` is a module loader that exposes `.html`
// documents as another valid module type that can be loaded.
//
// This loader attempts to adhere to the module loader spec as best it can.
// However, note that the spec was removed from the ES6 draft spec (with the
// intent to have a separate modules spec).
;(function(scope) {
  'use strict'

  scope.DocumentLoader = DocumentLoader

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
    // URLs so that they are not assumed to be `.html.js`.
    if (loader.paths) {
      loader.paths['*.html'] = '*.html'
    }
  }

  // ## Loader Hooks

  // For the most part, we leverage the behavior of `Reflect.Loader` to handle
  // locating and fetching `.html` resources.
  //
  // While this does dramatically simplify the logic of `DocumentLoader`, it
  // prevents us from using native machinery (i.e. HTML Imports). We can
  // potentially hack around it, but it becomes awkward and brittle:
  //
  //  * The `fetch` hook expects a `String` to be returned, and load records
  //    assume that the `source` property is also a `String`. If we were to
  //    make use of HTML Imports, we get a `Document`, not a `String`.
  //
  //    * Note that this does work with the [es6-module-loader polyfill](https://github.com/ModuleLoader/es6-module-loader),
  //      but breaks [System.js](https://github.com/systemjs/systemjs) (see the
  //      change where we [convert away from using imports](https://github.com/nevir/html-exports/commit/48a61c762aebb4df52f858746ad9df64cd58de2d)).
  //
  //  * Presumably, the only thing we gain from using (native) HTML Imports to
  //    fetch documents is prefetching and parallel parsing.
  //

  // ### `DocumentLoader#instantiate`

  // If the load record represents a HTML document, load it as a module.
  //
  // Declared (module) dependencies are extracted from the document's source,
  // according to [`HTMLExports.depsFor`](index.html#-htmlexports-depsfor-).
  // Similarly, exports are determined via [`HTMLExports.exportsFor`](index.html#-htmlexports-exportsfor-).
  //
  // For expected behavior of the hook, see sections 15.2.4.5.2 and 15.2.4.5.3
  // of the [Aug 24, 2014 ES6 spec draft](http://wiki.ecmascript.org/doku.php?id=harmony:specification_drafts).
  DocumentLoader.prototype.instantiate = function instantiate(load) {
    if (!this._isHtml(load)) {
      return this._parentHooks.instantiate.apply(this, arguments)
    }

    return {
      deps: scope.depsFor(load.source),
      execute: function executeHTMLDocument() {
        //- TODO(nevir): Ideally we'd be constructing/loading the doc async. And
        //- we probably want to wait for the load event, too.
        //-
        //- See https://github.com/ModuleLoader/es6-module-loader/issues/263
        var doc = this._newDocument(load)
        return this.newModule(scope.exportsFor(doc))
      }.bind(this),
    }
  }

  // ## Internal Implementation

  // A load record can be determined to represent a HTML document via various
  // hints and bits of metadata:
  DocumentLoader.prototype._isHtml = function _isHtml(load) {
    // * An extension of `.html` is assumed to represent a HTML document.
    var path = load.address || load.name
    if (path && path.slice(-5) === '.html') {
      return true
    }

    // * `Content-Type: text/html` is another hint, but not supported for now.
    //
    //- TODO(nevir): Coordinate with es6-module-loader/System.js to propagate
    //- response headers through as load record metadata.

    // * A document that begins with `<` is similarly assumed to be HTML. This
    //   helps to cover cases where one's server is misconfigured.
    //
    //- Note the stupid basic UTF BOM detection.
    var LOOKS_LIKE_HTML = /^([\x00\xBB\xBF\xEF\xFF\xFE]{2,4})?\s*</
    if (load.source && LOOKS_LIKE_HTML.test(load.source)) {
      return true
    }

    return false
  }

  // Because we cannot rely on HTML imports (native or polyfill) to construct
  // the `Document` for us, it is left to us.
  //
  // This mostly follows the [HTML Imports polyfill](https://github.com/Polymer/HTMLImports/blob/master/src/importer.js#L121-147).
  DocumentLoader.prototype._newDocument = function _newDocument(load) {
    var doc = document.implementation.createHTMLDocument('module: ' + load.name)

    // The document is given a base URL via the `base` element...
    var base = doc.createElement('base')
    base.setAttribute('href', load.address)
    // ... as well as the `baseURI` property (for IE support).
    if (!doc.baseURI) {
      doc.baseURI = load.address
    }
    doc.head.appendChild(base)

    // Additionally, we enforce that HTML modules are encoded as `UTF-8`. HTML
    // Imports does this, so we assume that it is safe to carry over to modules.
    var meta = doc.createElement('meta')
    meta.setAttribute('charset', 'utf-8')
    doc.head.appendChild(meta)

    doc.body.innerHTML = load.source

    // Unfortunately, there is a little bit of work to support the polyfill for
    // `<template>` elements.
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
