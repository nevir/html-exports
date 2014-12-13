// # LoaderHooks

// `HTMLExports.LoaderHooks` is a mixable map of loader hooks that provide the
// underlying behavior for loading HTML documents as modules.
//
// These hooks are designed to be consumed via various interfaces:
//
//  * They can be used directly as a [SystemJS plugin](https://github.com/systemjs/systemjs/wiki/Creating-a-Plugin).
//
//  * They are indirectly mixed into [`DocumentLoader`](documentloader.html).
//
//  * They can be mixed into any existing loader via [`DocumentLoader.mixin`](documentloader.html#-documentloader-mixin-).
//
;(function(scope) {
  'use strict'

  var LoaderHooks = {}
  scope.LoaderHooks = LoaderHooks

  // ## `LoaderHooks.fetch`

  // Documents are fetched via a dynamic HTML import. This ensures that the
  // document's linked resources (stylesheets, scripts, etc) are also properly
  // loaded.
  //
  // The alternative would be for us to fetch document source and construct/load
  // HTML documents ourselves. This becomes rather complex, and would end up
  // duplicating much of the logic expressed by the HTML Imports polyfill.
  LoaderHooks.fetch = function fetchHTML(load) {
    console.debug('HTMLExports.LoaderHooks.fetch(', load, ')')

    return new Promise(function(resolve, reject) {
      var link = _newDynamicImport(load.address)

      link.addEventListener('error', function() {
        reject(new Error('Unknown failure when fetching URL: ' + load.address))
      })

      // A downside of this approach is that the module loader asserts that
      // module source is a string. Not to mention, userland loaders such as
      // SystemJS tend to assume that the source is JavaScript.
      link.addEventListener('load', function() {
        // To protect ourselves, and adhere to the spec as best we can, the
        // real source is placed in the load record's `metadata` as a side
        // channel.
        load.metadata.importedHTMLDocument = link.import
        // And then, to appease the spec/SystemJS, we provide a dummy value for
        // `source`.
        resolve('')
      })
    })
  }

  // ## `LoaderHooks.instantiate`

  // Once we have a document fetched via HTML imports, we can extract the
  // its dependencies and exported values.
  //
  // However, it is worth noting that we gain the same document semantics as
  // HTML imports: stylesheets are merged into the root document, scripts
  // evaluate globally, etc. Good for simplifying code, not great for scoping.
  //
  // Furthermore, imports are not considered loaded until all of their linked
  // dependencies (stylesheets, scripts, etc) have also loaded. This makes
  // prefetching declared module dependencies difficult/impossible.
  LoaderHooks.instantiate = function instantiateHTML(load) {
    console.debug('HTMLExports.LoaderHooks.instantiate(', load, ')')
    var doc = load.metadata.importedHTMLDocument
    if (!doc) {
      throw new Error('HTMLExports bug: Expected fetched Document in metadata')
    }

    return {
      deps: scope.depsFor(doc),
      execute: function executeHTML() {
        return this.newModule(scope.exportsFor(doc))
      }.bind(this),
    }
  }

  // ## Document Processing

  // ### `HTMLExports.depsFor`

  // HTML modules can declare dependencies on any other modules via the `import`
  // element:
  //
  // ```html
  // <import src="some-module">
  // ```
  scope.depsFor = function depsFor(document) {
    var declaredDependencies = document.querySelectorAll('import[src]')
    return Array.prototype.map.call(declaredDependencies, function(importNode) {
      return importNode.getAttribute('src')
    })
  }

  // ### `HTMLExports.exportsFor`

  // HTML modules can export elements that are tagged with `export`.
  scope.exportsFor = function exportsFor(document) {
    var exports = {}
    // They can either be named elements (via `id`), such as:
    //
    // ```html
    // <div export id="foo">...</div>
    // ```
    var exportedNodes = document.querySelectorAll('[export][id]')
    for (var i = 0, node; node = exportedNodes[i]; i++) {
      exports[node.getAttribute('id')] = node
    }

    // Or they can be the default export when tagged with `default`:
    //
    // ```html
    // <div export default>...</div>
    // ```
    var defaultNodes = document.querySelectorAll('[export][default]')
    if (defaultNodes.length > 1) {
      throw new Error('Only one default export is allowed per document')
    } else if (defaultNodes.length === 1) {
      exports.default = defaultNodes[0]
    // Otherwise, the default export will be the document.
    } else {
      exports.default = document
    }

    return exports
  }

  // ## Internal Implementation

  function _newDynamicImport(address) {
    var link = document.createElement('link')
    link.setAttribute('rel', 'import')
    link.setAttribute('href', address)
    link.setAttribute('module', '')  // Annotate the link for debugability.

    document.head.appendChild(link)

    return link
  }

})(this.HTMLExports = this.HTMLExports || {})

// # DocumentLoader

;(function(scope) {
  'use strict'

  scope.DocumentLoader = DocumentLoader

  // `HTMLExports.DocumentLoader` is a module loader that loads any modules with
  // a `.html` extension as a HTML module. See [`HTMLExports.LoaderHooks`](loaderhooks.html)
  // for the underlying behavior.
  function DocumentLoader(options) {
    Reflect.Loader.call(this, options || {})
  }
  DocumentLoader.prototype = Object.create(Reflect.Loader.prototype)

  // ### `DocumentLoader.mixin`

  // Rather than instantiating and managing a `DocumentLoader` directly, you
  // will frequently want to mix `DocumentLoader`'s behavior into an existing
  // loader.
  //
  // For example, to override the default system loader:
  //
  // ```js
  // HTMLExports.DocumentLoader.mixin(System)
  // ```
  //
  DocumentLoader.mixin = function mixin(loader) {
    console.debug('DocumentLoader.mixin(', loader, ')')

    Object.keys(scope.LoaderHooks).forEach(function(hookName) {
      console.assert(hookName !== 'normalize', 'only supports hooks that accept a load record')

      var htmlHook   = scope.LoaderHooks[hookName]
      var parentHook = loader[hookName]
      loader[hookName] = function(load) {
        return (_isHtml(load) ? htmlHook : parentHook).apply(this, arguments)
      }
    })

    // If the author is using es6-module-loader or SystemJS, an entry is added
    // to their `paths` property so that `.html` addresses are not resolved as
    // `.html.js`.
    if (loader.paths) {
      loader.paths['*.html'] = '*.html'
    }
  }

  DocumentLoader.mixin(DocumentLoader.prototype)

  // ## Internal Implementation

  // Any module with an extension of `.html` is assumed to represent a HTML
  // document.
  //
  // We cannot perform any smarter heuristics (such as checking content type),
  // as this check is performed before the `fetch` step completes.
  function _isHtml(load) {
    var path = load.address || load.name
    return path && path.slice(-5) === '.html'
  }

})(this.HTMLExports = this.HTMLExports || {})

// # Global Behavior
;(function(scope) {
  'use strict'

  // When HTML Exports is used normally, it is mixed into the `System` loader.
  scope.DocumentLoader.mixin(System)

})(this.HTMLExports = this.HTMLExports || {})
