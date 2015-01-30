// # Configuration

// As this loader extension is a bit of an experiment, there are a few knobs you
// can turn to try different ways of loading HTML as modules.

;(function(scope) {
  'use strict'

  scope.config = {
    // Whether values exported by a HTML module should be made available to
    // scripts inlined within that module.
    //
    // For example, when enabled:
    //
    // ```html
    // <div export id="foo"></div>
    // <script type="scoped">
    // console.log(foo) // foo is in scope.
    // </script>
    // ```
    exposeSameDocumentExports: true,
  }

})(this.HTMLExports = this.HTMLExports || {})
