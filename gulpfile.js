var _         = require('lodash')
var concat    = require('gulp-concat')
var groc      = require('gulp-groc')
var gulp      = require('gulp')
var jshint    = require('gulp-jshint')
var notify    = require('gulp-notify')
var path      = require('path')
var rename    = require('gulp-rename')
var replace   = require('gulp-replace')
var uglify    = require('gulp-uglify')
var webserver = require('gulp-webserver')

var ALL_SOURCES  = ['gulpfile.js', '{demo,src,test}/**/*.{html,js}']
var MAIN_SOURCES = ['src/loaderhooks.js', 'src/**/*.js', 'src/system.js']
var PROJECT_ROOT = __dirname

var BUILD_VARIATIONS = {
  main: ['src/loaderhooks.js', 'src/**/*.js', 'src/system.js'],
}

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

_.each(BUILD_VARIATIONS, function(sources, name) {
  var targetBase = 'build:' + name
  function target(kind) {
    return targetBase + ':' + kind
  }

  var destBase = 'html-exports'
  if (name !== 'main') { destBase = destBase + '.' + name }
  function dest(kind) {
    return destBase + (kind === 'release' ? '' : '.' + kind) + '.js'
  }

  gulp.task(targetBase, [target('debug'), target('release'), target('min')])

  gulp.task(target('debug'), function() {
    return gulp.src(sources)
      .pipe(concat(dest('debug')))
      .pipe(gulp.dest('./dist'))
  })

  gulp.task(target('release'), [target('debug')], function() {
    return gulp.src(['./dist/' + dest('debug')])
      .pipe(replace(/\n\s*console.(debug|assert)[^\n]+/g, ''))
      .pipe(rename(dest('release')))
      .pipe(gulp.dest('./dist'))
  })

  gulp.task(target('min'), [target('release')], function() {
    return gulp.src(['./dist/' + dest('release')])
      .pipe(uglify())
      .pipe(rename(dest('min')))
      .pipe(gulp.dest('./dist'))
  })
})

// Pretty errors for our various tasks.

var watching = false

function onError(error) {
  if (watching) {
    var message = error.message.replace(new RegExp(PROJECT_ROOT + path.sep, 'g'), '')
    notify.onError(message)(this)
  }
}
