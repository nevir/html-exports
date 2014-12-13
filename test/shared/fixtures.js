/* jshint -W098 */

/**
 * @param {String...} fixturePaths The fixtures that should be imported. Tests
 *     will not run until they have all loaded.
 */
function importFixtures() {
  var fixtures = {}

  // Ideally this is not needed, but see:
  // https://github.com/ModuleLoader/es6-module-loader/issues/255
  var importOptions = {name: document.location.pathname};

  var numToLoad = arguments.length
  var numLoaded = 0
  Array.prototype.forEach.call(arguments, function(path) {
    System.import('../fixtures/' + path, importOptions).then(function(mod) {
      fixtures[path.replace(/\..+$/, '')] = mod
      numLoaded = numLoaded + 1
    })
  })

  // Wait until all the fixtures have loaded.
  before(function(done) {
    var intervalId = setInterval(function() {
      if (numLoaded < numToLoad) return
      clearInterval(intervalId)
      done()
    }, 1)
  })

  return fixtures
}

/* jshint +W098 */
