var concat    = require('gulp-concat')
var gulp      = require('gulp')
var jshint    = require('gulp-jshint')
var notify    = require('gulp-notify')
var path      = require('path')
var webserver = require('gulp-webserver')

var ALL_SOURCES   = ['gulpfile.js', '{demo,src,test}/**/*.{html,js}']
var MAIN_SOURCES = 'src/**/*.js'
var PROJECT_ROOT = __dirname

// Tasks

gulp.task('default', ['watch', 'build', 'test'])
gulp.task('test',    ['test:style'])

gulp.task('test:style', function() {
  return gulp.src(ALL_SOURCES)
    .pipe(jshint.extract('auto'))
    .pipe(jshint())
    .pipe(jshint.reporter('jshint-stylish'))
    .pipe(jshint.reporter('fail'))
    .on('error', onError)
})

gulp.task('watch', function() {
  watching = true
  return gulp.watch(ALL_SOURCES, {debounceDelay: 10}, ['test', 'build'])
})

// As much as I'd like to use ES6 for the source, and just transpile it, the
// Traceur runtime is too much overhead for a simple "shim" like this.
gulp.task('build', function() {
  gulp.src(MAIN_SOURCES)
    .pipe(concat('html-exports.js'))
    .pipe(gulp.dest('./dist'))
})

gulp.task('demo', function() {
  gulp.src('.')
    .pipe(webserver({
      livereload: true,
      open:       '/demo/custom-element',
    }))
})

// Pretty errors for our various tasks.

var watching = false
function onError(error) {
  if (watching) {
    var message = error.message.replace(new RegExp(PROJECT_ROOT + path.sep, 'g'), '')
    notify.onError(message)(this)
  }
}
