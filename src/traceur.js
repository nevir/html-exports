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
