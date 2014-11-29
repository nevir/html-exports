// # HTMLExports.DocumentLoader

;(function(scope) {
  'use strict'

  scope.DocumentLoader = DocumentLoader

  // TODO(nevir)
  function DocumentLoader(options, parentHooks) {
    Reflect.Loader.call(this, options || {})
    this._parentHooks = parentHooks || Reflect.Loader.prototype
  }
  DocumentLoader.prototype = Object.create(Reflect.Loader.prototype)

  // ## `DocumentLoader.mixin`

  // Rather than instantiating and managing a `DocumentLoader` directly, you
  // will frequently want to mix `DocumentLoader`'s behavior into an existing
  // instance of `Reflect.Loader`.
  //
  var MIXIN_HOOKS = ['locate', 'fetch', 'instantiate']
  //
  // The hooks defined on the loader instance will be overridden, and chained
  // when operating on a resource that `DocumentLoader` doesn't understand.
  //
  // For example, to override the default system loader:
  //
  // ```js
  // HTMLExports.DocumentLoader.mixin(System)
  // ```
  //
  DocumentLoader.mixin = function mixin(loader) {
    console.debug('DocumentLoader.mixin(', loader, ')')
    var parentHooks = {}
    var instance = new this({}, parentHooks)
    MIXIN_HOOKS.forEach(function(hook) {
      parentHooks[hook] = loader[hook].bind(loader)
      loader[hook] = instance[hook].bind(instance)
    })
  }

  // ## Loader Hooks

  // ### `DocumentLoader#locate`

  // Most commonly, authors are defining and referencing their HTML documents
  // with a `.html` extension. `DocumentLoader` uses this as a hint to directly
  // load the module as a document.
  DocumentLoader.prototype.locate = function locate(load) {
    console.debug('DocumentLoader#locate(', load, ')')
    // `DocumentLoader` also introduces `contentType` as a general purpose
    // metadata property for load records.
    if (!load.metadata.contentType && load.name.slice(-5) === '.html') {
      load.metadata.contentType = 'text/html'
    }

    // The module's name is used as its address, as HTML Imports (utilized when
    // loading documents) handles relative address resolution.
    if (load.metadata.contentType === 'text/html') {
      return load.name
    }

    return this._parentHooks.locate.apply(this, arguments)
  }

  // ### `DocumentLoader#fetch`

  // TODO(nevir)
  DocumentLoader.prototype.fetch = function fetch(load) {
    console.debug('DocumentLoader#fetch(', load, ')')
    // If we are unsure of the module's type, we load it via default mechanisms
    // (i.e. XHR).
    if (load.metadata.contentType !== 'text/html') {
      return this._parentHooks.fetch.apply(this, arguments)
    }

    // For any module that we are confident is a HTML document, we load it
    // directly via a `<link rel="import" ...>`, allowing us to offload much of
    //
    return new Promise(function(resolve, reject) {

      var link = document.createElement('link')
      link.setAttribute('rel', 'import')
      link.setAttribute('href', load.address)

      link.addEventListener('load', function() {
        resolve(link.import)
        link.remove()
      })

      link.addEventListener('error', function() {
        reject(new Error('Unknown failure when fetching URL: ' + load.address))
        link.remove()
      })

      document.head.appendChild(link)
    })
  }

  // ### `DocumentLoader#instantiate`

  // TODO(nevir)
  DocumentLoader.prototype.instantiate = function instantiate(load) {
    console.debug('DocumentLoader#instantiate(', load, ')')
    // TODO(nevir): Ideally, this shim should check the content type of the
    // response (and attempt to detect the content type for misconfigured
    // servers). That introduces a fair bit of complexity, and the current
    // assumption is that authors will always specify the `.html` extension.
    if (!(load.source instanceof Document)) {
      return this._parentHooks.instantiate.apply(this, arguments)
    }

    return {
      deps: scope.depsFor(load.source),
      execute: function execute() {
        return this.newModule(scope.exportsFor(load.source))
      }.bind(this)
    }
  }

})(this.HTMLExports = this.HTMLExports || {})
