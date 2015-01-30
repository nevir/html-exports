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
    var es5Scripts = document.querySelectorAll('script[type="scoped"]')

    // Similarly, we support modules (mirroring es6-module-loader), and
    // provide the same behavior:
    //
    // ```html
    // <script type="module">...</script>
    // ```
    var es6Scripts = document.querySelectorAll('script[type="module"]')

    var tuples = _scopedValueTuples(document, exportedValueTuples)
    return [].concat(
      Array.prototype.map.call(es6Scripts, scope.compileES6.bind(scope, tuples))
    )
  }

  function _scopedValueTuples(document, exportedValueTuples) {
    // The value for `default` is special: it's reserved, and not included in a
    // script's scope.
    var tuples = exportedValueTuples.filter(function(tuple) {
      return tuple[0] !== 'default'
    })

    return tuples
  }

  //




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
    console.assert(allExports.length === deps.length, 'declared dependencies do not match loaded exports')
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
      console.debug('scoped script', script, 'was canceled')
      return Promise.resolve() // This _should not_ cancel the module load.
    } else {
      console.debug('executing scoped script', script, 'scoped values:', scopedValues)
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
