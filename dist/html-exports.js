(function(loader) {
  'use strict'

  var loaderLocate = loader.locate
  /**
   *
   */
  loader.locate = function locate(load) {
    // If the module requested is explicit about the extension, we can be pretty
    // confident of the content type and URL.
    if (!load.metadata.contentType && load.name.slice(-5) === '.html') {
      load.metadata.contentType = 'text/html'
      // Circumvent System.paths because we have an explicit URL
      return this.baseURL + load.name
    }

    // Otherwise, default behavior.
    return loaderLocate.apply(this, arguments)
  }

  var loaderFetch = loader.fetch
  /**
   *
   */
  loader.fetch = function fetch(load) {
    if (load.metadata.contentType !== 'text/html') {
      return loaderFetch.apply(this, arguments)
    }

    return new Promise(function(resolve, reject) {
      var link = document.createElement('link')
      link.setAttribute('rel', 'import')
      link.setAttribute('href', load.address)

      link.addEventListener('load', function() {
        resolve(link.import)
        link.remove()
      })

      link.addEventListener('error', function() {
        link.remove()
        // TODO(nevir): The error object doesn't appear to have a message?
        reject(new Error('Failure when fetching URL: ' + load.address))
      })

      document.head.appendChild(link)
    })
  }

  var loaderInstantiate = loader.instantiate
  /**
   *
   */
  loader.instantiate = function instantiate(load) {
    if (load.metadata.contentType !== 'text/html') {
      return loaderInstantiate.apply(this, arguments)
    }

    return {
      deps: [],  // TODO(nevir): Extract links & specify deps.
      execute: function() {
        return loader.newModule(exportsForDocument(load.source))
      }
    }
  }

  /**
   *
   */
  function exportsForDocument(document) {
    var exports = {}
    var exportedNodes = document.querySelectorAll('[id][export]')
    for (var i = 0, node; node = exportedNodes[i]; i++) {
      exports[node.getAttribute('id')] = node
    }

    return exports
  }

})(System)
