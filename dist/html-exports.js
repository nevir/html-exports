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

    Object.keys(scope.LoaderHooks).forEach(function(hookName) {

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

// # Scoped Scripts

;(function(scope) {
  'use strict'

  // ### `HTMLExports.runScopedScripts`

  // Processes any scoped scripts, and executes them after all declared imports
  // within a document have loaded.
  scope.runScopedScripts = function runScopedScripts(document) {
    return new Promise(function(resolve, reject) {
      var deps     = scope.depsFor(document)
      var options  = {name: document.baseURI || document.location.pathname}
      var promises = deps.map(function(dep) {
        return System.import(dep.name, options)
      })
      Promise.all(promises).then(function(allExports) {
        var exportMap = _flattenExports(allExports, deps)
        document.dispatchEvent(new CustomEvent('DeclaredImportsLoaded', {detail: {
          exportMap:    exportMap,
          dependencies: deps,
        }}))

        // A scoped script can be declared as:
        //
        // ```html
        // <script type="scoped">...</script>
        // ```
        var scripts   = document.querySelectorAll('script[type="scoped"]')
        for (var i = 0; i < scripts.length; i++) {
          _executeScript(exportMap, scripts[i])
        }

        resolve()
      })
    })
  }

  // ## Internal Implementation

  // After we have loaded all the declared imports for a particular document,
  // we need to flatten the imported values into a set of (aliased) keys and
  // their values.
  function _flattenExports(allExports, deps) {
    var exportMap = {}
    var masked    = []

    for (var i = 0, dep; dep = deps[i]; i++) {
      Object.keys(dep.aliases).forEach(function(source) {
        var target = dep.aliases[source]
        // It is entirely possible for multiple import declarations to attempt
        // to write to the same key. We'll mark those, so that we can warn about
        // them at the end of te flattening process.
        if (target in exportMap) { masked.push(target) }
        // Similarly, it is possible for a declared import to request a value
        // that wasn't actually imported. We want to warn about that, too.
        if (!(source in allExports[i])) {
          console.warn('"' + source + '" was requested, but not exported from "' + dep.name + '".', dep.source)
        }
        exportMap[target] = allExports[i][source]
      })
    }

    if (masked.length) {
      masked.forEach(_warnMaskedImports.bind(null, allExports, deps))
    }

    return exportMap
  }

  // It's important that we give authors as much info as possible to diagnose
  // any problems with their source. So, we spend a bit of computational effort
  // whenever imports are masked to let the author know where the conflicts
  // originate.
  function _warnMaskedImports(allExports, deps, name) {
    var conflicting = deps.filter(function(dep) {
      return dep.aliases
    }).map(function(dep) {
      return dep.source
    })
    console.warn('Multiple values named "' + name + '" were requested by imports:', conflicting)
  }

  // After all the imported values are flattened and validated, it is time to
  // execute the scoped scripts within the document.
  function _executeScript(exportMap, script) {
    var keys   = Object.keys(exportMap)
    var values = keys.map(function(k) { return exportMap[k] })
    // Scoped scripts are evaluated in strict mode. It's the future!
    var source = '"use strict";\n' + script.textContent

    // Currently, each script gets its own closure that includes any scoped
    // values imported by the document's declare imports. This also acts as a
    // convenient sandbox for scripts.
    try {
      var func = Function.apply(null, keys.concat([source]))
      func.apply(null, values)
    } catch (error) {
      console.error(
        'Failure executing scoped script:', error.message, '\n',
        'Imported values:', exportMap, '\n',
        'Script body:', source, '\n')
      throw error
    }
  }

})(this.HTMLExports = this.HTMLExports || {})

// # Global Behavior
;(function(scope) {
  'use strict'

  // When HTML Exports is used normally, it is mixed into the `System` loader.
  scope.DocumentLoader.mixin(System)

  //
  document.addEventListener('DOMContentLoaded', function() {
    scope.runScopedScripts(document)
  })

})(this.HTMLExports = this.HTMLExports || {})
