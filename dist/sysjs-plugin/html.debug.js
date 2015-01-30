// # Configuration

// As this loader extension is a bit of an experiment, there are a few knobs you
// can turn to try different ways of loading HTML as modules.

;(function(scope) {
  'use strict'

  scope.config = {
    // Whether values exported by a HTML module should be made available to
    // scripts inlined within that module.
    //
    // For example, when enabled:
    //
    // ```html
    // <div export id="foo"></div>
    // <script type="scoped">
    // console.log(foo) // foo is in scope.
    // </script>
    // ```
    exposeSameDocumentExports: true,
  }

})(this.HTMLExports = this.HTMLExports || {})

// # Internal Helpers

;(function(scope) {
  'use strict'

  var _util = {}
  scope._util = _util

  // ## `flattenValueTuples`

  // After collecting value tuples ([key, value, source]), we can flatten them
  // into an value map, and also warn about any masked values.
  scope._util.flattenValueTuples = function flattenValueTuples(valueTuples, ignore) {
    var valueMap = {}
    var masked   = []
    for (var i = 0, tuple; tuple = valueTuples[i]; i++) {
      var key = tuple[0]
      if (key in valueMap && (!ignore || ignore.indexOf(key) === -1)) {
        masked.push(key)
      }
      valueMap[key] = tuple[1]
    }

    if (masked.length) {
      masked.forEach(_warnMaskedValues.bind(null, valueTuples))
    }

    return valueMap
  }

  // It's important that we give authors as much info as possible to diagnose
  // any problems with their source. So, we spend a bit of computational effort
  // whenever values are masked (imports, exports, etc).
  function _warnMaskedValues(valueTuples, key) {
    var conflicting = valueTuples.filter(function(tuple) {
      return tuple[0] === key
    }).map(function(tuple) {
      return tuple[2]
    })
    console.warn.apply(console,
      ['Multiple values named "' + key + '" were evaluated:'].concat(conflicting)
    )
  }

})(this.HTMLExports = this.HTMLExports || {})

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
        // A difficulty of the module loader spec is that it (rightfully)
        // assumes that all sources are a `String`. Because we completely skip
        // over raw source, we need to be a little more crafty by placing the
        // real source in a side channel.
        load.metadata._htmlExports = {document: link.import}
        // And then, to appease the spec/SystemJS, we provide a dummy value for
        // `source`.
        resolve('')
      })
    })
  }

  // ## `LoaderHooks.translate`

  // While this is not strictly a translation, we need to extract and normalize
  // any dependencies and exports declared by a document. This is as good a
  // place as any.
  //
  // This is also a great place to perform any async pre-execution, because the
  // `instantiate` does not support asynchronous processing.
  LoaderHooks.translate = function translateHTML(load) {
    console.debug('HTMLExports.LoaderHooks.translate(', load, ')')
    var meta = load.metadata._htmlExports
    console.assert(meta && meta.document)

    meta.docExportTuples = scope.exportTuplesFor(meta.document)
    meta.docDependencies = scope.htmlDepsFor(meta.document)
    meta.scopedScripts   = scope.scopedScriptsFor(meta.document, meta.docExportTuples)

    // Once we have scanned for all the imports/exports/scripts within the
    // document, we can determine the full range of dependencies for it.
    var depNames = meta.docDependencies.map(function(d) { return d.name })
    for (var i = 0, script; script = meta.scopedScripts[i]; i++) {
      depNames = depNames.concat(script.deps)
    }

    // Unfortunately, however, we need to be careful to use the normalized
    // module names when retrieving those modules during the `instantiate`
    // step's `execute` function. This is an async process, so we have to
    // perform it prior to that step.
    return _normalizeAll(this, depNames).then(function(nameMap) {
      meta.depMap = nameMap
    })


    // var htmlDeps = scope.htmlDepsFor(doc)
    // var scripts  = scope.scopedScriptsFor(doc)
    // //- We'll want these in `instantiate`
    // load.metadata._htmlExports.htmlDeps = htmlDeps
    // load.metadata._htmlExports.scripts  = scripts

    // var depNames = htmlDeps.map(function(d) { return d.name })
    // for (var i = 0, script; script = scripts[i]; i++) {
    //   depNames = depNames.concat(script.deps)
    // }

    // // In this case, we need to be careful to normalize all dependency names so
    // // that we can synchronously retrieve them during execution. Sadly, this is
    // // an async process, so we can't embed it in `instantiate`.
    // var normalizers = depNames.map(function(n) { return this.normalize(n) }.bind(this))
    // return Promise.all(normalizers).then(function(names) {
    //   console.assert(depNames.length == names.length)
    //   var depMap = {}
    //   for (var i = 0; i < names.length; i++) {
    //     depMap[depNames[i]] = names[i]
    //   }
    //   load.metadata._htmlExports.depMap = depMap

    //   for (var i = 0, dep; dep = htmlDeps[i]; i++) {
    //     dep.normalized = depMap[dep.name]
    //   }
    //   for (var i = 0, script; script = scripts[i]; i++) {
    //     script.normalizedDeps = script.deps.map(function(n) { return depMap[n] })
    //   }

    //   //- TODO(nevir): Do duplicate entries need to be trimmed?
    //   load.metadata._htmlExports.deps = names
    // })
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
    var meta = load.metadata._htmlExports
    console.assert(meta && meta.depMap && meta.docExportTuples && meta.scopedScripts)

    console.debug('meta for:', load.name, meta)
    console.debug('deps for:', load.name, Object.keys(meta.depMap))
    return {
      deps: Object.keys(meta.depMap),
      execute: function executeHTML() {
        // Execution is pretty straightforward:
        //
        // * We extract any (HTML) exported values from the document.
        var tuples = meta.docExportTuples
        // * And execute any scoped scripts, merging their exported values into
        //   those of the document.
        for (var i = 0, script; script = meta.scopedScripts[i]; i++) {
          tuples = tuples.concat(script.execute(function(name) {
            return this.get(meta.depMap[name])
          }.bind(this)))
        }

        // Note that up until this point, and exported value was represented as
        // a value tuple. This allows us to provide useful errors/warnings for
        // conflicting exports.
        //
        // The only value we allow conflicts for is `default` (latest wins).
        var exports = scope._util.flattenValueTuples(tuples, ['default'])
        console.debug('exports from:', load.name, exports)
        return this.newModule(exports)
      }.bind(this),
    }
  }

  // ## Document Processing

  // ### `HTMLExports.depsFor`

  // Each document can declare dependencies via various means. In order to speed
  // up the load process, we scan a (potentially inert) document for any of
  // those (aka preloading & proper ordering).
  scope.depsFor = function depsFor(document) {
    return [].concat(scope.htmlDepsFor(document), scope.jsDepsFor(document))
  }

  // #### `HTMLExports.htmlDepsFor`

  // HTML modules can declare dependencies on any other modules via the `import`
  // element:
  //
  // ```html
  // <import src="some-module">
  // ```
  scope.htmlDepsFor = function htmlDepsFor(document) {
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

  // #### `HTMLExports.jsDepsFor`

  // JS modules can also have declared dependencies (ES6+):
  //
  // ```html
  // <script type="module">
  //   import { tentacle } from 'squid'
  // </script>
  // ```
  scope.jsDepsFor = function jsDepsFor(document) {
    var result  = []
    var scripts = document.querySelectorAll('module,script[type="module"]')
    for (var i = 0, script; script = scripts[i]; i++) {
      result = result.concat(_depsForModule(script.textContent))
    }

    return result
  }

  function _depsForModule(script) {
    var regex  = /(?:^\s*|[}\);\n]\s*)(?:import|export)\s+(?:[^;\n]+\s+from\s+)?(["'])((?:\\.|[^\1])*?)\1/g
    var result = []
    var source = script.textContent
    var match
    while (match = regex.exec(source)) {
      console.warn(match)
      result.push({
        name:    match[2],
        aliases: {}, // TODO
        source:  script,
      })
    }
    console.debug('deps for', script, result)

    return result
  }

  // ### `HTMLExports.exportsFor`

  // HTML modules can export elements that are tagged with `export`.
  scope.exportTuplesFor = function exportTuplesFor(document) {
    //- We collect [key, value, source] and then flatten at the end.
    var valueTuples = []
    // They can either be named elements (via `id`), such as:
    //
    // ```html
    // <div export id="foo">...</div>
    // ```
    var exportedNodes = document.querySelectorAll('[export][id]')
    for (var i = 0, node; node = exportedNodes[i]; i++) {
      valueTuples.push([node.getAttribute('id'), node, node])
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
      valueTuples.push(['default', defaultNodes[0], defaultNodes[0]])
    // Otherwise, the default export will be the document.
    } else {
      valueTuples.push(['default', document, document])
    }

    // Furthermore, values exported by `<script type="scoped">` blocks are also
    // exported via the document. This depends on `HTMLExports.runScopedScripts`
    // having been run already.
    var scopedScripts = document.querySelectorAll('script[type="scoped"]')
    for (i = 0; node = scopedScripts[i]; i++) {
      if (!node.exports) continue;
      var keys = Object.keys(node.exports)
      for (var j = 0, key; key = keys[j]; j++) {
        valueTuples.push([key, node.exports[key], node])
      }
    }

    return valueTuples
  }

  scope.exportsFor = function exportsFor(document) {
    return scope._util.flattenValueTuples(scope.exportTuplesFor(document), ['default'])
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

  function _normalizeAll(loader, names) {
    var promises = names.map(function(n) { return loader.normalize(n) })
    return Promise.all(promises).then(function(normalizedNames) {
      var nameMap = Object.create(null)
      for (var i = 0, normalizedName; normalizedName = normalizedNames[i]; i++) {
        nameMap[names[i]] = normalizedName
      }
      return nameMap
    })
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
