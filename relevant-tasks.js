'use strict';

var _ = require('lodash');
var argv = require('yargs').argv;
var gulp = require('gulp');
var replace = require('gulp-replace');
var connect = require('gulp-connect');
var webpack = require('webpack');
var webpackStream = require('webpack-stream');
var webpackConfig = require('./webpack.conf');
var helpers = require('./gulpHelpers');
var prebid = require('./package.json');

const { gulpBundle, clean, lint } = gulp.__passVars;

var port = 9999;

gulp.task('relevant-devpack', function () {
  var cloned = _.cloneDeep(webpackConfig);
  cloned.devtool = 'source-map';
  var externalModules = helpers.getArgModules();

  let moduleSources = helpers.getModulePaths(externalModules);
  if(externalModules.length) {
    moduleSources = moduleSources.filter((p) => {
      const match = externalModules.find(e => ~p.indexOf(`modules/${e}`));
      return match;
    });
  }

  function swallowError(error) {
    console.log(error.toString())
    this.emit('end')
  }

  return gulp.src([].concat(moduleSources, 'src/relevant/relevantWorker.js'))
    .pipe(helpers.nameModules(externalModules)).on('error', swallowError)
    .pipe(webpackStream(cloned, webpack)).on('error', swallowError)
    .pipe(replace('$prebid.version$', prebid.version)).on('error', swallowError)
    .pipe(gulp.dest('build/dev')).on('error', swallowError)
    .pipe(connect.reload());
});

gulp.task('relevant-build-bundle-dev', gulp.series('relevant-devpack', gulpBundle.bind(null, true)));

gulp.task('relevant-watch', function (done) {
  var mainWatcher = gulp.watch([
    'src/**/*.js',
    'modules/**/*.js',
    'test/spec/**/*.js',
    '!test/spec/loaders/**/*.js'
  ]);

  connect.server({
    https: argv.https,
    port: port,
    root: './',
    livereload: true
  });

  mainWatcher.on('all', gulp.series(clean, gulp.parallel(lint, 'relevant-build-bundle-dev')));
  done();
});

gulp.task('relevant-serve', gulp.series('relevant-build-bundle-dev', 'relevant-watch'));
