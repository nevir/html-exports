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
        _fireEvent(document, 'DeclaredImportsLoaded')

        // A scoped script can be declared as:
        //
        // ```html
        // <script type="scoped">...</script>
        // ```
        var scripts = document.querySelectorAll('script[type="scoped"]')
        if (!scripts.length) { return resolve() }

        var exportMap = _resolveExports(allExports, deps, document)
        try {
          for (var i = 0, script; script = scripts[i]; i++) {
            _executeScript(exportMap, script)
          }
        // If any scripts fail to execute, we fail the entire load.
        } catch (error) {
          reject(error)
        }

        resolve()
      })
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
  function _executeScript(exportMap, script) {
    // Scoped scripts follow the same lifecycle events as a regular `<script>`
    // element. See http://www.w3.org/TR/html5/scripting-1.html
    if (!_fireEvent(script, 'beforescriptexecute', true, true)) {
      // You can cancel a scoped script by canceling `beforescriptexecute`.
      console.debug('scoped script', script, 'was canceled')
      return
    } else {
      console.debug('executing scoped script', script, 'scoped imports:', exportMap)
    }

    var keys   = Object.keys(exportMap)
    var values = keys.map(function(k) { return exportMap[k] })
    // We support CommonJS style exports for scoped scripts. Ideally, we'd be
    // reusing `System.module`, but there doesn't appear to be a clean way of
    // also supporting scoped imports via that mechanism.
    if ('exports' in exportMap || 'module' in exportMap) {
      throw new Error('"exports" and "module" are reserved names for scoped scripts')
    }
    keys.push('exports', 'module')
    values.push({})
    values.push({exports: values[values.length - 1]})
    var module = values[values.length - 1]

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
    } finally {
      // Once a script has executed (for better or worse), we fire script
      // lifecycle events. Interestingly, the spec (and native impls) do not
      // appear to fire an `error` event for scripting errors, so we omit that.
      //
      // See http://www.w3.org/TR/html5/scripting-1.html for behavior.
      _fireEvent(script, 'afterscriptexecute', true)
      setTimeout(function() { _fireEvent(script, 'load') }, 0)
    }

    // Once a scoped script has run, its exports are exposed via the `exports`
    // property on the script's element.
    script.exports = module.exports
  }

  function _fireEvent(node, eventName, bubble, cancelable) {
    var event = new Event(eventName)
    event.bubbles    = !!bubble
    event.cancelable = !!cancelable
    return node.dispatchEvent(event)
  }

})(this.HTMLExports = this.HTMLExports || {})
