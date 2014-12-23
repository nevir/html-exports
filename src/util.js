// # Internal Helpers

;(function(scope) {
  'use strict'

  var _util = {}
  scope._util = _util

  // ## `flattenValueTuples`

  // After collecting value tuples ([key, value, source]), we can flatten them
  // into an value map, and also warn about any masked values.
  scope._util.flattenValueTuples = function flattenValueTuples(valueTuples, ignore) {
    var valueMap = {}
    var masked   = []
    for (var i = 0, tuple; tuple = valueTuples[i]; i++) {
      var key = tuple[0]
      if (key in valueMap && (!ignore || ignore.indexOf(key) === -1)) {
        masked.push(key)
      }
      valueMap[key] = tuple[1]
    }

    if (masked.length) {
      masked.forEach(_warnMaskedValues.bind(null, valueTuples))
    }

    return valueMap
  }

  // It's important that we give authors as much info as possible to diagnose
  // any problems with their source. So, we spend a bit of computational effort
  // whenever values are masked (imports, exports, etc).
  function _warnMaskedValues(valueTuples, key) {
    var conflicting = valueTuples.filter(function(tuple) {
      return tuple[0] === key
    }).map(function(tuple) {
      return tuple[2]
    })
    console.warn.apply(console,
      ['Multiple values named "' + key + '" were evaluated:'].concat(conflicting)
    )
  }

})(this.HTMLExports = this.HTMLExports || {})
