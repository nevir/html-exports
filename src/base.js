// # HTMLExports

;(function(scope) {
  'use strict'

  // ### `HTMLExports.depsFor`

  scope.depsFor = function depsFor(source) {
    return []
  }

  // ### `HTMLExports.exportsFor`

  // TODO(nevir)
  scope.exportsFor = function exportsFor(document) {
    var exports = {}
    var exportedNodes = document.querySelectorAll('[id][export]')
    for (var i = 0, node; node = exportedNodes[i]; i++) {
      exports[node.getAttribute('id')] = node
    }

    return exports
  }

})(this.HTMLExports = this.HTMLExports || {})
