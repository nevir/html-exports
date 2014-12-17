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
