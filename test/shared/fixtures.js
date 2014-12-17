/* jshint -W098 */

/**
 * @param {String...} fixturePaths The fixtures that should be imported. Tests
 *     will not run until they have all loaded.
 */
function importFixtures() {
  var fixtures = {}

  // Ideally this is not needed, but see:
  // https://github.com/ModuleLoader/es6-module-loader/issues/255
  var importOptions = {name: document.location.pathname}

  var imports = Array.prototype.map.call(arguments, function(path) {
    return System.import('../fixtures/' + path, importOptions).then(function(mod) {
      fixtures[path.replace(/\..+$/, '')] = mod
    })
  })

  // Block tests until all the fixtures have loaded
  before(function(done) {
    Promise.all(imports).then(function() { done() })
  })

  return fixtures
}

/* jshint +W098 */
