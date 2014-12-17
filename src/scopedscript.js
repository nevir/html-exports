// # Scoped Scripts

;(function(scope) {
  'use strict'

  // ### `HTMLExports.runScopedScripts`

  // Processes any scoped scripts, and executes them after all declared imports
  // within a document have loaded.
  scope.runScopedScripts = function runScopedScripts(document) {
    var deps     = scope.depsFor(document)
    var options  = {name: document.location.pathname}
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
    })
  }

  // ## Internal Implementation

  // After we have loaded all the declared imports for a particular document,
  // we need to flatten the imported values into a set of (aliased) keys and
  // their values.
  function _flattenExports(allExports, deps) {
    console.assert(allExports.length === deps.length, 'declared dependencies do not match loaded exports')
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
    console.debug('executing scoped script', script, 'scoped imports:', exportMap)
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
