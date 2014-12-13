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
