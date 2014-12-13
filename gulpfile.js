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
var PROJECT_ROOT = __dirname

var BUILD_VARIATIONS = {
  main: {
    sources:  ['src/loaderhooks.js', 'src/documentloader.js', 'src/system.js'],
    destBase: './dist/html-exports',
  },
  sysjs: {
    sources:  ['src/loaderhooks.js', 'src/sysjs-plugin.js'],
    destBase: './dist/sysjs-plugin/html',
  },
}

// Tasks

require('web-component-tester').gulp.init(gulp);
gulp.task('default', ['watch', 'build', 'test:style', 'doc'])
gulp.task('test',    ['test:style', 'test:local'])

gulp.task('watch', function() {
  watching = true
  return gulp.watch(ALL_SOURCES, {debounceDelay: 10}, ['test:style', 'build', 'doc'])
})

gulp.task('demo', ['build'], function() {
  return gulp.src('.')
    .pipe(webserver({
      livereload: true,
      open:       '/demo/custom-element',
    }))
})

gulp.task('doc', function() {
  return gulp.src('src/**/*.js')
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

_.each(BUILD_VARIATIONS, function(config, name) {
  var targetBase = 'build:' + name
  function target(kind) {
    return targetBase + ':' + kind
  }

  function dest(kind) {
    return config.destBase + (kind === 'release' ? '' : '.' + kind) + '.js'
  }

  gulp.task(targetBase, [target('debug'), target('release'), target('min')])

  gulp.task(target('debug'), function() {
    return gulp.src(config.sources)
      .pipe(concat(dest('debug')))
      .pipe(gulp.dest('.'))
  })

  gulp.task(target('release'), [target('debug')], function() {
    return gulp.src([dest('debug')])
      .pipe(replace(/\n\s*console.(debug|assert)[^\n]+/g, ''))
      .pipe(rename(dest('release')))
      .pipe(gulp.dest('.'))
  })

  gulp.task(target('min'), [target('release')], function() {
    return gulp.src([dest('release')])
      .pipe(uglify())
      .pipe(rename(dest('min')))
      .pipe(gulp.dest('.'))
  })
})

var variations = _.keys(BUILD_VARIATIONS)
gulp.task('build',         _.map(variations, function(v) { return 'build:' + v }))
gulp.task('build:debug',   _.map(variations, function(v) { return 'build:' + v + ':debug' }))
gulp.task('build:release', _.map(variations, function(v) { return 'build:' + v + ':release' }))
gulp.task('build:min',     _.map(variations, function(v) { return 'build:' + v + ':min' }))

// Pretty errors for our various tasks.

var watching = false

function onError(error) {
  if (watching) {
    var message = error.message.replace(new RegExp(PROJECT_ROOT + path.sep, 'g'), '')
    notify.onError(message)(this)
  }
}
