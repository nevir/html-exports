// # HTMLExports

;(function(scope) {
  'use strict'

  // TODO(nevir)
  scope.depsFor = function depsFor(document) {
    return []
  }

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
