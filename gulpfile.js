var concat    = require('gulp-concat')
var groc      = require('gulp-groc')
var gulp      = require('gulp')
var jshint    = require('gulp-jshint')
var notify    = require('gulp-notify')
var path      = require('path')
var rename    = require('gulp-rename')
var replace   = require('gulp-replace')
var webserver = require('gulp-webserver')

var ALL_SOURCES  = ['gulpfile.js', '{demo,src,test}/**/*.{html,js}']
var MAIN_SOURCES = ['src/loaderhooks.js', 'src/**/*.js', 'src/system.js']
var PROJECT_ROOT = __dirname

// Tasks

require('web-component-tester').gulp.init(gulp);
gulp.task('default', ['watch', 'build', 'test:style', 'doc'])
gulp.task('test',    ['test:style', 'test:local'])
gulp.task('build',   ['build:main'])

gulp.task('watch', function() {
  watching = true
  return gulp.watch(ALL_SOURCES, {debounceDelay: 10}, ['test:style', 'build:main:debug', 'doc'])
})

gulp.task('demo', ['build'], function() {
  return gulp.src('.')
    .pipe(webserver({
      livereload: true,
      open:       '/demo/custom-element',
    }))
})

gulp.task('doc', ['build:main'], function() {
  return gulp.src(MAIN_SOURCES)
    .pipe(groc())
})

gulp.task('test:style', function() {
  return gulp.src(ALL_SOURCES)
    .pipe(jshint.extract('auto'))
    .pipe(jshint())
    .pipe(jshint.reporter('jshint-stylish'))
    .pipe(jshint.reporter('fail'))
    .on('error', onError)
})

// Build Variations

gulp.task('build:main', ['build:main:debug', 'build:main:release'])

gulp.task('build:main:debug', function() {
  return gulp.src(MAIN_SOURCES)
    .pipe(concat('html-exports.debug.js'))
    .pipe(gulp.dest('./dist'))
})

gulp.task('build:main:release', ['build:main:debug'], function() {
  return gulp.src(['./dist/html-exports.debug.js'])
    .pipe(replace(/\n\s*console.(debug|assert)[^\n]+/g, ''))
    .pipe(rename('html-exports.js'))
    .pipe(gulp.dest('./dist'))
})


// Pretty errors for our various tasks.

var watching = false

function onError(error) {
  if (watching) {
    var message = error.message.replace(new RegExp(PROJECT_ROOT + path.sep, 'g'), '')
    notify.onError(message)(this)
  }
}
