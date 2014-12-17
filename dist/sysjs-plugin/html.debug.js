// # LoaderHooks

// `HTMLExports.LoaderHooks` is a mixable map of loader hooks that provide the
// underlying behavior for loading HTML documents as modules.
//
// These hooks are designed to be consumed via various interfaces:
//
//  * They are indirectly mixed into [`DocumentLoader`](documentloader.html).
//
//  * They can be mixed into any existing loader via [`DocumentLoader.mixin`](documentloader.html#-documentloader-mixin-).
//
//  * They can be used via a [SystemJS plugin](sysjs-plugin.html).
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

      link.addEventListener('load', function() {
        // One problem with the module loader spec is that the `instantiate`
        // step does not support asynchronous execution. We want that, so that
        // we can ensure that any async-executed scripts in the document defer
        // its load (also so we can extract exports from them).
        //
        // Thus, we perform any async logic during load to emulate that (if
        // scoped scripts are enabled).
        var runScripts = scope.runScopedScripts && scope.runScopedScripts(link.import) || Promise.resolve()
        runScripts.then(function() {
          // Another difficulty of the module loader spec is that it rightfully
          // assumes that all sources are a `String`. Because we completely skip
          // over raw source, we need to be a little more crafty by placing the
          // real source in a side channel.
          load.metadata.importedHTMLDocument = link.import
          // And then, to appease the spec/SystemJS, we provide a dummy value for
          // `source`.
          resolve('')
        })
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
      deps: scope.depsFor(doc).map(function(d) { return d.name }),
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
      // Much like ES6's import syntax, you can also choose which exported
      // values to bring into scope, and rename them.
      var aliases = {}
      // The default export can be imported via the `as` attribute:
      //
      // ```html
      // <import src="jQuery" as="$">
      // ```
      if (importNode.hasAttribute('as')) {
        aliases.default = importNode.getAttribute('as')
      }
      // Named exports can be imported via the `values` attribute (space
      // separated).
      //
      // ```html
      // <import src="lodash" values="compact">
      // ```
      if (importNode.hasAttribute('values')) {
        importNode.getAttribute('values').split(/\s+/).forEach(function(key) {
          if (key === '') return
          aliases[key] = key
        })
      }

      // Each dependency returned is an object with:
      return {
        // * `name`: The declared name; you may want to `normalize` it.
        name: importNode.getAttribute('src'),
        // * `aliases`: A map of exported values to the keys they should be
        //              exposed as.
        aliases: aliases,
        // * `source`: Source element, to aid in debugging. Expect a beating if
        //             you leak this!
        source: importNode,
      }
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

// # SystemJS Plugin

// Note that there is an assumption that `HTMLExports.LoaderHooks` exists in the
// scope (which is taken care of by the build process).
var LoaderHooks = this.HTMLExports.LoaderHooks

Object.keys(LoaderHooks).forEach(function(hookName) {
  exports[hookName] = LoaderHooks[hookName]
})

// SystemJS' plugin interface has a slightly different interface for the
// `instantiate` hook. It expects the module to be directly returned:
exports.instantiate = function instantiateHTML() {
  return LoaderHooks.instantiate.apply(this, arguments).execute()
}
