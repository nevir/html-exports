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
