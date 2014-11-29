var concat    = require('gulp-concat')
var groc      = require('gulp-groc')
var gulp      = require('gulp')
var jshint    = require('gulp-jshint')
var notify    = require('gulp-notify')
var path      = require('path')
var replace   = require('gulp-replace')
var webserver = require('gulp-webserver')

var ALL_SOURCES  = ['gulpfile.js', '{demo,src,test}/**/*.{html,js}']
var MAIN_SOURCES = ['src/base.js', 'src/**/*.js', 'src/system.js']
var PROJECT_ROOT = __dirname

// Tasks

gulp.task('default', ['watch', 'build', 'test', 'docs'])
gulp.task('test',    ['test:style'])
gulp.task('build', ['build:dev', 'build:main'])

gulp.task('watch', function() {
  watching = true
  return gulp.watch(ALL_SOURCES, {debounceDelay: 10}, ['test', 'build', 'docs'])
})

gulp.task('demo', ['build'], function() {
  gulp.src('.')
    .pipe(webserver({
      livereload: true,
      open:       '/demo/custom-element',
    }))
})

gulp.task('docs', ['build:main'], function() {
  gulp.src(MAIN_SOURCES)
    .pipe(groc({
      out:   'doc',
      index: 'src/base.js',
      strip: 'src/',
    }))
})

// As much as I'd like to use ES6 for the source, and just transpile it, the
// Traceur runtime is too much overhead for a simple "shim" like this.
gulp.task('build:dev', function() {
  gulp.src(MAIN_SOURCES)
    .pipe(concat('html-exports.dev.js'))
    .pipe(gulp.dest('./dist'))
})

gulp.task('build:main', ['build:dev'], function() {
  gulp.src(['html-exports.dev.js'])
    .pipe(replace(/\n\s*console.debug[^\n]+/g, ''))
    .pipe(gulp.dest('./dist/html-exports.js'))
})

gulp.task('test:style', function() {
  return gulp.src(ALL_SOURCES)
    .pipe(jshint.extract('auto'))
    .pipe(jshint())
    .pipe(jshint.reporter('jshint-stylish'))
    .pipe(jshint.reporter('fail'))
    .on('error', onError)
})

// Pretty errors for our various tasks.

var watching = false
function onError(error) {
  if (watching) {
    var message = error.message.replace(new RegExp(PROJECT_ROOT + path.sep, 'g'), '')
    notify.onError(message)(this)
  }
}
