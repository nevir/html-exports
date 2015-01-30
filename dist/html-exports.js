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
    var meta = load.metadata._htmlExports

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
    var meta = load.metadata._htmlExports

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

// # ES6 Support via Traceur

;(function(scope) {
  'use strict'

  // ### `HTMLExports.compileES6`

  // In order to support `<module>`/`<script type="module">`, we need to be able
  // to evaluate ES6 sources, and scan for dependencies (prior to execution).
  //
  // Furthermore, we go beyond es6-module-loader's behavior by providing the
  // ability to inject values into the module's scope.
  scope.compileES6 = function compileES6(scopedValueTuples, script) {
    var compiler = _newCompiler()

    // We need to hijack System.register to be able to pick up exported values
    // and dependencies, just like es6-module-loader:
    // https://github.com/ModuleLoader/es6-module-loader/blob/ceb13870b22e1478670c3ee1d9b9beb7a2de660d/src/polyfill-wrapper-end.js
    var origRegister = System.register
    var dependencies, declaration;
    System.register = function() {
      dependencies = arguments[0]
      declaration  = arguments[1]
    }

    try {
      _eval(scopedValueTuples, compiler.compile(script.textContent))
    } catch (error) {
      console.error(
        'Failure executing inline module:', error.message, '\n',
        'Local values:', {}, '\n',
        'Module body:', script.textContent, '\n')
      throw error
    } finally {
      System.register = origRegister
    }

    return {
      deps:    dependencies,
      execute: _execDeclaration.bind(null, dependencies, declaration, script),
    }
  }

  function _newCompiler() {
    // We are careful to honor any options already specified via
    // es6-module-loader or SystemJS users.
    var options = Object.create(System.traceurOptions || null);
    options.modules    = 'instantiate'  // Direct access to exports.
    options.sourceMaps = false
    options.script     = false

    return new traceur.Compiler(options);
  }

  function _eval(scopedValueTuples, source) {
    var keys   = scopedValueTuples.map(function(t) { return t[0] })
    var values = scopedValueTuples.map(function(t) { return t[1] })

    var func = Function.apply(null, keys.concat([source]))
    return func.apply(null, values)
  }

  function _execDeclaration(dependencies, declaration, script, getModule) {
    console.warn('_execDeclaration', dependencies)
    var modules = dependencies.map(function(name) {
      var mod = getModule(name)
      if (!mod) {
        throw new Error('Expected module "' + name + '" to be defined')
      }
    })

    var tuples = []
    var intermediate = declaration(function(name, value) {
      console.warn('export', arguments)
      tuples.push([name, value, script])
    })

    intermediate.execute()

    console.warn('tuples:', tuples)

    return tuples
  }

})(this.HTMLExports = this.HTMLExports || {})

// # Scoped Scripts

;(function(scope) {
  'use strict'

  // ### `HTMLExports.scopedScriptsFor`

  // Process a document for any scoped scripts/modules that it might contain.
  //
  // Scripts are compiled, and the given values are exposed to their scope.
  scope.scopedScriptsFor = function scopedScriptsFor(document, exportedValueTuples) {
    // A scoped script can be declared as:
    //
    // ```html
    // <script type="scoped">...</script>
    // ```
    var scripts = document.querySelectorAll('script[type="scoped"]')

    // Similarly, we support modules (mirroring es6-module-loader), and
    // provide the same behavior:
    //
    // ```html
    // <script type="module">...</script>
    // ```
    var modules = document.querySelectorAll('script[type="module"]')

    var tuples = _scopedValueTuples(document, exportedValueTuples)
    return [].concat(
      Array.prototype.map.call(modules, scope.compileES6.bind(scope, tuples))
    )
  }

  function _scopedValueTuples(document, exportedValueTuples) {
    // The value for `default` is special: it's reserved, and not included in a
    // script's scope.
    var tuples = exportedValueTuples.filter(function(tuple) {
      return tuple[0] !== 'default'
    })
    //

    return tuples
  }

  // ### `HTMLExports.runScopedScripts`

  // Processes any scoped scripts, and executes them after all declared imports
  // within a document have loaded.
  scope.runScopedScripts = function runScopedScripts(document) {
    var deps     = scope.depsFor(document)
    var depNames = deps.map(function(dep) { return dep.name })
    var options  = {name: document.baseURI || document.location.pathname}

    return _importAll(depNames).then(function(allExports) {
      _fireEvent(document, 'DeclaredImportsLoaded')

      // A scoped script can be declared as:
      //
      // ```html
      // <script type="scoped">...</script>
      // ```
      var scripts = document.querySelectorAll('script[type="scoped"]')

      // Similarly, we support modules (mirroring es6-module-loader), and
      // provide the same behavior:
      //
      // ```html
      // <script type="module">...</script>
      // ```
      var modules = document.querySelectorAll('script[type="module"]')
      if (!scripts.length && !modules.length) { return }

      // In both cases, we add a few values to each script's scope:
      //
      //- TODO(nevir):
      //- * Values explicitly imported by the module are made available as
      //-   local values to that module's scoped scripts.
      //- var scopedVaules = _importedValues(document)
      var scopedValues = {}

      // * When the config flag `exposeSameDocumentExports` is active, all
      //   values exported by the module's document are exposed to the script.
      if (scope.config.exposeSameDocumentExports) {
        var exports = _resolveExports(allExports, deps, document)
        Object.keys(exports).forEach(function(key) {
          scopedValues[key] = exports[key]
        })
      }
      // * `document` points to the _module's document_.
      scopedValues.document = document
      // * `rootDocument` points to the root document loaded by the browser.
      scopedValues.rootDocument = window.document

      var scriptLoads = _processScripts(scopedValues, _evalES5, scripts)
      scriptLoads = scriptLoads.concat(_processScripts(scopedValues, _evalES6, modules))
      // If any scripts fail to execute, we fail the entire load.
      return Promise.all(scriptLoads)
    })
  }

  // ## Internal Implementation

  // After we have loaded all the declared imports for a particular document,
  // we need to flatten the imported values into a set of (aliased) keys and
  // their values.
  function _resolveExports(allExports, deps, document) {
    var valueTuples = []
    for (var i = 0, dep; dep = deps[i]; i++) {
      var keys = Object.keys(dep.aliases)
      for (var j = 0, key; key = keys[j]; j++) {
        var alias = dep.aliases[key]
        if (!(key in allExports[i])) {
          console.warn('"' + key + '" was requested, but not exported from "' + dep.name + '".', dep.source)
        }
        valueTuples.push([alias, allExports[i][key], dep.source])
      }
    }

    // As a convenience, we also expose values exported by the current document.
    valueTuples = valueTuples.concat(scope._exportTuplesFor(document))
    var exportMap = scope._util.flattenValueTuples(valueTuples)
    // We have to be careful not to expose the document's default value though.
    delete exportMap.default

    return exportMap
  }

  // After all the imported values are flattened and validated, it is time to
  // execute the scoped scripts within the document.
  function _processScripts(scopedValues, evalFunc, scripts) {
    return Array.prototype.map.call(scripts, _processScript.bind(null, scopedValues, evalFunc))
  }

  function _processScript(scopedValues, evalFunc, script) {
    // Scoped scripts follow the same lifecycle events as a regular `<script>`
    // element. See http://www.w3.org/TR/html5/scripting-1.html
    if (!_fireEvent(script, 'beforescriptexecute', true, true)) {
      // You can cancel a scoped script by canceling `beforescriptexecute`.
      return Promise.resolve() // This _should not_ cancel the module load.
    } else {
    }

    function onScriptComplete() {
      // Once a script has executed (for better or worse), we fire script
      // lifecycle events. Interestingly, the spec (and native impls) do not
      // appear to fire an `error` event for scripting errors, so we omit that.
      //
      // See http://www.w3.org/TR/html5/scripting-1.html for behavior.
      _fireEvent(script, 'afterscriptexecute', true)
      setTimeout(function() { _fireEvent(script, 'load') }, 0)
    }

    return evalFunc(scopedValues, script.textContent).then(
      function(exports) {
        // Any values exported by that script are exposed via the `exports`
        // property on the script's element.
        script.exports = exports || {}
        onScriptComplete()
      },
      function(error) {
        onScriptComplete()
        return Promise.reject(error)
      }
    )
  }

  function _fireEvent(node, eventName, bubble, cancelable) {
    var event = new Event(eventName)
    event.bubbles    = !!bubble
    event.cancelable = !!cancelable
    return node.dispatchEvent(event)
  }

  // ## Language-specific Evaluation

  // Ideally, we would not need any of this logic, and would instead be calling
  // out to `System.module`. Unfortunately, there is no way to pass scoped
  // (local) values to be included as part of the module's scope via that.
  //
  // So, we have to resort to evaluating the ES5 and ES6 sources directly.

  // ### ES5

  function _evalES5(scopedValues, source) {
    // We support CommonJS style exports for scoped ES5 scripts.
    if ('exports' in scopedValues || 'module' in scopedValues) {
      return Promise.reject(
        new Error('"exports" and "module" are reserved names for scoped scripts')
      )
    }
    scopedValues.exports = {}
    scopedValues.module  = {exports: scopedValues.module}

    // Scoped scripts are evaluated in strict mode. It's the future!
    source = '"use strict";\n' + source

    try {
      _eval(scopedValues, source)
      return Promise.resolve(scopedValues.module.exports)

    } catch (error) {
      console.error(
        'Failure executing scoped script:', error.message, '\n',
        'Local values:', scopedValues, '\n',
        'Script body:', source, '\n')
      return Promise.reject(error)
    }
  }

  // ### ES6

  function _evalES6(scopedValues, source) {
    return new Promise(function(resolve, reject) {
      var compiled = scope.compileES6(source, scopedValues)
      console.warn('execd:', compiled.execute())
      resolve({})

      // // This should follow es6-module-loader and System.js as closely as it can.
      // // See https://github.com/ModuleLoader/es6-module-loader/blob/ceb13870b22e1478670c3ee1d9b9beb7a2de660d/src/loader.js#L1094-1100
      // var options = Object.create(System.traceurOptions || null);
      // options.modules    = 'instantiate'  // Direct access to exports.
      // options.sourceMaps = false
      // options.script     = false

      // var compiler = new traceur.Compiler(options);

      // // We need to hijack System.register to be able to pick up exported values
      // // and dependencies, just like es6-module-loader:
      // // https://github.com/ModuleLoader/es6-module-loader/blob/ceb13870b22e1478670c3ee1d9b9beb7a2de660d/src/polyfill-wrapper-end.js
      // var origRegister = System.register
      // System.register = function(depNames, declare) {
      //   console.error('System.register', depNames, declare)
      //   //- TODO(nevir): We should be parsing out these dependencies sooner.
      //   _importAll(depNames).then(function(allExports) {
      //     console.warn('deps loaded', depNames, allExports)
      //   }, function(error) {
      //     console.warn('failed', error)
      //   })

      //   console.warn('System.register', depNames, declare)
      //   resolve({})
      // }

      // try {
      //   var compiledSource = compiler.compile(source)
      //   console.warn('source:', compiledSource)
      //   _eval(scopedValues, compiledSource)

      // } catch (error) {
      //   console.error(
      //     'Failure executing inline module:', error.message, '\n',
      //     'Local values:', scopedValues, '\n',
      //     'Module body:', source, '\n')
      //   return reject(error)

      // } finally {
      //   System.register = origRegister
      // }
    })

    return Promise.resolve({})
  }

  // ### Utility

  function _importAll(names) {
    console.warn('_importAll', names, names.map(function(n) { return System.import(n) }))
    return Promise.all(names.map(function(n) { return System.import(n) }))
  }

  function _eval(scopedValues, source) {
    var keys   = Object.keys(scopedValues)
    var values = keys.map(function(k) { return scopedValues[k] })

    var func = Function.apply(null, keys.concat([source]))
    return func.apply(null, values)
  }

})(this.HTMLExports = this.HTMLExports || {})

// # Global Behavior
;(function(scope) {
  'use strict'

  // When HTML Exports is used normally, it is mixed into the `System` loader.
  scope.DocumentLoader.mixin(System)

  //
  document.addEventListener('DOMContentLoaded', function() {
    // scope.runScopedScripts(document)
  })

})(this.HTMLExports = this.HTMLExports || {})
